import * as THREE from 'three';
import { W, D, V, cellToWorld } from '../core/constants';
import { Cell, Grid } from '../core/Grid';
import { Simulation } from '../core/Simulation';

// The inhabitants. Each one has a tiny behavior loop tuned for charm:
// - isopods (the cleanup crew) trundle around, seek out dead plants to
//   nibble, and occasionally curl into a defensive little ball
// - a snail glides very slowly, eyestalks first, grazing moss when the
//   carpet is thick enough
// - butterflies flutter between open flowers by day and rest at night
// - fireflies drift as soft glows after dark

function surfaceWorldY(grid: Grid, gx: number, gz: number): number {
  let top = grid.top(gx, gz);
  if (top < 0) top = 0;
  return (top + 1) * V;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255, 240, 190, 1)');
  g.addColorStop(0.35, 'rgba(255, 215, 120, 0.55)');
  g.addColorStop(1, 'rgba(255, 200, 100, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- isopod ----------

class Isopod {
  group = new THREE.Group();
  private walking = new THREE.Group();
  private ball: THREE.Mesh;
  private pos: THREE.Vector2;
  private target: THREE.Vector2;
  private pause = 0;
  private curl = 0; // >0 while curled
  private nextCurl: number;
  private speed: number;
  private wobble = Math.random() * 10;

  constructor(scene: THREE.Scene, private grid: Grid, private sim: Simulation) {
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x5d5650, roughness: 0.45 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x474340, roughness: 0.6 });

    // Segmented shell: three overlapping plates, biggest in the middle.
    for (let s = 0; s < 3; s++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.085 - Math.abs(s - 1) * 0.012, 10, 8), shellMat);
      seg.scale.set(1.1, 0.62, 1);
      seg.position.x = (s - 1) * 0.075;
      this.walking.add(seg);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), bodyMat);
    head.position.set(0.15, -0.012, 0);
    this.walking.add(head);
    // Antennae.
    for (const s of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.008, 0.1, 4), bodyMat);
      ant.position.set(0.2, 0.01, s * 0.03);
      ant.rotation.z = -1.1;
      ant.rotation.y = s * 0.5;
      this.walking.add(ant);
    }
    this.group.add(this.walking);

    // Curled form: a tidy little ball.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), shellMat);
    this.ball.visible = false;
    this.group.add(this.ball);

    this.group.traverse((o) => { o.castShadow = true; });
    scene.add(this.group);

    this.pos = new THREE.Vector2(8 + Math.random() * (W - 16), 8 + Math.random() * (D - 16));
    this.target = this.pos.clone();
    this.speed = 2.0 + Math.random() * 1.2;
    this.nextCurl = 15 + Math.random() * 30;
  }

  update(dt: number): void {
    this.wobble += dt * 14;

    // Curling: a real pillbug party trick.
    this.nextCurl -= dt;
    if (this.curl > 0) {
      this.curl -= dt;
      if (this.curl <= 0) {
        this.walking.visible = true;
        this.ball.visible = false;
      }
    } else if (this.nextCurl <= 0) {
      this.curl = 2 + Math.random() * 2.5;
      this.nextCurl = 20 + Math.random() * 35;
      this.walking.visible = false;
      this.ball.visible = true;
    }

    if (this.curl <= 0 && this.pause > 0) this.pause -= dt;
    else if (this.curl <= 0) {
      const delta = this.target.clone().sub(this.pos);
      const dist = delta.length();
      if (dist < 0.4) {
        this.sim.nibbleDeadAt(Math.round(this.pos.x), Math.round(this.pos.y), 2);
        this.pause = 0.6 + Math.random() * 2.4;
        const dead = this.sim.findDeadPlantNear(Math.round(this.pos.x), Math.round(this.pos.y), 26);
        if (dead) {
          this.target.set(dead.x + (Math.random() - 0.5), dead.z + (Math.random() - 0.5));
        } else {
          const wander = 6 + Math.random() * 16;
          const ang = Math.random() * Math.PI * 2;
          this.target.set(
            Math.min(W - 4, Math.max(3, this.pos.x + Math.cos(ang) * wander)),
            Math.min(D - 4, Math.max(3, this.pos.y + Math.sin(ang) * wander))
          );
        }
      } else {
        delta.normalize().multiplyScalar(Math.min(dist, this.speed * dt));
        this.pos.add(delta);
        this.group.rotation.y = Math.atan2(-delta.y, delta.x);
      }
    }

    const gx = Math.round(this.pos.x), gz = Math.round(this.pos.y);
    if (this.grid.get(gx, this.grid.top(gx, gz), gz) === Cell.WATER) {
      this.target.set(W / 2 + (Math.random() - 0.5) * 20, D / 2 + (Math.random() - 0.5) * 10);
    }
    const [wx, , wz] = cellToWorld(gx, 0, gz);
    this.group.position.set(
      wx + (this.pos.x - gx) * V,
      surfaceWorldY(this.grid, gx, gz) + 0.045 + (this.curl > 0 ? 0.02 : Math.sin(this.wobble) * 0.006),
      wz + (this.pos.y - gz) * V
    );
  }
}

// ---------- snail ----------

class Snail {
  group = new THREE.Group();
  private pos: THREE.Vector2;
  private target: THREE.Vector2;
  private grazeTimer = 20;

  constructor(scene: THREE.Scene, private grid: Grid, private sim: Simulation) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8a76a, roughness: 0.55 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.4 });
    const shellMat2 = new THREE.MeshStandardMaterial({ color: 0x6e4628, roughness: 0.4 });

    // Foot: a long low blob.
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), bodyMat);
    foot.scale.set(2.1, 0.55, 0.8);
    foot.position.y = 0.05;
    this.group.add(foot);
    // Head rises at the front, with eyestalks.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), bodyMat);
    head.position.set(0.17, 0.1, 0);
    this.group.add(head);
    for (const s of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.11, 5), bodyMat);
      stalk.position.set(0.2, 0.18, s * 0.025);
      stalk.rotation.z = -0.35;
      this.group.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5), shellMat2);
      eye.position.set(0.225, 0.235, s * 0.025);
      this.group.add(eye);
    }
    // Shell: a coil read from nested tori + core.
    const coilOuter = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.05, 8, 18), shellMat);
    coilOuter.position.set(-0.06, 0.17, 0);
    const coilInner = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.032, 8, 14), shellMat2);
    coilInner.position.set(-0.06, 0.17, 0.0);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), shellMat);
    core.position.set(-0.06, 0.17, 0);
    this.group.add(coilOuter, coilInner, core);

    this.group.traverse((o) => { o.castShadow = true; });
    scene.add(this.group);

    this.pos = new THREE.Vector2(20 + Math.random() * 30, 8 + Math.random() * 24);
    this.target = this.pos.clone();
  }

  update(dt: number): void {
    const delta = this.target.clone().sub(this.pos);
    const dist = delta.length();
    if (dist < 0.3) {
      // Prefer drifting toward moss; otherwise amble.
      const wander = 5 + Math.random() * 12;
      const ang = Math.random() * Math.PI * 2;
      this.target.set(
        Math.min(W - 4, Math.max(3, this.pos.x + Math.cos(ang) * wander)),
        Math.min(D - 4, Math.max(3, this.pos.y + Math.sin(ang) * wander))
      );
    } else {
      delta.normalize().multiplyScalar(Math.min(dist, 0.45 * dt)); // gloriously slow
      this.pos.add(delta);
      this.group.rotation.y = Math.atan2(-delta.y, delta.x);
    }

    // Graze moss when the carpet is thick — keeps it from taking over.
    this.grazeTimer -= dt;
    if (this.grazeTimer <= 0) {
      this.grazeTimer = 25 + Math.random() * 25;
      if (this.sim.mossCells() > 80) {
        const gx = Math.round(this.pos.x), gz = Math.round(this.pos.y);
        outer: for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const x = gx + dx, z = gz + dz;
            const top = this.grid.top(x, z);
            if (top > 0 && this.grid.get(x, top, z) === Cell.MOSS) {
              this.grid.clearCell(x, top, z);
              this.sim.changed = true;
              break outer;
            }
          }
        }
      }
    }

    const gx = Math.round(this.pos.x), gz = Math.round(this.pos.y);
    if (this.grid.get(gx, this.grid.top(gx, gz), gz) === Cell.WATER) {
      this.target.set(W / 2, D / 2);
    }
    const [wx, , wz] = cellToWorld(gx, 0, gz);
    this.group.position.set(
      wx + (this.pos.x - gx) * V,
      surfaceWorldY(this.grid, gx, gz) + 0.01,
      wz + (this.pos.y - gz) * V
    );
  }
}

// ---------- butterfly ----------

class Butterfly {
  group = new THREE.Group();
  private wingL: THREE.Group;
  private wingR: THREE.Group;
  private state: 'fly' | 'sit' = 'fly';
  private sitT = 0;
  private targetPos = new THREE.Vector3(0, 6, 0);
  private phase = Math.random() * Math.PI * 2;
  private opacity = 0;
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(scene: THREE.Scene, private grid: Grid, private sim: Simulation, color: number) {
    const wingMat = new THREE.MeshStandardMaterial({
      color, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0,
    });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.6, transparent: true, opacity: 0 });
    this.mats.push(wingMat, bodyMat);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(0.16, 0.12, 0.22, 0.02, 0.18, -0.06);
    wingShape.bezierCurveTo(0.14, -0.12, 0.04, -0.08, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape, 6);

    this.wingL = new THREE.Group();
    const wl = new THREE.Mesh(wingGeo, wingMat);
    wl.rotation.x = -Math.PI / 2;
    this.wingL.add(wl);
    this.wingR = new THREE.Group();
    const wr = new THREE.Mesh(wingGeo, wingMat);
    wr.rotation.x = -Math.PI / 2;
    wr.scale.z = -1;
    this.wingR.add(wr);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 3, 6), bodyMat);
    body.rotation.x = Math.PI / 2;
    this.group.add(this.wingL, this.wingR, body);
    this.group.position.set(0, 6, 0);
    scene.add(this.group);
  }

  private pickFlower(): THREE.Vector3 | null {
    const flowers = this.sim.getPlants().filter(
      (p) => p.species === 'flower' && p.look === 0 && p.stage > 0.6
    );
    if (flowers.length === 0) return null;
    const f = flowers[(Math.random() * flowers.length) | 0];
    const [wx, wy, wz] = cellToWorld(f.x, f.y, f.z);
    return new THREE.Vector3(wx, wy + 0.65 * f.stage + 0.12, wz);
  }

  update(dt: number, time: number, night: boolean): void {
    // Day creature: fades away at night.
    const targetOpacity = night ? 0 : 1;
    this.opacity += (targetOpacity - this.opacity) * Math.min(1, dt * 1.2);
    for (const m of this.mats) m.opacity = this.opacity;
    this.group.visible = this.opacity > 0.03;
    if (!this.group.visible) return;

    const flapSpeed = this.state === 'fly' ? 14 : 2.2;
    const flapAmp = this.state === 'fly' ? 0.85 : 0.35;
    const flap = Math.sin(time * flapSpeed + this.phase) * flapAmp;
    this.wingL.rotation.z = flap;
    this.wingR.rotation.z = -flap;

    if (this.state === 'sit') {
      this.sitT -= dt;
      if (this.sitT <= 0) {
        const next = this.pickFlower();
        this.targetPos = next ?? new THREE.Vector3((Math.random() - 0.5) * W * V * 0.6, 5.5 + Math.random() * 2.5, (Math.random() - 0.5) * D * V * 0.6);
        this.state = 'fly';
      }
      return;
    }

    // Flying: drift toward the target with a fluttery bob.
    const toTarget = this.targetPos.clone().sub(this.group.position);
    const dist = toTarget.length();
    if (dist < 0.15) {
      this.state = 'sit';
      this.sitT = 3 + Math.random() * 6;
      return;
    }
    const step = toTarget.normalize().multiplyScalar(Math.min(dist, 1.4 * dt));
    step.y += Math.sin(time * 5 + this.phase) * 0.35 * dt;
    this.group.position.add(step);
    this.group.rotation.y = Math.atan2(-step.z, step.x) + Math.PI / 2;
    // Re-target occasionally mid-flight so paths feel alive.
    if (Math.random() < dt * 0.12) {
      const next = this.pickFlower();
      if (next) this.targetPos = next;
    }
  }
}

// ---------- the troupe ----------

export class Critters {
  private isopods: Isopod[] = [];
  private snail: Snail;
  private butterflies: Butterfly[] = [];
  private fireflies: THREE.Points;
  private fireflyPhase: Float32Array;
  private fireflyVisible = 0;

  constructor(scene: THREE.Scene, grid: Grid, sim: Simulation) {
    for (let n = 0; n < 3; n++) this.isopods.push(new Isopod(scene, grid, sim));
    this.snail = new Snail(scene, grid, sim);
    this.butterflies.push(new Butterfly(scene, grid, sim, 0xe2899f));
    this.butterflies.push(new Butterfly(scene, grid, sim, 0x8fb7dd));

    const n = 14;
    const positions = new Float32Array(n * 3);
    this.fireflyPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * W * 0.8 * V;
      positions[i * 3 + 1] = 4 + Math.random() * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * D * 0.8 * V;
      this.fireflyPhase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      map: glowTexture(),
      color: 0xffd97a,
      size: 0.38,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    scene.add(this.fireflies);
  }

  update(dt: number, time: number, night: boolean): void {
    for (const iso of this.isopods) iso.update(dt);
    this.snail.update(dt);
    for (const b of this.butterflies) b.update(dt, time, night);

    const targetVis = night ? 1 : 0;
    this.fireflyVisible += (targetVis - this.fireflyVisible) * Math.min(1, dt * 1.5);
    const mat = this.fireflies.material as THREE.PointsMaterial;
    mat.opacity = this.fireflyVisible * (0.65 + Math.sin(time * 2.2) * 0.3);
    this.fireflies.visible = this.fireflyVisible > 0.02;
    if (this.fireflies.visible) {
      const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ph = this.fireflyPhase[i];
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.5 + ph) * 0.004);
        pos.setY(i, 3.5 + Math.sin(time * 0.35 + ph * 2) * 1.6);
        pos.setZ(i, pos.getZ(i) + Math.cos(time * 0.4 + ph) * 0.004);
      }
      pos.needsUpdate = true;
    }
  }
}
