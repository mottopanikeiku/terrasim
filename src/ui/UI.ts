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
  onAuto?: (on: boolean) => void;
  onSound?: (on: boolean) => void;
  onPhoto?: () => void;
  onReset?: () => void;
  onSpeed?: (mult: number) => void;

  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private statsEl: HTMLElement;
  private alertsEl!: HTMLElement;
  private guideEl!: HTMLElement;
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
      <div id="alerts"></div>
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
    this.alertsEl = root.querySelector('#alerts')!;
    this.buildGuide();

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

    // Auto day/night drift — on by default; picking a time pauses it.
    const autoBtn = document.createElement('button');
    autoBtn.className = 'chip active';
    autoBtn.title = 'Let time drift on its own';
    autoBtn.textContent = '\u{1F504}';
    autoBtn.addEventListener('click', () => {
      const on = !autoBtn.classList.contains('active');
      autoBtn.classList.toggle('active', on);
      this.onAuto?.(on);
    });
    this.buttons.set('preset-auto', autoBtn);
    presets.appendChild(autoBtn);

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
        this.setActivePreset(name);
        autoBtn.classList.remove('active'); // manual pick pauses the drift
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

    // Sound: starts muted; the toggle click is the gesture that unlocks audio.
    const sound = document.createElement('button');
    sound.className = 'chip';
    sound.title = 'Sound — birdsong, crickets, drips';
    sound.textContent = '\u{1F507}';
    sound.addEventListener('click', () => {
      const on = !sound.classList.contains('active');
      sound.classList.toggle('active', on);
      sound.textContent = on ? '\u{1F50A}' : '\u{1F507}';
      this.onSound?.(on);
      if (on) this.hint('Listen closely \u{1F426}', 2500);
    });
    actions.appendChild(sound);

    const guide = document.createElement('button');
    guide.className = 'chip';
    guide.title = 'How terrariums work';
    guide.textContent = '\u{1F4D6}';
    guide.addEventListener('click', () => this.guideEl.classList.toggle('open'));
    actions.appendChild(guide);

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

  // Reflect the current time of day (the auto cycle calls this as it drifts).
  setActivePreset(name: PresetName): void {
    for (const p of ['day', 'golden', 'night'] as PresetName[]) {
      this.buttons.get(`preset-${p}`)?.classList.toggle('active', p === name);
    }
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

  updateAlerts(alerts: string[]): void {
    this.alertsEl.innerHTML = alerts
      .map((a) => `<div class="alert">${a}</div>`)
      .join('');
  }

  private buildGuide(): void {
    this.guideEl = document.createElement('div');
    this.guideEl.id = 'guide';
    this.guideEl.innerHTML = `
      <div id="guide-card">
        <button id="guide-close" title="Close">&times;</button>
        <h2>\u{1F331} How your terrarium works</h2>
        <p>A terrarium is a tiny world behind glass. Done right, it needs
        almost nothing from you — the same water cycles around and around,
        and the plants, soil and bugs keep each other in balance. This one
        works the same way real ones do.</p>

        <h3>\u{1FAA8} The layers</h3>
        <p><b>Gravel</b> at the bottom is drainage — extra water collects
        there instead of drowning roots. <b>Sand</b> keeps the soil out of
        the drainage. <b>Soil</b> on top is where everything grows. Pour
        them in that order when you build.</p>

        <h3>\u{1F4A7} The water cycle</h3>
        <p>Open water slowly <b>evaporates</b> and raises the humidity
        (\u{1F4A7} in the corner). Humid air <b>condenses</b> on the glass —
        watch for droplets running down — and trickles back into the soil at
        the edges. Plants drink from damp soil (it looks darker), and water
        sinks deeper over time. Nothing is lost; it just keeps moving.</p>

        <h3>\u{1F33F} The plants</h3>
        <p>Plants drink the moisture near their roots and grow slowly — in
        real time. A seedling takes a good while to mature, so check back on
        it like you would a real one (or use the speed toggle). Thirsty
        plants <b>turn yellow and droop</b>. Water them and they recover.
        Ignore them and they die, fall over, and <b>compost back into fresh
        soil</b>. Healthy mature plants quietly seed new sprouts nearby.</p>
        <p>Each species has a personality: <b>succulents</b> barely drink and
        love the dry corner, <b>ferns and mushrooms</b> want it damp,
        <b>grass</b> is easy-going, <b>moss</b> creeps slowly over any moist
        surface — it's your humidity indicator. If the moss retreats, the
        tank is too dry.</p>

        <h3>\u{1F41B} The cleanup crew</h3>
        <p>The little isopods wandering around are decomposers — real
        terrarium keepers add them on purpose. They find dead plants and
        nibble them away, returning nutrients to the soil faster.</p>

        <h3>\u{267B}\u{FE0F} Making it self-sustaining</h3>
        <p>The goal: a tank you could walk away from. The checklist —</p>
        <p>\u{2022} Keep <b>some standing water</b> (a pond corner) so the
        cycle has a source.<br/>
        \u{2022} Aim for <b>humidity between 55% and 80%</b> — condensation
        on the glass is a good sign, not a problem.<br/>
        \u{2022} Mix <b>thirsty and hardy species</b> across wet and dry
        zones.<br/>
        \u{2022} Let dead plants compost — that's the nutrient loop, not a
        mess.<br/>
        \u{2022} Watch the mood (\u{1F331} = thriving). Alerts appear under
        the stats when something needs you.</p>

        <h3>\u{1F5B1}\u{FE0F} Controls</h3>
        <p>Hold <b>left mouse</b> to pour or erase \u{2022} <b>click</b> to
        plant \u{2022} <b>right-drag</b> to orbit \u{2022} <b>scroll</b> to
        zoom \u{2022} on touch: drag to orbit, tap to act.</p>
      </div>
    `;
    document.body.appendChild(this.guideEl);
    this.guideEl.querySelector('#guide-close')!.addEventListener('click', () => {
      this.guideEl.classList.remove('open');
    });
    this.guideEl.addEventListener('click', (e) => {
      if (e.target === this.guideEl) this.guideEl.classList.remove('open');
    });
  }
}
