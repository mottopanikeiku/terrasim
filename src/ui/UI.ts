import { ToolId } from '../core/Input';
import { PresetName } from '../core/Scene';

interface ToolDef {
  id: ToolId;
  label: string;
  icon: string; // emoji, or css color prefixed with '#' for a swatch
  hint: string;
}

const POUR_TOOLS: ToolDef[] = [
  { id: 'sand', label: 'Sand', icon: '#d6bc8a', hint: 'Hold left mouse to pour sand' },
  { id: 'soil', label: 'Soil', icon: '#5d4734', hint: 'Hold left mouse to pour soil' },
  { id: 'gravel', label: 'Gravel', icon: '#9a948c', hint: 'Hold left mouse to pour gravel' },
  { id: 'water', label: 'Water', icon: '#6fb3d9', hint: 'Hold left mouse to pour water — plants drink it from the soil' },
];

const PLACE_TOOLS: ToolDef[] = [
  { id: 'seeds', label: 'Seeds', icon: '\u{1F33E}', hint: 'Toss a handful of mixed seeds — they sprout on damp soil' },
  { id: 'rock', label: 'Rock', icon: '\u{1FAA8}', hint: 'Click to set a rock on the terrain' },
  { id: 'fern', label: 'Fern', icon: '\u{1FAB4}', hint: 'Click on soil to plant a fern' },
  { id: 'grass', label: 'Grass', icon: '\u{1F33F}', hint: 'Click on soil to plant grass' },
  { id: 'succulent', label: 'Succulent', icon: '\u{1F331}', hint: 'Click on soil — succulents survive dry spells' },
  { id: 'flower', label: 'Flower', icon: '\u{1F338}', hint: 'Click on soil to plant a flower' },
  { id: 'mushroom', label: 'Mushroom', icon: '\u{1F344}', hint: 'Click anywhere damp to plant mushrooms' },
  { id: 'moss', label: 'Moss', icon: '\u{1F7E2}', hint: 'Click rocks or soil to spread moss' },
];

const ERASE_TOOL: ToolDef = { id: 'erase', label: 'Erase', icon: '⌫', hint: 'Hold to dig away material' };

export interface Stats {
  humidity: number;
  water: number;
  plants: number;
  healthyFrac: number;
}

export class UI {
  onTool?: (tool: ToolId) => void;
  onPreset?: (preset: PresetName) => void;
  onPhoto?: () => void;
  onReset?: () => void;
  onSpeed?: (mult: number) => void;

  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private statsEl: HTMLElement;
  private hintTimer = 0;
  private toastQueue: string[] = [];
  private toastBusy = false;
  private buttons = new Map<string, HTMLButtonElement>();
  private speed = 1;

  constructor() {
    const root = document.createElement('div');
    root.id = 'ui';
    root.innerHTML = `
      <div id="brand"><h1>Terrarium</h1><span>pour &middot; plant &middot; grow</span></div>
      <div id="stats"></div>
      <div id="topbar">
        <div class="seg" id="presets"></div>
        <div class="seg" id="actions"></div>
      </div>
      <div id="toolbar"></div>
      <div id="toast"></div>
      <div id="hint"></div>
    `;
    document.body.appendChild(root);

    this.hintEl = root.querySelector('#hint')!;
    this.toastEl = root.querySelector('#toast')!;
    this.statsEl = root.querySelector('#stats')!;

    const toolbar = root.querySelector('#toolbar')!;
    const addGroup = (title: string, tools: ToolDef[]) => {
      const group = document.createElement('div');
      group.className = 'group';
      group.innerHTML = `<div class="group-title">${title}</div>`;
      const row = document.createElement('div');
      row.className = 'row';
      for (const t of tools) {
        const btn = document.createElement('button');
        btn.className = 'tool';
        btn.title = t.hint;
        const iconHtml = t.icon.startsWith('#')
          ? `<span class="swatch" style="background:${t.icon}"></span>`
          : `<span class="emoji">${t.icon}</span>`;
        btn.innerHTML = `${iconHtml}<label>${t.label}</label>`;
        btn.addEventListener('click', () => {
          this.selectTool(t.id);
          this.onTool?.(t.id);
          this.hint(t.hint, 4000);
        });
        this.buttons.set(t.id, btn);
        row.appendChild(btn);
      }
      group.appendChild(row);
      toolbar.appendChild(group);
    };
    addGroup('Pour', POUR_TOOLS);
    addGroup('Plant', PLACE_TOOLS);
    addGroup('', [ERASE_TOOL]);

    const presets = root.querySelector('#presets')!;
    const presetDefs: [PresetName, string, string][] = [
      ['day', '☀️', 'Daylight'],
      ['golden', '\u{1F305}', 'Golden hour'],
      ['night', '\u{1F319}', 'Night — watch for fireflies'],
    ];
    for (const [name, icon, label] of presetDefs) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.title = label;
      btn.textContent = icon;
      btn.addEventListener('click', () => {
        presets.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        this.onPreset?.(name);
      });
      this.buttons.set(`preset-${name}`, btn);
      presets.appendChild(btn);
    }
    this.buttons.get('preset-golden')!.classList.add('active');

    const actions = root.querySelector('#actions')!;
    const speedBtn = document.createElement('button');
    speedBtn.className = 'chip wide';
    speedBtn.title = 'Time speed';
    speedBtn.textContent = '1×';
    speedBtn.addEventListener('click', () => {
      this.speed = this.speed === 1 ? 3 : 1;
      speedBtn.textContent = `${this.speed}×`;
      speedBtn.classList.toggle('active', this.speed > 1);
      this.onSpeed?.(this.speed);
      this.hint(this.speed > 1 ? 'Time flows faster — watch things grow' : 'Back to normal time', 2500);
    });
    actions.appendChild(speedBtn);

    const photo = document.createElement('button');
    photo.className = 'chip';
    photo.title = 'Save a photo';
    photo.textContent = '\u{1F4F7}';
    photo.addEventListener('click', () => this.onPhoto?.());
    actions.appendChild(photo);

    const reset = document.createElement('button');
    reset.className = 'chip';
    reset.title = 'Start over';
    reset.textContent = '↺';
    reset.addEventListener('click', () => {
      if (confirm('Start over with a fresh terrarium?')) this.onReset?.();
    });
    actions.appendChild(reset);

    this.selectTool('water');
    this.hint('Hold left mouse to pour · right-drag to orbit · scroll to zoom', 8000);
  }

  selectTool(id: ToolId): void {
    this.buttons.forEach((btn, key) => {
      if (!key.startsWith('preset-')) btn.classList.toggle('active', key === id);
    });
  }

  hint(text: string, ms = 3000): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), ms);
  }

  // Event toasts: queued, rate-limited so the ecosystem narrates itself
  // without spamming.
  toast(text: string): void {
    if (this.toastQueue.length >= 3) return;
    this.toastQueue.push(text);
    this.pumpToasts();
  }

  private pumpToasts(): void {
    if (this.toastBusy || this.toastQueue.length === 0) return;
    this.toastBusy = true;
    this.toastEl.textContent = this.toastQueue.shift()!;
    this.toastEl.classList.add('show');
    setTimeout(() => {
      this.toastEl.classList.remove('show');
      setTimeout(() => {
        this.toastBusy = false;
        this.pumpToasts();
      }, 500);
    }, 3800);
  }

  updateStats(s: Stats): void {
    const mood = s.plants === 0 ? '\u{1FAB9}' : s.healthyFrac > 0.8 ? '\u{1F331}' : s.healthyFrac > 0.4 ? '\u{1F614}' : '\u{1F940}';
    this.statsEl.innerHTML =
      `<span title="Air humidity — high humidity fogs the glass and waters the edges">\u{1F4A7} ${Math.round(s.humidity)}%</span>` +
      `<span title="Standing water">\u{1F30A} ${s.water}</span>` +
      `<span title="Living plants">\u{1F33F} ${s.plants}</span>` +
      `<span title="Ecosystem mood">${mood}</span>`;
  }
}
