// Réordonner une liste en glissant (doigt ou souris).
// - avec une poignée (handle) : le glissement démarre tout de suite ;
// - avec longPress : appui long (~0,45 s) sur l'élément, puis glisser ; un appui
//   court reste un simple toucher, et un mouvement rapide fait défiler la page.
// Les autres éléments s'écartent pendant le glissement ; au lâcher,
// onReorder(from, to) reçoit l'ancienne et la nouvelle position.
import { vibrate } from './dom.js';

const HOLD_MS = 450;
const SLOP = 8; // px de tolérance avant que l'appui long soit annulé

/** Position d'arrivée : nombre d'autres éléments dont le milieu est au-dessus du centre déplacé. */
export function dropIndex(mids, from, center) {
  let to = 0;
  mids.forEach((mid, k) => {
    if (k !== from && mid < center) to += 1;
  });
  return to;
}

export function makeSortable(list, { handle = '.drag-handle', longPress = false, onReorder }) {
  let dragging = false;
  // Pendant un glissement au doigt, la page ne doit pas défiler.
  list.addEventListener('touchmove', (e) => {
    if (dragging) e.preventDefault();
  }, { passive: false });
  if (longPress) list.addEventListener('contextmenu', (e) => e.preventDefault());

  list.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const items = [...list.children];
    const item = items.find((el) => el.contains(ev.target));
    if (!item || items.length < 2) return;
    const grip = longPress ? item : ev.target.closest(handle);
    if (!grip || !item.contains(grip)) return;
    const from = items.indexOf(item);
    const startX = ev.clientX;
    const startY = ev.clientY;
    let rects;
    let mids;
    let step;
    let to = from;
    let timer = null;

    const start = () => {
      dragging = true;
      rects = items.map((el) => el.getBoundingClientRect());
      mids = rects.map((r) => r.top + r.height / 2);
      step = rects[from].height + (rects[1].top - rects[0].bottom);
      try {
        grip.setPointerCapture(ev.pointerId);
      } catch {
        /* ignoré */
      }
      list.classList.add('sorting');
      item.classList.add('dragging');
      vibrate(15);
    };
    const move = (e) => {
      if (!dragging) {
        // Appui long pas encore atteint : un mouvement l'annule (défilement normal).
        if (Math.abs(e.clientX - startX) > SLOP || Math.abs(e.clientY - startY) > SLOP) stop();
        return;
      }
      e.preventDefault();
      // Reste près de la liste (une demi-hauteur de marge pour atteindre la première ou la dernière place).
      const half = rects[from].height / 2;
      const dy = Math.max(rects[0].top - rects[from].top - half, Math.min(rects[rects.length - 1].bottom - rects[from].bottom + half, e.clientY - startY));
      item.style.transform = `translateY(${dy}px)`;
      const next = dropIndex(mids, from, mids[from] + dy);
      if (next !== to) {
        to = next;
        vibrate(5);
      }
      items.forEach((el, k) => {
        if (k === from) return;
        let shift = 0;
        if (from < to && k > from && k <= to) shift = -step;
        if (from > to && k >= to && k < from) shift = step;
        el.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    const end = () => {
      stop();
      if (!dragging) return;
      dragging = false;
      list.classList.remove('sorting');
      item.classList.remove('dragging');
      for (const el of items) el.style.transform = '';
      // Le lâcher ne doit pas compter comme un toucher (ouvrir le repas…).
      const swallow = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      list.addEventListener('click', swallow, true);
      setTimeout(() => list.removeEventListener('click', swallow, true), 400);
      if (to !== from) onReorder(from, to);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    if (longPress) timer = setTimeout(start, HOLD_MS);
    else {
      ev.preventDefault();
      start();
    }
  });
}
