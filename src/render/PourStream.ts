import * as THREE from 'three';

// Cosmetic pour stream: a sprinkle of falling particles between the
// cursor and the ground while a pour is held. Pure feedback — the volume
// itself goes straight into the heightfield — but it makes pouring FEEL
// like pouring.

const COUNT = 90;

const TOOL_COLOR: Record<string, number> = {
  sand: 0xd6bc8a,
  soil: 0x6b5138,
  gravel: 0x9a948c,
  water: 0x9fd0e8,
};

export class PourStream {
  private points: THREE.Points;
  private mat: THREE.PointsMaterial;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private origin = new THREE.Vector3();
  private groundY = 0;
  private active = false;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(COUNT * 3);
    this.vel = new Float32Array(COUNT * 3);
    this.life = new Float32Array(COUNT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({
      color: 0xd6bc8a,
      size: 0.085,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 3;
    scene.add(this.points);
  }

  // Call every frame; tool is null when not pouring.
  set(tool: string | null, target: THREE.Vector3 | null, groundY: number): void {
    this.active = !!tool && !!target;
    if (tool) this.mat.color.setHex(TOOL_COLOR[tool] ?? 0xd6bc8a).convertSRGBToLinear();
    if (target) {
      this.origin.set(target.x, Math.max(groundY + 1.6, target.y + 1.4), target.z);
      this.groundY = groundY;
    }
  }

  update(dt: number): void {
    if (!this.active) {
      // Let the tail of the stream finish falling, then hide.
      let any = false;
      for (let i = 0; i < COUNT; i++) {
        if (this.life[i] > 0) {
          any = true;
          this.step(i, dt);
        }
      }
      this.points.visible = any;
      if (any) (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      return;
    }

    this.points.visible = true;
    for (let i = 0; i < COUNT; i++) {
      if (this.life[i] <= 0 && Math.random() < 0.5) {
        // Respawn at the spout with a little scatter.
        this.pos[i * 3] = this.origin.x + (Math.random() - 0.5) * 0.22;
        this.pos[i * 3 + 1] = this.origin.y + Math.random() * 0.3;
        this.pos[i * 3 + 2] = this.origin.z + (Math.random() - 0.5) * 0.22;
        this.vel[i * 3] = (Math.random() - 0.5) * 0.25;
        this.vel[i * 3 + 1] = -0.4 - Math.random() * 0.5;
        this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
        this.life[i] = 2;
      } else if (this.life[i] > 0) {
        this.step(i, dt);
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private step(i: number, dt: number): void {
    this.vel[i * 3 + 1] -= 9.5 * dt;
    this.pos[i * 3] += this.vel[i * 3] * dt;
    this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
    this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    if (this.pos[i * 3 + 1] <= this.groundY + 0.03) {
      this.life[i] = 0;
      this.pos[i * 3 + 1] = -100; // park out of sight
    }
  }
}
