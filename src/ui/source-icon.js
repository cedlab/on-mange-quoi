// Petit symbole d'une source de recette : un émoji, ou une pastille dessinée
// (Chronodrive : un « C » blanc sur rond vert).
import { h } from './dom.js';
import { sourceType } from '../logic/sources.js';

// Dessiné en SVG (et non avec une lettre) pour que le C soit exactement au centre du rond.
const CHRONO = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="12" fill="#4caf32"/>'
  + '<path transform="translate(0.8 0)" d="M15.75 8.25A5.3 5.3 0 1 0 15.75 15.75" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>';

export function sourceIcon(typeId) {
  if (typeId === 'chronodrive') {
    const el = h('span', { class: 'src-mark', 'aria-hidden': 'true' });
    el.innerHTML = CHRONO;
    return el;
  }
  return sourceType(typeId).emoji;
}

/** Symbole + nom : « 🥣 Thermomix », « (C) Chronodrive ». */
export function sourceTag(typeId) {
  return h('span', { class: 'src-label' }, sourceIcon(typeId), ' ', sourceType(typeId).label);
}
