// Petit symbole d'une source de recette : un émoji, ou une pastille dessinée
// (Chronodrive : un « C » blanc sur rond vert).
import { h } from './dom.js';
import { sourceType } from '../logic/sources.js';

// Dessiné en SVG (et non avec une lettre) pour que le C soit exactement au centre du rond.
const CHRONO = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="12" fill="#4caf32"/>'
  + '<path transform="translate(0.8 0)" d="M15.75 8.25A5.3 5.3 0 1 0 15.75 15.75" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>';

// Thermomix : un petit robot (bol, couvercle, poignée, socle et bouton) blanc sur rond vert.
const THERMOMIX = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">'
  + '<circle cx="12" cy="12" r="12" fill="#36a852"/>'
  + '<rect x="8.2" y="4.6" width="7.2" height="1.6" rx="0.8" fill="#fff"/>'
  + '<path d="M8.4 7h6.8l-0.9 6.4H9.3z" fill="#fff"/>'
  + '<path d="M15.1 8.3h1.2a1.1 1.1 0 0 1 1.1 1.1v2a1.1 1.1 0 0 1-1.1 1.1h-1.5" fill="none" stroke="#fff" stroke-width="1.2"/>'
  + '<rect x="6.6" y="14.2" width="10.4" height="5.4" rx="1.6" fill="#fff"/>'
  + '<circle cx="11.8" cy="16.9" r="1.45" fill="#36a852"/></svg>';

const MARKS = { chronodrive: CHRONO, cookidoo: THERMOMIX };

export function sourceIcon(typeId) {
  if (MARKS[typeId]) {
    const el = h('span', { class: 'src-mark', 'aria-hidden': 'true' });
    el.innerHTML = MARKS[typeId];
    return el;
  }
  return sourceType(typeId).emoji;
}

/** Symbole + nom : « 🥣 Thermomix », « (C) Chronodrive ». */
export function sourceTag(typeId) {
  return h('span', { class: 'src-label' }, sourceIcon(typeId), ' ', sourceType(typeId).label);
}
