import { TerrariumScene } from './core/Scene';
import { VoxelEngine } from './core/VoxelEngine';
import { InputManager } from './core/InputManager';
import { StateManager } from './core/StateManager';
import { Vessel } from './terrarium/Vessel';
import { Lighting } from './environment/Lighting';
import { ParticleSystem } from './environment/Particles';
import { AudioManager } from './environment/AudioManager';
import { Toolbar } from './ui/Toolbar';
import { ControlPanel } from './ui/ControlPanel';
import { ScreenshotExport } from './ui/ScreenshotExport';
import { buildDefaultTerrarium } from './terrarium/DefaultTerrarium';
import { lerp } from './utils/MathUtils';

async function init() {
  const app = document.getElementById('app')!;

  // 1. Scene
  const terrariumScene = new TerrariumScene(app);

  // 2. Vessel
  const vessel = new Vessel(terrariumScene.scene);

  // 3. Lighting
  const lighting = new Lighting(terrariumScene.scene);
  lighting.setOnTransitionUpdate((preset, t) => {
    terrariumScene.bloomPass.strength = lerp(
      terrariumScene.bloomPass.strength,
      preset.bloomStrength,
      t
    );
    terrariumScene.renderer.toneMappingExposure = lerp(
      terrariumScene.renderer.toneMappingExposure,
      preset.exposure,
      t
    );
  });

  // 4. Voxel Engine
  const engine = new VoxelEngine(terrariumScene.scene);

  // 5. Particles
  const particles = new ParticleSystem(terrariumScene.scene);

  // 6. Audio
  const audio = new AudioManager();
  audio.init();

  // 7. State Manager
  const stateManager = new StateManager(engine);
  stateManager.bindKeys();

  // 8. Load saved state or build default terrarium
  if (!stateManager.load()) {
    buildDefaultTerrarium(engine);
  }

  // 9. Input Manager
  const input = new InputManager(
    terrariumScene.camera,
    engine,
    terrariumScene.scene,
    terrariumScene.getCanvas()
  );
  input.onPlacement = () => {
    stateManager.pushUndo();
    stateManager.save();
  };

  // 10. UI
  ControlPanel.createTitleBar();

  const toolbar = new Toolbar();
  toolbar.onToolChange = (tool) => {
    input.currentTool = tool;
  };
  toolbar.onHover = (over) => {
    input.setOverUI(over);
  };

  const controlPanel = new ControlPanel();
  controlPanel.onPresetChange = (name) => {
    lighting.switchPreset(name);
    audio.setPreset(name);

    // Fireflies only in moonlight
    particles.showFireflies = name === 'moonlight';
  };
  controlPanel.onScreenshot = () => {
    ScreenshotExport.capture(terrariumScene.renderer, terrariumScene.scene, terrariumScene.camera);
  };
  controlPanel.onAudioToggle = () => {
    audio.toggle();
  };
  controlPanel.onAutoRotate = (enabled) => {
    terrariumScene.controls.autoRotate = enabled;
  };

  // 11. Fade out loading screen
  setTimeout(() => {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('fade-out');
      setTimeout(() => loading.remove(), 800);
    }
  }, 500);

  // 12. Render loop
  let lastTime = 0;

  function animate(currentTime: number) {
    requestAnimationFrame(animate);

    const time = currentTime * 0.001;
    const delta = Math.min(time - lastTime, 0.05);
    lastTime = time;

    // Update systems
    vessel.update(time);
    lighting.update(delta);
    particles.update(time, delta);

    // Render
    terrariumScene.render();
  }

  requestAnimationFrame(animate);

  // 13. Visibility API — pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      terrariumScene.clock.stop();
    } else {
      terrariumScene.clock.start();
    }
  });
}

init().catch((err) => {
  console.error('Terrarium init failed:', err);
  const loading = document.getElementById('loading');
  if (loading) {
    const p = loading.querySelector('p');
    if (p) p.textContent = 'WebGL required. Please use a modern browser.';
  }
});
