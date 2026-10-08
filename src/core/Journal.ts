// The terrarium's diary: a persistent log of everything that happened —
// sprouts, blooms, deaths, visits — plus the tank's age in days. This is
// what makes the tank feel like an ongoing companion rather than a toy
// you reset: come back tomorrow and Day 2 is waiting with its history.

export interface JournalEntry {
  at: number; // epoch ms
  msg: string;
}

const MAX_ENTRIES = 150;

export class Journal {
  bornAt = Date.now();
  entries: JournalEntry[] = [];

  add(msg: string): void {
    this.entries.push({ at: Date.now(), msg });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
  }

  day(at = Date.now()): number {
    return calendarDay(this.bornAt, at);
  }

  reset(): void {
    this.bornAt = Date.now();
    this.entries = [];
  }
}

// Calendar age: Day 1 on the local date the tank was born, Day 2 from the
// next midnight. Rounding absorbs daylight-saving days of 23 or 25 hours.
export function calendarDay(bornAt: number, at: number): number {
  const born = new Date(bornAt).setHours(0, 0, 0, 0);
  const now = new Date(at).setHours(0, 0, 0, 0);
  return Math.round((now - born) / 86400000) + 1;
}

export function formatDuration(seconds: number): string {
  if (seconds < 90) return 'a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} minutes`;
  const h = Math.floor(m / 60);
  if (h < 48) {
    const rm = m - h * 60;
    return rm > 0 ? `${h}h ${rm}m` : `${h} hours`;
  }
  const d = Math.floor(h / 24);
  const rh = h - d * 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d} days`;
}
