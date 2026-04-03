import { VoxelEngine } from './VoxelEngine';

const STORAGE_KEY = 'terrarium-save';
const MAX_UNDO = 20;

export class StateManager {
  private engine: VoxelEngine;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  constructor(engine: VoxelEngine) {
    this.engine = engine;
  }

  pushUndo(): void {
    const state = JSON.stringify(this.engine.serialize());
    this.undoStack.push(state);
    if (this.undoStack.length > MAX_UNDO) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false;
    const current = JSON.stringify(this.engine.serialize());
    this.redoStack.push(current);
    const prev = this.undoStack.pop()!;
    this.engine.deserialize(JSON.parse(prev));
    this.engine.rebuild();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    const current = JSON.stringify(this.engine.serialize());
    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    this.engine.deserialize(JSON.parse(next));
    this.engine.rebuild();
    return true;
  }

  save(): void {
    try {
      const data = this.engine.serialize();
      // RLE compress the grid
      const compressed = this.rleEncode(data.grid);
      const payload = JSON.stringify({ grid: compressed, colors: data.colors });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
      console.warn('Failed to save terrarium:', e);
    }
  }

  load(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      const grid = this.rleDecode(payload.grid);
      this.engine.deserialize({ grid, colors: payload.colors });
      this.engine.rebuild();
      return true;
    } catch (e) {
      console.warn('Failed to load terrarium:', e);
      return false;
    }
  }

  hasSave(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  clearSave(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private rleEncode(arr: number[]): [number, number][] {
    const result: [number, number][] = [];
    let i = 0;
    while (i < arr.length) {
      const val = arr[i];
      let count = 1;
      while (i + count < arr.length && arr[i + count] === val && count < 255) {
        count++;
      }
      result.push([val, count]);
      i += count;
    }
    return result;
  }

  private rleDecode(rle: [number, number][]): number[] {
    const result: number[] = [];
    for (const [val, count] of rle) {
      for (let i = 0; i < count; i++) {
        result.push(val);
      }
    }
    return result;
  }

  // Setup keyboard shortcuts
  bindKeys(): void {
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.save();
      }
    });
  }
}
