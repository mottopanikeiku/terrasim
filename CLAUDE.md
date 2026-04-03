# Voxel Terrarium Builder

## Project Vision

A **competition-winning** interactive voxel terrarium builder/simulator for the web. The user places plants, rocks, moss, soil layers, and decorations inside a glass terrarium vessel, then watches their creation come alive with lighting, particles, and ambient animation. The aesthetic is cozy, detailed, and visually stunning — the kind of thing that makes someone stop scrolling and say "wow."

**Target:** OpenAI x Handshake Codex Creator Challenge (deadline April 30, 2026)
**Judged on:** Usefulness (25%), Execution (25%), Creativity (20%), Clarity (15%), Polish (15%)

The pitch: *"A beautiful voxel terrarium you can design, grow, and share."*

---

## Tech Stack

- **Three.js** (r160+) — 3D rendering, instanced meshes, post-processing
- **Vite** — fast dev server + bundler
- **Vanilla TypeScript** — no React overhead, direct DOM for UI panels
- **GLSL shaders** — custom glass refraction, volumetric light, atmosphere
- **Howler.js** — ambient audio (rain, wind, nature sounds)
- **html2canvas** or Three.js renderer `.toDataURL()` — screenshot export
- **Deploy target:** Vercel or Netlify (static site)

---

## Architecture Overview

```
src/
├── main.ts                 # Entry point, scene setup, render loop
├── core/
│   ├── Scene.ts            # Three.js scene, camera, renderer, post-processing
│   ├── VoxelEngine.ts      # Voxel grid system, instanced mesh management
│   ├── InputManager.ts     # Raycasting, mouse/touch interaction, drag-and-drop
│   └── StateManager.ts     # Terrarium state, undo/redo, save/load (localStorage)
├── terrarium/
│   ├── Vessel.ts           # Glass container geometry + refraction shader
│   ├── SoilSystem.ts       # Layered soil/substrate rendering (sand, gravel, earth)
│   ├── PlantRegistry.ts    # Plant type definitions (shape, color palette, growth rules)
│   ├── PlantGenerator.ts   # Procedural voxel plant generation from registry
│   ├── RockGenerator.ts    # Procedural voxel rock/pebble generation
│   ├── MossSystem.ts       # Surface-spreading moss with organic growth patterns
│   ├── WaterSystem.ts      # Small puddles, moisture, condensation on glass
│   └── DecorationSystem.ts # Tiny mushrooms, fallen leaves, twigs, crystals
├── environment/
│   ├── Lighting.ts         # Dynamic lighting: warm lamp, daylight, golden hour, moonlight
│   ├── Particles.ts        # Dust motes, water droplets, fireflies, pollen
│   ├── Atmosphere.ts       # Fog inside jar, volumetric light rays, condensation
│   ├── DayNightCycle.ts    # Gradual time-of-day transitions
│   └── AudioManager.ts     # Ambient soundscapes tied to terrarium state
├── ui/
│   ├── Toolbar.ts          # Plant/item palette sidebar
│   ├── ControlPanel.ts     # Lighting, time, environment sliders
│   ├── TooltipSystem.ts    # Hover info for plants and items
│   ├── ScreenshotExport.ts # Capture and download terrarium as image
│   └── ShareSystem.ts      # Encode terrarium state to URL for sharing
├── shaders/
│   ├── glass.vert/frag     # Vessel refraction + reflection + fresnel
│   ├── voxel.vert/frag     # Voxel rendering with AO + soft shadows
│   ├── atmosphere.frag     # Volumetric light scattering inside vessel
│   └── water.frag          # Caustics and water surface shader
└── utils/
    ├── VoxelGeometry.ts    # Greedy meshing, face culling, instancing helpers
    ├── ColorPalette.ts     # Curated nature-inspired color palettes
    ├── Noise.ts            # Simplex/Perlin noise for procedural generation
    └── MathUtils.ts        # Vector helpers, interpolation, easing functions
```

---

## Design Language

### Aesthetic Direction: "Cozy Diorama"
- Warm, soft lighting — think golden hour sunlight streaming through a window onto a desk terrarium
- Voxel style should feel handcrafted, not blocky-Minecraft — use small voxels (think 0.1-0.2 unit scale) for organic curves
- Glass vessel should feel REAL — proper refraction, subtle reflections, slight green tint
- Color palette: earthy greens, warm browns, terracotta, with pops of color from flowers
- Background: soft gradient or blurred room environment, not black void
- UI: minimal, elegant, semi-transparent panels that don't compete with the terrarium

### Color Palettes (curated, nature-inspired)
```
Soil:     #3D2B1F, #5C4033, #6B4423, #8B6914
Moss:     #2D5A27, #3B7A33, #4A9A3F, #6BBF59
Fern:     #1B4D3E, #2E8B57, #3CB371, #66CDAA
Flowers:  #FF6B6B, #FFA07A, #FFD700, #DDA0DD, #87CEEB
Rocks:    #696969, #808080, #A9A9A9, #BDB8AD
Water:    #4A90D9, #5BA3E6, #7CB9F2, #A8D8FF
Glass:    rgba(200, 230, 255, 0.08) tint
```

### Typography (for UI)
- Display: "Fraunces" (Google Fonts) — warm, organic serif
- Body: "DM Sans" (Google Fonts) — clean, modern

---

## Core Mechanics

### Voxel Grid System
- Terrarium interior is a 3D voxel grid (suggested: ~40x40x40 for detail without perf issues)
- Grid is bounded by the vessel shape (cylindrical jar, dome, cube, etc.)
- Each voxel stores: type (empty, soil, plant, rock, moss, water, decoration), color, metadata
- Use **instanced meshes** grouped by material for performance
- Implement **greedy meshing** to reduce draw calls — merge adjacent same-type faces
- Support **face culling** — don't render faces between adjacent solid voxels

### Plant System
Plants are NOT pre-made models. They are **procedurally generated voxel structures** using L-system-inspired rules:
- **Succulents:** Radial rosette patterns, thick chunky leaves, subtle color gradient from center
- **Ferns:** Recursive frond branching, unfurling animation, translucent light green
- **Moss:** Surface-crawling cellular automata, organic spread from placement point
- **Flowers:** Stem + leaf + bloom, variety of bloom shapes (daisy, tulip, wildflower)
- **Cacti:** Columnar or round, with subtle spines (single-voxel protrusions)
- **Mushrooms:** Cap + stem, clusters, bioluminescent variant for night mode
- **Vines/Ivy:** Path-following growth along vessel walls and rocks
- **Trees (bonsai-scale):** Trunk branching + canopy, miniature and detailed

Each plant type has:
- Growth stages (seed → sprout → mature) for time-lapse feature
- Color palette with slight per-instance variation (no two plants identical)
- Placement rules (needs soil? grows on rocks? climbs walls?)

### Vessel Types
- **Classic jar:** Cylindrical with rounded top, cork lid
- **Geodesic dome:** Hexagonal glass panels
- **Open bowl:** Wide, shallow, no lid (different plant options)
- **Hanging teardrop:** Suspended, teardrop-shaped glass

### Interaction Model
1. **Select tool** from sidebar palette (plant type, rock, soil, etc.)
2. **Hover** over terrarium to see placement preview (ghost voxels)
3. **Click** to place
4. **Right-click/long-press** to remove
5. **Scroll wheel** to rotate camera orbit
6. **Drag** on empty space to orbit camera
7. **Pinch** to zoom (touch support!)

---

## Visual Effects (The "Wow" Factor)

These effects are what separate a 3/5 polish score from a 5/5:

### Glass Vessel Shader
- Fresnel-based reflection (more reflective at glancing angles)
- Subtle refraction distortion of contents behind glass
- Very slight green/blue tint
- Condensation droplets on inner surface (animated, slowly forming and sliding)
- Rim light catching edges

### Lighting System
- **Primary light:** Directional, warm-tinted, casts soft shadows
- **Ambient:** Soft fill light to prevent harsh darks
- **Rim light:** Subtle backlight on vessel edges
- **Interior bounce:** Fake GI by tinting ambient inside vessel based on soil/plant colors
- **Presets:** Morning Sun, Golden Hour, Overcast, Warm Lamp, Moonlight, Grow Light (purple)
- Smooth animated transitions between presets

### Particle Systems
- **Dust motes:** Tiny bright dots floating lazily inside the vessel, catching light
- **Pollen:** Seasonal, drifts from flowering plants
- **Water droplets:** Condensation dripping down glass interior
- **Fireflies:** Tiny warm glowing dots at night, with organic random movement
- **Spores:** From mushrooms, subtle glowing particles

### Post-Processing
- Soft bloom on bright spots and light sources
- Subtle vignette for focus
- Slight depth of field (tilt-shift feel — makes it look miniature)
- Color grading per lighting preset
- Optional: film grain for warmth

### Ambient Audio (Howler.js)
- Layered ambient loops: soft rain, gentle wind, birdsong, night crickets
- Audio layers fade in/out based on time-of-day and weather setting
- Subtle UI sounds: soft click on place, gentle whoosh on tool switch
- Volume control + mute toggle in UI
- **Start muted** — only enable on user interaction (browser autoplay policy)

---

## Time-Lapse / Growth Simulation

The killer feature for "usefulness" scoring:
- User clicks "Grow" button or scrubs a time slider
- Plants animate from seed → sprout → mature over a few seconds
- Moss spreads organically across surfaces
- Subtle color shifts as plants mature
- This demonstrates the terrarium over time — educational AND beautiful
- Can be "recorded" as a looping GIF/video (stretch goal)

---

## Save / Share System

Critical for "usefulness" — people need to be able to keep and share their creations:
- **localStorage save/load** — auto-save on every change, manual save slots
- **URL encoding** — compress terrarium state to a shareable URL parameter
- **Screenshot export** — high-res PNG download of current view
- **Preset terrariums** — ship 3-4 beautiful pre-built terrariums as starting points or inspiration

---

## UI Design

### Layout
```
┌──────────────────────────────────────────────────┐
│  [Logo/Title]                    [📷] [💾] [🔗]  │
│                                                    │
│  ┌──────┐                                         │
│  │ 🌿   │                                         │
│  │ 🪨   │        [ 3D TERRARIUM VIEWPORT ]        │
│  │ 🌸   │                                         │
│  │ 🍄   │                                         │
│  │ 🌊   │                                         │
│  │ ⚙️   │                                         │
│  └──────┘                                         │
│                                                    │
│  ──── Lighting ──── Time ──── Weather ────        │
│  [○─────────] [○──────────] [☀️ 🌙 🌧️]           │
└──────────────────────────────────────────────────┘
```

### UI Principles
- **Glass-morphism** panels (frosted glass, semi-transparent, backdrop-blur)
- Icons with tooltip labels, not text-heavy
- Collapsible sidebar — maximizes viewport on mobile
- Bottom control bar for lighting/time/weather — always accessible
- Responsive: works on desktop AND tablet (touch-friendly hit targets)
- Keyboard shortcuts for power users (1-9 for tools, Z for undo, etc.)
- **No tutorial overlay on first load** — instead, start with a beautiful pre-built terrarium that invites exploration. Include a subtle "?" icon for help.

---

## Performance Targets

- **60fps** on mid-range hardware (GTX 1060 / M1 Mac / modern phone)
- Keep draw calls < 50 via instanced meshes + greedy meshing
- Voxel grid operations should be < 16ms
- Lazy-load audio assets
- Use `requestAnimationFrame` properly, pause rendering when tab is hidden
- LOD: reduce particle count on mobile, simpler shaders if needed
- Test on Chrome, Firefox, Safari, and mobile Chrome/Safari

---

## Development Phases

### Phase 1: Foundation (Priority: HIGH)
- [ ] Vite + TypeScript project setup
- [ ] Three.js scene with orbit controls
- [ ] Basic voxel grid system with instanced meshes
- [ ] Glass vessel geometry (cylinder jar)
- [ ] Basic soil layer placement
- [ ] Raycasting for voxel placement/removal
- [ ] Camera controls (orbit, zoom, pan)

### Phase 2: Content (Priority: HIGH)
- [ ] Plant registry with 6-8 plant types
- [ ] Procedural plant generation (L-system inspired)
- [ ] Rock/pebble generator
- [ ] Moss spreading system
- [ ] Soil layer types (gravel, sand, earth)
- [ ] Basic UI toolbar for tool/plant selection

### Phase 3: Beauty (Priority: HIGH)
- [ ] Glass refraction shader
- [ ] Dynamic lighting system with presets
- [ ] Particle systems (dust, droplets, fireflies)
- [ ] Post-processing pipeline (bloom, DoF, vignette)
- [ ] Background environment (gradient + subtle blur)
- [ ] Color grading per lighting preset

### Phase 4: Polish (Priority: MEDIUM)
- [ ] Ambient audio system
- [ ] Growth/time-lapse animation
- [ ] Screenshot export
- [ ] Save/load to localStorage
- [ ] URL-based sharing (compressed state)
- [ ] Preset terrariums (3-4 beautiful defaults)
- [ ] Undo/redo system

### Phase 5: Ship (Priority: HIGH)
- [ ] Responsive layout + mobile touch support
- [ ] Performance optimization pass
- [ ] Cross-browser testing
- [ ] Deploy to Vercel/Netlify
- [ ] Write 500-char project description for Handshake submission
- [ ] Final visual polish pass — every pixel matters

---

## Competition Submission

### Project Title
"Terrarium" (or "Voxel Terrarium" or "terr.io" — pick what feels best)

### Description Template (max 500 chars)
```
A beautiful interactive voxel terrarium builder. Design your own 
miniature ecosystem — place succulents, ferns, mushrooms, and moss 
inside a glass vessel, then watch it come alive with dynamic lighting, 
floating particles, and ambient sound. Built as a creative tool for 
terrarium enthusiasts and anyone who loves cozy digital spaces. 
Developed using Claude Code + Codex. Features procedural plant 
generation, real-time glass shaders, and shareable creations.
```

---

## Key Principles for Claude Code

1. **Beauty over features.** If something looks mediocre, fix it before moving on. A stunning terrarium with 4 plant types beats an ugly one with 20.

2. **Small voxels, organic shapes.** The voxel grid should be fine enough that plants look organic, not blocky. Target 0.1-0.15 unit voxel size relative to vessel.

3. **Performance is non-negotiable.** Use instanced meshes, greedy meshing, and frustum culling. If it drops below 60fps, optimize before adding more.

4. **The glass vessel IS the hero.** The refraction, reflection, and rim lighting on the glass container is what makes this feel premium. Invest time here.

5. **Sound design matters.** Ambient audio transforms a visual demo into an experience. Layer soft nature sounds. Start muted, enable on interaction.

6. **Ship incrementally.** Get a basic working version deployed early. Iterate. Don't go dark for 2 weeks building features nobody can see.

7. **Test on mobile.** A huge portion of judges might view on phones. Touch controls and responsive layout are mandatory, not nice-to-have.

8. **The first 3 seconds matter most.** When a judge opens the URL, what do they see? It should be a pre-loaded beautiful terrarium, not an empty workspace. Default to showing something gorgeous, with the builder tools available for those who want to create.
