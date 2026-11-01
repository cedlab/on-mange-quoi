// Calendrier : sauter à une date ou sélectionner une période (du … au …).
import { daysBetween, formatShort, fromISO, monthGrid, monthName, todayISO } from '../logic/dates.js';
import { sheet } from './components.js';
import { h, plural, setChildren } from './dom.js';
import { icon } from './icons.js';

/**
 * Ouvre le calendrier.
 * options : { from, to, planned: Set de dates, title, actions: [{ label, primary, onPick(from, to) }] }
 * Toucher un jour le choisit ; toucher un 2e jour forme la période ; un 3e recommence.
 */
export function openCalendar({ from = null, to = null, planned = new Set(), title = 'Calendrier', actions = [], hint } = {}) {
  const today = todayISO();
  let start = from;
  let end = to || from;
  const base = fromISO(from || today);
  let year = base.getFullYear();
  let month = base.getMonth();
  const body = h('div', { class: 'stack calendar' });

  const pick = (iso) => {
    if (!start || (start && end && start !== end) || (start === end && iso === start)) {
      start = iso;
      end = iso;
    } else {
      [start, end] = iso < start ? [iso, start] : [start, iso];
    }
    draw();
  };

  function draw() {
    const cells = monthGrid(year, month);
    const [a, b] = start ? [start, end || start] : [null, null];
    const count = a ? daysBetween(a, b).length : 0;
    setChildren(body,
      hint && h('p', { class: 'small muted' }, hint),
      h('div', { class: 'cal-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Mois précédent', onclick: () => { month -= 1; if (month < 0) { month = 11; year -= 1; } draw(); } }, icon('back', 20)),
        h('strong', null, `${monthName(month)[0].toUpperCase()}${monthName(month).slice(1)} ${year}`),
        h('button', { class: 'icon-btn flip', 'aria-label': 'Mois suivant', onclick: () => { month += 1; if (month > 11) { month = 0; year += 1; } draw(); } }, icon('back', 20))),
      h('div', { class: 'cal-grid' },
        ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => h('span', { class: 'cal-dow' }, d)),
        cells.map((iso) => {
          if (!iso) return h('span', { class: 'cal-cell empty' });
          const inRange = a && iso >= a && iso <= b;
          const cls = ['cal-cell', inRange && 'in', iso === a && 'start', iso === b && 'end', iso === today && 'today', planned.has(iso) && 'planned']
            .filter(Boolean).join(' ');
          return h('button', { class: cls, 'aria-pressed': String(Boolean(inRange)), onclick: () => pick(iso) }, String(fromISO(iso).getDate()));
        })),
      h('p', { class: 'cal-summary' }, a
        ? (a === b ? formatShort(a) : `Du ${formatShort(a)} au ${formatShort(b)} · ${plural(count, 'jour', 'jours')}`)
        : 'Touche un jour, puis un autre pour choisir une période.'),
      h('div', { class: 'stack tight' }, actions.map((act) => h('button', {
        class: `btn ${act.primary ? 'primary' : 'ghost'}`, disabled: !a,
        onclick: () => {
          s.close();
          act.onPick(a, b);
        },
      }, act.label))));
  }
  draw();
  const s = sheet(body, { title });
  return s;
}
