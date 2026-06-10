import * as THREE from 'three';

// One global 8-bit palette. Every voxel stores a single byte index into this
// table, which makes the grid trivially serializable and keeps colors stable
// while grains tumble around.

export interface PaletteRange {
  start: number;
  count: number;
}

const entries: number[] = [0x000000]; // index 0 reserved

function range(hexes: number[]): PaletteRange {
  const start = entries.length;
  entries.push(...hexes);
  return { start, count: hexes.length };
}

export const RANGES = {
  sand: range([0xd6bc8a, 0xcdb280, 0xc4a878, 0xdcc394, 0xc9ae7d, 0xd1b685, 0xbfa472, 0xe0c89a]),
  soil: range([0x5a4332, 0x66503a, 0x4d3a29, 0x6e5540, 0x574230, 0x624c37, 0x523d2a, 0x6a523c]),
  gravel: range([0x9a948c, 0x857f78, 0xa8a29a, 0x78736d, 0x8f8a85, 0xb0a89e, 0x6e6a66, 0x97928d]),
  rock: range([0x7d7a74, 0x8c8881, 0x6b6862, 0x9b968e, 0x76726b, 0x84807a]),
  water: range([0x7ec3e8, 0x8acbed, 0x74bbe2, 0x82c5ea]),
  stem: range([0x4f7a3a, 0x456e33, 0x5a8743, 0x6b5337, 0x7a5f3e, 0x3e6b2e]),
  leaf: range([0x4e8a3c, 0x5d9c48, 0x437a33, 0x6fae57, 0x39702c, 0x559441, 0x7cba63, 0x2f6325, 0x68a951, 0x498536]),
  leafDark: range([0x3a6b2e, 0x437837, 0x305c26, 0x4a7d3c]),
  petal: range([0xe26d6d, 0xf0938c, 0xf2c14e, 0xc77dd8, 0xe88bb4, 0xf5f1e6, 0xe2a14e, 0xd96fa3]),
  petalCenter: range([0xf2cc4e, 0xe8b93a, 0xf7d96a]),
  mushroom: range([0xc14f3a, 0xb84a36, 0xd05c42, 0xa84432]),
  mushroomStem: range([0xeadfc8, 0xe2d4b8, 0xf0e6d2]),
  mushroomSpot: range([0xf5efe0, 0xfaf5e8]),
  // Bright yellow-greens so moss reads clearly against soil and gravel.
  moss: range([0x6fae45, 0x7fbd52, 0x5f9e3c, 0x8cc763, 0x569636, 0x77b54e]),
  // Plant health states
  wilt: range([0xb5a04a, 0xa8923d, 0x9c8838, 0xc2ad5a, 0x8f7a33]),
  dead: range([0x6e5a3a, 0x7d684a, 0x5c4a30, 0x66543a]),
} as const;

export type RangeName = keyof typeof RANGES;

// Linear-space colors indexed by palette byte (materials expect linear).
export const PALETTE: THREE.Color[] = entries.map((hex) =>
  new THREE.Color(hex).convertSRGBToLinear()
);

export function randomShade(name: RangeName, rand: () => number = Math.random): number {
  const r = RANGES[name];
  return r.start + Math.floor(rand() * r.count);
}

export function shadeInRange(shade: number, name: RangeName): boolean {
  const r = RANGES[name];
  return shade >= r.start && shade < r.start + r.count;
}
