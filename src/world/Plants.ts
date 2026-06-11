export type Species = 'fern' | 'grass' | 'succulent' | 'flower' | 'mushroom';

// Visual/health condition of a plant.
export type Look = 0 | 1 | 2; // healthy | wilted | dead

export interface Plant {
  id: number;
  species: Species;
  x: number; // column coords — height comes from the terrain, so plants
  z: number; // ride the ground as it settles and grows
  seed: number;
  stage: number; // 0..1 growth
  health: number; // 0..100 — driven by access to moisture
  look: Look;
  decayT: number; // dead plants count down to compost
}

// Species metadata for UI + placement rules.
export const SPECIES_INFO: Record<Species, { label: string; icon: string; needsSoil: boolean }> = {
  fern: { label: 'Fern', icon: '\u{1FAB4}', needsSoil: true },
  grass: { label: 'Grass', icon: '\u{1F33F}', needsSoil: true },
  succulent: { label: 'Succulent', icon: '\u{1F331}', needsSoil: true },
  flower: { label: 'Flower', icon: '\u{1F338}', needsSoil: true },
  mushroom: { label: 'Mushroom', icon: '\u{1F344}', needsSoil: false },
};
