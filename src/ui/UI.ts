import { ToolId } from '../core/Input';
import { PresetName } from '../core/Scene';
import { JournalEntry } from '../core/Journal';
import { ALL_SPECIES, SPECIES, Species } from '../world/Plants';

// The keeper's journal: all tools and knowledge live in a little paper
// book docked at the side of the screen, with index tabs — Tools, the
// Field Guide, the Diary, a How-it-works page, and the Studio (settings).
// The viewport stays clear; the book tucks away to a bookmark.

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

const PLANT_TOOLS: ToolDef[] = ALL_SPECIES.map((id) => {
  const def = SPECIES[id];
  return {
    id,
    label: def.label.split(' ')[0].length <= 7 ? def.label.split(' ')[0] : def.label.split(' ').pop()!,
    icon: def.icon,
    hint: `${def.label} · ${def.sci} (${def.family}) — ${def.care}`,
  };
});

const EXTRA_TOOLS: ToolDef[] = [
  { id: 'seeds', label: 'Seeds', icon: '\u{1F33E}', hint: 'Toss a handful of mixed seeds — they sprout on damp soil' },
  { id: 'moss', label: 'Moss', icon: '\u{1F7E2}', hint: 'Click rocks or soil to spread a moss colony' },
  { id: 'rock', label: 'Rock', icon: '\u{1FAA8}', hint: 'Click to set a rock on the terrain' },
  { id: 'litter', label: 'Litter', icon: '\u{1F342}', hint: 'Scatter fallen leaves — mulch that keeps the soil under it damp' },
  { id: 'erase', label: 'Dig', icon: '\u{26CF}\u{FE0F}', hint: 'Hold to dig away material and water' },
];

const FAUNA_GUIDE: { label: string; sci: string; family: string; icon: string; lore: string }[] = [
  {
    label: 'Common pill-bug', sci: 'Armadillidium vulgare', family: 'Armadillidiidae', icon: '\u{1FAB2}',
    lore: 'Not an insect — a land crustacean (an isopod) that still breathes through gill-like plates, which is why it needs humid air. Rolls into a perfect ball when alarmed ("conglobation") and earns its keep eating dead plant matter.',
  },
  {
    label: 'Garden snail', sci: 'Cornu aspersum', family: 'Helicidae', icon: '\u{1F40C}',
    lore: 'Grazes films and tender moss with a radula — a ribbon tongue bearing thousands of microscopic teeth. Seals its shell with dried mucus to wait out dry spells.',
  },
  {
    label: 'Springtail', sci: 'Folsomia candida', family: 'Isotomidae', icon: '\u{26AA}',
    lore: 'A primitive six-legged soil dweller with a spring-loaded tail (furcula) it snaps to launch itself away from danger. The mold patrol of every bioactive terrarium — watch for tiny pale hops near damp soil.',
  },
  {
    label: 'Common eastern firefly', sci: 'Photinus pyralis', family: 'Lampyridae', icon: '\u{2728}',
    lore: 'A beetle, not a fly. Its lantern makes cold light from luciferin at nearly 100% efficiency; males cruise at dusk flashing a J-shaped signal to females in the grass.',
  },
  {
    label: 'Butterflies', sci: 'Pieris rapae · Polyommatus icarus', family: 'Pieridae / Lycaenidae', icon: '\u{1F98B}',
    lore: 'Day-fliers that taste with their feet and drink nectar through a coiled proboscis. At night they do not sleep so much as roost — wings folded, metabolism low, waiting for the sun.',
  },
];

type PageName = 'tools' | 'guide' | 'diary' | 'help' | 'studio';

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
  onJournal?: () => void;

  private hintEl: HTMLElement;
  private toastEl: HTMLElement;
  private statsEl: HTMLElement;
  private alertsEl: HTMLElement;
  private bookEl: HTMLElement;
  private pagesEl: HTMLElement;
  private diaryPage!: HTMLElement;
  private hintTimer = 0;
  private toastQueue: string[] = [];
  private toastBusy = false;
  private buttons = new Map<string, HTMLButtonElement>();
  private tabs = new Map<PageName, HTMLButtonElement>();
  private speed = 1;

  constructor() {
    const root = document.createElement('aside');
    root.id = 'ui';
    root.setAttribute('aria-label', 'Terrarium controls');
    root.innerHTML = `
      <div id="brand"><h1>Terrarium</h1><span>pour &middot; plant &middot; grow</span></div>
      <div id="stats" role="group" aria-label="Terrarium status"></div>
      <div id="alerts" aria-live="polite"></div>
      <div id="toast" role="status"></div>
      <div id="hint" role="status"></div>
      <button id="book-toggle" aria-label="Open keeper's journal" aria-controls="book" aria-expanded="false">\u{1F4D6}</button>
      <section id="book" aria-label="Keeper's journal">
        <nav id="book-tabs" aria-label="Journal pages"></nav>
        <div id="book-pages" tabindex="0" role="region" aria-label="Journal page contents"></div>
      </section>
    `;
    document.body.appendChild(root);

    this.hintEl = root.querySelector('#hint')!;
    this.toastEl = root.querySelector('#toast')!;
    this.statsEl = root.querySelector('#stats')!;
    this.alertsEl = root.querySelector('#alerts')!;
    this.bookEl = root.querySelector('#book')!;
    this.pagesEl = root.querySelector('#book-pages')!;

    // Bookmark <-> book toggling. The bookmark only shows when the book is
    // tucked away; a dedicated ✕ tab closes it — no surprise toggles.
    this.toggleEl = root.querySelector('#book-toggle') as HTMLButtonElement;
    this.toggleEl.addEventListener('click', () => this.openBook(true, true));

    const tabsEl = root.querySelector('#book-tabs')!;
    const tabDefs: [PageName, string, string][] = [
      ['tools', '\u{1F331}', 'Tools'],
      ['guide', '\u{1F52C}', 'Guide'],
      ['diary', '\u{1F4D4}', 'Diary'],
      ['help', '\u{1F4D6}', 'How'],
      ['studio', '\u{2699}\u{FE0F}', 'Studio'],
    ];
    for (const [name, em, label] of tabDefs) {
      const b = document.createElement('button');
      b.className = 'btab';
      b.innerHTML = `<span class="em" aria-hidden="true">${em}</span><span class="tab-label">${label}</span>`;
      b.addEventListener('click', () => {
        this.setPage(name);
        if (name === 'diary') this.onJournal?.();
      });
      this.tabs.set(name, b);
      tabsEl.appendChild(b);
    }
    const closeTab = document.createElement('button');
    closeTab.className = 'btab btab-close';
    closeTab.title = 'Tuck the journal away';
    closeTab.setAttribute('aria-label', 'Close journal');
    closeTab.innerHTML = `<span class="em">\u{2715}</span>`;
    closeTab.addEventListener('click', () => this.openBook(false, true));
    tabsEl.appendChild(closeTab);

    this.buildToolsPage();
    this.buildGuidePage();
    this.buildDiaryPage();
    this.buildHelpPage();
    this.buildStudioPage();
    this.setPage('tools');
    this.openBook(innerWidth >= 900);

    this.selectTool('water');
    this.hint('Choose a tool in the journal; focus the tank and use arrows + Enter to act', 8000);
  }

  private toggleEl!: HTMLButtonElement;

  private openBook(open: boolean, moveFocus = false): void {
    this.bookEl.classList.toggle('closed', !open);
    this.bookEl.inert = !open;
    this.toggleEl.style.display = open ? 'none' : '';
    this.toggleEl.setAttribute('aria-expanded', String(open));
    if (moveFocus) {
      if (open) this.tabs.get('tools')?.focus();
      else this.toggleEl.focus();
    }
  }

  private setPage(name: PageName): void {
    this.openBook(true);
    this.tabs.forEach((b, n) => {
      b.classList.toggle('active', n === name);
      b.setAttribute('aria-pressed', String(n === name));
    });
    this.pagesEl.querySelectorAll('.bpage').forEach((p) => {
      p.classList.toggle('active', (p as HTMLElement).dataset.page === name);
      (p as HTMLElement).hidden = (p as HTMLElement).dataset.page !== name;
    });
  }

  private page(name: PageName): HTMLElement {
    const el = document.createElement('div');
    el.className = 'bpage';
    el.dataset.page = name;
    this.pagesEl.appendChild(el);
    return el;
  }

  // ---- pages ----

  private buildToolsPage(): void {
    const el = this.page('tools');
    el.innerHTML = `<h2>\u{1F331} Tools</h2>
      <p class="sub">pick a tool, then click, tap, or use arrows and Enter on the terrarium</p>`;
    const addGroup = (title: string, tools: ToolDef[]) => {
      const h = document.createElement('h3');
      h.textContent = title;
      el.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      for (const t of tools) {
        const btn = document.createElement('button');
        btn.className = 'tool';
        btn.title = t.hint;
        btn.setAttribute('aria-label', t.label);
        const iconHtml = t.icon.startsWith('#')
          ? `<span class="swatch" style="background:${t.icon}"></span>`
          : `<span class="emoji">${t.icon}</span>`;
        btn.innerHTML = `${iconHtml}<span class="tool-label">${t.label}</span>`;
        btn.addEventListener('click', () => {
          this.selectTool(t.id);
          this.onTool?.(t.id);
          // Tuck the book away so the tank is clickable immediately —
          // the open book would otherwise eat the pour clicks.
          this.openBook(false);
          document.querySelector<HTMLCanvasElement>('#app canvas')?.focus({ preventScroll: true });
          this.hint(t.hint, 4500);
        });
        this.buttons.set(t.id, btn);
        row.appendChild(btn);
      }
      el.appendChild(row);
    };
    addGroup('Pour', POUR_TOOLS);
    addGroup('Plant', PLANT_TOOLS);
    addGroup('Extras', EXTRA_TOOLS);
  }

  private buildGuidePage(): void {
    const el = this.page('guide');
    const wetBar = (lo: number, hi: number) => {
      const cells = 10;
      let bar = '';
      for (let c = 0; c < cells; c++) {
        const v = (c + 0.5) / cells;
        bar += v >= lo && v <= hi ? '\u{25A0}' : '\u{25A1}';
      }
      return `<span class="fg-wet" title="preferred soil moisture">dry ${bar} wet</span>`;
    };
    const groups: [string, string][] = [
      ['fern', '\u{1FAB4} Ferns'],
      ['foliage', '\u{1F343} Tropical foliage'],
      ['succulent', '\u{1F335} Succulents'],
      ['sedge', '\u{1F33E} Pond edge'],
      ['flower', '\u{1F338} Flowering & carnivorous'],
      ['fungus', '\u{1F344} Fungi'],
    ];
    let html = `<h2>\u{1F52C} Field guide</h2>
      <p class="sub">real species, simplified game care rules</p>`;
    for (const [g, title] of groups) {
      html += `<h3>${title}</h3>`;
      for (const id of ALL_SPECIES) {
        const d = SPECIES[id as Species];
        if (d.group !== g) continue;
        html += `<div class="fg-entry">
          <div class="fg-head"><span class="emoji">${d.icon}</span>
            <b>${d.label}</b> <i>${d.sci}</i> <span class="fg-fam">${d.family}</span></div>
          <p>${d.lore}</p>
          <p class="fg-care">${wetBar(d.idealWet[0], d.idealWet[1])} &middot; ${d.care}</p>
        </div>`;
      }
    }
    html += '<h3>\u{1F41B} The animals</h3>';
    for (const f of FAUNA_GUIDE) {
      html += `<div class="fg-entry">
        <div class="fg-head"><span class="emoji">${f.icon}</span>
          <b>${f.label}</b> <i>${f.sci}</i> <span class="fg-fam">${f.family}</span></div>
        <p>${f.lore}</p>
      </div>`;
    }
    html += `<h3>\u{1FAA8} The substrate</h3>
      <p>Real terrariums are built in the same three layers you pour here: a
      <b>gravel false bottom</b> so excess water drains away from roots, a
      <b>sand barrier</b> that keeps fine soil out of the drainage, and a
      <b>humus-rich topsoil</b> whose capillary pores hold the moisture
      plants drink. Leaf litter on top is mulch — it slows evaporation and
      feeds the cleanup crew as it breaks down.</p>`;
    el.innerHTML = html;
  }

  private buildDiaryPage(): void {
    this.diaryPage = this.page('diary');
    this.diaryPage.innerHTML = `<h2>\u{1F4D4} Diary</h2>
      <p class="sub">the story starts now \u{1F331}</p>`;
  }

  private buildHelpPage(): void {
    const el = this.page('help');
    el.innerHTML = `
      <h2>\u{1F331} How it works</h2>
      <p class="sub">a tiny world behind glass</p>
      <p>This is a small game inspired by terrariums, not a botanical
      prediction or plant-care guide. Water, soil and plant health follow
      hand-tuned rules.</p>

      <h3>\u{1FAA8} The layers</h3>
      <p><b>Gravel</b> at the bottom is drainage. <b>Sand</b> keeps the soil
      out of it. <b>Soil</b> on top is where everything grows. Pour them in
      that order when you build.</p>

      <h3>\u{1F4A7} The water cycle</h3>
      <p>Open water slowly <b>evaporates</b> and raises the humidity. Humid
      air <b>condenses</b> on the glass — watch for droplets — and trickles
      back into the soil at the edges. Plants drink from damp soil (it
      looks darker). The dark ring around the pond illustrates soil
      moisture; these are game rules, not measured water transport.</p>

      <h3>\u{1F33F} The plants</h3>
      <p>Each species drinks at its own pace and grows in real time — a
      seedling takes a while to mature, so check back on it like a real
      one (or use the 3&times; toggle in the Studio). Thirsty plants turn
      yellow and droop; water them and they recover. Dead ones fall and
      <b>compost into fresh soil</b>. Healthy mature plants quietly seed
      new sprouts. The Field Guide tab has every species' preferences.</p>

      <h3>\u{1F41B} The cleanup crew</h3>
      <p>Pill-bugs and springtails are decomposers — real keepers add them
      on purpose. They find dead plants and mold and recycle them faster.</p>

      <h3>\u{267B}\u{FE0F} Going self-sustaining</h3>
      <p>\u{2022} Keep <b>some standing water</b> so the cycle has a source.<br/>
      \u{2022} Aim for <b>humidity between 55% and 80%</b>.<br/>
      \u{2022} Mix <b>thirsty and hardy species</b> across wet and dry zones.<br/>
      \u{2022} Let dead plants compost — that's the nutrient loop.<br/>
      \u{2022} Watch the mood tag (\u{1F331} = thriving) and the alerts.</p>

      <h3>\u{1F5B1}\u{FE0F} Controls</h3>
      <p>Hold <b>left mouse</b> to pour or dig \u{2022} <b>click</b> to
      plant \u{2022} <b>right-drag</b> to orbit \u{2022} <b>scroll</b> to
      zoom \u{2022} on touch: drag to orbit, tap to act.</p>
      <p>Keyboard: <b>Tab</b> through the journal. Choose a tool, then use
      <b>arrows</b> on the focused tank to move the target, <b>Enter</b> to
      apply once, or hold <b>Space</b> to pour. <b>Shift + arrows</b> orbit,
      <b>+</b>/<b>-</b> zoom, and <b>Home</b> frames the tank.</p>
    `;
  }

  private buildStudioPage(): void {
    const el = this.page('studio');
    el.innerHTML = `<h2>\u{2699}\u{FE0F} Studio</h2>
      <p class="sub">light, pace and keepsakes</p>`;

    const row = (label: string): HTMLElement => {
      const r = document.createElement('div');
      r.className = 'srow';
      r.innerHTML = `<span class="lbl">${label}</span>`;
      el.appendChild(r);
      return r;
    };

    // Time of day.
    const timeRow = row('Time of day');
    const seg = document.createElement('div');
    seg.className = 'seg';
    const autoBtn = document.createElement('button');
    autoBtn.className = 'chip active';
    autoBtn.title = 'Let the light drift on its own';
    autoBtn.setAttribute('aria-label', 'Automatic lighting');
    autoBtn.setAttribute('aria-pressed', 'true');
    autoBtn.textContent = '\u{1F504}';
    autoBtn.addEventListener('click', () => {
      const on = !autoBtn.classList.contains('active');
      autoBtn.classList.toggle('active', on);
      autoBtn.setAttribute('aria-pressed', String(on));
      this.onAuto?.(on);
    });
    this.buttons.set('preset-auto', autoBtn);
    seg.appendChild(autoBtn);
    const presetDefs: [PresetName, string, string][] = [
      ['day', '\u{2600}\u{FE0F}', 'Daylight'],
      ['golden', '\u{1F305}', 'Golden hour'],
      ['night', '\u{1F319}', 'Night — fireflies and glowing fungi'],
    ];
    for (const [name, icon, label] of presetDefs) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.textContent = icon;
      btn.addEventListener('click', () => {
        this.setActivePreset(name);
        autoBtn.classList.remove('active');
        autoBtn.setAttribute('aria-pressed', 'false');
        this.onPreset?.(name);
      });
      this.buttons.set(`preset-${name}`, btn);
      seg.appendChild(btn);
    }
    this.buttons.get('preset-day')!.classList.add('active');
    this.setActivePreset('day');
    timeRow.appendChild(seg);

    // Pace.
    const paceRow = row('Pace of life');
    const speedBtn = document.createElement('button');
    speedBtn.className = 'chip wide';
    speedBtn.textContent = '1\u{D7}';
    speedBtn.title = 'Time speed';
    speedBtn.setAttribute('aria-label', 'Time speed: 1 times');
    speedBtn.addEventListener('click', () => {
      this.speed = this.speed === 1 ? 3 : 1;
      speedBtn.textContent = `${this.speed}\u{D7}`;
      speedBtn.setAttribute('aria-label', `Time speed: ${this.speed} times`);
      speedBtn.classList.toggle('active', this.speed > 1);
      this.onSpeed?.(this.speed);
      this.hint(this.speed > 1 ? 'Time flows faster — watch things grow' : 'Back to normal time', 2500);
    });
    paceRow.appendChild(speedBtn);

    // Sound.
    const soundRow = row('Sound');
    const sound = document.createElement('button');
    sound.className = 'chip';
    sound.title = 'Birdsong, crickets, drips';
    sound.setAttribute('aria-label', 'Ambient sound');
    sound.setAttribute('aria-pressed', 'false');
    sound.textContent = '\u{1F507}';
    sound.addEventListener('click', () => {
      const on = !sound.classList.contains('active');
      sound.classList.toggle('active', on);
      sound.setAttribute('aria-pressed', String(on));
      sound.textContent = on ? '\u{1F50A}' : '\u{1F507}';
      this.onSound?.(on);
      if (on) this.hint('Listen closely \u{1F426}', 2500);
    });
    soundRow.appendChild(sound);

    // Photo.
    const photoRow = row('Take a photo');
    const photo = document.createElement('button');
    photo.className = 'chip';
    photo.title = 'Save a picture of the tank';
    photo.setAttribute('aria-label', 'Save photo');
    photo.textContent = '\u{1F4F7}';
    photo.addEventListener('click', () => this.onPhoto?.());
    photoRow.appendChild(photo);

    // Reset.
    const resetRow = row('Start over');
    const reset = document.createElement('button');
    reset.className = 'chip';
    reset.title = 'Begin a fresh terrarium';
    reset.setAttribute('aria-label', 'Reset terrarium');
    reset.textContent = '\u{21BA}';
    reset.addEventListener('click', () => {
      if (confirm('Start over with a fresh terrarium?')) this.onReset?.();
    });
    resetRow.appendChild(reset);
  }

  // ---- public API (same shape as before) ----

  selectTool(id: ToolId): void {
    this.buttons.forEach((btn, key) => {
      if (!key.startsWith('preset-')) {
        btn.classList.toggle('active', key === id);
        btn.setAttribute('aria-pressed', String(key === id));
      }
    });
  }

  setActivePreset(name: PresetName): void {
    for (const p of ['day', 'golden', 'night'] as PresetName[]) {
      this.buttons.get(`preset-${p}`)?.classList.toggle('active', p === name);
      this.buttons.get(`preset-${p}`)?.setAttribute('aria-pressed', String(p === name));
    }
  }

  hint(text: string, ms = 3000): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), ms);
  }

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

  updateStats(s: Stats, day = 1): void {
    const mood = s.plants === 0 ? '\u{1FAB9}' : s.healthyFrac > 0.8 ? '\u{1F331}' : s.healthyFrac > 0.4 ? '\u{1F614}' : '\u{1F940}';
    this.statsEl.innerHTML =
      `<span title="How long this terrarium has been alive">\u{1F4C5} Day ${day}</span>` +
      `<span title="Air humidity — high humidity fogs the glass and waters the edges">\u{1F4A7} ${Math.round(s.humidity)}%</span>` +
      `<span title="Standing water">\u{1F30A} ${s.water}</span>` +
      `<span title="Living plants">\u{1F33F} ${s.plants}</span>` +
      `<span title="Ecosystem mood">${mood}</span>`;
  }

  updateAlerts(alerts: string[]): void {
    const html = alerts.map((a) => `<div class="alert">${a}</div>`).join('');
    if (this.alertsEl.innerHTML !== html) this.alertsEl.innerHTML = html;
  }

  // Populate and open the diary page.
  showJournal(entries: JournalEntry[], bornAt: number, day: number): void {
    const fmtWhen = (at: number) => {
      const d = Math.floor((at - bornAt) / 86400000) + 1;
      const t = new Date(at);
      const hh = `${t.getHours()}`.padStart(2, '0');
      const mm = `${t.getMinutes()}`.padStart(2, '0');
      return `Day ${d} \u{B7} ${hh}:${mm}`;
    };
    const rows = entries
      .slice()
      .reverse()
      .map((e) => `<div class="journal-entry"><span class="when">${fmtWhen(e.at)}</span><span>${e.msg}</span></div>`)
      .join('');
    this.diaryPage.innerHTML = `<h2>\u{1F4D4} Diary</h2>
      <p class="sub">Day ${day} &middot; everything this little world has lived through</p>
      ${rows || '<p>Nothing yet — the story starts now \u{1F331}</p>'}`;
    this.setPage('diary');
  }

  // Generic loose-paper overlay (used for the welcome-back card).
  private buildOverlay(html: string): HTMLDialogElement {
    const el = document.createElement('dialog');
    el.className = 'overlay';
    el.setAttribute('aria-label', 'Welcome back');
    el.innerHTML = `
      <div class="overlay-card">
        <button class="overlay-close" aria-label="Close welcome message">&times;</button>
        ${html}
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.overlay-close')!.addEventListener('click', () => el.close());
    el.addEventListener('close', () => el.remove());
    el.addEventListener('click', (e) => {
      if (e.target === el) el.close();
    });
    return el;
  }

  showWelcome(day: number, awayText: string, lines: string[], needsWater: boolean): void {
    const items = lines.map((l) => `<li>${l}</li>`).join('');
    const nudge = needsWater
      ? `<p><b>Some plants came back thirsty</b> — give them a drink \u{1F4A7}</p>`
      : '';
    const el = this.buildOverlay(`
      <h2>\u{1F33F} Welcome back</h2>
      <p class="sub">Day ${day} &middot; you were away ${awayText}</p>
      <p>Your terrarium kept living without you:</p>
      <ul class="away">${items}</ul>
      ${nudge}
    `);
    el.classList.add('open');
    el.showModal();
  }
}
