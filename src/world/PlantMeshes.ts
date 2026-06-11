import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { Species } from './Plants';

// Smooth procedural plant geometry. Each plant is ONE merged, vertex-colored
// BufferGeometry (a single draw call), origin at its base, built at full
// size — growth is animated by scaling the mesh. Every species gets its own
// recognizable silhouette: a botanist should be able to tell them apart.

function paint(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Vertical gradient paint (base -> tip along local Y).
function paintGradient(geo: THREE.BufferGeometry, base: THREE.Color, tip: THREE.Color): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-5, maxY - minY);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / span;
    c.copy(base).lerp(tip, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Center-vein paint: bright center fading to edge color by |x| (for leaves
// built in the XY plane). Fittonia's nerves, peperomia's shell pattern.
function paintVein(geo: THREE.BufferGeometry, center: THREE.Color, edge: THREE.Color): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  let maxX = 1e-5;
  for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, Math.abs(pos.getX(i)));
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.abs(pos.getX(i)) / maxX);
    c.copy(center).lerp(edge, Math.pow(t, 0.6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Horizontal stripe paint along Y (haworthia's white tubercle bands).
function paintStripes(geo: THREE.BufferGeometry, base: THREE.Color, stripe: THREE.Color, freq: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = Math.sin(pos.getY(i) * freq);
    const c = s > 0.45 ? stripe : base;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

const GREENS = [0x4e8a3c, 0x5d9c48, 0x437a33, 0x569441, 0x39702c];
const TIP_GREENS = [0x8cc46a, 0x9ed27a, 0x7cba63];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// A leaf blade: a narrow plane, bent over by `bend`, tapered at the tip.
function blade(len: number, width: number, bend: number, baseC: THREE.Color, tipC: THREE.Color): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, len, 1, 4);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / len;
    pos.setZ(i, bend * t * t * len);            // arc over
    pos.setX(i, pos.getX(i) * (1 - t * 0.85)); // taper
  }
  geo.computeVertexNormals();
  return paintGradient(geo, baseC, tipC);
}

// An oval leaf in the XY plane (tapered both ends), painted by callback.
function ovalLeaf(len: number, width: number, painter: (g: THREE.BufferGeometry) => void): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, len, 2, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / len + 0.5); // 0..1 along the leaf
    const profile = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    pos.setX(i, pos.getX(i) * (0.25 + profile * 0.75));
    pos.setZ(i, Math.abs(pos.getX(i)) * 0.35); // gentle fold
  }
  geo.translate(0, len / 2, 0);
  geo.computeVertexNormals();
  painter(geo);
  return geo;
}

// ---- ferns ----

function buildNephrolepis(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 5 + Math.floor(rand() * 3);
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + rand() * 0.5;
    const len = 0.7 + rand() * 0.6;
    const rise = 0.45 + rand() * 0.3;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(dir.x * len * 0.35, rise * len, dir.z * len * 0.35),
      new THREE.Vector3(dir.x * len, rise * len * 0.55, dir.z * len)
    );
    const stemC = new THREE.Color(0x3e6b2e);
    parts.push(paint(new THREE.TubeGeometry(curve, 7, 0.012, 4), stemC));

    const leafC = new THREE.Color(pick(GREENS, rand));
    const leafC2 = new THREE.Color(pick(TIP_GREENS, rand));
    const pairs = 7;
    for (let p = 1; p <= pairs; p++) {
      const t = p / (pairs + 1);
      const pt = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      const leafLen = 0.16 * (1 - t * 0.65) * (len / 0.9);
      for (const s of [-1, 1]) {
        const leaf = new THREE.PlaneGeometry(leafLen, 0.05 * (1 - t * 0.4));
        paintGradient(leaf, leafC, leafC2);
        const m = new THREE.Matrix4();
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(1, 0, 0),
          side.clone().multiplyScalar(s).add(new THREE.Vector3(0, 0.35, 0)).normalize()
        );
        m.compose(
          pt.clone().add(side.clone().multiplyScalar(s * leafLen * 0.5)),
          quat,
          new THREE.Vector3(1, 1, 1)
        );
        leaf.applyMatrix4(m);
        parts.push(leaf);
      }
    }
  }
  return mergeGeometries(parts)!;
}

function buildAsplenium(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const fronds = 8 + Math.floor(rand() * 4);
  const baseC = new THREE.Color(0x3f7d2e);
  for (let f = 0; f < fronds; f++) {
    const ang = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const len = 0.55 + rand() * 0.4;
    const tipC = new THREE.Color(pick([0x9ed27a, 0x8cc46a, 0xa8dd84], rand));
    const frond = blade(len, 0.11 + rand() * 0.05, 0.5 + rand() * 0.4, baseC, tipC);
    frond.rotateY(ang);
    frond.rotateZ((rand() - 0.5) * 0.15);
    parts.push(frond);
  }
  // The "nest": a small dark core where the rosette gathers.
  const core = new THREE.SphereGeometry(0.07, 8, 6);
  paint(core, new THREE.Color(0x4a3a26));
  core.translate(0, 0.03, 0);
  parts.push(core);
  return mergeGeometries(parts)!;
}

// ---- tropical foliage ----

function buildFittonia(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leaves = 10 + Math.floor(rand() * 5);
  const vein = new THREE.Color(rand() < 0.5 ? 0xe88bb4 : 0xf0ede4); // pink or white nerves
  const edge = new THREE.Color(0x2c5e26);
  for (let l = 0; l < leaves; l++) {
    const ang = (l / leaves) * Math.PI * 2 + rand() * 0.6;
    const r = 0.05 + rand() * 0.16;
    const leaf = ovalLeaf(0.16 + rand() * 0.08, 0.11 + rand() * 0.04, (g) => paintVein(g, vein, edge));
    leaf.rotateX(-0.9 - rand() * 0.45); // lies low
    leaf.rotateY(ang);
    leaf.translate(Math.cos(ang) * r, 0.025 + rand() * 0.03, Math.sin(ang) * r);
    parts.push(leaf);
  }
  return mergeGeometries(parts)!;
}

function buildPilea(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leaves = 9 + Math.floor(rand() * 5);
  const base = new THREE.Color(0x355f2b);
  const bronze = new THREE.Color(0x7d5a3c);
  for (let l = 0; l < leaves; l++) {
    const ang = (l / leaves) * Math.PI * 2 + rand() * 0.7;
    const h = 0.07 + rand() * 0.16;
    const stem = new THREE.CylinderGeometry(0.006, 0.008, h, 4);
    paint(stem, base);
    stem.translate(0, h / 2, 0);
    stem.rotateZ((rand() - 0.5) * 0.7);
    stem.rotateY(ang);
    parts.push(stem);

    const leaf = new THREE.CircleGeometry(0.055 + rand() * 0.025, 8);
    const c = base.clone().lerp(bronze, rand() * 0.5);
    paintVein(leaf, c.clone().lerp(new THREE.Color(0x9ed27a), 0.4), c);
    leaf.rotateX(-Math.PI / 2 + 0.5 + rand() * 0.3);
    leaf.rotateY(ang);
    leaf.translate(Math.cos(ang) * h * 0.55, h * 0.95, Math.sin(ang) * h * 0.55);
    parts.push(leaf);
  }
  return mergeGeometries(parts)!;
}

function buildPeperomia(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const strands = 4 + Math.floor(rand() * 3);
  const stemC = new THREE.Color(0x6b8856);
  const shell = new THREE.Color(0x46683a);
  const shellLight = new THREE.Color(0x9bb98a);
  for (let s = 0; s < strands; s++) {
    const ang = (s / strands) * Math.PI * 2 + rand() * 0.7;
    const len = 0.3 + rand() * 0.3;
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(dir.x * len * 0.5, 0.05 + rand() * 0.04, dir.z * len * 0.5),
      new THREE.Vector3(dir.x * len, 0.012, dir.z * len)
    );
    parts.push(paint(new THREE.TubeGeometry(curve, 6, 0.005, 4), stemC));
    const beads = 4 + Math.floor(rand() * 3);
    for (let b = 0; b < beads; b++) {
      const t = (b + 1) / (beads + 1);
      const pt = curve.getPoint(t);
      const leaf = new THREE.CircleGeometry(0.028 + rand() * 0.012, 7);
      paintVein(leaf, shellLight, shell);
      leaf.rotateX(-Math.PI / 2 + (rand() - 0.5) * 0.4);
      leaf.translate(pt.x, pt.y + 0.012, pt.z);
      parts.push(leaf);
    }
  }
  return mergeGeometries(parts)!;
}

// ---- succulents ----

function buildEcheveria(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rings = 3;
  const inner = new THREE.Color(0x4a7a6e);
  for (let k = 0; k < rings; k++) {
    const leaves = 5 + k * 3;
    const tilt = 0.5 + k * 0.38; // outer rings lie flatter
    const leafLen = 0.2 + k * 0.12;
    const ringC = new THREE.Color(pick([0x7fa78f, 0x8fb39e, 0x6f9a85], rand)).lerp(inner, (rings - k) * 0.2);
    for (let l = 0; l < leaves; l++) {
      const ang = (l / leaves) * Math.PI * 2 + k * 0.5 + rand() * 0.1;
      const leaf = new THREE.ConeGeometry(0.07 + k * 0.015, leafLen, 5);
      leaf.scale(1, 1, 0.55);
      paintGradient(leaf, ringC, new THREE.Color(0xd193a4)); // blushed tips
      leaf.translate(0, leafLen / 2, 0);
      leaf.rotateX(tilt);
      leaf.rotateY(-ang);
      leaf.translate(Math.cos(ang) * 0.05 * k, 0.15 - k * 0.05, Math.sin(ang) * 0.05 * k);
      parts.push(leaf);
    }
  }
  return mergeGeometries(parts)!;
}

function buildHaworthia(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leaves = 11 + Math.floor(rand() * 5);
  const dark = new THREE.Color(0x2c5230);
  const stripe = new THREE.Color(0xe9efe2);
  for (let l = 0; l < leaves; l++) {
    const ang = (l / leaves) * Math.PI * 2 + rand() * 0.3;
    const len = 0.22 + rand() * 0.16;
    const leaf = new THREE.ConeGeometry(0.035, len, 4);
    leaf.scale(1, 1, 0.6);
    paintStripes(leaf, dark, stripe, 36 + rand() * 14);
    leaf.translate(0, len / 2, 0);
    leaf.rotateX(0.32 + rand() * 0.3);
    leaf.rotateY(-ang);
    leaf.translate(Math.cos(ang) * 0.04, 0.01, Math.sin(ang) * 0.04);
    parts.push(leaf);
  }
  return mergeGeometries(parts)!;
}

// ---- sedge ----

function buildEleocharis(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 16 + Math.floor(rand() * 9);
  for (let i = 0; i < blades; i++) {
    const len = 0.55 + rand() * 0.7;
    const b = blade(
      len, 0.014 + rand() * 0.01, 0.18 + rand() * 0.45,
      new THREE.Color(pick([0x4e8a3c, 0x5d9c48, 0x67ad50], rand)),
      new THREE.Color(pick(TIP_GREENS, rand))
    );
    b.rotateY(rand() * Math.PI * 2);
    b.rotateZ((rand() - 0.5) * 0.4);
    b.translate((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2);
    parts.push(b);
  }
  return mergeGeometries(parts)!;
}

// ---- flowering / carnivorous ----

function buildSinningia(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Thumbnail rosette of round leaves.
  const leaves = 6 + Math.floor(rand() * 3);
  const leafC = new THREE.Color(0x3c6e30);
  for (let l = 0; l < leaves; l++) {
    const ang = (l / leaves) * Math.PI * 2 + rand() * 0.5;
    const leaf = new THREE.CircleGeometry(0.05 + rand() * 0.02, 8);
    paintVein(leaf, leafC.clone().lerp(new THREE.Color(0x9ed27a), 0.35), leafC);
    leaf.rotateX(-Math.PI / 2 + 0.45);
    leaf.rotateY(ang);
    leaf.translate(Math.cos(ang) * 0.055, 0.03, Math.sin(ang) * 0.055);
    parts.push(leaf);
  }
  // Lavender trumpets on slender stalks.
  const blooms = 1 + Math.floor(rand() * 3);
  for (let b = 0; b < blooms; b++) {
    const ang = rand() * Math.PI * 2;
    const h = 0.22 + rand() * 0.16;
    const lean = (rand() - 0.5) * 0.1;
    const stalk = new THREE.CylinderGeometry(0.006, 0.008, h, 4);
    paint(stalk, new THREE.Color(0x5a7d46));
    stalk.translate(lean, h / 2, 0);
    stalk.rotateY(ang);
    parts.push(stalk);

    const trumpetC = new THREE.Color(pick([0xb89ae0, 0xa98ad6, 0xc4a8ea], rand));
    const tube = new THREE.CylinderGeometry(0.045, 0.016, 0.12, 7, 1, true);
    paintGradient(tube, trumpetC.clone().lerp(new THREE.Color(0x6a4a9e), 0.4), trumpetC);
    tube.translate(lean, h + 0.05, 0);
    tube.rotateY(ang);
    parts.push(tube);
    // Flared face.
    const face = new THREE.CircleGeometry(0.055, 7);
    paintVein(face, new THREE.Color(0xf2eef8), trumpetC);
    face.rotateX(-Math.PI / 2);
    face.translate(lean, h + 0.112, 0);
    face.rotateY(ang);
    parts.push(face);
  }
  return mergeGeometries(parts)!;
}

function buildDrosera(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const paddles = 6 + Math.floor(rand() * 4);
  const leafBase = new THREE.Color(0x5a8a3a);
  const leafTip = new THREE.Color(0xc05a3a); // reddening toward the trap
  for (let p = 0; p < paddles; p++) {
    const ang = (p / paddles) * Math.PI * 2 + rand() * 0.4;
    const len = 0.28 + rand() * 0.18;
    const paddle = blade(len, 0.045, 0.32 + rand() * 0.3, leafBase, leafTip);
    paddle.rotateY(ang);
    paddle.rotateZ((rand() - 0.5) * 0.2);
    parts.push(paddle);
    // Sticky dew: tiny bright droplets along the upper half.
    const drops = 4 + Math.floor(rand() * 3);
    for (let d = 0; d < drops; d++) {
      const t = 0.45 + (d / drops) * 0.5;
      const drop = new THREE.SphereGeometry(0.011, 5, 4);
      paint(drop, new THREE.Color(0xf2c9c0));
      // Place along the arched blade (mirror the blade's bend math).
      const bend = 0.45;
      const y = len * t;
      const zz = bend * t * t * len;
      drop.translate((rand() - 0.5) * 0.035, y, zz + 0.012);
      drop.rotateY(ang);
      parts.push(drop);
    }
  }
  return mergeGeometries(parts)!;
}

// ---- fungi ----

function buildShrooms(
  rand: () => number,
  stemC: THREE.Color, capDark: THREE.Color, capLight: THREE.Color,
  slim: boolean
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cluster = 2 + Math.floor(rand() * 3);
  for (let m = 0; m < cluster; m++) {
    const scale = m === 0 ? 1 : 0.5 + rand() * 0.4;
    const ox = m === 0 ? 0 : (rand() - 0.5) * 0.45;
    const oz = m === 0 ? 0 : (rand() - 0.5) * 0.45;
    const h = (slim ? 0.34 + rand() * 0.22 : 0.28 + rand() * 0.2) * scale;
    const stem = new THREE.CylinderGeometry((slim ? 0.02 : 0.035) * scale, (slim ? 0.028 : 0.05) * scale, h, 7);
    paint(stem, stemC);
    stem.translate(ox, h / 2, oz);
    parts.push(stem);

    const capR = ((slim ? 0.1 : 0.14) + rand() * 0.07) * scale;
    const cap = new THREE.SphereGeometry(capR, 10, 6, 0, Math.PI * 2, 0, Math.PI * (slim ? 0.62 : 0.55));
    cap.scale(1, slim ? 0.95 : 0.75, 1);
    paintGradient(cap, capDark, capLight);
    cap.translate(ox, h * 0.98, oz);
    parts.push(cap);
  }
  return mergeGeometries(parts)!;
}

function buildMycena(rand: () => number): THREE.BufferGeometry {
  return buildShrooms(
    rand,
    new THREE.Color(0xdfe8da),
    new THREE.Color(0xb8ccb4),
    new THREE.Color(0xe9f5e4),
    true
  );
}

function buildLeucocoprinus(rand: () => number): THREE.BufferGeometry {
  return buildShrooms(
    rand,
    new THREE.Color(0xefe3a8),
    new THREE.Color(0xcfae45),
    new THREE.Color(0xf0dd7d),
    true
  );
}

export function buildPlantGeometry(species: Species, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  switch (species) {
    case 'nephrolepis': return buildNephrolepis(rand);
    case 'asplenium': return buildAsplenium(rand);
    case 'fittonia': return buildFittonia(rand);
    case 'pilea': return buildPilea(rand);
    case 'peperomia': return buildPeperomia(rand);
    case 'echeveria': return buildEcheveria(rand);
    case 'haworthia': return buildHaworthia(rand);
    case 'eleocharis': return buildEleocharis(rand);
    case 'sinningia': return buildSinningia(rand);
    case 'drosera': return buildDrosera(rand);
    case 'mycena': return buildMycena(rand);
    case 'leucocoprinus': return buildLeucocoprinus(rand);
  }
}
