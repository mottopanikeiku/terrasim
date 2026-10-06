import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { TANK_W, TANK_H } from './constants';

export type PresetName = 'day' | 'golden' | 'night';

// The art direction: a lamplit miniature. The room stays quiet and falls
// away; light concentrates inside the glass. Bloom makes highlights and
// the night fungi glow; a tilt-shift blur band makes the tank read tiny;
// a final grade warms the golden hour and cools the night.

interface LightState {
  sunColor: THREE.Color;
  sunIntensity: number;
  sunPos: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  bgTop: THREE.Color;
  bgMid: THREE.Color;
  bgBot: THREE.Color;
  exposure: number;
  lampIntensity: number;
  spotIntensity: number;
  glowOpacity: number;   // sun patch on the back wall
  shaftOpacity: number;  // volumetric light shafts
  bloom: number;
  tilt: number;          // tilt-shift blur strength
  vignette: number;
  saturation: number;
  tint: THREE.Color;     // final grade multiply
}

function state(p: {
  sunColor: number; sunIntensity: number; sunPos: [number, number, number];
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  bgTop: number; bgMid: number; bgBot: number;
  exposure: number; lampIntensity: number; spotIntensity: number;
  glowOpacity: number; shaftOpacity: number;
  bloom: number; tilt: number; vignette: number; saturation: number; tint: number;
}): LightState {
  return {
    sunColor: new THREE.Color(p.sunColor),
    sunIntensity: p.sunIntensity,
    sunPos: new THREE.Vector3(...p.sunPos),
    hemiSky: new THREE.Color(p.hemiSky),
    hemiGround: new THREE.Color(p.hemiGround),
    hemiIntensity: p.hemiIntensity,
    bgTop: new THREE.Color(p.bgTop),
    bgMid: new THREE.Color(p.bgMid),
    bgBot: new THREE.Color(p.bgBot),
    exposure: p.exposure,
    lampIntensity: p.lampIntensity,
    spotIntensity: p.spotIntensity,
    glowOpacity: p.glowOpacity,
    shaftOpacity: p.shaftOpacity,
    bloom: p.bloom,
    tilt: p.tilt,
    vignette: p.vignette,
    saturation: p.saturation,
    tint: new THREE.Color(p.tint),
  };
}

// Honest naturalist light: a bright room near a window. The post stack
// stays subtle — a touch of miniature tilt and sparkle, never "display
// case". Drama is reserved for night, and even that is just a desk lamp.
const PRESETS: Record<PresetName, LightState> = {
  day: state({
    sunColor: 0xfff6e8, sunIntensity: 3.6, sunPos: [9, 19, 9],
    hemiSky: 0xdcebf5, hemiGround: 0x9c8a72, hemiIntensity: 1.05,
    bgTop: 0xcfc4ae, bgMid: 0xb6a890, bgBot: 0x968871,
    exposure: 1.12, lampIntensity: 0, spotIntensity: 0,
    glowOpacity: 0, shaftOpacity: 0.05,
    bloom: 0.12, tilt: 0.35, vignette: 0.2, saturation: 1.02, tint: 0xffffff,
  }),
  golden: state({
    sunColor: 0xffd9a0, sunIntensity: 3.2, sunPos: [12, 11, 12],
    hemiSky: 0xe2cfae, hemiGround: 0x97805f, hemiIntensity: 0.9,
    bgTop: 0xc4ae8b, bgMid: 0xa68c66, bgBot: 0x83694a,
    exposure: 1.14, lampIntensity: 0, spotIntensity: 0,
    glowOpacity: 0.25, shaftOpacity: 0.12,
    bloom: 0.2, tilt: 0.4, vignette: 0.26, saturation: 1.05, tint: 0xfff7ec,
  }),
  night: state({
    sunColor: 0x8aa4d4, sunIntensity: 0.4, sunPos: [-8, 16, -6],
    hemiSky: 0x44506b, hemiGround: 0x1c1916, hemiIntensity: 0.32,
    bgTop: 0x191d28, bgMid: 0x14161e, bgBot: 0x0e0f14,
    exposure: 1.0, lampIntensity: 32, spotIntensity: 260,
    glowOpacity: 0, shaftOpacity: 0,
    bloom: 0.5, tilt: 0.38, vignette: 0.34, saturation: 0.95, tint: 0xe6ebff,
  }),
};

// Tilt-shift: separable blur whose strength grows away from a horizontal
// focus band — the classic miniature-photography trick.
const TiltShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDelta: { value: new THREE.Vector2(0, 0) },
    uStrength: { value: 0.5 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uDelta;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      float band = clamp((abs(vUv.y - 0.46) - 0.13) / 0.4, 0.0, 1.0);
      float amt = band * band * uStrength;
      vec2 d = uDelta * amt;
      vec4 c = texture2D(tDiffuse, vUv) * 0.227;
      c += (texture2D(tDiffuse, vUv + d * 1.385) + texture2D(tDiffuse, vUv - d * 1.385)) * 0.316;
      c += (texture2D(tDiffuse, vUv + d * 3.231) + texture2D(tDiffuse, vUv - d * 3.231)) * 0.0703;
      gl_FragColor = c;
    }`,
};

// Final grade: saturation, warm/cool tint, vignette, faint film grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.35 },
    uSaturation: { value: 1.05 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    uniform vec3 uTint;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(luma), c, uSaturation);
      c *= uTint;
      vec2 q = vUv - vec2(0.5, 0.44);
      c *= 1.0 - uVignette * smoothstep(0.32, 0.95, length(q * vec2(1.15, 1.0)));
      c += (hash(vUv * 731.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lamp: THREE.PointLight;
  private spot: THREE.SpotLight;
  private glow: THREE.Sprite;
  private shaftMats: THREE.MeshBasicMaterial[] = [];
  private bgUniforms: { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color } };
  private current: LightState;
  private target: LightState;

  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private tiltH: ShaderPass;
  private tiltV: ShaderPass;
  private gradePass: ShaderPass;
  private time = 0;

  constructor(container: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 300);
    this.camera.position.set(13, 8, 17);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    // Environment reflections (soft studio) for glass/water realism.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Room backdrop: big gradient sphere.
    this.bgUniforms = {
      topColor: { value: new THREE.Color() },
      midColor: { value: new THREE.Color() },
      bottomColor: { value: new THREE.Color() },
    };
    const bg = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.bgUniforms,
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor;
          varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y;
            vec3 c = mix(bottomColor, midColor, smoothstep(-0.35, 0.1, h));
            c = mix(c, topColor, smoothstep(0.1, 0.7, h));
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    bg.renderOrder = -100;
    this.scene.add(bg);

    // Soft sun-glow patch on the back wall — late light through a window.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d')!;
    const gg = gctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    gg.addColorStop(0, 'rgba(255, 226, 170, 0.85)');
    gg.addColorStop(0.5, 'rgba(255, 200, 130, 0.3)');
    gg.addColorStop(1, 'rgba(255, 190, 120, 0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0, 0, 256, 256);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    this.glow.position.set(-15, 20, -20.2);
    this.glow.scale.set(24, 24, 1);
    this.scene.add(this.glow);

    // Volumetric shafts: additive gradient planes slanting with the sun.
    const shaftTex = SceneManager.makeShaftTexture();
    const shaftGroup = new THREE.Group();
    for (const [off, w, len] of [[-3.4, 2.2, 26], [0.2, 3.4, 28], [3.2, 1.7, 24]] as const) {
      const mat = new THREE.MeshBasicMaterial({
        map: shaftTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.shaftMats.push(mat);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
      plane.position.set(off * 1.4, 7.5, off);
      plane.rotation.z = -0.62;
      plane.rotation.y = 0.25;
      plane.renderOrder = 6;
      shaftGroup.add(plane);
    }
    this.scene.add(shaftGroup);

    // Lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -4;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.radius = 5;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);

    // Warm desk lamp for night mode (fills the room a little).
    this.lamp = new THREE.PointLight(0xffb066, 0, 30, 2);
    this.lamp.position.set(4, TANK_H + 4, 3);
    this.scene.add(this.lamp);

    // Display spot: a warm cone aimed at the tank so it stays the bright
    // jewel of the scene even as the room dims.
    this.spot = new THREE.SpotLight(0xffe2b8, 0, 0, 0.62, 0.8, 1.25);
    this.spot.position.set(-2, 18, 4);
    this.spot.target.position.set(-1, 1.5, 0);
    this.scene.add(this.spot);
    this.scene.add(this.spot.target);

    // Post stack: render -> bloom -> tilt-shift (H+V) -> grade.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.composer.setSize(innerWidth, innerHeight);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.88);
    this.composer.addPass(this.bloomPass);
    this.tiltH = new ShaderPass(TiltShader);
    this.tiltV = new ShaderPass(TiltShader);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.gradePass = new ShaderPass(GradeShader);
    this.composer.addPass(this.gradePass);
    this.updateTiltDeltas();

    this.current = this.cloneState(PRESETS.day);
    this.target = this.cloneState(PRESETS.day);
    this.apply(this.current);

    // Controls: LEFT is reserved for tools; orbit with right-drag.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, TANK_H * 0.42, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 60;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minPolarAngle = Math.PI * 0.08;
    (this.controls as any).mouseButtons = {
      LEFT: -1,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    (this.controls as any).touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    this.frameTank();
    this.controls.update();

    addEventListener('resize', () => this.onResize());
  }

  private static makeShaftTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const lin = ctx.createLinearGradient(0, 0, 0, 512);
    lin.addColorStop(0, 'rgba(255, 232, 180, 0.55)');
    lin.addColorStop(0.6, 'rgba(255, 220, 160, 0.22)');
    lin.addColorStop(1, 'rgba(255, 210, 150, 0)');
    ctx.fillStyle = lin;
    ctx.fillRect(0, 0, 128, 512);
    // Soft horizontal falloff so the shaft has no hard edges.
    const img = ctx.getImageData(0, 0, 128, 512);
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 128; x++) {
        const fall = Math.sin((x / 127) * Math.PI);
        img.data[(y * 128 + x) * 4 + 3] *= fall * fall;
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  private updateTiltDeltas(): void {
    (this.tiltH.uniforms as any).uDelta.value.set(1 / innerWidth, 0);
    (this.tiltV.uniforms as any).uDelta.value.set(0, 1 / innerHeight);
  }

  private cloneState(s: LightState): LightState {
    return {
      sunColor: s.sunColor.clone(),
      sunIntensity: s.sunIntensity,
      sunPos: s.sunPos.clone(),
      hemiSky: s.hemiSky.clone(),
      hemiGround: s.hemiGround.clone(),
      hemiIntensity: s.hemiIntensity,
      bgTop: s.bgTop.clone(),
      bgMid: s.bgMid.clone(),
      bgBot: s.bgBot.clone(),
      exposure: s.exposure,
      lampIntensity: s.lampIntensity,
      spotIntensity: s.spotIntensity,
      glowOpacity: s.glowOpacity,
      shaftOpacity: s.shaftOpacity,
      bloom: s.bloom,
      tilt: s.tilt,
      vignette: s.vignette,
      saturation: s.saturation,
      tint: s.tint.clone(),
    };
  }

  currentPreset: PresetName = 'day';
  onPresetShift?: (p: PresetName) => void;

  // The room breathes on its own: day -> golden evening -> night -> golden
  // morning, over ~7.5 minutes. Picking a preset by hand pauses the drift.
  private auto = true;
  private cycleT = 0;
  private static CYCLE: [PresetName, number][] = [
    ['day', 180], ['golden', 75], ['night', 140], ['golden', 55],
  ];

  setPreset(name: PresetName): void {
    this.auto = false;
    this.applyPreset(name);
  }

  setAuto(on: boolean): void {
    this.auto = on;
  }

  private applyPreset(name: PresetName): void {
    this.currentPreset = name;
    this.target = this.cloneState(PRESETS[name]);
    this.onPresetShift?.(name);
  }

  private apply(s: LightState): void {
    this.sun.color.copy(s.sunColor);
    this.sun.intensity = s.sunIntensity;
    this.sun.position.copy(s.sunPos);
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiIntensity;
    this.bgUniforms.topColor.value.copy(s.bgTop);
    this.bgUniforms.midColor.value.copy(s.bgMid);
    this.bgUniforms.bottomColor.value.copy(s.bgBot);
    this.renderer.toneMappingExposure = s.exposure;
    this.lamp.intensity = s.lampIntensity;
    this.spot.intensity = s.spotIntensity;
    (this.glow.material as THREE.SpriteMaterial).opacity = s.glowOpacity;
    for (let i = 0; i < this.shaftMats.length; i++) {
      this.shaftMats[i].opacity = s.shaftOpacity * (i === 1 ? 1 : 0.7);
    }
    this.bloomPass.strength = s.bloom;
    (this.tiltH.uniforms as any).uStrength.value = s.tilt;
    (this.tiltV.uniforms as any).uStrength.value = s.tilt;
    (this.gradePass.uniforms as any).uVignette.value = s.vignette;
    (this.gradePass.uniforms as any).uSaturation.value = s.saturation;
    (this.gradePass.uniforms as any).uTint.value.copy(s.tint);
  }

  // Render one frame through the full post stack (also used for photos).
  renderFrame(): void {
    this.composer.render();
  }

  update(dt: number): void {
    this.time += dt;
    (this.gradePass.uniforms as any).uTime.value = this.time % 97;

    if (this.auto) {
      const total = SceneManager.CYCLE.reduce((s, [, d]) => s + d, 0);
      this.cycleT = (this.cycleT + dt) % total;
      let acc = 0;
      for (const [preset, dur] of SceneManager.CYCLE) {
        acc += dur;
        if (this.cycleT < acc) {
          if (preset !== this.currentPreset) this.applyPreset(preset);
          break;
        }
      }
    }

    // Smooth exponential approach toward the target preset.
    const k = 1 - Math.exp(-(this.auto ? 0.5 : 3.5) * dt);
    const c = this.current, t = this.target;
    c.sunColor.lerp(t.sunColor, k);
    c.sunIntensity += (t.sunIntensity - c.sunIntensity) * k;
    c.sunPos.lerp(t.sunPos, k);
    c.hemiSky.lerp(t.hemiSky, k);
    c.hemiGround.lerp(t.hemiGround, k);
    c.hemiIntensity += (t.hemiIntensity - c.hemiIntensity) * k;
    c.bgTop.lerp(t.bgTop, k);
    c.bgMid.lerp(t.bgMid, k);
    c.bgBot.lerp(t.bgBot, k);
    c.exposure += (t.exposure - c.exposure) * k;
    c.lampIntensity += (t.lampIntensity - c.lampIntensity) * k;
    c.spotIntensity += (t.spotIntensity - c.spotIntensity) * k;
    c.glowOpacity += (t.glowOpacity - c.glowOpacity) * k;
    c.shaftOpacity += (t.shaftOpacity - c.shaftOpacity) * k;
    c.bloom += (t.bloom - c.bloom) * k;
    c.tilt += (t.tilt - c.tilt) * k;
    c.vignette += (t.vignette - c.vignette) * k;
    c.saturation += (t.saturation - c.saturation) * k;
    c.tint.lerp(t.tint, k);
    this.apply(c);

    this.controls.update();
    this.renderFrame();
  }

  // Fit the whole tank in view for any aspect ratio.
  private frameTank(): void {
    const halfH = TANK_H * 0.78;
    const halfW = TANK_W * 0.72;
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = 1.12 * Math.max(halfH / Math.tan(vHalf), halfW / Math.tan(hHalf));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).add(dir.multiplyScalar(dist));
  }

  private onResize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.updateTiltDeltas();
    this.frameTank();
  }
}
