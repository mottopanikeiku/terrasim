import * as THREE from 'three';
import { TANK_W, TANK_H, TANK_D } from '../core/constants';

const GLASS_T = 0.12; // pane thickness
const MARGIN = 0.06; // gap between interior grid and glass

// Rectangular open-top aquarium: four transmission-glass walls, a glass
// bottom, dark silicone-style edge seams, sitting on a wooden table.
export class Aquarium {
  constructor(scene: THREE.Scene) {
    const w = TANK_W + MARGIN * 2;
    const d = TANK_D + MARGIN * 2;
    const h = TANK_H + 0.4; // a little headroom above the grid

    // Plain transparent glass instead of `transmission`: three.js excludes
    // transparent objects (our water) from the transmission backdrop, which
    // would make the pond invisible through the walls. Flat panes barely
    // refract anyway, so alpha-blended glass with strong reflections reads
    // just as real.
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xf4fbf7,
      transparent: true,
      opacity: 0.06,
      roughness: 0.04,
      metalness: 0.0,
      envMapIntensity: 0.7,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const panes: [number, number, number, number, number, number][] = [
      // [sx, sy, sz, px, py, pz]
      [w + GLASS_T * 2, h, GLASS_T, 0, h / 2, d / 2 + GLASS_T / 2],   // front
      [w + GLASS_T * 2, h, GLASS_T, 0, h / 2, -d / 2 - GLASS_T / 2],  // back
      [GLASS_T, h, d, -w / 2 - GLASS_T / 2, h / 2, 0],                // left
      [GLASS_T, h, d, w / 2 + GLASS_T / 2, h / 2, 0],                 // right
      [w + GLASS_T * 2, GLASS_T, d + GLASS_T * 2, 0, -GLASS_T / 2, 0], // bottom
    ];
    for (const [sx, sy, sz, px, py, pz] of panes) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), glass);
      pane.position.set(px, py, pz);
      scene.add(pane);
    }

    // Edge seams: slim dark strips along the four vertical corners and the
    // top/bottom rims, like aquarium silicone/trim.
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x20211f, roughness: 0.6, metalness: 0.15 });
    const seamT = 0.07;
    const addSeam = (sx: number, sy: number, sz: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), seamMat);
      m.position.set(px, py, pz);
      scene.add(m);
    };
    const ox = w / 2 + GLASS_T / 2;
    const oz = d / 2 + GLASS_T / 2;
    for (const [px, pz] of [[-ox, -oz], [ox, -oz], [-ox, oz], [ox, oz]] as const) {
      addSeam(seamT * 2, h, seamT * 2, px, h / 2, pz);
    }
    for (const py of [0, h]) {
      addSeam(w + GLASS_T * 3, seamT, seamT * 2, 0, py, -oz);
      addSeam(w + GLASS_T * 3, seamT, seamT * 2, 0, py, oz);
      addSeam(seamT * 2, seamT, d + GLASS_T * 3, -ox, py, 0);
      addSeam(seamT * 2, seamT, d + GLASS_T * 3, ox, py, 0);
    }

    // Warm wooden tabletop with plank seams and a satin sheen.
    const tableTex = Aquarium.makeWoodTexture();
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(70, 0.6, 44),
      new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.45, metalness: 0.0, envMapIntensity: 0.55 })
    );
    table.position.y = -0.3 - GLASS_T;
    table.receiveShadow = true;
    scene.add(table);

    // Soft contact shadow hugging the tank base — grounds it on the table.
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.5, d * 1.9),
      new THREE.MeshBasicMaterial({
        map: Aquarium.makeContactShadowTexture(),
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      })
    );
    contact.rotation.x = -Math.PI / 2;
    contact.position.y = 0.012 - GLASS_T;
    contact.renderOrder = 1;
    scene.add(contact);
  }

  private static makeWoodTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d')!;
    // Deep walnut, low-contrast grain: rich and quiet so it doesn't compete
    // with the tank.
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#5a3f26');
    grad.addColorStop(0.5, '#64472b');
    grad.addColorStop(1, '#523a22');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);
    const plankH = 256;
    for (let p = 0; p < 4; p++) {
      const y0 = p * plankH;
      ctx.fillStyle = `rgba(${40 + Math.random() * 26 | 0}, ${28 + Math.random() * 16 | 0}, ${14 + Math.random() * 10 | 0}, 0.12)`;
      ctx.fillRect(0, y0, 1024, plankH);
      ctx.fillStyle = 'rgba(24, 14, 6, 0.35)';
      ctx.fillRect(0, y0, 1024, 1.5);
      for (let i = 0; i < 18; i++) {
        const y = y0 + 10 + Math.random() * (plankH - 16);
        const lum = 0.85 + Math.random() * 0.3;
        ctx.strokeStyle = `rgba(${(96 * lum) | 0}, ${(68 * lum) | 0}, ${(40 * lum) | 0}, ${0.08 + Math.random() * 0.1})`;
        ctx.lineWidth = 1 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 32) {
          ctx.lineTo(x, y + Math.sin(x * 0.009 + i * 3 + p) * 3 + (Math.random() - 0.5) * 1);
        }
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1.6, 1.2);
    tex.anisotropy = 4;
    return tex;
  }

  private static makeContactShadowTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    g.addColorStop(0, 'rgba(20, 10, 4, 0.9)');
    g.addColorStop(0.55, 'rgba(20, 10, 4, 0.45)');
    g.addColorStop(1, 'rgba(20, 10, 4, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }
}
