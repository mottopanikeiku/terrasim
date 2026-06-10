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
import { WaterSurface } from './world/WaterSurface';
import { buildDefaultScene } from './world/DefaultScene';
import { UI } from './ui/UI';
import { save, load, clearSave } from './core/Storage';
import { SoundScape } from './core/SoundScape';
import { Journal, formatDuration } from './core/Journal';
import { AwaySummary } from './core/Simulation';

const SIM_HZ = 30;

// Turn an away-time summary into friendly welcome-back lines.
function awayLines(s: AwaySummary): string[] {
  const lines: string[] = [];
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('#', `${k}`));
  if (s.matured > 0) lines.push(n(s.matured, 'A plant reached full size \u{1F33C}', '# plants reached full size \u{1F33C}'));
  if (s.sprouted > 0) lines.push(n(s.sprouted, 'A new seedling sprouted on its own \u{1F331}', '# new seedlings sprouted on their own \u{1F331}'));
  if (s.mossGrown > 8) lines.push('The moss crept a little further \u{1F343}');
  if (s.pondShrank) lines.push('The pond shrank a touch — the soil drank the difference \u{1F4A7}');
  if (s.wilted > 0) lines.push(n(s.wilted, 'One plant got thirsty \u{1F940}', '# plants got thirsty \u{1F940}'));
  if (s.died > 0) lines.push(n(s.died, 'A plant withered away \u{1F342}', '# plants withered away \u{1F342}'));
  if (s.composted > 0) lines.push(n(s.composted, 'A dead plant composted into fresh soil \u{267B}\u{FE0F}', '# dead plants composted into fresh soil \u{267B}\u{FE0F}'));
  if (lines.length === 0) lines.push('Everything stayed calm and green \u{1F33F}');
  return lines;
}

function init(): void {
  const app = document.getElementById('app')!;

  const sceneMgr = new SceneManager(app);
  new Aquarium(sceneMgr.scene);

  const grid = new Grid();
  const room = new Room(sceneMgr.scene, grid);
  const sim = new Simulation(grid);
  const voxels = new VoxelRenderer(sceneMgr.scene, grid);
  const water = new WaterSurface(sceneMgr.scene);
  const plantRenderer = new PlantRenderer(sceneMgr.scene, sim);
  const critters = new Critters(sceneMgr.scene, grid, sim);
  const condensation = new Condensation(sceneMgr.scene);

  // Load the saved tank; if the keeper was away, fast-forward what they
  // missed and prepare a welcome-back summary.
  const journal = new Journal();
  let welcome: { day: number; awayText: string; lines: string[]; needsWater: boolean } | null = null;
  const meta = load(grid, sim);
  if (meta) {
    journal.bornAt = meta.bornAt;
    journal.entries = meta.journal;
    const awaySec = Math.max(0, (Date.now() - meta.savedAt) / 1000);
    if (awaySec > 600) {
      const summary = sim.fastForward(awaySec);
      // Route the fast-forward's events into the diary, not the toast queue.
      while (sim.events.length > 0) journal.add(sim.events.shift()!);
      const lines = awayLines(summary);
      journal.add(`You were away ${formatDuration(awaySec)} \u{2014} ${lines[0].toLowerCase()}`);
      welcome = {
        day: journal.day(),
        awayText: formatDuration(awaySec),
        lines,
        needsWater: summary.wilted > 0 || summary.died > 0,
      };
    }
  } else {
    buildDefaultScene(grid, sim);
    journal.add('A new terrarium was born \u{1F331}');
  }
  sim.events.length = 0; // don't toast the pre-roll

  const input = new Input(sceneMgr.renderer.domElement, sceneMgr.camera, grid, sim, sceneMgr.scene);

  // Debug handle for development tooling.
  (window as any).__terra = { grid, sim, sceneMgr, critters, plantRenderer, voxels, water };

  const ui = new UI();
  let speed = 1;
  ui.onTool = (tool) => input.setTool(tool);
  ui.onPreset = (preset) => sceneMgr.setPreset(preset);
  ui.onAuto = (on) => sceneMgr.setAuto(on);
  sceneMgr.onPresetShift = (p) => ui.setActivePreset(p);
  ui.onSpeed = (mult) => { speed = mult; };

  const audio = new SoundScape();
  ui.onSound = (on) => audio.setEnabled(on);
  room.onDrip = () => audio.plip();
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
    journal.reset();
    journal.add('A new terrarium was born \u{1F331}');
    dirty = true;
  };
  ui.onJournal = () => ui.showJournal(journal.entries, journal.bornAt, journal.day());
  if (welcome) ui.showWelcome(welcome.day, welcome.awayText, welcome.lines, welcome.needsWater);
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
  let lastRebuild = 0;

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

    // Drain ecosystem events into toasts and the diary.
    while (sim.events.length > 0) {
      const msg = sim.events.shift()!;
      journal.add(msg);
      ui.toast(msg);
    }

    // Rebuilds are the heaviest step; cap them at ~25Hz so sustained pours
    // keep a fluid framerate.
    if (sim.changed && now - lastRebuild > 38) {
      voxels.rebuild();
      water.rebuild(grid);
      sim.changed = false;
      lastRebuild = now;
      dirty = true;
    }

    water.update(time);
    plantRenderer.update(rawDt, time);
    critters.update(rawDt, time, sceneMgr.currentPreset === 'night');
    condensation.update(rawDt, sim.humidity);
    room.update(rawDt);
    const pourKind = input.pouringTool();
    if (pourKind) audio.pourTick(pourKind);
    audio.update(rawDt, sceneMgr.currentPreset);
    sceneMgr.update(rawDt);

    statsAccum += rawDt;
    if (statsAccum > 1) {
      const st = sim.stats();
      ui.updateStats(st, journal.day());
      ui.updateAlerts(sim.alerts(st));
      statsAccum = 0;
    }

    saveAccum += rawDt;
    if (dirty && saveAccum > 8) {
      save(grid, sim, journal);
      dirty = false;
      saveAccum = 0;
    }
  }
  requestAnimationFrame(frame);

  // Save on tab-hide so the away-timer starts from the moment they left.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save(grid, sim, journal);
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
