import { ToolType } from '../core/InputManager';

interface ToolItem {
  id: ToolType;
  icon: string;
  label: string;
  category: 'plants' | 'terrain' | 'creatures' | 'tools';
}

const TOOLS: ToolItem[] = [
  // Plants
  { id: 'succulent', icon: '\u{1F33F}', label: 'Succulent', category: 'plants' },
  { id: 'fern', icon: '\u{1F33F}', label: 'Fern', category: 'plants' },
  { id: 'flower', icon: '\u{1F33A}', label: 'Flower', category: 'plants' },
  { id: 'mushroom', icon: '\u{1F344}', label: 'Mushroom', category: 'plants' },
  { id: 'cactus', icon: '\u{1F335}', label: 'Cactus', category: 'plants' },
  { id: 'bonsai', icon: '\u{1F333}', label: 'Bonsai', category: 'plants' },
  { id: 'vine', icon: '\u{1FAB4}', label: 'Vine', category: 'plants' },
  { id: 'pitcher', icon: '\u{1FAB4}', label: 'Pitcher', category: 'plants' },
  // Terrain
  { id: 'soil', icon: '\u{1F7EB}', label: 'Soil', category: 'terrain' },
  { id: 'rock', icon: '\u{1FAA8}', label: 'Rock', category: 'terrain' },
  { id: 'moss', icon: '\u{1F7E2}', label: 'Moss', category: 'terrain' },
  // Creatures
  { id: 'snail', icon: '\u{1F40C}', label: 'Snail', category: 'creatures' },
  { id: 'ladybug', icon: '\u{1F41E}', label: 'Ladybug', category: 'creatures' },
  { id: 'butterfly', icon: '\u{1F98B}', label: 'Butterfly', category: 'creatures' },
  { id: 'frog', icon: '\u{1F438}', label: 'Frog', category: 'creatures' },
  // Tools
  { id: 'eraser', icon: '\u{1F6AB}', label: 'Eraser', category: 'tools' },
];

export class Toolbar {
  private container: HTMLElement;
  private selectedId: ToolType = 'succulent';
  public onToolChange?: (tool: ToolType) => void;
  public onHover?: (over: boolean) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'toolbar';
    this.container.innerHTML = this.buildHTML();
    document.body.appendChild(this.container);

    this.addStyles();
    this.bindEvents();
    this.updateSelection();
  }

  private buildHTML(): string {
    const categories = ['plants', 'terrain', 'creatures', 'tools'] as const;
    const labels: Record<string, string> = {
      plants: 'Plants',
      terrain: 'Terrain',
      creatures: 'Creatures',
      tools: 'Tools',
    };

    let html = '';
    for (const cat of categories) {
      const items = TOOLS.filter(t => t.category === cat);
      html += `<div class="toolbar-category">
        <div class="toolbar-category-label">${labels[cat]}</div>
        <div class="toolbar-items">`;
      for (const item of items) {
        html += `<button class="toolbar-btn" data-tool="${item.id}" title="${item.label}">
          <span class="toolbar-icon">${item.icon}</span>
          <span class="toolbar-label">${item.label}</span>
        </button>`;
      }
      html += `</div></div>`;
    }
    return html;
  }

  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #toolbar {
        position: fixed;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px 8px;
        background: rgba(30, 25, 18, 0.75);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-radius: 16px;
        border: 1px solid rgba(200, 180, 140, 0.15);
        max-height: 80vh;
        overflow-y: auto;
        scrollbar-width: none;
      }
      #toolbar::-webkit-scrollbar { display: none; }

      .toolbar-category-label {
        font-family: 'DM Sans', sans-serif;
        font-size: 0.6rem;
        color: rgba(200, 180, 140, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 4px 6px 2px;
      }

      .toolbar-items {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .toolbar-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border: none;
        background: transparent;
        color: #c4b89a;
        cursor: pointer;
        border-radius: 10px;
        transition: all 0.2s ease;
        font-family: 'DM Sans', sans-serif;
        font-size: 0.8rem;
        min-width: 120px;
        text-align: left;
      }

      .toolbar-btn:hover {
        background: rgba(200, 180, 140, 0.12);
        color: #e8dcc0;
      }

      .toolbar-btn.active {
        background: rgba(200, 180, 140, 0.2);
        color: #fff;
        box-shadow: inset 0 0 0 1px rgba(200, 180, 140, 0.25);
      }

      .toolbar-icon {
        font-size: 1.1rem;
        width: 24px;
        text-align: center;
      }

      .toolbar-label {
        white-space: nowrap;
      }

      @media (max-width: 768px) {
        #toolbar {
          left: 0;
          right: 0;
          top: auto;
          bottom: 60px;
          transform: none;
          flex-direction: row;
          flex-wrap: wrap;
          justify-content: center;
          max-height: 140px;
          border-radius: 16px 16px 0 0;
          padding: 8px;
        }
        .toolbar-category {
          display: flex;
          gap: 2px;
          align-items: center;
        }
        .toolbar-category-label { display: none; }
        .toolbar-items { flex-direction: row; }
        .toolbar-btn {
          min-width: auto;
          padding: 8px;
        }
        .toolbar-label { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  private bindEvents(): void {
    this.container.addEventListener('mouseenter', () => this.onHover?.(true));
    this.container.addEventListener('mouseleave', () => this.onHover?.(false));

    this.container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.toolbar-btn') as HTMLElement;
      if (!btn) return;
      const tool = btn.dataset.tool as ToolType;
      if (tool) {
        this.selectedId = tool;
        this.updateSelection();
        this.onToolChange?.(tool);
      }
    });

    // Keyboard shortcuts: 1-9 for first 9 tools
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= TOOLS.length) {
        this.selectedId = TOOLS[num - 1].id;
        this.updateSelection();
        this.onToolChange?.(this.selectedId);
      }
      if (e.key === 'e' || e.key === 'E') {
        this.selectedId = 'eraser';
        this.updateSelection();
        this.onToolChange?.(this.selectedId);
      }
    });
  }

  private updateSelection(): void {
    const btns = this.container.querySelectorAll('.toolbar-btn');
    btns.forEach(btn => {
      const el = btn as HTMLElement;
      el.classList.toggle('active', el.dataset.tool === this.selectedId);
    });
  }
}
