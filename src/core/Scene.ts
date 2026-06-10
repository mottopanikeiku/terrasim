import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TANK_W, TANK_H } from './constants';

export type PresetName = 'day' | 'golden' | 'night';

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
}

function state(p: {
  sunColor: number; sunIntensity: number; sunPos: [number, number, number];
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  bgTop: number; bgMid: number; bgBot: number;
  exposure: number; lampIntensity: number;
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
  };
}

const PRESETS: Record<PresetName, LightState> = {
  day: state({
    sunColor: 0xfff6e8, sunIntensity: 3.2, sunPos: [10, 18, 8],
    hemiSky: 0xcfe4f5, hemiGround: 0x8a7560, hemiIntensity: 1.3,
    bgTop: 0xe9dcc4, bgMid: 0xd2bb95, bgBot: 0xa08560,
    exposure: 1.15, lampIntensity: 0,
  }),
  golden: state({
    sunColor: 0xffc77d, sunIntensity: 3.4, sunPos: [14, 9, 10],
    hemiSky: 0xe8c49a, hemiGround: 0x84684a, hemiIntensity: 1.2,
    bgTop: 0xecd1a4, bgMid: 0xd2a468, bgBot: 0x916640,
    exposure: 1.2, lampIntensity: 0,
  }),
  night: state({
    sunColor: 0x9db4dd, sunIntensity: 0.7, sunPos: [-8, 16, -6],
    hemiSky: 0x3c4a66, hemiGround: 0x1c1a18, hemiIntensity: 0.45,
    bgTop: 0x2c3242, bgMid: 0x232633, bgBot: 0x191b24,
    exposure: 1.0, lampIntensity: 26,
  }),
};

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lamp: THREE.PointLight;
  private bgUniforms: { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color } };
  private current: LightState;
  private target: LightState;

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

    // Room backdrop: big gradient sphere, kept bright and warm.
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

    // Soft sun-glow patch on the back wall — like late light through a window.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    const gctx = glowCanvas.getContext('2d')!;
    const gg = gctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    gg.addColorStop(0, 'rgba(255, 226, 170, 0.85)');
    gg.addColorStop(0.5, 'rgba(255, 200, 130, 0.3)');
    gg.addColorStop(1, 'rgba(255, 190, 120, 0)');
    gctx.fillStyle = gg;
    gctx.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }));
    glow.position.set(-19, 15, -20.2);
    glow.scale.set(30, 30, 1);
    this.scene.add(glow);

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

    // Warm desk lamp for night mode.
    this.lamp = new THREE.PointLight(0xffb066, 0, 30, 2);
    this.lamp.position.set(4, TANK_H + 4, 3);
    this.scene.add(this.lamp);

    this.current = this.cloneState(PRESETS.golden);
    this.target = this.cloneState(PRESETS.golden);
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
    };
  }

  currentPreset: PresetName = 'golden';

  setPreset(name: PresetName): void {
    this.currentPreset = name;
    this.target = this.cloneState(PRESETS[name]);
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
  }

  update(dt: number): void {
    // Smooth exponential approach toward the target preset.
    const k = 1 - Math.exp(-3.5 * dt);
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
    this.apply(c);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
    this.frameTank();
  }
}
