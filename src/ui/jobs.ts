// The Job Board UI: the board (Race menu section and a sheet), the Garage pill beside the goal card, the result
// card's "jobs done" block, and reward feedback (sound, toast, a level-up card). Rules live in core/jobs.ts.
// Owned by the New mechanic workstream.
import './css/jobs.css';
import { sfx, tone } from '../audio';
import type { GameEvent } from '../core/events';
import * as J from '../core/jobs';
import { JOB_REFILL_S, STREAK_IDLE_S, xpFor } from '../data/jobs';
import { FAMILIES, carById } from '../data/tables';
import type { App } from './app';
import { h } from './dom';
import { icon } from './icons';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fam = (job: J.Job) => (job.family ? FAMILIES[job.family] : null);

/** Glyph per kind: the board reads at a glance. */
const ICON: Record<J.Job['kind'], string> = { merge: '⇄', deliver: '📦', win: '🏁', shifts: '⚙', perfects: '⚡', classic: '🚗' };

/** Streak chip text. */
function streakText(streak: number) {
  const b = Math.round(J.streakBonus(streak) * 100);
  return streak > 0 ? `Streak ×${streak}${b ? ` · +${b}% pay` : ''}` : 'No streak yet';
}

/** The Garage Level bar with the next reward named. */
export function levelBlock(app: App, compact = false): HTMLElement {
  const s = app.game.state;
  const L = J.levelInfo(s);
  const toGo = Math.max(0, xpFor(L.nextLevel) - L.xp);
  return h('div', { class: `jb-level${compact ? ' compact' : ''}`, 'aria-label': `Garage Level ${L.level}. ${toGo} XP to level ${L.nextLevel}: ${J.rewardText(s, L.next)}` },
    h('div', { class: 'jb-lv' }, h('span', { class: 'jb-lvnum' }, `Lv ${L.level}`), h('b', {}, 'Garage Level')),
    h('div', { class: 'jb-lvbody' },
      h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(L.frac * 100)}%` })),
      h('div', { class: 'jb-next' }, h('span', {}, `Lv ${L.nextLevel}: `), h('b', {}, J.rewardText(s, L.next)), h('span', { class: 'jb-togo' }, ` · ${toGo} XP to go`))));
}

/** One job: what to do, how far along, what it pays (with the streak), and its action. */
function jobCard(app: App, job: J.Job, close?: () => void): HTMLElement {
  const s = app.game.state;
  const j = J.readJobs(s);
  const pay = J.payNow(job, j.streak);
  const counter = job.need > 1;
  let action: HTMLElement | null = null;
  if (job.kind === 'deliver') {
    const p = J.deliverPreview(s, job);
    action = h('button', {
      class: `btn sm${p ? ' primary' : ' off'}`, 'data-job-deliver': String(job.id),
      'aria-label': p ? `Deliver your ${p.q === 'std' ? '' : p.q + ' '}T${p.t} ${FAMILIES[p.f].name} for $${pay}` : 'No matching spare yet',
      onclick: () => { app.game.deliverJob(job.id); },
    }, p ? 'Deliver' : J.starredMatch(s, job) ? 'Starred' : 'Need part');
  } else if (job.kind === 'merge') {
    action = close ? h('button', { class: 'btn sm', onclick: () => { close(); app.go('garage'); } }, 'Garage') : null;
  } else if (job.kind === 'win' && job.cond === 'event') {
    // one tap to the race the job asks for (the Race menu's own live start: car switch, busy guard and all)
    action = h('button', { class: 'btn sm primary-lite', onclick: () => { close?.(); app.go('race'); (app.views.race as unknown as { startLive(id: string): void }).startLive(job.event!); } }, 'Race');
  } else if (job.kind === 'classic') {
    const car = job.car!;
    const on = s.activeCar === car;
    action = h('button', { class: `btn sm${on ? '' : ' primary-lite'}`, 'aria-label': on ? `The ${carById(car).model} is your car now: race it` : `Switch to the ${carById(car).model}`,
      onclick: () => { if (!on) { app.game.setActiveCar(car); app.toast(`Driving the ${carById(car).model} — switch back in the Showroom`); } close?.(); app.go('race'); } }, on ? 'Race' : 'Drive it');
  } else if (app.route !== 'race' || close) {
    action = h('button', { class: 'btn sm', onclick: () => { close?.(); app.go('race'); } }, 'Race');
  }
  const f = fam(job);
  return h('div', { class: 'jb-job', 'data-job': String(job.id), 'data-kind': job.kind, style: f ? `--fam:${f.color}` : '' },
    h('span', { class: 'jb-ico', 'aria-hidden': 'true' }, ICON[job.kind]),
    h('div', { class: 'jb-main' },
      h('div', { class: 'jb-title' }, J.jobTitle(job)),
      h('div', { class: 'jb-hint' }, J.jobHint(job)),
      counter ? h('div', { class: 'jb-prog' }, h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((job.progress / job.need) * 100)}%` })), h('span', { class: 'num' }, `${job.progress}/${job.need}`)) : null),
    h('div', { class: 'jb-side' },
      h('span', { class: 'jb-pay num' }, `$${pay}`),
      h('span', { class: 'jb-xp' }, `+${job.xp} XP`),
      action,
      h('button', { class: 'jb-skip', 'aria-label': `Skip: ${J.jobTitle(job)}. A new job comes in a minute`, onclick: () => app.game.skipJob(job.id) }, 'Skip')));
}

/** An empty slot: when the next job arrives (counts down live). */
function emptySlot(app: App, i: number): HTMLElement {
  const left = h('span', { class: 'num' }, mmss(J.refillIn(app.game.state, i, Date.now())));
  return h('div', { class: 'jb-job empty', 'data-slot': String(i) }, h('span', { class: 'jb-ico', 'aria-hidden': 'true' }, '⏱'),
    h('div', { class: 'jb-main' }, h('div', { class: 'jb-title' }, 'New job in ', left), h('div', { class: 'jb-hint' }, 'Jobs refill while you play and while you are away.')));
}

/** Live countdowns: refresh the timers each second while the element is on screen; re-render when a slot fills. */
function liveTimers(app: App, el: HTMLElement, rebuild: () => void) {
  const id = window.setInterval(() => {
    if (!el.isConnected) { clearInterval(id); return; }
    const s = app.game.state;
    let refill = false;
    el.querySelectorAll<HTMLElement>('.jb-job.empty').forEach((row) => {
      const i = Number(row.dataset.slot);
      const left = J.refillIn(s, i, Date.now());
      if (!J.readJobs(s).slots[i] && left > 0) row.querySelector('.num')!.textContent = mmss(left);
      else refill = true;
    });
    if (refill) rebuild();
  }, 1000);
}

/** The board's body: level, streak, then each slot. */
function boardBody(app: App, close?: () => void): HTMLElement[] {
  const s = app.game.state;
  const j = J.readJobs(s);
  const rows = j.slots.map((job, i) => (job ? jobCard(app, job, close) : emptySlot(app, i)));
  return [
    levelBlock(app),
    h('div', { class: 'jb-streak' },
      h('span', { class: `chip jb-streakchip${j.streak ? ' on' : ''}` }, `🔥 ${streakText(j.streak)}`),
      h('span', { class: 'jb-streaknote' }, j.streak ? 'Clear another to keep it climbing (max +50%). It never resets while you are away.' : 'Clear jobs back to back for up to +50% pay.')),
    ...rows,
  ];
}

/** The Race menu section. Null until the board opens (after the first few races). */
export function jobBoardSection(app: App): HTMLElement | null {
  const s = app.game.state;
  if (!J.jobsUnlocked(s)) return null;
  const sec = h('section', { class: 'job-board', 'aria-label': 'Job Board', 'data-coach': 'jobs' });
  const build = () => {
    const j = J.readJobs(app.game.state);
    sec.replaceChildren(
      h('div', { class: 'feat-label' }, 'Job Board', h('span', { class: 'jb-count' }, ` · ${j.done} done · refills every ${J.refillS(j) / 60} min`)),
      ...boardBody(app));
  };
  build();
  liveTimers(app, sec, build);
  return sec;
}

/** The board as a sheet (from the Garage pill). */
export function openJobBoard(app: App) {
  app.sheet((close) => {
    const body = h('div', { class: 'job-board sheet-board' });
    const build = () => {
      const j = J.readJobs(app.game.state);
      body.replaceChildren(
        h('button', { class: 'btn sm close', onclick: close }, 'Close'),
        h('h2', {}, 'Job Board'),
        h('p', { class: 'jb-intro' }, `Short jobs that pay at once and raise your Garage Level. A cleared slot refills in ${J.refillS(j) / 60} min, while you play or are away.`),
        ...boardBody(app, close),
        ...(j.log.length ? [h('div', { class: 'jb-log' }, h('small', {}, 'Recently done'), ...j.log.slice(0, 3).map((l) => h('div', {}, `✓ ${l.title}`, h('span', { class: 'num' }, `+$${l.cash}`))))] : []));
    };
    build();
    liveTimers(app, body, build);
    const unsub = app.game.subscribe((ev) => { if (!body.isConnected) { unsub(); return; } if (ev.some(isJobEvent)) build(); });
    return body;
  });
}

const isJobEvent = (e: GameEvent) => e.type === 'job' || e.type === 'jobNew' || e.type === 'jobSkip' || e.type === 'garageLevel' || e.type === 'jobDeliver' || e.type === 'jobStreak';

/** The Garage pill beside the goal card: jobs open, the nearest one's progress, and the level bar. */
export class JobsPill {
  el: HTMLButtonElement;
  private top: HTMLElement;
  private sub: HTMLElement;
  private bar: HTMLElement;
  constructor(private app: App) {
    this.top = h('span', { class: 'jp-top' });
    this.sub = h('span', { class: 'jp-sub' });
    this.bar = h('i');
    this.el = h('button', { class: 'jobs-pill', 'data-coach': 'jobs-pill', onclick: () => openJobBoard(app) },
      icon('jobs', 'jp-i'), this.top, this.sub, h('span', { class: 'bar' }, this.bar));
  }
  render() {
    const s = this.app.game.state;
    const on = J.jobsUnlocked(s);
    this.el.hidden = !on;
    if (!on) return;
    const j = J.readJobs(s);
    const open = j.slots.filter(Boolean) as J.Job[];
    const ready = open.filter((x) => x.kind === 'deliver' && J.deliverPreview(s, x)).length;
    const L = J.levelInfo(s);
    this.top.textContent = `${open.length}/${j.slots.length}`;
    this.sub.textContent = ready ? `${ready} ready` : `Lv ${L.level}${j.streak ? ` · ×${j.streak}` : ''}`;
    this.el.classList.toggle('ready', ready > 0);
    this.bar.style.width = `${Math.round(L.frac * 100)}%`;
    this.el.setAttribute('aria-label', `Job Board: ${open.length} of ${j.slots.length} jobs open${ready ? `, ${ready} ready to deliver` : ''}. Garage Level ${L.level}. Tap to open.`);
  }
  pulse() { this.el.classList.remove('jp-hit'); requestAnimationFrame(() => this.el.classList.add('jp-hit')); }
}

/** For the race result: the jobs this race finished (paid already), and how close the rest are. */
export function jobsResultBlock(app: App, raceId: number): HTMLElement | null {
  const s = app.game.state;
  if (!J.jobsUnlocked(s)) return null;
  const j = J.readJobs(s);
  const done = j.log.filter((l) => l.raceId === raceId);
  const open = (j.slots.filter(Boolean) as J.Job[]).filter((x) => x.kind !== 'deliver');
  const near = open.sort((a, b) => b.progress / b.need - a.progress / a.need)[0];
  if (!done.length && !near) return null;
  const fresh = j.done === 0 && !done.length;
  return h('div', { class: `jb-result${done.length || fresh ? ' hit' : ''}`, 'aria-label': 'Job Board' },
    fresh ? h('div', { class: 'jb-new' }, h('strong', {}, 'New: the Job Board is open'), h('div', {}, `${j.slots.filter(Boolean).length} short jobs that pay cash at once — find them beside your goal card and in the Race menu.`)) : null,
    ...done.map((l) => h('div', { class: 'jb-done' }, h('span', { class: 'jb-check', 'aria-hidden': 'true' }, '✓'),
      h('div', { class: 'grow' }, h('strong', {}, `Job done · ${l.title}`), h('div', {}, `+$${l.cash} · +${l.xp} XP${l.streak > 1 ? ` · streak ×${l.streak}` : ''}`)))),
    near ? h('div', { class: 'jb-near' }, h('small', {}, 'Next job'), h('span', {}, `${J.jobTitle(near)}${near.need > 1 ? ` · ${near.progress}/${near.need}` : ''}`), h('span', { class: 'num' }, `$${J.payNow(near, j.streak)}`)) : null,
    levelBlock(app, true));
}

// ---------------- Feedback ----------------

/** A short rising "job done" chime over the cash blip. */
function chime(streak: number) {
  sfx.cash();
  const base = 660 * 2 ** (Math.min(streak - 1, 5) / 12);
  tone(base, 0.12, 'triangle', 0.09, 0.08);
  tone(base * 1.5, 0.16, 'triangle', 0.08, 0.16);
}

let pendingLevel: { level: number; reward: string } | null = null;

/** Level-up card: the reward that just landed and the next one to chase. */
function showLevelUp(app: App, level: number, reward: string) {
  sfx.fanfare();
  app.sheet((close) => h('div', { class: 'jb-levelup', role: 'dialog', 'aria-label': `Garage Level ${level}` },
    h('div', { class: 'jb-burst', 'aria-hidden': 'true' }, `Lv ${level}`),
    h('h2', {}, `Garage Level ${level}!`),
    h('p', { class: 'jb-got' }, h('small', {}, 'Reward'), h('strong', {}, reward)),
    levelBlock(app, true),
    h('button', { class: 'btn wide primary', onclick: close }, 'Nice')));
}

/** One listener for the whole app: sounds and toasts when a job pays, a card on level-up (after any race result),
 *  and the first-time announcement. Never fires mid-race (the result card shows those jobs instead). */
export function initJobsFeedback(app: App, pill?: JobsPill) {
  app.game.subscribe((ev) => {
    for (const e of ev) {
      if (e.type === 'job') {
        chime(e.streak);
        pill?.pulse();
        if (!app.busy) app.toast(`Job done · ${e.title} · +$${e.cash}${e.streak > 1 ? ` · streak ×${e.streak}` : ''}`);
      }
      if (e.type === 'garageLevel') pendingLevel = { level: e.level, reward: e.reward };
      if (e.type === 'jobNew' && e.first && !app.busy) app.toast('The Job Board is open: short jobs that pay at once', { label: 'See jobs', run: () => openJobBoard(app) }, 6000);
      if (e.type === 'jobNew' && !e.first) pill?.pulse();
      if (e.type === 'jobDeliver') { /* the bench redraws; the chime above covers it */ }
    }
    flushLevel(app);
  });
  // a level reached during a race shows once the result card closes
  const id = window.setInterval(() => flushLevel(app), 700);
  void id;
}

function flushLevel(app: App) {
  if (!pendingLevel || app.busy || app.root.querySelector('.sheet .jb-levelup')) return;
  const p = pendingLevel;
  pendingLevel = null;
  setTimeout(() => showLevelUp(app, p.level, p.reward), 350);
}

/** Text for the coach cue (shown once, when the board first opens). */
export const JOBS_CUE = `New: the Job Board. Three short jobs that pay cash at once and raise your Garage Level — a new one arrives ${JOB_REFILL_S / 60} min after you clear one, even while you are away. Clear them back to back for a streak.`;
export { STREAK_IDLE_S };
