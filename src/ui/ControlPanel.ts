import { PRESETS } from '../environment/Lighting';

export class ControlPanel {
  private container: HTMLElement;
  public onPresetChange?: (name: string) => void;
  public onScreenshot?: () => void;
  public onAudioToggle?: () => void;
  public onAutoRotate?: (enabled: boolean) => void;
  private currentPreset = 'goldenHour';
  private audioEnabled = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'control-panel';
    this.container.innerHTML = this.buildHTML();
    document.body.appendChild(this.container);

    this.addStyles();
    this.bindEvents();
  }

  private buildHTML(): string {
    const presetBtns = Object.values(PRESETS).map(p => {
      const active = p.name === this.currentPreset ? ' active' : '';
      return `<button class="preset-btn${active}" data-preset="${p.name}" title="${p.label}">${p.icon}</button>`;
    }).join('');

    return `
      <div class="cp-section cp-presets">
        <span class="cp-label">Lighting</span>
        <div class="cp-preset-row">${presetBtns}</div>
      </div>
      <div class="cp-section cp-actions">
        <button class="cp-action-btn" id="btn-rotate" title="Auto Rotate">\u{1F504}</button>
        <button class="cp-action-btn" id="btn-screenshot" title="Screenshot">\u{1F4F7}</button>
        <button class="cp-action-btn" id="btn-audio" title="Toggle Audio">\u{1F507}</button>
      </div>
    `;
  }

  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #control-panel {
        position: fixed;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 16px;
        background: rgba(30, 25, 18, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-radius: 14px;
        border: 1px solid rgba(200, 180, 140, 0.15);
      }

      .cp-section {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .cp-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 0.65rem;
        color: rgba(200, 180, 140, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .cp-preset-row {
        display: flex;
        gap: 4px;
      }

      .preset-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(200, 180, 140, 0.08);
        border-radius: 10px;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .preset-btn:hover {
        background: rgba(200, 180, 140, 0.18);
      }
      .preset-btn.active {
        background: rgba(200, 180, 140, 0.25);
        box-shadow: inset 0 0 0 1px rgba(200, 180, 140, 0.3);
      }

      .cp-action-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(200, 180, 140, 0.08);
        border-radius: 10px;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .cp-action-btn:hover {
        background: rgba(200, 180, 140, 0.18);
      }
      .cp-action-btn.active {
        background: rgba(200, 180, 140, 0.25);
      }

      /* Title bar */
      #title-bar {
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100;
        padding: 6px 20px;
        background: rgba(30, 25, 18, 0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 12px;
        border: 1px solid rgba(200, 180, 140, 0.1);
        font-family: 'Fraunces', serif;
        font-weight: 300;
        font-size: 1.1rem;
        color: #c4b89a;
        letter-spacing: 0.08em;
        pointer-events: none;
      }

      @media (max-width: 768px) {
        #control-panel {
          bottom: 8px;
          padding: 6px 10px;
          gap: 8px;
        }
        .cp-label { display: none; }
        .preset-btn, .cp-action-btn {
          width: 32px;
          height: 32px;
          font-size: 1rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    // Prevent orbit when interacting with panel
    this.container.addEventListener('mousedown', e => e.stopPropagation());
    this.container.addEventListener('pointerdown', e => e.stopPropagation());

    // Preset buttons
    this.container.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = (btn as HTMLElement).dataset.preset!;
        this.currentPreset = preset;
        this.container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.onPresetChange?.(preset);
      });
    });

    // Action buttons
    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      this.onScreenshot?.();
    });

    document.getElementById('btn-audio')?.addEventListener('click', () => {
      this.audioEnabled = !this.audioEnabled;
      const btn = document.getElementById('btn-audio')!;
      btn.textContent = this.audioEnabled ? '\u{1F50A}' : '\u{1F507}';
      btn.classList.toggle('active', this.audioEnabled);
      this.onAudioToggle?.();
    });

    document.getElementById('btn-rotate')?.addEventListener('click', () => {
      const btn = document.getElementById('btn-rotate')!;
      const isActive = btn.classList.toggle('active');
      this.onAutoRotate?.(isActive);
    });
  }

  // Create title bar
  static createTitleBar(): void {
    const titleBar = document.createElement('div');
    titleBar.id = 'title-bar';
    titleBar.textContent = 'Terrarium';
    document.body.appendChild(titleBar);
  }
}
