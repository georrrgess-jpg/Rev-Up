// Paint shop rules: cosmetic purchases and choices. Nothing here changes performance.
import { CarId, STYLE_ITEMS, StyleItem, styleItem } from '../data/tables';
import type { GameEvent } from './events';
import type { GameState } from './state';
import type { CarStyle, PaintMaterial, WheelSetId } from '../render/car';

/** The cosmetic style a car is drawn with, everywhere it appears. */
export function carStyle(s: GameState, car: CarId): CarStyle {
  const st = s.style?.[car];
  const out: CarStyle = st ? { wheel: st.wheel as WheelSetId | undefined, material: st.material as PaintMaterial | undefined, restore: st.restore, livery: st.livery } : {};
  const cc = s.concours?.[car];
  if (cc) out.concours = cc; // Concours restoration stage: drawn by the car renderer
  return out;
}

/** Premium paint is bought per car; colours, wheels and liveries are bought (or earned) once and fit every car. */
export const ownsKey = (item: StyleItem, car: CarId) => (item.kind === 'material' ? `${item.id}:${car}` : item.id);
export const owned = (s: GameState, item: StyleItem, car: CarId) => (s.owns ?? []).includes(ownsKey(item, car));

/** Items shown for this car now: open by cars owned (an earned item shows as soon as it is owned); restoration only
 *  for the Tapeback and in order. */
export function shopItems(s: GameState, car: CarId): StyleItem[] {
  const restore = s.style[car]?.restore ?? 0;
  return STYLE_ITEMS.filter((i) => {
    if (s.owned.length < i.opens && !owned(s, i, car)) return false;
    if (i.kind === 'restore') return car === 'junker' && Number(i.value) <= restore + 1;
    return true;
  });
}

/** Buy an item and apply it to the car. Restoration stages are permanent; everything else can be swapped. */
export function buyStyle(s: GameState, itemId: string, car: CarId): GameEvent[] {
  const item = styleItem(itemId);
  if (!item || !s.owned.includes(car)) return [{ type: 'invalid', reason: 'Not available' }];
  if (!shopItems(s, car).includes(item)) return [{ type: 'invalid', reason: 'Not available yet' }];
  if (owned(s, item, car)) return applyStyle(s, itemId, car);
  if (s.cash < item.price) return [{ type: 'invalid', reason: `Need $${item.price - s.cash} more` }];
  s.cash -= item.price;
  s.stats.spent = (s.stats.spent ?? 0) + item.price;
  (s.owns ??= []).push(ownsKey(item, car));
  applyStyle(s, itemId, car);
  return [{ type: 'styleBought', item: item.id, car }];
}

/** Apply an owned item (or `null` to go back to the factory look for that kind). */
export function applyStyle(s: GameState, itemId: string | null, car: CarId, kind?: StyleItem['kind']): GameEvent[] {
  const st = (s.style[car] ??= {});
  if (itemId === null) {
    if (kind === 'wheel') delete st.wheel;
    if (kind === 'material') delete st.material;
    if (kind === 'livery') delete st.livery;
    return [];
  }
  const item = styleItem(itemId);
  if (!item || !owned(s, item, car)) return [{ type: 'invalid', reason: 'Not owned' }];
  if (item.kind === 'paint') s.paints[car] = item.value;
  if (item.kind === 'wheel') st.wheel = item.value;
  if (item.kind === 'material') st.material = item.value;
  if (item.kind === 'livery') st.livery = item.value;
  if (item.kind === 'restore') st.restore = Math.max(st.restore ?? 0, Number(item.value));
  return [];
}

/** Total Paint shop catalogue value still unbought for the cars owned (for the audit and Showroom progress). */
export const styleRemaining = (s: GameState) =>
  s.owned.reduce((a, car) => a + shopItems(s, car).filter((i) => !owned(s, i, car) && (i.kind !== 'paint' && i.kind !== 'wheel' && i.kind !== 'livery' || car === s.owned[0])).reduce((b, i) => b + i.price, 0), 0);

