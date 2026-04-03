import * as THREE from 'three';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

// Vessel profile: returns the radius at a given normalized height (0=bottom, 1=top)
// Classic jar shape
const VESSEL_PROFILE: [number, number][] = [
  [0.00, 0.00],  // bottom center
  [0.02, 0.85],  // bottom edge
  [0.05, 0.92],  // lower belly
  [0.15, 0.97],  // belly
  [0.30, 1.00],  // widest
  [0.50, 0.98],  // mid
  [0.65, 0.93],  // upper body
  [0.75, 0.80],  // neck start
  [0.80, 0.65],  // neck
  [0.85, 0.58],  // narrow neck
  [0.88, 0.55],  // narrowest
  [0.92, 0.58],  // lip flare
  [0.95, 0.62],  // lip
  [0.97, 0.63],  // lip top
  [1.00, 0.63],  // top
];

export function getVesselRadiusAtHeight(normalizedY: number): number {
  if (normalizedY <= 0 || normalizedY >= 1) return 0;

  for (let i = 1; i < VESSEL_PROFILE.length; i++) {
    const [y0, r0] = VESSEL_PROFILE[i - 1];
    const [y1, r1] = VESSEL_PROFILE[i];
    if (normalizedY >= y0 && normalizedY <= y1) {
      const t = (normalizedY - y0) / (y1 - y0);
      return lerp(r0, r1, t);
    }
  }
  return 0;
}

export const GRID_SIZE = 48;
export const VESSEL_RADIUS = 10; // world units
export const VESSEL_HEIGHT = 22; // world units
export const VOXEL_SIZE = (VESSEL_RADIUS * 2) / GRID_SIZE;

// Convert grid coords to world position
export function gridToWorld(gx: number, gy: number, gz: number): THREE.Vector3 {
  const halfGrid = GRID_SIZE / 2;
  return new THREE.Vector3(
    (gx - halfGrid + 0.5) * VOXEL_SIZE,
    (gy + 0.5) * VOXEL_SIZE - VESSEL_HEIGHT * 0.02,
    (gz - halfGrid + 0.5) * VOXEL_SIZE
  );
}

// Convert world position to grid coords
export function worldToGrid(pos: THREE.Vector3): [number, number, number] {
  const halfGrid = GRID_SIZE / 2;
  return [
    Math.floor(pos.x / VOXEL_SIZE + halfGrid),
    Math.floor((pos.y + VESSEL_HEIGHT * 0.02) / VOXEL_SIZE),
    Math.floor(pos.z / VOXEL_SIZE + halfGrid),
  ];
}

// Check if a grid position is inside the vessel
export function isInsideVessel(gx: number, gy: number, gz: number): boolean {
  const normalizedY = (gy + 0.5) / GRID_SIZE;
  if (normalizedY <= 0.02 || normalizedY >= 0.88) return false; // below bottom / above neck

  const maxRadius = getVesselRadiusAtHeight(normalizedY) * VESSEL_RADIUS * 0.92; // slight inset
  const cx = (gx - GRID_SIZE / 2 + 0.5) * VOXEL_SIZE;
  const cz = (gz - GRID_SIZE / 2 + 0.5) * VOXEL_SIZE;
  const dist = Math.sqrt(cx * cx + cz * cz);

  return dist < maxRadius;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function lerpColor(c1: THREE.Color, c2: THREE.Color, t: number): THREE.Color {
  return new THREE.Color().copy(c1).lerp(c2, t);
}

export function distance2D(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dz * dz);
}
