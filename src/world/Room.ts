import * as THREE from 'three';
import { V, cellToWorld } from '../core/constants';
import { World } from '../core/World';

// The cozy room around the tank: a plaster wall, framed prints, and little
// desk props — plus the tiny details that sell a miniature world: a snail
// shell by the books, hand-written plant labels in the soil, a watering can
// that drips now and then.

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTexture(w: number, h: number, draw: Draw): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const drawButterfly: Draw = (ctx, w, h) => {
  ctx.fillStyle = '#f7efdd';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2 + 8;
  // wings: two big, two small
  const wing = (dx: number, dy: number, rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + dy, rx, ry, dx > 0 ? -0.5 : 0.5, 0, Math.PI * 2);
    ctx.fill();
  };
  wing(-34, -22, 30, 38, '#dd7da2');
  wing(34, -22, 30, 38, '#dd7da2');
  wing(-26, 28, 22, 26, '#eaa3bc');
  wing(26, 28, 22, 26, '#eaa3bc');
  // wing dots
  ctx.fillStyle = '#fdf3f6';
  for (const [dx, dy] of [[-36, -26], [36, -26], [-26, 26], [26, 26]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  // body + antennae
  ctx.fillStyle = '#6b5340';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 7, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6b5340';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 3, cy - 30);
    ctx.quadraticCurveTo(cx + s * 16, cy - 52, cx + s * 24, cy - 48);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 24, cy - 48, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawMushroom: Draw = (ctx, w, h) => {
  ctx.fillStyle = '#f3ecdb';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, base = h * 0.78;
  // stem
  ctx.fillStyle = '#f0e6d0';
  ctx.strokeStyle = '#d8c9a8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 14, base);
  ctx.quadraticCurveTo(cx - 10, base - 52, cx - 8, base - 60);
  ctx.lineTo(cx + 8, base - 60);
  ctx.quadraticCurveTo(cx + 10, base - 52, cx + 14, base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // cap
  ctx.fillStyle = '#d96a52';
  ctx.beginPath();
  ctx.ellipse(cx, base - 58, 52, 38, 0, Math.PI, 0);
  ctx.fill();
  // cap dots
  ctx.fillStyle = '#f8ece2';
  for (const [dx, dy, r] of [[-26, -16, 7], [4, -30, 9], [28, -12, 6], [-4, -8, 5]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, base - 58 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // grass tufts
  ctx.strokeStyle = '#7fae5a';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (const [dx, lean] of [[-40, -0.4], [-30, 0.2], [34, 0.4], [44, -0.2]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + dx, base + 4);
    ctx.quadraticCurveTo(cx + dx + lean * 18, base - 14, cx + dx + lean * 26, base - 22);
    ctx.stroke();
  }
};

const drawFern: Draw = (ctx, w, h) => {
  ctx.fillStyle = '#eef0e2';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#5c8a4a';
  ctx.lineCap = 'round';
  const cx = w / 2, base = h * 0.84;
  for (const [lean, len] of [[-0.55, 0.62], [0, 0.74], [0.55, 0.62]] as const) {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, base);
    const tipX = cx + lean * 70, tipY = base - h * len;
    ctx.quadraticCurveTo(cx + lean * 20, base - h * len * 0.6, tipX, tipY);
    ctx.stroke();
    // leaflets
    ctx.lineWidth = 3;
    for (let t = 0.18; t < 0.95; t += 0.11) {
      const px = cx + (tipX - cx) * t + lean * 8 * Math.sin(t * 4);
      const py = base + (tipY - base) * t;
      const llen = 16 * (1 - t * 0.7);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + s * llen * 0.7, py - 2, px + s * llen, py - llen * 0.45);
        ctx.stroke();
      }
    }
  }
};

export class Room {
  onDrip?: () => void; // fired when the watering-can drop lands
  private drip: THREE.Mesh;
  private dripT = 4;
  private dripY = 0;
  private dripFalling = false;
  private labels: { group: THREE.Group; gx: number; gz: number }[] = [];
  private world?: World;

  constructor(scene: THREE.Scene, world?: World) {
    this.world = world;
    // Quiet warm plaster wall, darker toward the edges so the lit tank is
    // the unambiguous subject — busy wallpaper patterns read cheap.
    const wallTex = canvasTexture(1024, 512, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h * 0.62, 60, w / 2, h * 0.62, w * 0.62);
      g.addColorStop(0, '#b59c79');
      g.addColorStop(0.55, '#9a8161');
      g.addColorStop(1, '#6e5a42');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Faint plaster speckle for tooth.
      for (let i = 0; i < 2600; i++) {
        const a = Math.random() * 0.05;
        ctx.fillStyle = Math.random() < 0.5 ? `rgba(255,240,210,${a})` : `rgba(40,28,16,${a})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
    });
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 44),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.97, metalness: 0 })
    );
    wall.position.set(0, 18, -21);
    scene.add(wall);

    // Skirting board where wall meets table.
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(90, 1.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xc9ab7e, roughness: 0.7 })
    );
    skirt.position.set(0, 0.2, -20.8);
    scene.add(skirt);

    // Framed prints, hung with a little tilt like someone loved them up there.
    this.hangPoster(scene, drawButterfly, -13, 13.5, 4.2, 5.4, 0.03);
    this.hangPoster(scene, drawMushroom, -6.2, 11.2, 3.4, 4.4, -0.02);
    this.hangPoster(scene, drawFern, 12.5, 12.8, 4.0, 5.2, 0.025);

    // Desk props: a copper watering can and a stack of well-read books.
    this.wateringCan(scene, -16.5, 0, 6);
    this.bookStack(scene, 17.5, 0, -5.5);

    // --- the tiny details ---

    // An empty snail shell resting beside the books.
    const shellBig = new THREE.MeshStandardMaterial({ color: 0x9a6a40, roughness: 0.45 });
    const shellDark = new THREE.MeshStandardMaterial({ color: 0x755030, roughness: 0.45 });
    const shell = new THREE.Group();
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.26, 9, 20), shellBig);
    const coil2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.15, 8, 14), shellDark);
    const coreS = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), shellBig);
    shell.add(coil, coil2, coreS);
    shell.rotation.x = Math.PI / 2 - 0.25; // lying on its side
    shell.position.set(14.6, 0.45, -2.8);
    shell.traverse((o) => { o.castShadow = true; });
    scene.add(shell);

    // A pencil resting on top of the book stack.
    const pencil = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xd9a13c, roughness: 0.6 })
    );
    shaft.rotation.z = Math.PI / 2;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8d8b8, roughness: 0.7 })
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 1.35;
    const lead = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5 })
    );
    lead.rotation.z = -Math.PI / 2;
    lead.position.x = 1.52;
    pencil.add(shaft, tip, lead);
    pencil.position.set(17.3, 1.78, -5.2);
    pencil.rotation.y = 0.4;
    pencil.traverse((o) => { o.castShadow = true; });
    scene.add(pencil);

    // A hand-written card leaning against the front glass.
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.7),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(256, 168, (ctx, w, h) => {
          ctx.fillStyle = '#f4ecd8';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#b8a888';
          ctx.lineWidth = 3;
          ctx.strokeRect(5, 5, w - 10, h - 10);
          ctx.strokeStyle = '#5a4a38';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          // wobbly handwriting squiggles
          for (const [y0, x0, x1] of [[58, 36, 218], [96, 36, 190], [134, 70, 180]] as const) {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            for (let x = x0; x <= x1; x += 9) {
              ctx.lineTo(x, y0 + Math.sin(x * 0.32) * 5 + (Math.random() - 0.5) * 3);
            }
            ctx.stroke();
          }
          // a tiny heart at the end
          ctx.fillStyle = '#c96a6a';
          ctx.beginPath();
          ctx.arc(196, 130, 5, 0, Math.PI * 2);
          ctx.arc(205, 130, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(191, 133);
          ctx.lineTo(200.5, 144);
          ctx.lineTo(210, 133);
          ctx.fill();
        }),
        roughness: 0.85,
      })
    );
    card.position.set(-9.5, 0.85, 5.85);
    card.rotation.x = -0.32; // leaning back against the glass
    card.castShadow = true;
    scene.add(card);

    // Plant labels staked into the soil inside the tank (they ride the
    // terrain as it shifts).
    this.plantLabel(scene, 20, 24);
    this.plantLabel(scene, 123, 18);

    // The drip that falls from the watering can spout once in a while.
    this.drip = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshPhysicalMaterial({ color: 0x9fd0ea, roughness: 0.1, transparent: true, opacity: 0.85 })
    );
    this.drip.visible = false;
    scene.add(this.drip);
  }

  private plantLabel(scene: THREE.Scene, gx: number, gz: number): void {
    const group = new THREE.Group();
    const stake = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.7, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xb08c5c, roughness: 0.8 })
    );
    stake.position.y = 0.35;
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.3),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(96, 56, (ctx, w, h) => {
          ctx.fillStyle = '#f2e9d4';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#6a5a44';
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(12, 30);
          for (let x = 12; x <= 80; x += 6) {
            ctx.lineTo(x, 30 + Math.sin(x * 0.4) * 4 + (Math.random() - 0.5) * 2);
          }
          ctx.stroke();
        }),
        roughness: 0.9,
        side: THREE.DoubleSide,
      })
    );
    tag.position.y = 0.62;
    group.add(stake, tag);
    group.rotation.y = -0.35 + Math.random() * 0.7;
    group.traverse((o) => { o.castShadow = true; });
    scene.add(group);
    this.labels.push({ group, gx, gz });
  }

  // Animates the watering-can drip and keeps soil labels riding the terrain.
  update(dt: number): void {
    if (this.world) {
      for (const l of this.labels) {
        const [wx, , wz] = cellToWorld(l.gx, 0, l.gz);
        l.group.position.set(wx, Math.max(0, this.world.groundWorldY(l.gx, l.gz)) + 0.06, wz);
      }
    }

    if (this.dripFalling) {
      this.dripY -= 6 * dt;
      if (this.dripY <= 0.06) {
        this.dripFalling = false;
        this.drip.visible = false;
        this.dripT = 6 + Math.random() * 9;
        this.onDrip?.();
      } else {
        this.drip.position.y = this.dripY;
        this.drip.scale.y = 1.4; // stretched as it falls
      }
    } else {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        // Spout tip of the watering can (matches wateringCan placement).
        this.drip.position.set(-16.5 + Math.cos(0.5) * -2.55, 2.2, 6 + Math.sin(-0.5) * -2.55);
        this.dripY = 2.2;
        this.drip.scale.set(1, 1, 1);
        this.drip.visible = true;
        this.dripFalling = true;
      }
    }
  }

  private hangPoster(scene: THREE.Scene, draw: Draw, x: number, y: number, w: number, h: number, tilt: number): void {
    const group = new THREE.Group();
    // Slim dark walnut frame + wide cream mat: gallery framing reads
    // considered, not clipart.
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x3c2e20, roughness: 0.45, metalness: 0.05 })
    );
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9 })
    );
    mat.position.z = 0.085;
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.82, h * 0.82),
      new THREE.MeshStandardMaterial({ map: canvasTexture(256, Math.round(256 * h / w), draw), roughness: 0.9 })
    );
    art.position.z = 0.095;
    group.add(frame, mat, art);
    group.position.set(x, y, -20.6);
    group.rotation.z = tilt;
    scene.add(group);
  }

  private wateringCan(scene: THREE.Scene, x: number, y: number, z: number): void {
    const copper = new THREE.MeshStandardMaterial({ color: 0xb87545, roughness: 0.35, metalness: 0.75 });
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2.4, 18), copper);
    body.position.y = 1.2;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 2.6, 10), copper);
    spout.position.set(-1.6, 1.6, 0);
    spout.rotation.z = 0.8;
    const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 10), copper);
    nose.position.set(-2.55, 2.25, 0);
    nose.rotation.z = 0.8;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 8, 20, Math.PI), copper);
    handle.position.set(1.15, 1.7, 0);
    handle.rotation.z = -Math.PI / 2;
    group.add(body, spout, nose, handle);
    group.position.set(x, y, z);
    group.rotation.y = 0.5;
    group.traverse((o) => { o.castShadow = true; });
    scene.add(group);
  }

  private bookStack(scene: THREE.Scene, x: number, y: number, z: number): void {
    // Muted spines — library tones, not candy.
    const colors = [0x84443c, 0x49604a, 0x9a7c42];
    const group = new THREE.Group();
    let h = 0;
    for (let i = 0; i < 3; i++) {
      const bw = 3.4 - i * 0.3, bd = 2.5 - i * 0.2, bh = 0.55;
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.7 })
      );
      book.position.set((Math.random() - 0.5) * 0.4, h + bh / 2, (Math.random() - 0.5) * 0.3);
      book.rotation.y = (Math.random() - 0.5) * 0.35;
      book.castShadow = true;
      group.add(book);
      h += bh;
    }
    group.position.set(x, y, z);
    scene.add(group);
  }
}
