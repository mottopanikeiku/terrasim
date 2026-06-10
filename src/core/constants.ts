// Aquarium interior grid dimensions (cells) and cell size (world units).
// Tank interior: 24 x 10 x 10 world units (w x h x d) — panoramic.
export const W = 96;
export const H = 40;
export const D = 40;
export const V = 0.25;

export const TANK_W = W * V;
export const TANK_H = H * V;
export const TANK_D = D * V;

// Grid (x,y,z) cell index -> world-space center of that cell.
export function cellToWorld(x: number, y: number, z: number): [number, number, number] {
  return [(x - W / 2 + 0.5) * V, (y + 0.5) * V, (z - D / 2 + 0.5) * V];
}
