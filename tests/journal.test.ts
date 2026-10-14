import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarDay, formatDuration, Journal } from '../src/core/Journal.ts';

test('the tank turns Day 2 at the next local midnight, not after 24 hours', () => {
  const born = new Date(2026, 2, 10, 23, 30).getTime();
  assert.equal(calendarDay(born, new Date(2026, 2, 10, 23, 59).getTime()), 1);
  assert.equal(calendarDay(born, new Date(2026, 2, 11, 0, 5).getTime()), 2);
  assert.equal(calendarDay(born, new Date(2026, 2, 17, 12, 0).getTime()), 8);
  // Spans that include a daylight-saving change in many time zones.
  assert.equal(calendarDay(new Date(2026, 2, 1).getTime(), new Date(2026, 3, 1).getTime()), 32);
  assert.equal(calendarDay(new Date(2026, 9, 1).getTime(), new Date(2026, 10, 1).getTime()), 32);
  const journal = new Journal();
  journal.bornAt = born;
  assert.equal(journal.day(new Date(2026, 2, 11, 8).getTime()), 2);
});

test('the diary keeps only the newest 150 entries', () => {
  const journal = new Journal();
  for (let n = 0; n < 160; n++) journal.add(`entry ${n}`);
  assert.equal(journal.entries.length, 150);
  assert.equal(journal.entries[0].msg, 'entry 10');
  assert.equal(journal.entries[149].msg, 'entry 159');
  journal.reset();
  assert.deepEqual(journal.entries, []);
});

test('away durations read naturally', () => {
  assert.equal(formatDuration(30), 'a minute');
  assert.equal(formatDuration(600), '10 minutes');
  assert.equal(formatDuration(3 * 3600), '3 hours');
  assert.equal(formatDuration(3 * 3600 + 25 * 60), '3h 25m');
  assert.equal(formatDuration(2 * 86400), '2 days');
  assert.equal(formatDuration(3 * 86400 + 5 * 3600), '3d 5h');
});
