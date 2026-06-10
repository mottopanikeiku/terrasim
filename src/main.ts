import { SceneManager } from './core/Scene';
import { Grid } from './core/Grid';
import { Simulation } from './core/Simulation';
import { VoxelRenderer } from './core/VoxelRenderer';
import { Input } from './core/Input';
import { Aquarium } from './world/Aquarium';
import { Room } from './world/Room';
import { Critters } from './world/Critters';
import { Condensation } from './world/Condensation';
import { PlantRenderer } from './world/PlantRenderer';
import { buildDefaultScene } from './world/DefaultScene';
import { UI } from './ui/UI';
import { save, load, clearSave } from './core/Storage';

const SIM_HZ = 30;

function init(): void {
  const app = document.getElementById('app')!;

  const sceneMgr = new SceneManager(app);
  new Aquarium(sceneMgr.scene);

  const grid = new Grid();
  const room = new Room(sceneMgr.scene, grid);
  const sim = new Simulation(grid);
  const voxels = new VoxelRenderer(sceneMgr.scene, grid);
  const plantRenderer = new PlantRenderer(sceneMgr.scene, sim);
  const critters = new Critters(sceneMgr.scene, grid, sim);
  const condensation = new Condensation(sceneMgr.scene);

  if (!load(grid, sim)) {
    buildDefaultScene(grid, sim);
  }
  sim.events.length = 0; // don't toast the pre-roll

  const input = new Input(sceneMgr.renderer.domElement, sceneMgr.camera, grid, sim, sceneMgr.scene);

  // Debug handle for development tooling.
  (window as any).__terra = { grid, sim, sceneMgr, critters, plantRenderer, voxels };

  const ui = new UI();
  let speed = 1;
  ui.onTool = (tool) => input.setTool(tool);
  ui.onPreset = (preset) => sceneMgr.setPreset(preset);
  ui.onAuto = (on) => sceneMgr.setAuto(on);
  sceneMgr.onPresetShift = (p) => ui.setActivePreset(p);
  ui.onSpeed = (mult) => { speed = mult; };
  ui.onPhoto = () => {
    sceneMgr.renderer.render(sceneMgr.scene, sceneMgr.camera);
    const a = document.createElement('a');
    a.href = sceneMgr.renderer.domElement.toDataURL('image/png');
    a.download = 'terrarium.png';
    a.click();
    ui.hint('Photo saved');
  };
  ui.onReset = () => {
    clearSave();
    sim.getPlants().length = 0;
    plantRenderer.clear();
    buildDefaultScene(grid, sim);
    sim.events.length = 0;
    dirty = true;
  };
  input.onHint = (text) => ui.hint(text);

  let dirty = false;
  input.onAction = () => {
    dirty = true;
  };

  // Main loop: fixed-rate simulation (scaled by time speed), render every frame.
  let last = performance.now();
  let simAccum = 0;
  let saveAccum = 0;
  let statsAccum = 0;
  let time = 0;

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const rawDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const dt = rawDt * speed;
    time += rawDt;

    simAccum += dt;
    const step = 1 / SIM_HZ;
    let ticks = 0;
    while (simAccum >= step && ticks < 4 * speed) {
      input.simStep();
      sim.tick();
      simAccum -= step;
      ticks++;
    }
    sim.growth(dt);

    // Drain ecosystem events into toasts.
    while (sim.events.length > 0) ui.toast(sim.events.shift()!);

    if (sim.changed) {
      voxels.rebuild();
      sim.changed = false;
      dirty = true;
    }

    plantRenderer.update(rawDt, time);
    critters.update(rawDt, time, sceneMgr.currentPreset === 'night');
    condensation.update(rawDt, sim.humidity);
    room.update(rawDt);
    sceneMgr.update(rawDt);

    statsAccum += rawDt;
    if (statsAccum > 1) {
      const st = sim.stats();
      ui.updateStats(st);
      ui.updateAlerts(sim.alerts(st));
      statsAccum = 0;
    }

    saveAccum += rawDt;
    if (dirty && saveAccum > 8) {
      save(grid, sim);
      dirty = false;
      saveAccum = 0;
    }
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty) {
      save(grid, sim);
      dirty = false;
    }
  });

  // Fade the loading overlay once the first frame is up.
  requestAnimationFrame(() => {
    setTimeout(() => {
      const loading = document.getElementById('loading');
      if (loading) {
        loading.classList.add('fade-out');
        setTimeout(() => loading.remove(), 700);
      }
    }, 250);
  });
}

try {
  init();
} catch (err) {
  console.error('init failed', err);
  const p = document.querySelector('#loading p');
  if (p) p.textContent = 'WebGL is required — please use a modern browser.';
}
