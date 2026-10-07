// Rendering quality only: never changes simulation steps or time speed.
const FRAME_RATES = [24, 30, 45] as const;
const SHADOW_SIZES = [512, 1024, 1536] as const;
const PIXEL_BUDGETS = [900_000, 1_500_000, 2_200_000] as const;
const PIXEL_RATIOS = [0.85, 1.15, 1.5] as const;

export class RenderPolicy {
  private tier: number;
  private readonly ceiling: number;
  private lastFrame = -Infinity;
  private slowFrames = 0;
  private steadyFrames = 0;

  constructor(compact: boolean) {
    this.ceiling = compact ? 1 : 2;
    this.tier = this.ceiling;
  }

  get maxFps(): number { return FRAME_RATES[this.tier]; }
  get shadowSize(): number { return SHADOW_SIZES[this.tier]; }
  pixelRatio(deviceRatio: number, width: number, height: number): number {
    const budgetRatio = Math.sqrt(PIXEL_BUDGETS[this.tier] / Math.max(1, width * height));
    return Math.min(deviceRatio || 1, PIXEL_RATIOS[this.tier], budgetRatio);
  }

  shouldRender(now: number, visible: boolean): boolean {
    if (!visible) return false;
    const interval = 1000 / this.maxFps;
    if (now - this.lastFrame < interval) return false;
    // No catch-up renders after a delayed frame or a hidden tab.
    this.lastFrame = now;
    return true;
  }

  // Sample only rendered frames. Slow RAF delivery includes CPU/GPU pressure;
  // render submission duration catches expensive synchronous drawing work.
  observe(frameMs: number, renderMs: number): boolean {
    const cost = Math.max(frameMs, renderMs);
    if (!Number.isFinite(cost) || cost <= 0) return false;
    // A long delivery gap with cheap drawing can be a tab returning to the foreground.
    // Expensive drawing still counts, even when a frame takes hundreds of milliseconds.
    if (frameMs > 1000 && renderMs < 1000 / this.maxFps * 1.2) return false;
    const slow = cost > 1000 / this.maxFps * 1.2;
    this.slowFrames = slow ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    this.steadyFrames = cost < 18 ? this.steadyFrames + 1 : 0;
    if (this.slowFrames >= 30 && this.tier > 0) {
      this.tier--;
    } else if (this.steadyFrames >= 360 && this.tier < this.ceiling) {
      this.tier++;
    } else {
      return false;
    }
    this.slowFrames = 0;
    this.steadyFrames = 0;
    return true;
  }
}
