import * as THREE from 'three';

export const COLORS = {
  soil: {
    gravel: [0x696969, 0x808080, 0xA9A9A9, 0x9E9E8E],
    sand: [0xC2B280, 0xD2C290, 0xB8A970, 0xCDB87D],
    earth: [0x3D2B1F, 0x5C4033, 0x6B4423, 0x8B6914, 0x4A3728],
  },
  moss: [0x2D5A27, 0x3B7A33, 0x4A9A3F, 0x6BBF59, 0x1E4D1A, 0x357A2E],
  fern: [0x1B4D3E, 0x2E8B57, 0x3CB371, 0x66CDAA, 0x228B22],
  flower: [0xFF6B6B, 0xFFA07A, 0xFFD700, 0xDDA0DD, 0x87CEEB, 0xFF69B4, 0xFFC0CB, 0xE6E6FA],
  rock: [0x696969, 0x808080, 0xA9A9A9, 0xBDB8AD, 0x778899, 0x708090],
  crystal: [0x9B59B6, 0x3498DB, 0x1ABC9C, 0xE74C3C, 0xF39C12],
  water: [0x4A90D9, 0x5BA3E6, 0x7CB9F2, 0xA8D8FF],
  mushroom: {
    cap: [0xCD853F, 0xD2691E, 0x8B4513, 0xA0522D, 0xCC4444, 0xFFFFE0],
    stem: [0xFAEBD7, 0xFFE4C4, 0xF5DEB3, 0xEEDCB5],
    spots: [0xFFFFF0, 0xFFFAFA, 0xFFF8DC],
    glow: [0x7DFDFE, 0x39FF14, 0xBF40BF],
  },
  succulent: {
    inner: [0x2D5A27, 0x1B4D3E, 0x355E3B],
    outer: [0x4A9A3F, 0x6BBF59, 0x50C878],
    tips: [0xC04080, 0xDB7093, 0xCD5C5C, 0x9B59B6],
  },
  cactus: [0x2D5A27, 0x355E3B, 0x3B7A33, 0x228B22],
  bark: [0x3D2B1F, 0x5C4033, 0x6B4423, 0x4A3728, 0x8B4513],
  leaf: [0x228B22, 0x2E8B57, 0x3CB371, 0x32CD32, 0x006400],
  vine: [0x2E8B57, 0x3CB371, 0x228B22, 0x006400],
  pitcher: [0x8B0000, 0x6B3A2A, 0x4B5320, 0x556B2F],
  creature: {
    snailShell: [0xD2691E, 0xCD853F, 0x8B4513, 0xA0522D],
    snailBody: [0xBDB76B, 0xC4A35A, 0x9E8C50],
    ladybug: [0xCC0000, 0xDD2222],
    ladybugSpots: [0x111111],
    butterfly: [0xFF6B6B, 0x4A90D9, 0xFFD700, 0xDDA0DD, 0xFF8C00, 0x00CED1],
    frog: [0x32CD32, 0x228B22, 0x00FF00, 0xFF4500, 0x0000FF, 0xFFD700],
  },
  background: {
    top: 0x2C2419,
    bottom: 0x1A1510,
  },
};

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function varyColor(hex: number, amount: number = 0.08): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.h += (Math.random() - 0.5) * amount * 0.5;
  hsl.s += (Math.random() - 0.5) * amount;
  hsl.l += (Math.random() - 0.5) * amount;
  hsl.s = Math.max(0, Math.min(1, hsl.s));
  hsl.l = Math.max(0, Math.min(1, hsl.l));
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return color;
}

export function darkenColor(color: THREE.Color, factor: number): THREE.Color {
  const c = color.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.l *= (1 - factor);
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return c;
}
