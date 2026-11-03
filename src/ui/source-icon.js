// Petit symbole d'une source de recette : un émoji, ou une pastille dessinée
// (Chronodrive : un « C » blanc sur rond vert).
import { h } from './dom.js';
import { sourceType } from '../logic/sources.js';

const MARKS = { chronodrive: { letter: 'C', className: 'src-mark-chrono' } };

export function sourceIcon(typeId) {
  const m = MARKS[typeId];
  if (m) return h('span', { class: `src-mark ${m.className}`, 'aria-hidden': 'true' }, m.letter);
  return sourceType(typeId).emoji;
}

/** Symbole + nom : « 🥣 Thermomix », « (C) Chronodrive ». */
export function sourceTag(typeId) {
  return h('span', { class: 'src-label' }, sourceIcon(typeId), ' ', sourceType(typeId).label);
}
