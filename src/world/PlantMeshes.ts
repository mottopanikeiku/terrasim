import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { Species } from './Plants';

// Smooth procedural plant geometry. Each plant is ONE merged, vertex-colored
// BufferGeometry (a single draw call), origin at its base, built at full
// size — growth is animated by scaling the mesh.

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

const GREENS = [0x4e8a3c, 0x5d9c48, 0x437a33, 0x569441, 0x39702c];
const TIP_GREENS = [0x8cc46a, 0x9ed27a, 0x7cba63];
const PETALS = [0xe26d6d, 0xf0938c, 0xf2c14e, 0xc77dd8, 0xe88bb4, 0xe2a14e, 0xd96fa3, 0xf5f1e6];

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

// A grass blade: a narrow plane, bent over by k, tapered at the tip.
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

function buildGrass(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blades = 9 + Math.floor(rand() * 6);
  for (let i = 0; i < blades; i++) {
    const len = 0.5 + rand() * 0.8;
    const b = blade(
      len, 0.035 + rand() * 0.02, 0.25 + rand() * 0.5,
      new THREE.Color(pick(GREENS, rand)), new THREE.Color(pick(TIP_GREENS, rand))
    );
    b.rotateY(rand() * Math.PI * 2);
    b.rotateZ((rand() - 0.5) * 0.35);
    b.translate((rand() - 0.5) * 0.22, 0, (rand() - 0.5) * 0.22);
    parts.push(b);
  }
  return mergeGeometries(parts)!;
}

function buildFern(rand: () => number): THREE.BufferGeometry {
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
    const rachis = new THREE.TubeGeometry(curve, 7, 0.012, 4);
    parts.push(paint(rachis, stemC));

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

function buildSucculent(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rings = 3;
  const inner = new THREE.Color(0x2f6325);
  for (let k = 0; k < rings; k++) {
    const leaves = 5 + k * 3;
    const tilt = 0.5 + k * 0.38; // outer rings lie flatter
    const leafLen = 0.22 + k * 0.13;
    const ringC = new THREE.Color(pick([0x4e8a3c, 0x5d9c48, 0x6aab57], rand)).lerp(inner, (rings - k) * 0.25);
    for (let l = 0; l < leaves; l++) {
      const ang = (l / leaves) * Math.PI * 2 + k * 0.5 + rand() * 0.1;
      const leaf = new THREE.ConeGeometry(0.07 + k * 0.015, leafLen, 5);
      leaf.scale(1, 1, 0.55);
      paintGradient(leaf, ringC, new THREE.Color(0xc98a96)); // blushed tips
      leaf.translate(0, leafLen / 2, 0);
      leaf.rotateX(tilt);
      leaf.rotateY(-ang);
      leaf.translate(Math.cos(ang) * 0.05 * k, 0.16 - k * 0.05, Math.sin(ang) * 0.05 * k);
      parts.push(leaf);
    }
  }
  return mergeGeometries(parts)!;
}

function buildFlower(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = 0.7 + rand() * 0.5;
  const lean = (rand() - 0.5) * 0.25;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.5, h * 0.6, 0),
    new THREE.Vector3(lean, h, 0)
  );
  const stemC = new THREE.Color(0x4f7a3a);
  parts.push(paint(new THREE.TubeGeometry(curve, 6, 0.015, 5), stemC));

  // Leaf pair on the stem.
  for (const s of [-1, 1]) {
    const leaf = blade(0.22, 0.07, 0.5, stemC, new THREE.Color(pick(TIP_GREENS, rand)));
    leaf.rotateZ(s * 1.05);
    leaf.rotateY(rand() * Math.PI);
    leaf.translate(0, h * (0.3 + rand() * 0.2), 0);
    parts.push(leaf);
  }

  // Bloom.
  const head = curve.getPoint(1);
  const petalC = new THREE.Color(pick(PETALS, rand));
  const petalC2 = petalC.clone().lerp(new THREE.Color(0xffffff), 0.35);
  const petals = 6 + Math.floor(rand() * 3);
  for (let p = 0; p < petals; p++) {
    const ang = (p / petals) * Math.PI * 2;
    const petal = new THREE.PlaneGeometry(0.09, 0.17, 1, 2);
    paintGradient(petal, petalC, petalC2);
    petal.translate(0, 0.085, 0);
    petal.rotateX(-0.95);
    petal.rotateY(ang);
    petal.translate(head.x, head.y, head.z);
    parts.push(petal);
  }
  const center = new THREE.SphereGeometry(0.045, 8, 6);
  paint(center, new THREE.Color(0xf2cc4e));
  center.translate(head.x, head.y + 0.01, head.z);
  parts.push(center);
  return mergeGeometries(parts)!;
}

function buildMushroom(rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cluster = 2 + Math.floor(rand() * 2);
  for (let m = 0; m < cluster; m++) {
    const scale = m === 0 ? 1 : 0.5 + rand() * 0.4;
    const ox = m === 0 ? 0 : (rand() - 0.5) * 0.45;
    const oz = m === 0 ? 0 : (rand() - 0.5) * 0.45;
    const h = (0.28 + rand() * 0.2) * scale;
    const stem = new THREE.CylinderGeometry(0.035 * scale, 0.05 * scale, h, 7);
    paint(stem, new THREE.Color(0xeadfc8));
    stem.translate(ox, h / 2, oz);
    parts.push(stem);

    const capR = (0.14 + rand() * 0.08) * scale;
    const cap = new THREE.SphereGeometry(capR, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    cap.scale(1, 0.75, 1);
    paintGradient(cap, new THREE.Color(0x8a3528), new THREE.Color(pick([0xc14f3a, 0xd05c42, 0xb84a36], rand)));
    cap.translate(ox, h * 0.98, oz);
    parts.push(cap);
  }
  return mergeGeometries(parts)!;
}

export function buildPlantGeometry(species: Species, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  switch (species) {
    case 'grass': return buildGrass(rand);
    case 'fern': return buildFern(rand);
    case 'succulent': return buildSucculent(rand);
    case 'flower': return buildFlower(rand);
    case 'mushroom': return buildMushroom(rand);
  }
}
