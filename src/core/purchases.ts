// Every purchase rule as data: exact price, currency, concrete benefit and lock condition, read from the same
// functions that charge it, so what the Shop shows is what the wallet pays. Pure (never changes the state).
import {
  ACTIVE_FAMILIES, CRATE_SCRAP_COST, CRATE_TIER_ODDS, CarId, FAMILIES, Family, PART_ORDER_PRICE, STYLE_ITEMS,
  TARGETED_CRATE_CASH_COST, TARGETED_CRATE_SCRAP_COST, TUNE_STAGES, TUNE_STEP, UPGRADES, UpgradeId, carById, polishCost,
  scrapOrderCost, styleItem, tunePrice,
} from '../data/tables';
import { KITS, KIT_SHELF_MAX, KitId, kitById } from '../data/fabrication';
import { orderMaxTier, orderPrice } from './board';
import { fabOpen, kitCount, kitPrice } from './fabrication';
import { fitted } from './install';
import { loadoutWith } from './loadout';
import { upgradeCost, upgradeEffect, upgradeLock, upgradeShown } from './progression';
import { restoreInfo } from './projects';
import type { GameState, Part } from './state';
import { owned as styleOwned, shopItems } from './style';

export type PurchaseKind = 'upgrade' | 'order' | 'scrapOrder' | 'polish' | 'crate' | 'tune' | 'style' | 'kit' | 'restore';

/**
 * One purchase, as the Shop renders it.
 * - `id`: stable key, e.g. `upgrade:printer`, `order:engine:6`, `scrapOrder:tires:5`, `polish:<partId>`,
 *   `crate:std` / `crate:targeted:<family>` / `crate:cash:<family>`, `tune:<car>`, `style:<itemId>:<car>`, `kit:<kitId>`,
 *   `restore:<car>`
 * - `price` / `currency`: exactly what the rule charges now (0 when maxed or already owned)
 * - `benefit`: the concrete effect, with numbers
 * - `locked`: why it is not on sale yet (null when it is); `maxed`: nothing more to buy here
 * - `short`: how much more of the currency is needed (0 when affordable); `canBuy`: on sale, not maxed, affordable
 */
export interface PurchaseInfo {
  id: string;
  kind: PurchaseKind;
  name: string;
  price: number;
  currency: 'cash' | 'scrap';
  benefit: string;
  locked: string | null;
  maxed: boolean;
  short: number;
  canBuy: boolean;
}

const pct = (a: number, b: number) => `${Math.round((b / a - 1) * 1000) / 10}%`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

function finish(s: GameState, p: Omit<PurchaseInfo, 'short' | 'canBuy'>): PurchaseInfo {
  const have = p.currency === 'cash' ? s.cash : s.scrap;
  const short = p.locked || p.maxed ? 0 : Math.max(0, p.price - have);
  return { ...p, short, canBuy: !p.locked && !p.maxed && short === 0 };
}

/** What a part of this family and tier would do on the active car (vs what it has fitted). */
function partBenefit(s: GameState, f: Family, t: number): string {
  const car = s.activeCar;
  const cls = carById(car);
  const have = fitted(s, car)[f];
  const probe: Part = { id: -1, f, t, q: 'std' };
  const before = loadoutWith(s, car, {}).stats;
  const after = loadoutWith(s, car, { [f]: probe }).stats;
  const stat = FAMILIES[f].stat as 'top' | 'accel' | 'grip';
  const label = FAMILIES[f].statLabel.toLowerCase();
  const capped = t > cls.cap ? ` (runs at T${cls.cap} on it)` : '';
  if (after[stat] > before[stat] + 1e-9) return `T${t} ${FAMILIES[f].name}: +${pct(before[stat], after[stat])} ${label} on your ${cls.model}${capped}${have ? `, over its T${have.t}` : ''}`;
  return `T${t} ${FAMILIES[f].name}: ${label}; no gain on your ${cls.model} (it has T${have?.t ?? 0}${capped}) — a merge ingredient or a part for another car`;
}

const crateOdds = (s: GameState) => CRATE_TIER_ODDS[Math.min(s.upgrades.crateTier, CRATE_TIER_ODDS.length - 1)].map((w, i) => (w > 0 ? `${Math.round(w * 100)}% T${i + 1}` : '')).filter(Boolean).join(' · ');

/** One purchase by id (see `PurchaseInfo.id`), or null for an unknown id. */
export function purchaseInfo(s: GameState, id: string): PurchaseInfo | null {
  const [kind, a, b] = id.split(':');
  switch (kind) {
    case 'upgrade': {
      const def = UPGRADES.find((u) => u.id === a);
      if (!def) return null;
      const cost = upgradeCost(s, def.id);
      const eff = upgradeEffect(s, def.id);
      return finish(s, { id, kind: 'upgrade', name: def.name, price: cost ?? 0, currency: 'cash', maxed: cost === null,
        benefit: cost === null ? `Maxed: ${eff.now}` : `${eff.now} → ${eff.next}`, locked: cost === null ? null : upgradeShown(s, def) ? upgradeLock(s, def.id) : 'Opens later in the ladder' });
    }
    case 'order': case 'scrapOrder': {
      const f = a as Family, t = Number(b);
      if (!ACTIVE_FAMILIES.includes(f) || !Number.isInteger(t) || t < 1 || !PART_ORDER_PRICE[t]) return null;
      const max = orderMaxTier(s);
      const cash = kind === 'order';
      return finish(s, { id, kind, name: `T${t} ${FAMILIES[f].name}`, price: cash ? orderPrice(s, t) : scrapOrderCost(t), currency: cash ? 'cash' : 'scrap', maxed: false,
        benefit: partBenefit(s, f, t), locked: t > max ? `T${t} sells once you own a car that runs T${t + 1} or chase one (now up to T${max})` : null });
    }
    case 'polish': {
      const pid = Number(a);
      const all = [...s.board, ...s.tray, ...Object.values(s.installed ?? {}).flatMap((sl) => Object.values(sl ?? {}))].filter(Boolean) as Part[];
      const p = all.find((x) => x.id === pid);
      if (!p) return null;
      return finish(s, { id, kind: 'polish', name: `Polish T${p.t} ${FAMILIES[p.f].name}`, price: p.q === 'std' ? polishCost(p.t) : 0, currency: 'scrap', maxed: p.q !== 'std',
        benefit: p.q === 'std' ? `+15% to this part's ${FAMILIES[p.f].statLabel.toLowerCase()} (Polished); lost if it is merged` : `Already ${p.q === 'mint' ? 'Mint' : 'Polished'}`, locked: null });
    }
    case 'crate': {
      if (a === 'std') return finish(s, { id, kind: 'crate', name: 'Mystery crate', price: CRATE_SCRAP_COST, currency: 'scrap', maxed: false, benefit: `One random part: ${crateOdds(s)}`, locked: null });
      const f = b as Family;
      if (!ACTIVE_FAMILIES.includes(f)) return null;
      const cash = a === 'cash';
      if (!cash && a !== 'targeted') return null;
      return finish(s, { id, kind: 'crate', name: `${FAMILIES[f].name} crate`, price: cash ? TARGETED_CRATE_CASH_COST : TARGETED_CRATE_SCRAP_COST, currency: cash ? 'cash' : 'scrap', maxed: false,
        benefit: `One ${FAMILIES[f].name} part: ${crateOdds(s)}`, locked: null });
    }
    case 'tune': {
      const car = a as CarId;
      let cls; try { cls = carById(car); } catch { return null; }
      const stage = s.tune?.[car] ?? 0;
      const maxed = stage >= TUNE_STAGES;
      return finish(s, { id, kind: 'tune', name: `${cls.model} Tune-up ${Math.min(TUNE_STAGES, stage + 1)}`, price: maxed ? 0 : tunePrice(car, stage), currency: 'cash', maxed,
        benefit: maxed ? `Fully tuned: +${Math.round(TUNE_STAGES * TUNE_STEP * 100)}% top speed, acceleration and grip` : `Stage ${stage + 1} of ${TUNE_STAGES}: +${Math.round(TUNE_STEP * 100)}% top speed, acceleration and grip on the ${cls.model} (not in stock-class races)`,
        locked: s.owned.includes(car) ? null : `Unlock the ${cls.model} first` });
    }
    case 'style': {
      const item = styleItem(a);
      const car = (b ?? s.activeCar) as CarId;
      if (!item) return null;
      const own = s.owned.includes(car) && styleOwned(s, item, car);
      const open = s.owned.includes(car) && shopItems(s, car).includes(item);
      return finish(s, { id, kind: 'style', name: item.name, price: own ? 0 : item.price, currency: 'cash', maxed: own,
        benefit: `${item.blurb} Looks only — no performance.`,
        locked: open || own ? null : item.kind === 'restore' ? 'Restore the Tapeback in order' : `Opens with your ${ordinal(item.opens)} car` });
    }
    case 'kit': {
      const k = kitById(a);
      if (!k) return null;
      const n = kitCount(s, k.id as KitId);
      return finish(s, { id, kind: 'kit', name: k.name, price: kitPrice(s), currency: 'scrap', maxed: n >= KIT_SHELF_MAX,
        benefit: `${k.effect} for one live race (armed in Pit Setup; used only when the race counts) · ${n} of ${KIT_SHELF_MAX} on the shelf`,
        locked: fabOpen(s) ? null : 'The Fab bench opens with your 4th car' });
    }
    case 'restore': {
      const car = a as CarId;
      try { carById(car); } catch { return null; }
      const r = restoreInfo(s, car);
      return finish(s, { id, kind: 'restore', name: `${carById(car).model}: ${r.name}`, price: r.cost, currency: 'scrap', maxed: r.maxed, benefit: r.benefit, locked: r.locked });
    }
  }
  return null;
}

/** The full catalogue for the active car (or `car`), grouped by kind in Shop order. Items that are locked are
 *  included with their reason, so a Shop can show what is coming; filter on `locked` to hide them. */
export function purchaseCatalog(s: GameState, car: CarId = s.activeCar): PurchaseInfo[] {
  const ids: string[] = [
    ...UPGRADES.map((u) => `upgrade:${u.id as UpgradeId}`),
    ...ACTIVE_FAMILIES.flatMap((f) => PART_ORDER_PRICE.map((_, t) => t).filter((t) => t > 0).map((t) => `order:${f}:${t}`)),
    ...ACTIVE_FAMILIES.flatMap((f) => PART_ORDER_PRICE.map((_, t) => t).filter((t) => t > 0).map((t) => `scrapOrder:${f}:${t}`)),
    'crate:std', ...ACTIVE_FAMILIES.map((f) => `crate:targeted:${f}`), ...ACTIVE_FAMILIES.map((f) => `crate:cash:${f}`),
    ...s.owned.map((c) => `tune:${c}`),
    ...STYLE_ITEMS.map((i) => `style:${i.id}:${car}`),
    ...KITS.map((k) => `kit:${k.id}`),
    ...s.owned.map((c) => `restore:${c}`),
  ];
  return ids.map((id) => purchaseInfo(s, id)).filter((p): p is PurchaseInfo => !!p);
}
