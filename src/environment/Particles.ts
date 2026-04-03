import * as THREE from 'three';
import { VESSEL_RADIUS, VESSEL_HEIGHT, randomRange } from '../utils/MathUtils';

export class ParticleSystem {
  private dustPoints: THREE.Points;
  private fireflyPoints: THREE.Points;
  private dustPositions: Float32Array;
  private dustVelocities: Float32Array;
  private fireflyPositions: Float32Array;
  private fireflyPhases: Float32Array;
  private fireflyAlphas: Float32Array;

  public showFireflies = false;

  private dustCount = 200;
  private fireflyCount = 20;

  constructor(scene: THREE.Scene) {
    // Dust motes
    this.dustPositions = new Float32Array(this.dustCount * 3);
    this.dustVelocities = new Float32Array(this.dustCount * 3);

    for (let i = 0; i < this.dustCount; i++) {
      this.resetDust(i);
    }

    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));

    const dustMat = new THREE.PointsMaterial({
      color: 0xFFF8E0,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.dustPoints.renderOrder = 900;
    scene.add(this.dustPoints);

    // Fireflies
    this.fireflyPositions = new Float32Array(this.fireflyCount * 3);
    this.fireflyPhases = new Float32Array(this.fireflyCount);
    this.fireflyAlphas = new Float32Array(this.fireflyCount);

    for (let i = 0; i < this.fireflyCount; i++) {
      this.resetFirefly(i);
      this.fireflyPhases[i] = Math.random() * Math.PI * 2;
    }

    const fireflyGeo = new THREE.BufferGeometry();
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(this.fireflyPositions, 3));

    const fireflyColors = new Float32Array(this.fireflyCount * 3);
    for (let i = 0; i < this.fireflyCount; i++) {
      const warmth = 0.8 + Math.random() * 0.2;
      fireflyColors[i * 3] = warmth;
      fireflyColors[i * 3 + 1] = warmth * 0.9;
      fireflyColors[i * 3 + 2] = warmth * 0.3;
    }
    fireflyGeo.setAttribute('color', new THREE.BufferAttribute(fireflyColors, 3));

    const fireflyMat = new THREE.PointsMaterial({
      size: 0.2,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });

    this.fireflyPoints = new THREE.Points(fireflyGeo, fireflyMat);
    this.fireflyPoints.renderOrder = 901;
    this.fireflyPoints.visible = false;
    scene.add(this.fireflyPoints);
  }

  private resetDust(i: number): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * VESSEL_RADIUS * 0.8;
    this.dustPositions[i * 3] = Math.cos(angle) * r;
    this.dustPositions[i * 3 + 1] = randomRange(1, VESSEL_HEIGHT * 0.85);
    this.dustPositions[i * 3 + 2] = Math.sin(angle) * r;

    this.dustVelocities[i * 3] = randomRange(-0.002, 0.002);
    this.dustVelocities[i * 3 + 1] = randomRange(-0.001, 0.003);
    this.dustVelocities[i * 3 + 2] = randomRange(-0.002, 0.002);
  }

  private resetFirefly(i: number): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * VESSEL_RADIUS * 0.7;
    this.fireflyPositions[i * 3] = Math.cos(angle) * r;
    this.fireflyPositions[i * 3 + 1] = randomRange(3, VESSEL_HEIGHT * 0.7);
    this.fireflyPositions[i * 3 + 2] = Math.sin(angle) * r;
  }

  update(time: number, delta: number): void {
    // Dust motes — lazy floating
    for (let i = 0; i < this.dustCount; i++) {
      const i3 = i * 3;
      this.dustPositions[i3] += this.dustVelocities[i3] + Math.sin(time * 0.5 + i) * 0.001;
      this.dustPositions[i3 + 1] += this.dustVelocities[i3 + 1] + Math.sin(time * 0.3 + i * 0.7) * 0.0005;
      this.dustPositions[i3 + 2] += this.dustVelocities[i3 + 2] + Math.cos(time * 0.4 + i * 1.3) * 0.001;

      // Wrap bounds
      const x = this.dustPositions[i3];
      const y = this.dustPositions[i3 + 1];
      const z = this.dustPositions[i3 + 2];
      const r = Math.sqrt(x * x + z * z);

      if (r > VESSEL_RADIUS * 0.85 || y > VESSEL_HEIGHT * 0.85 || y < 1) {
        this.resetDust(i);
      }
    }
    (this.dustPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // Fireflies — random walk with pulsing glow
    if (this.showFireflies) {
      this.fireflyPoints.visible = true;
      const mat = this.fireflyPoints.material as THREE.PointsMaterial;

      for (let i = 0; i < this.fireflyCount; i++) {
        const i3 = i * 3;
        this.fireflyPhases[i] += delta * (0.8 + Math.random() * 0.4);

        // Random walk
        this.fireflyPositions[i3] += Math.sin(this.fireflyPhases[i] * 1.3) * 0.02;
        this.fireflyPositions[i3 + 1] += Math.cos(this.fireflyPhases[i] * 0.7) * 0.015;
        this.fireflyPositions[i3 + 2] += Math.sin(this.fireflyPhases[i] * 1.1 + 2) * 0.02;

        // Bounds check
        const x = this.fireflyPositions[i3];
        const y = this.fireflyPositions[i3 + 1];
        const z = this.fireflyPositions[i3 + 2];
        if (Math.sqrt(x * x + z * z) > VESSEL_RADIUS * 0.75 || y > VESSEL_HEIGHT * 0.75 || y < 3) {
          this.resetFirefly(i);
        }
      }

      // Pulsing alpha
      mat.opacity = 0.4 + Math.sin(time * 2) * 0.3;

      (this.fireflyPoints.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    } else {
      this.fireflyPoints.visible = false;
    }
  }
}
