import { h } from './dom';

/**
 * Coach marks: one short instruction anchored beside the control it is about. Steps are derived from game
 * state each render (never from a stored step index), so finishing actions out of order or reloading
 * mid-step is always safe. The callout never covers its target, and the targets stay tappable.
 */
export interface CoachStep {
  id: string;
  targets: Element[];
  text: string;
  /** Show "Got it": the step only ends when dismissed (contextual tips). */
  ack?: boolean;
}

export class Coach {
  readonly el: HTMLElement;
  private text: HTMLElement;
  private gotIt: HTMLButtonElement;
  private step: CoachStep | null = null;
  private marked: Element[] = [];

  constructor(private host: HTMLElement, onAck: (id: string) => void, onSkip: () => void) {
    this.text = h('div', { class: 'coach-text' });
    this.gotIt = h('button', { class: 'coach-btn', onclick: () => this.step && onAck(this.step.id) }, 'Got it');
    this.el = h('div', { class: 'coach', role: 'note', 'aria-live': 'polite' },
      this.text,
      h('div', { class: 'coach-actions' }, this.gotIt, h('button', { class: 'coach-btn subtle', onclick: () => onSkip() }, 'Skip tips')),
      h('span', { class: 'coach-arrow', 'aria-hidden': 'true' }));
    this.el.hidden = true;
    host.append(this.el);
  }

  show(step: CoachStep | null) {
    const same = step && this.step && step.id === this.step.id && step.targets.length === this.step.targets.length && step.targets.every((t, i) => t === this.step!.targets[i]);
    if (!same) {
      for (const m of this.marked) m.classList.remove('coach-target');
      this.marked = [];
    }
    this.step = step;
    if (!step || !step.targets.length) { this.el.hidden = true; return; }
    this.text.textContent = step.text;
    this.gotIt.hidden = !step.ack;
    for (const t of step.targets) { t.classList.add('coach-target'); this.marked.push(t); }
    this.el.hidden = false;
    requestAnimationFrame(() => this.place());
  }

  /** Put the callout above the targets if there is room, else below; keep it inside the host. */
  place() {
    if (!this.step || this.el.hidden) return;
    const host = this.host.getBoundingClientRect();
    const rects = this.step.targets.map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rects.length) { this.el.hidden = true; return; }
    const top = Math.min(...rects.map((r) => r.top)) - host.top;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - host.top;
    const cx = (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2 - host.left;
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const above = top - hgt - 14 >= 4;
    const y = above ? top - hgt - 12 : bottom + 12;
    const x = Math.max(8, Math.min(host.width - w - 8, cx - w / 2));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${Math.max(4, Math.min(host.height - hgt - 4, y))}px`;
    this.el.classList.toggle('below', !above);
    (this.el.querySelector('.coach-arrow') as HTMLElement).style.left = `${Math.max(14, Math.min(w - 14, cx - x))}px`;
  }

  clear() { this.show(null); }
}
