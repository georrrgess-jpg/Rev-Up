import { setMuted } from '../audio';
import { exportText, importText } from '../core/save';
import { newGame } from '../core/state';
import type { App } from './app';
import { durationText, h } from './dom';

declare const __BUILD_TIME__: string;

export const install: { prompt: (() => Promise<void>) | null; installed: boolean } = { prompt: null, installed: false };

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function openSettings(app: App) {
  const game = app.game;
  app.sheet((close) => {
    const s = game.state;
    const toggle = (label: string, desc: string, get: () => boolean, set: (v: boolean) => void) => {
      const b = h('button', { class: 'toggle', role: 'switch', 'aria-checked': String(get()), 'aria-label': label });
      b.addEventListener('click', () => { set(!get()); b.setAttribute('aria-checked', String(get())); });
      return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, label), h('div', { class: 'd' }, desc)), b);
    };
    const ta = h('textarea', { 'aria-label': 'Save code', placeholder: 'Paste a save code here to import it' });
    const offline = app.offlineReady
      ? '✓ Offline play is ready. Rev Up opens and plays without a connection.'
      : 'Offline play is getting ready. Keep the game open for a moment while online.';
    let installHelp: HTMLElement;
    if (standalone()) installHelp = h('p', {}, 'Running as an installed app.');
    else if (isIOS()) installHelp = h('p', {}, 'On iPhone: in Safari tap Share → Add to Home Screen → turn on “Open as Web App” when offered → Add.');
    else if (install.prompt) installHelp = h('div', {}, h('p', {}, 'Install Rev Up for full-screen play and quick launch.'), h('button', { class: 'btn primary', onclick: () => install.prompt?.() }, 'Install app'));
    else installHelp = h('p', {}, 'On Android: open the browser menu (⋮) → Install app (or Add to Home screen). On iPhone: Safari Share → Add to Home Screen → Open as Web App → Add.');

    return h('div', {},
      h('button', { class: 'btn sm close', onclick: close }, 'Close'),
      h('h2', {}, 'Settings'),
      toggle('Sound', 'Merge clicks, nitro, and engine revs', () => !game.state.settings.muted, (v) => { game.setSetting('muted', !v); setMuted(!v); }),
      toggle('Reduced motion', 'Shorter, calmer animations', () => game.state.settings.reducedMotion, (v) => { game.setSetting('reducedMotion', v); document.documentElement.classList.toggle('reduced', v); }),
      toggle('Nitro window cue', 'A beep when a nitro window opens', () => game.state.settings.nitroCue, (v) => game.setSetting('nitroCue', v)),
      h('h3', {}, 'Install'),
      installHelp,
      h('p', {}, offline),
      h('h3', {}, 'Move your save'),
      h('p', {}, 'Safari and the Home Screen app can keep separate saves. Copy the code from one and import it in the other.'),
      ta,
      h('div', { class: 'fams', style: 'margin-top:8px' },
        h('button', { class: 'btn sm', onclick: async () => {
          game.saveNow();
          const code = exportText(game.state);
          ta.value = code;
          try { await navigator.clipboard.writeText(code); app.toast('Save code copied'); } catch { ta.select(); app.toast('Save code ready — copy it from the box'); }
        } }, 'Export'),
        h('button', { class: 'btn sm', onclick: () => {
          const blob = new Blob([exportText(game.state)], { type: 'text/plain' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'rev-up-save.txt' });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        } }, 'Download'),
        h('button', { class: 'btn sm', onclick: () => {
          const st = importText(ta.value);
          if (!st) { app.toast('That code could not be read'); return; }
          if (!confirm('Replace this garage with the imported save?')) return;
          game.replaceState(st);
          close();
          location.reload();
        } }, 'Import')),
      h('h3', {}, 'Your run'),
      h('p', {}, `Active time ${durationText(s.activeS)} · ${s.stats.races} races · ${s.stats.wins} wins · ${s.stats.fusions} fusions · ${s.stats.mints} Mint · ${s.stats.polished} Polished`),
      h('p', { style: 'font-size:12px' }, `Build ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} · save v${s.v}`),
      h('button', { class: 'btn sm danger', onclick: () => {
        if (!confirm('Start over? This erases this garage on this device.')) return;
        const fresh = newGame(Date.now());
        game.replaceState(fresh);
        location.reload();
      } }, 'Start over'),
    );
  });
}
