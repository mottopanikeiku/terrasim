// Aquarium interior grid dimensions (cells) and cell size (world units).
// Tank interior: 24 x 10 x 10 world units (w x h x d) — panoramic.
// Cells are deliberately small (1/6 unit) so grains read as granules,
// not blocks.
export const W = 144;
export const H = 60;
export const D = 60;
export const V = 1 / 6;

export const TANK_W = W * V;
export const TANK_H = H * V;
export const TANK_D = D * V;

// Grid (x,y,z) cell index -> world-space center of that cell.
export function cellToWorld(x: number, y: number, z: number): [number, number, number] {
  return [(x - W / 2 + 0.5) * V, (y + 0.5) * V, (z - D / 2 + 0.5) * V];
}
