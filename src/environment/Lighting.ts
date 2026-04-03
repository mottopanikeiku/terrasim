import * as THREE from 'three';
import { lerp, easeInOutCubic } from '../utils/MathUtils';

export interface LightingPreset {
  name: string;
  label: string;
  icon: string;
  directionalColor: number;
  directionalIntensity: number;
  directionalPos: [number, number, number];
  ambientColor: number;
  ambientIntensity: number;
  hemisphereTop: number;
  hemisphereBottom: number;
  hemisphereIntensity: number;
  backColor: number;
  backIntensity: number;
  bloomStrength: number;
  exposure: number;
}

export const PRESETS: Record<string, LightingPreset> = {
  goldenHour: {
    name: 'goldenHour',
    label: 'Golden Hour',
    icon: '\u{1F305}',
    directionalColor: 0xFFBF6B,
    directionalIntensity: 2.0,
    directionalPos: [12, 15, 8],
    ambientColor: 0xFFF0D0,
    ambientIntensity: 0.4,
    hemisphereTop: 0xFFCC88,
    hemisphereBottom: 0x3D2B1F,
    hemisphereIntensity: 0.5,
    backColor: 0xFF9944,
    backIntensity: 0.6,
    bloomStrength: 0.35,
    exposure: 1.3,
  },
  daylight: {
    name: 'daylight',
    label: 'Daylight',
    icon: '\u{2600}\u{FE0F}',
    directionalColor: 0xFFF8F0,
    directionalIntensity: 1.8,
    directionalPos: [8, 20, 6],
    ambientColor: 0xE8EEFF,
    ambientIntensity: 0.5,
    hemisphereTop: 0x87CEEB,
    hemisphereBottom: 0x3D2B1F,
    hemisphereIntensity: 0.6,
    backColor: 0xAABBDD,
    backIntensity: 0.3,
    bloomStrength: 0.2,
    exposure: 1.2,
  },
  moonlight: {
    name: 'moonlight',
    label: 'Moonlight',
    icon: '\u{1F319}',
    directionalColor: 0x8899CC,
    directionalIntensity: 0.8,
    directionalPos: [-8, 18, -6],
    ambientColor: 0x334466,
    ambientIntensity: 0.2,
    hemisphereTop: 0x334466,
    hemisphereBottom: 0x0A0A15,
    hemisphereIntensity: 0.3,
    backColor: 0x6677AA,
    backIntensity: 0.2,
    bloomStrength: 0.5,
    exposure: 0.8,
  },
  warmLamp: {
    name: 'warmLamp',
    label: 'Warm Lamp',
    icon: '\u{1F4A1}',
    directionalColor: 0xFFAA55,
    directionalIntensity: 1.5,
    directionalPos: [5, 18, 10],
    ambientColor: 0x442200,
    ambientIntensity: 0.3,
    hemisphereTop: 0xFFCC88,
    hemisphereBottom: 0x1A1510,
    hemisphereIntensity: 0.4,
    backColor: 0xFF8833,
    backIntensity: 0.4,
    bloomStrength: 0.4,
    exposure: 1.1,
  },
  growLight: {
    name: 'growLight',
    label: 'Grow Light',
    icon: '\u{1F33F}',
    directionalColor: 0xCC66FF,
    directionalIntensity: 1.5,
    directionalPos: [0, 20, 0],
    ambientColor: 0x6622AA,
    ambientIntensity: 0.3,
    hemisphereTop: 0xBB44FF,
    hemisphereBottom: 0x110022,
    hemisphereIntensity: 0.4,
    backColor: 0xAA33EE,
    backIntensity: 0.5,
    bloomStrength: 0.5,
    exposure: 1.0,
  },
};

export class Lighting {
  public directional: THREE.DirectionalLight;
  public ambient: THREE.AmbientLight;
  public hemisphere: THREE.HemisphereLight;
  public backlight: THREE.PointLight;
  public currentPreset: string = 'goldenHour';

  private transitioning = false;
  private transitionProgress = 0;
  private transitionDuration = 1.5;
  private fromState: LightingPreset | null = null;
  private toState: LightingPreset | null = null;
  private onTransitionUpdate?: (preset: LightingPreset, t: number) => void;

  constructor(scene: THREE.Scene) {
    const preset = PRESETS.goldenHour;

    // Main directional light
    this.directional = new THREE.DirectionalLight(preset.directionalColor, preset.directionalIntensity);
    this.directional.position.set(...preset.directionalPos);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.width = 1024;
    this.directional.shadow.mapSize.height = 1024;
    this.directional.shadow.camera.near = 1;
    this.directional.shadow.camera.far = 50;
    this.directional.shadow.camera.left = -15;
    this.directional.shadow.camera.right = 15;
    this.directional.shadow.camera.top = 25;
    this.directional.shadow.camera.bottom = -5;
    this.directional.shadow.bias = -0.001;
    this.directional.shadow.radius = 4;
    scene.add(this.directional);

    // Ambient fill
    this.ambient = new THREE.AmbientLight(preset.ambientColor, preset.ambientIntensity);
    scene.add(this.ambient);

    // Hemisphere
    this.hemisphere = new THREE.HemisphereLight(
      preset.hemisphereTop, preset.hemisphereBottom, preset.hemisphereIntensity
    );
    scene.add(this.hemisphere);

    // Backlight
    this.backlight = new THREE.PointLight(preset.backColor, preset.backIntensity, 40);
    this.backlight.position.set(-10, 10, -10);
    scene.add(this.backlight);
  }

  setOnTransitionUpdate(cb: (preset: LightingPreset, t: number) => void) {
    this.onTransitionUpdate = cb;
  }

  switchPreset(name: string): void {
    if (name === this.currentPreset || !PRESETS[name]) return;
    this.fromState = this.captureCurrentState();
    this.toState = PRESETS[name];
    this.currentPreset = name;
    this.transitioning = true;
    this.transitionProgress = 0;
  }

  private captureCurrentState(): LightingPreset {
    return {
      name: 'current',
      label: '',
      icon: '',
      directionalColor: this.directional.color.getHex(),
      directionalIntensity: this.directional.intensity,
      directionalPos: [
        this.directional.position.x,
        this.directional.position.y,
        this.directional.position.z,
      ],
      ambientColor: this.ambient.color.getHex(),
      ambientIntensity: this.ambient.intensity,
      hemisphereTop: (this.hemisphere as any).color.getHex(),
      hemisphereBottom: (this.hemisphere as any).groundColor.getHex(),
      hemisphereIntensity: this.hemisphere.intensity,
      backColor: this.backlight.color.getHex(),
      backIntensity: this.backlight.intensity,
      bloomStrength: 0.3,
      exposure: 1.2,
    };
  }

  update(delta: number): void {
    if (!this.transitioning || !this.fromState || !this.toState) return;

    this.transitionProgress += delta / this.transitionDuration;
    const t = easeInOutCubic(Math.min(this.transitionProgress, 1));

    const from = this.fromState;
    const to = this.toState;

    this.directional.color.set(from.directionalColor).lerp(new THREE.Color(to.directionalColor), t);
    this.directional.intensity = lerp(from.directionalIntensity, to.directionalIntensity, t);
    this.directional.position.set(
      lerp(from.directionalPos[0], to.directionalPos[0], t),
      lerp(from.directionalPos[1], to.directionalPos[1], t),
      lerp(from.directionalPos[2], to.directionalPos[2], t),
    );

    this.ambient.color.set(from.ambientColor).lerp(new THREE.Color(to.ambientColor), t);
    this.ambient.intensity = lerp(from.ambientIntensity, to.ambientIntensity, t);

    (this.hemisphere as any).color.set(from.hemisphereTop).lerp(new THREE.Color(to.hemisphereTop), t);
    (this.hemisphere as any).groundColor.set(from.hemisphereBottom).lerp(new THREE.Color(to.hemisphereBottom), t);
    this.hemisphere.intensity = lerp(from.hemisphereIntensity, to.hemisphereIntensity, t);

    this.backlight.color.set(from.backColor).lerp(new THREE.Color(to.backColor), t);
    this.backlight.intensity = lerp(from.backIntensity, to.backIntensity, t);

    if (this.onTransitionUpdate) {
      this.onTransitionUpdate(to, t);
    }

    if (this.transitionProgress >= 1) {
      this.transitioning = false;
    }
  }

  getCurrentPresetData(): LightingPreset {
    return PRESETS[this.currentPreset];
  }
}
