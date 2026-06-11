// The species registry: real terrarium plants with real taxonomy. Each
// entry carries the botany (genus, family, habitat lore for the field
// guide) AND the care traits that actually drive the simulation — thirst,
// drought tolerance, reseeding, where it likes to live.

export type Species =
  | 'nephrolepis' | 'asplenium'                 // ferns
  | 'fittonia' | 'pilea' | 'peperomia'          // tropical foliage
  | 'echeveria' | 'haworthia'                   // succulents
  | 'eleocharis'                                // pond-edge sedge
  | 'sinningia' | 'drosera'                     // flowering / carnivorous
  | 'mycena' | 'leucocoprinus';                 // fungi

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

export interface SpeciesDef {
  label: string;       // common name
  sci: string;         // Genus species
  family: string;
  icon: string;
  group: 'fern' | 'foliage' | 'succulent' | 'sedge' | 'flower' | 'fungus';
  needsSoil: boolean;  // fungi grow on any damp substrate
  thirst: number;      // health lost per dry growth tick
  idealWet: [number, number]; // moisture band (0..1) for the guide
  spread: number;      // reseed chance per growth tick when mature
  waterEdge?: boolean; // grows faster within reach of standing water
  drownDepth: number;  // standing water above this depth smothers it
  glows?: boolean;     // bioluminescent at night
  lore: string;        // real-world botany for the field guide
  care: string;        // how it behaves in this tank
}

export const SPECIES: Record<Species, SpeciesDef> = {
  nephrolepis: {
    label: 'Boston fern', sci: 'Nephrolepis exaltata', family: 'Nephrolepidaceae',
    icon: '\u{1FAB4}', group: 'fern', needsSoil: true,
    thirst: 0.16, idealWet: [0.35, 0.9], spread: 0.0009, drownDepth: 0.3,
    lore: 'A fern of humid forests and swamps across the tropical Americas, spreading by furry runners. The arching, pinnate fronds made it the classic parlor fern of the 1890s.',
    care: 'Wants evenly damp soil and humid air; wilts quickly in a dry tank and perks back up after watering.',
  },
  asplenium: {
    label: "Bird's-nest fern", sci: 'Asplenium nidus', family: 'Aspleniaceae',
    icon: '\u{1F33F}', group: 'fern', needsSoil: true,
    thirst: 0.14, idealWet: [0.3, 0.85], spread: 0.0007, drownDepth: 0.3,
    lore: 'An epiphyte from rainforest canopies of tropical Asia and the Pacific. Its rosette of glossy strap fronds forms a "nest" that catches falling leaves and rain, composting them into food.',
    care: 'Steady moisture, never soggy. The broad fronds love the fog of a humid tank.',
  },
  fittonia: {
    label: 'Nerve plant', sci: 'Fittonia albivenis', family: 'Acanthaceae',
    icon: '\u{1F343}', group: 'foliage', needsSoil: true,
    thirst: 0.18, idealWet: [0.4, 0.95], spread: 0.001, drownDepth: 0.25,
    lore: 'A creeping herb from the Peruvian rainforest floor, named for the striking net of pale veins across each leaf. Famous for theatrical "fainting" when thirsty — and full recovery within hours of a drink.',
    care: 'The thirstiest plant in the tank. Keep its corner properly damp or watch the drama.',
  },
  pilea: {
    label: 'Friendship plant', sci: 'Pilea involucrata', family: 'Urticaceae',
    icon: '\u{1F33F}', group: 'foliage', needsSoil: true,
    thirst: 0.12, idealWet: [0.3, 0.85], spread: 0.0012, drownDepth: 0.25,
    lore: 'A Central American understory herb with quilted, bronze-flushed leaves. A nettle relative that lost its sting — and so easy to share from cuttings that it earned its common name.',
    care: 'Easy-going in warm humid air; spreads politely into nearby damp soil.',
  },
  peperomia: {
    label: 'String of turtles', sci: 'Peperomia prostrata', family: 'Piperaceae',
    icon: '\u{1FABA}', group: 'foliage', needsSoil: true,
    thirst: 0.07, idealWet: [0.18, 0.6], spread: 0.0008, drownDepth: 0.2,
    lore: 'A trailing epiphyte from Brazilian rainforests; each coin-sized leaf carries a turtle-shell pattern. A pepper-family plant with semi-succulent leaves that store their own water.',
    care: 'Light watering only — its plump little leaves carry a reserve through dry spells.',
  },
  echeveria: {
    label: 'Mexican snowball', sci: 'Echeveria elegans', family: 'Crassulaceae',
    icon: '\u{1F331}', group: 'succulent', needsSoil: true,
    thirst: 0.03, idealWet: [0.05, 0.35], spread: 0.0005, drownDepth: 0.12,
    lore: 'A high-desert rosette from Mexico that banks water in plump blue-green leaves. Like most succulents it uses CAM photosynthesis — opening its stomata only at night to spend less water.',
    care: 'Loves the dry sandy corner. Too much standing water will rot it.',
  },
  haworthia: {
    label: 'Zebra plant', sci: 'Haworthiopsis attenuata', family: 'Asphodelaceae',
    icon: '\u{1F335}', group: 'succulent', needsSoil: true,
    thirst: 0.035, idealWet: [0.05, 0.4], spread: 0.0005, drownDepth: 0.12,
    lore: 'A South African scrubland succulent striped with bands of white tubercles. Another night-breathing CAM plant, built to shrug off months of drought.',
    care: 'Practically indestructible in the dry zone; keep it out of the pond.',
  },
  eleocharis: {
    label: 'Dwarf hairgrass', sci: 'Eleocharis acicularis', family: 'Cyperaceae',
    icon: '\u{1F33E}', group: 'sedge', needsSoil: true,
    thirst: 0.11, idealWet: [0.45, 1.0], spread: 0.002, waterEdge: true, drownDepth: 0.6,
    lore: 'A needle-thin spike-sedge that carpets pond margins across the northern hemisphere — happy fully submerged or on the wet bank. Not a true grass: sedges have solid, triangular stems.',
    care: 'Plant it at the waterline. It spreads fastest of anything here when its feet are wet.',
  },
  sinningia: {
    label: 'Micro gloxinia', sci: 'Sinningia pusilla', family: 'Gesneriaceae',
    icon: '\u{1F338}', group: 'flower', needsSoil: true,
    thirst: 0.15, idealWet: [0.35, 0.85], spread: 0.0012, drownDepth: 0.2,
    lore: 'One of the smallest flowering plants on Earth — a thumbnail rosette from shaded Brazilian rock faces that blooms with outsized lavender trumpets. A legend among terrarium keepers: it can live sealed in a jar for years.',
    care: 'Steady humidity and damp soil keep the trumpets coming.',
  },
  drosera: {
    label: 'Cape sundew', sci: 'Drosera capensis', family: 'Droseraceae',
    icon: '\u{1F9A0}', group: 'flower', needsSoil: true,
    thirst: 0.17, idealWet: [0.55, 1.0], spread: 0.0008, waterEdge: true, drownDepth: 0.3,
    lore: 'A carnivorous plant from Cape bogs in South Africa. Each leaf glistens with sticky "dew" — mucilage that traps insects, which the leaf then curls around and digests. Carnivory is its answer to nutrient-starved soil.',
    care: 'Keep it boggy — the wet pond bank is home. The dew sparkles after watering.',
  },
  mycena: {
    label: 'Night-light bonnet', sci: 'Mycena chlorophos', family: 'Mycenaceae',
    icon: '\u{1F344}', group: 'fungus', needsSoil: false,
    thirst: 0.18, idealWet: [0.5, 1.0], spread: 0.0015, drownDepth: 0.15, glows: true,
    lore: 'A bioluminescent fungus of subtropical Asian–Pacific forest litter. Its pale caps glow green in the dark — luciferin oxidizing, the same chemistry as a firefly — most brightly the night after warm rain.',
    care: 'Fruits in damp shade and glows after dark. Turn the lights to night and wait.',
  },
  leucocoprinus: {
    label: 'Flowerpot dapperling', sci: 'Leucocoprinus birnbaumii', family: 'Agaricaceae',
    icon: '\u{1F344}', group: 'fungus', needsSoil: false,
    thirst: 0.18, idealWet: [0.5, 1.0], spread: 0.0015, drownDepth: 0.15,
    lore: 'The little yellow mushroom that surprises plant owners worldwide: a tropical saprotroph that rides in potting soil and fruits wherever it is warm and moist. Harmless to plants — it only eats dead matter.',
    care: 'A sign your substrate is rich and damp. Comes and goes with the moisture.',
  },
};

export const ALL_SPECIES = Object.keys(SPECIES) as Species[];

// Old saves used generic species names; map them onto the new cast.
export const LEGACY_SPECIES: Record<string, Species> = {
  fern: 'nephrolepis',
  grass: 'eleocharis',
  succulent: 'echeveria',
  flower: 'sinningia',
  mushroom: 'mycena',
};
