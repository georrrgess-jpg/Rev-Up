import { GameState, SAVE_VERSION, migrate, newGame, validateState } from './state';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class MemoryKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

/** Storage keys are namespaced by the deployed base path so other Pages projects never collide. */
export const saveKey = (scope: string) => `revup:${scope}:save`;
export const backupKey = (scope: string) => `revup:${scope}:corrupt-backup`;

export interface LoadResult {
  state: GameState;
  status: 'new' | 'loaded' | 'recovered';
  problem?: string;
}

function checksum(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function encodeSave(s: GameState): string {
  const data = JSON.stringify(s);
  return JSON.stringify({ app: 'rev-up', v: SAVE_VERSION, sum: checksum(data), data });
}

export function decodeSave(raw: string): GameState | null {
  try {
    const env = JSON.parse(raw);
    if (!env || env.app !== 'rev-up' || typeof env.data !== 'string') return null;
    if (checksum(env.data) !== env.sum) return null;
    return migrate(JSON.parse(env.data));
  } catch {
    return null;
  }
}

export function loadGame(kv: KV, scope: string, now: number): LoadResult {
  let raw: string | null = null;
  try { raw = kv.getItem(saveKey(scope)); } catch { /* storage blocked */ }
  if (!raw) return { state: newGame(now), status: 'new' };
  const s = decodeSave(raw);
  if (s) return { state: s, status: 'loaded' };
  try { kv.setItem(backupKey(scope), raw); } catch { /* ignore */ }
  return { state: newGame(now), status: 'recovered', problem: 'Your save could not be read, so a fresh garage was started. A copy of the old data was kept.' };
}

export type WriteResult = 'ok' | 'conflict' | 'error';

/**
 * Write with optimistic concurrency: refuse if another tab has written a newer revision.
 * `s.rev` is bumped on success.
 */
export function writeGame(kv: KV, scope: string, s: GameState): WriteResult {
  const errs = validateState(s);
  if (errs.length) {
    console.error('Refusing to save invalid state', errs);
    return 'error';
  }
  try {
    const cur = kv.getItem(saveKey(scope));
    if (cur) {
      const other = decodeSave(cur);
      if (other && other.rev > s.rev) return 'conflict';
    }
  } catch {
    return 'error';
  }
  s.rev++;
  try {
    kv.setItem(saveKey(scope), encodeSave(s));
    return 'ok';
  } catch {
    s.rev--;
    return 'error';
  }
}

/** Portable text export for moving between Safari and the installed Home Screen app. */
export function exportText(s: GameState): string {
  const bytes = new TextEncoder().encode(encodeSave(s));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `REVUP1:${btoa(bin)}`;
}

export function importText(text: string): GameState | null {
  const t = text.trim();
  if (!t.startsWith('REVUP1:')) return null;
  try {
    const bin = atob(t.slice(7));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return decodeSave(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
