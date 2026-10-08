import { KitError } from './errors.js';

export interface Session {
  day: string;
  /** "HH:MM" or "HH:MM:SS" */
  start: string;
  end: string;
}

export interface Scheduled {
  sessions: readonly Session[];
}

export function timeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) throw new KitError('INVALID_TIME', `time must look like HH:MM, got "${time}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Same day and overlapping time. Back-to-back sessions (one ends when the next starts) do not clash. */
export function hasConflict(a: Scheduled, b: Scheduled): boolean {
  return a.sessions.some((x) =>
    b.sessions.some((y) =>
      x.day === y.day && timeToMinutes(x.start) < timeToMinutes(y.end) && timeToMinutes(y.start) < timeToMinutes(x.end)));
}

export function wouldConflict(candidate: Scheduled, selected: readonly Scheduled[]): boolean {
  return selected.some((s) => hasConflict(candidate, s));
}

export function findConflicts<T extends Scheduled>(items: readonly T[]): Array<{ a: T; b: T }> {
  const out: Array<{ a: T; b: T }> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (hasConflict(items[i], items[j])) out.push({ a: items[i], b: items[j] });
    }
  }
  return out;
}
