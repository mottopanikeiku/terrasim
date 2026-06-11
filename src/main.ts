import { SceneManager } from './core/Scene';
import { World, AwaySummary } from './core/World';
import { Ground } from './render/Ground';
import { Water } from './render/Water';
import { Rocks } from './render/Rocks';
import { Litter } from './render/Litter';
import { PourStream } from './render/PourStream';
import { Input } from './core/Input';
import { Aquarium } from './world/Aquarium';
import { Room } from './world/Room';
import { Critters } from './world/Critters';
import { Condensation } from './world/Condensation';
import { PlantRenderer } from './world/PlantRenderer';
import { buildDefaultScene } from './world/DefaultScene';
import { UI } from './ui/UI';
import { save, load, clearSave } from './core/Storage';
import { SoundScape } from './core/SoundScape';
import { Journal, formatDuration } from './core/Journal';

const SIM_HZ = 30;

// Turn an away-time summary into friendly welcome-back lines.
function awayLines(s: AwaySummary): string[] {
  const lines: string[] = [];
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many.replace('#', `${k}`));
  if (s.matured > 0) lines.push(n(s.matured, 'A plant reached full size \u{1F33C}', '# plants reached full size \u{1F33C}'));
  if (s.sprouted > 0) lines.push(n(s.sprouted, 'A new seedling sprouted on its own \u{1F331}', '# new seedlings sprouted on their own \u{1F331}'));
  if (s.mossGrown > 3) lines.push('The moss crept a little further \u{1F343}');
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

  const world = new World();
  const room = new Room(sceneMgr.scene, world);
  const ground = new Ground(sceneMgr.scene, world);
  const water = new Water(sceneMgr.scene, world);
  const rocks = new Rocks(sceneMgr.scene, world);
  const litter = new Litter(sceneMgr.scene, world);
  const pourStream = new PourStream(sceneMgr.scene);
  const plantRenderer = new PlantRenderer(sceneMgr.scene, world);
  const critters = new Critters(sceneMgr.scene, world);
  const condensation = new Condensation(sceneMgr.scene);

  // Load the saved tank; old-format saves keep their diary but the
  // landscape is reborn. If the keeper was away, fast-forward the gap.
  const journal = new Journal();
  let welcome: { day: number; awayText: string; lines: string[]; needsWater: boolean } | null = null;
  const loaded = load(world);
  if (loaded) {
    journal.bornAt = loaded.meta.bornAt;
    journal.entries = loaded.meta.journal;
    if (!loaded.restored) {
      buildDefaultScene(world);
      journal.add('The terrarium was reborn in a new, gentler form \u{1F331}');
    } else {
      const awaySec = Math.max(0, (Date.now() - loaded.meta.savedAt) / 1000);
      if (awaySec > 600) {
        const summary = world.fastForward(awaySec);
        while (world.events.length > 0) journal.add(world.events.shift()!);
        const lines = awayLines(summary);
        journal.add(`You were away ${formatDuration(awaySec)} \u{2014} ${lines[0].toLowerCase()}`);
        welcome = {
          day: journal.day(),
          awayText: formatDuration(awaySec),
          lines,
          needsWater: summary.wilted > 0 || summary.died > 0,
        };
      }
    }
  } else {
    buildDefaultScene(world);
    journal.add('A new terrarium was born \u{1F331}');
  }
  world.events.length = 0; // don't toast the pre-roll

  const input = new Input(sceneMgr.renderer.domElement, sceneMgr.camera, world, sceneMgr.scene);

  // Debug handle for development tooling.
  (window as any).__terra = { world, sceneMgr, critters, plantRenderer, ground, water };

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
    sceneMgr.renderFrame();
    const a = document.createElement('a');
    a.href = sceneMgr.renderer.domElement.toDataURL('image/png');
    a.download = 'terrarium.png';
    a.click();
    ui.hint('Photo saved');
  };
  ui.onReset = () => {
    clearSave();
    world.clear();
    plantRenderer.clear();
    buildDefaultScene(world);
    world.events.length = 0;
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
      world.tick();
      simAccum -= step;
      ticks++;
    }
    world.growth(dt);

    // Drain ecosystem events into toasts and the diary.
    while (world.events.length > 0) {
      const msg = world.events.shift()!;
      journal.add(msg);
      ui.toast(msg);
    }

    if (world.changed) {
      world.changed = false;
      dirty = true;
    }

    ground.update();
    water.update();
    water.setTime(time);
    rocks.update();
    litter.update(rawDt);

    // Pour-stream feedback: particles between cursor and ground.
    const pk = input.currentPick();
    pourStream.set(input.pouringTool(), pk.point ?? null, pk.point ? pk.point.y : 0);
    pourStream.update(rawDt);

    const night = sceneMgr.currentPreset === 'night';
    plantRenderer.update(rawDt, time, night);
    critters.update(rawDt, time, night);
    condensation.update(rawDt, world.humidity);
    room.update(rawDt);
    const pourKind = input.pouringTool();
    if (pourKind) audio.pourTick(pourKind);
    audio.update(rawDt, sceneMgr.currentPreset);
    sceneMgr.update(rawDt);

    statsAccum += rawDt;
    if (statsAccum > 1) {
      const st = world.stats();
      ui.updateStats(st, journal.day());
      ui.updateAlerts(world.alerts(st));
      statsAccum = 0;
    }

    saveAccum += rawDt;
    if (dirty && saveAccum > 8) {
      save(world, journal);
      dirty = false;
      saveAccum = 0;
    }
  }
  requestAnimationFrame(frame);

  // Save on tab-hide so the away-timer starts from the moment they left.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save(world, journal);
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
