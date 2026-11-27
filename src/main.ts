import './ui/style.css';
import './ui/css/garage.css';
import './ui/css/race-hud.css';
import './ui/css/art.css';
import { Game } from './core/game';
import { KV, MemoryKV } from './core/save';
import { App } from './ui/app';
import { h } from './ui/dom';
import { maybeOfflineClaim } from './ui/offline';
import { install } from './ui/settings';

const BASE = import.meta.env.BASE_URL;
const scope = BASE;

function storage(): KV {
  try {
    const k = '__revup_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return new MemoryKV(); // private mode with storage blocked: play without persistence
  }
}

function block(title: string, body: string, action?: { label: string; run: () => void }) {
  document.querySelector('.block')?.remove();
  const el = h('div', { class: 'block', role: 'alertdialog' }, h('div', { class: 'card' },
    h('h2', {}, title), h('p', {}, body),
    action ? h('button', { class: 'btn primary', onclick: action.run }, action.label) : null));
  document.getElementById('app')!.append(el);
  return el;
}

/** One live tab per save: a newer tab asks the older one to step aside. */
async function claimTab(): Promise<BroadcastChannel | null> {
  if (typeof BroadcastChannel === 'undefined') return null;
  const ch = new BroadcastChannel(`revup:${scope}`);
  let other = false;
  const onMsg = (e: MessageEvent) => { if (e.data?.type === 'here') other = true; };
  ch.addEventListener('message', onMsg);
  ch.postMessage({ type: 'hello' });
  await new Promise((r) => setTimeout(r, 180));
  ch.removeEventListener('message', onMsg);
  if (other) {
    await new Promise<void>((resolve) => {
      const el = block('Rev Up is open in another tab', 'Only one tab can drive your garage at a time, so progress never gets overwritten.', {
        label: 'Play here', run: () => { ch.postMessage({ type: 'takeover' }); el.remove(); setTimeout(resolve, 250); },
      });
    });
  }
  return ch;
}

function devPreset(game: Game) {
  if (!import.meta.env.DEV) return;
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  if (seed) { game.state.rng = Number(seed) >>> 0; game.state.raceSeed = (Number(seed) * 31) >>> 0; }
  const preset = q.get('dev');
  if (!preset) return;
  void import('./dev').then((m) => { m.applyPreset(game, preset); location.replace(location.pathname + location.hash); });
}

async function start() {
  const ch = await claimTab();
  const game = new Game(storage(), scope, Date.now());
  devPreset(game);
  // Title screen: lazy-loaded so it never weighs on first paint. Automated browsers (smoke, input and perf checks)
  // go straight to the Garage unless the URL asks for the intro with ?intro.
  const q = new URLSearchParams(location.search);
  const wantIntro = (q.has('intro') || !navigator.webdriver) && !q.has('dev');
  if (wantIntro) document.documentElement.classList.add('intro-pending');
  const app = new App(game, document.getElementById('app')!);
  (window as unknown as { revup?: unknown }).revup = import.meta.env.DEV ? { game, app } : undefined;
  if (wantIntro) {
    app.intro = true;
    import('./ui/intro')
      .then((m) => { document.documentElement.classList.remove('intro-pending'); return m.runIntro(app); })
      .catch((err) => console.warn('Intro skipped', err))
      .finally(() => { document.documentElement.classList.remove('intro-pending'); app.start(); });
  } else app.start();

  const freeze = (msg: string) => {
    game.conflict = true;
    block('Playing in another tab', msg, { label: 'Play here', run: () => location.reload() });
  };
  game.onConflict = () => freeze('Your garage was changed in another tab. Reload to continue here with the latest progress.');
  ch?.addEventListener('message', (e) => {
    if (e.data?.type === 'hello' && !game.conflict) ch.postMessage({ type: 'here' });
    if (e.data?.type === 'takeover' && !game.conflict) { game.saveNow(); freeze('Rev Up was opened in another tab. Your progress is saved.'); }
  });

  // Event-driven UI; a 1 s heartbeat runs the printer and active-time counters while visible.
  let lastTick = performance.now();
  let timer = 0;
  const run = () => {
    clearInterval(timer);
    lastTick = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;
      game.tick(dt);
      const g = app.views.garage as unknown as { updatePrinter(): void; renderActions(): void };
      if (app.route === 'garage') { g.updatePrinter(); if (game.state.pendingQuick) g.renderActions(); }
    }, 1000);
  };
  run();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(timer);
      game.saveNow();
    } else {
      game.resume();
      run();
      if (!app.busy && !app.intro) maybeOfflineClaim(app);
      swReg?.update().catch(() => undefined);
    }
  });
  window.addEventListener('pagehide', () => game.saveNow());

  // ---------- PWA ----------
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    const ev = e as Event & { prompt: () => Promise<void> };
    install.prompt = async () => { await ev.prompt(); install.prompt = null; };
  });
  let swReg: ServiceWorkerRegistration | undefined;
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    let updating = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updating) location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'READY' || e.data?.type === 'VERSION') {
        if (!app.offlineReady) {
          app.offlineReady = true;
          // said once, and not over a brand-new player's first screen (Settings always shows it)
          if (!game.state.tips.offline && game.state.stats.races > 0) { game.markTip('offline'); app.toast('Offline play is ready'); }
        }
      }
    });
    try {
      swReg = await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
      const ask = () => navigator.serviceWorker.controller?.postMessage({ type: 'VERSION' });
      if (navigator.serviceWorker.controller) ask();
      const watch = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            app.updateReady = () => { updating = true; w.postMessage({ type: 'SKIP_WAITING' }); };
            app.maybeShowUpdate();
          }
          if (w.state === 'activated' && !navigator.serviceWorker.controller) setTimeout(ask, 300);
        });
      };
      if (swReg.waiting && navigator.serviceWorker.controller) {
        const w = swReg.waiting;
        app.updateReady = () => { updating = true; w.postMessage({ type: 'SKIP_WAITING' }); };
        app.maybeShowUpdate();
      }
      watch(swReg.installing);
      swReg.addEventListener('updatefound', () => watch(swReg!.installing));
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  }
}

void start();
