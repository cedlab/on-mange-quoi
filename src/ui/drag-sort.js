// Réordonner une liste en glissant une poignée (doigt ou souris).
// Les autres éléments s'écartent pendant le glissement ; au lâcher,
// onReorder(from, to) reçoit l'ancienne et la nouvelle position.
import { vibrate } from './dom.js';

/** Position d'arrivée : nombre d'autres éléments dont le milieu est au-dessus du centre déplacé. */
export function dropIndex(mids, from, center) {
  let to = 0;
  mids.forEach((mid, k) => {
    if (k !== from && mid < center) to += 1;
  });
  return to;
}

export function makeSortable(list, { handle = '.drag-handle', onReorder }) {
  list.addEventListener('pointerdown', (ev) => {
    const grip = ev.target.closest(handle);
    if (!grip || !list.contains(grip) || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    const items = [...list.children];
    const item = items.find((el) => el.contains(grip));
    const from = items.indexOf(item);
    if (from < 0 || items.length < 2) return;
    ev.preventDefault();
    const rects = items.map((el) => el.getBoundingClientRect());
    const mids = rects.map((r) => r.top + r.height / 2);
    const gap = rects[1].top - rects[0].bottom;
    const step = rects[from].height + gap;
    const startY = ev.clientY;
    let to = from;
    try {
      grip.setPointerCapture(ev.pointerId);
    } catch {
      /* ignoré */
    }
    list.classList.add('sorting');
    item.classList.add('dragging');
    vibrate(10);

    const move = (e) => {
      // Reste dans la liste : pas plus haut que le premier, pas plus bas que le dernier.
      const dy = Math.max(rects[0].top - rects[from].top, Math.min(rects[rects.length - 1].bottom - rects[from].bottom, e.clientY - startY));
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
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      list.classList.remove('sorting');
      item.classList.remove('dragging');
      for (const el of items) el.style.transform = '';
      if (to !== from) onReorder(from, to);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  });
}
