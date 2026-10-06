# Terrasim

Terrasim is an interactive browser terrarium built with Three.js and TypeScript.

**Question:** Can layered soil, flowing water, and simple plant-care rules make a small digital garden feel alive?

The [world model](src/core/World.ts) stores substrate layers, moisture, moss, and water in a heightfield, and updates growth, wilting, reseeding, and composting. [Procedural plant meshes](src/world/PlantMeshes.ts) provide species-specific shapes rather than downloaded models. The [application loop](src/main.ts) connects editing tools, lighting, synthesized audio, a journal, local saving, and photo export.

## Result

The result is a playable illustration, not a validated ecosystem model. Its [grid constants](src/core/constants.ts) define **144 × 60 terrain columns**, and its [registry](src/world/Plants.ts) defines **12 plant and fungus species** with hand-tuned care traits. The [opening landscape](src/world/DefaultScene.ts) includes a pond, a fern-covered highland, and a dry succulent corner. Water and soil respond to editing; plant health responds to moisture and flooding.

There are no committed performance measurements, ecological validation results, or automated tests. The old frame-rate goals are not measured results.

## Run locally

Install Node.js and npm. From a fresh clone:

```sh
nice -n 19 npm ci
nice -n 19 npm run dev -- --host 127.0.0.1 --open false
nice -n 19 npm run build
```

Open the local URL printed by Vite. Use the journal's tools to pour substrate and water or place plants; drag to orbit and scroll to zoom. Lighting, simulation speed, sound, and photo controls are in the interface. Your tank stays in this browser's local storage; reset replaces it with the opening landscape.

A desktop or laptop with a WebGL-capable browser is needed. No server, model download, API key, or paid compute is required; running locally has no service charge. Minimum hardware and mobile performance have not been measured, and no frame-rate benchmark is claimed.

## Limitations

- Moisture, growth, drowning, and composting are hand-tuned game rules, not botanical predictions or plant-care advice.
- Terrain is a layered heightfield: it cannot represent caves or overhangs.
- Simulation uses random events, and returning after an absence uses an approximation rather than replaying every tick.
- Saving is browser-local; there is no account, portable save export, or shareable tank URL.
- Rendering uses shadows and post-processing without a measured device-support matrix. The interface requests Google Fonts; the application has no bundled font files.

## Prior work and context

Rendering, orbit controls, geometry utilities, and post-processing use [Three.js](https://threejs.org/docs/). Development and bundling use [Vite](https://vite.dev/guide/), and ambient sound is synthesized with the browser's [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), not Howler or downloaded sound recordings. These are the project's implementation dependencies, not evidence of ecological accuracy.

The [original design brief](docs/original-design-brief.md) is preserved as historical context, including unimplemented ideas and unmeasured targets.

Written with AI coding assistance.
