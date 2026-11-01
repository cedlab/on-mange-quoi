// Onglet « Stats » : ce qu'on mange, d'après le planning.
import { store } from '../../app.js';
import { addDays, formatShort, todayISO } from '../../logic/dates.js';
import { category, formatRating } from '../../logic/recipes.js';
import { sourceType } from '../../logic/sources.js';
import { collectionStats, computeStats, forgottenFavorites } from '../../logic/stats.js';
import { plannedDays } from '../../logic/plan.js';
import { openCalendar } from '../calendar.js';
import { emptyState, header } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { planSheet } from './recipe.js';
import { recipeThumb } from './recipes.js';

const PERIODS = [
  { id: '4w', label: '4 semaines', days: 28 },
  { id: '3m', label: '3 mois', days: 91 },
  { id: '12m', label: '12 mois', days: 365 },
  { id: 'all', label: 'Tout' },
];
let period = { id: '3m' };

const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)} %`);
const DAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function tile(value, label, sub) {
  return h('div', { class: 'stat-tile' }, h('strong', null, value), h('span', null, label), sub && h('small', null, sub));
}

/** Barres horizontales (une seule série) : libellé, barre, valeur au bout. */
function barList(items, { label, lead, href } = {}) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return h('ol', { class: 'bar-list' }, items.map((i) => {
    const content = [
      lead?.(i),
      h('div', { class: 'bar-body' },
        h('span', { class: 'bar-label' }, label ? label(i) : i.label),
        h('span', { class: 'bar-track' },
          h('span', { class: 'bar-fill', style: { width: `${Math.max(2, (i.count / max) * 100)}%` } }),
          h('span', { class: 'bar-value' }, String(i.count)))),
    ];
    const link = href?.(i);
    return h('li', null, link ? h('a', { class: 'bar-row', href: link }, content) : h('div', { class: 'bar-row' }, content));
  }));
}

/** Colonnes par semaine : valeur de la plus haute affichée, les autres au toucher. */
function weekColumns(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const caption = h('p', { class: 'small muted col-caption' }, 'Touche une colonne pour voir le détail.');
  const best = weeks.reduce((a, w) => (w.count > a.count ? w : a), weeks[0]);
  return h('div', { class: 'col-chart-wrap' },
    h('div', { class: 'col-chart', role: 'img', 'aria-label': `Plats par semaine, au plus ${best.count}` },
      weeks.map((w) => h('button', {
        class: 'col', title: `Semaine du ${formatShort(w.week)} : ${plural(w.count, 'plat', 'plats')}`,
        onclick: (e) => {
          e.currentTarget.parentElement.querySelectorAll('.col.on').forEach((c) => c.classList.remove('on'));
          e.currentTarget.classList.add('on');
          caption.textContent = `Semaine du ${formatShort(w.week)} : ${plural(w.count, 'plat', 'plats')}`;
        },
      },
      w === best && w.count > 0 && h('span', { class: 'col-value' }, String(w.count)),
      h('span', { class: 'col-bar', style: { height: `${(w.count / max) * 100}%` } })))),
    h('div', { class: 'col-axis' }, h('span', null, formatShort(weeks[0].week)), h('span', null, formatShort(weeks[weeks.length - 1].week))),
    caption,
    h('details', { class: 'small' }, h('summary', null, 'Voir en tableau'),
      h('table', { class: 'data-table' },
        h('thead', null, h('tr', null, h('th', null, 'Semaine du'), h('th', null, 'Plats'))),
        h('tbody', null, weeks.map((w) => h('tr', null, h('td', null, formatShort(w.week)), h('td', null, String(w.count))))))));
}

function section(title, ...content) {
  return h('section', { class: 'card stack stat-section' }, h('h2', null, title), ...content);
}

export function statsView() {
  const body = h('div', { class: 'stack' });
  const today = todayISO();

  function range() {
    if (period.id === 'custom') return [period.from, period.to];
    if (period.id === 'all') {
      const first = [...plannedDays(store.plans)].sort()[0];
      return [first && first < today ? first : addDays(today, -27), today];
    }
    const p = PERIODS.find((x) => x.id === period.id);
    return [addDays(today, -(p.days - 1)), today];
  }

  function draw() {
    if (!store.loaded || !store.plansLoaded) {
      setChildren(body, h('div', { class: 'spinner' }));
      return;
    }
    const [from, to] = range();
    const s = computeStats({ plans: store.plans, recipes: store.byId, from, to });
    const coll = collectionStats(store.recipes);
    const forgotten = forgottenFavorites(store.recipes, store.plans, today);
    const periodBar = h('div', { class: 'filters' },
      PERIODS.map((p) => h('button', { class: `chip-select ${period.id === p.id ? 'on' : ''}`, onclick: () => { period = { id: p.id }; draw(); } }, p.label)),
      h('button', {
        class: `chip-select ${period.id === 'custom' ? 'on' : ''}`, onclick: () => openCalendar({
          title: 'Statistiques : quelle période ?', from, to, planned: plannedDays(store.plans),
          actions: [{ label: 'Voir les statistiques', primary: true, onPick: (a, b) => { period = { id: 'custom', from: a, to: b }; draw(); } }],
        }),
      }, period.id === 'custom' ? `📅 ${formatShort(from)} → ${formatShort(to)}` : '📅 Période…'));

    const intro = h('p', { class: 'small muted stat-intro' }, `D’après le planning, du ${formatShort(from)} au ${formatShort(to)}.`);
    const collection = section('📚 Notre collection',
      h('div', { class: 'stat-tiles' },
        tile(String(coll.total), 'recettes'),
        tile(String(coll.withPhoto), 'avec photo'),
        tile(pct(coll.total ? coll.categorized / coll.total : null), 'classées', `${coll.categorized} sur ${coll.total}`),
        tile(coll.avgRating ? formatRating(Math.round(coll.avgRating * 2) / 2) : '—', 'note moyenne', `${plural(coll.rated, 'recette notée', 'recettes notées')}`),
        tile(String(coll.thermomix), 'Thermomix')));

    if (!s.occasions) {
      setChildren(body, periodBar, intro,
        emptyState('📊', 'Pas encore de repas sur cette période', 'Remplis la Semaine : les statistiques se construisent au fil des repas planifiés.',
          h('a', { class: 'btn primary', href: '#/semaine' }, icon('calendar', 18), 'Aller à la semaine')),
        forgotten.length > 0 && favoritesSection(forgotten),
        collection);
      return;
    }

    setChildren(body, periodBar, intro,
      h('div', { class: 'stat-tiles big' },
        tile(String(s.occasions), 'repas', s.dishes !== s.occasions ? plural(s.dishes, 'plat', 'plats') : null),
        tile(pct(s.homemadeRate), 'fait maison', 'avec une recette'),
        tile(String(s.distinctRecipes), 'recettes différentes'),
        tile(pct(s.seasonalRate), 'de saison', 'quand il y a des fruits ou légumes'),
        tile(s.avgRating ? formatRating(Math.round(s.avgRating * 2) / 2) : '—', 'note moyenne', 'des plats mangés'),
        tile(String(s.childOccasions), 'repas Poupette', s.childOccasions ? `dont ${s.sameAsFamily} comme les grands` : null)),
      s.topRecipes.length > 0 && section('🏆 Les plus cuisinées', barList(s.topRecipes, {
        lead: (i) => (store.recipe(i.key) ? recipeThumb(store.recipe(i.key), 36) : null),
        href: (i) => (store.recipe(i.key) ? `#/recette/${i.key}` : null),
      })),
      s.weeks.length > 1 && section('📈 Plats par semaine', weekColumns(s.weeks)),
      s.categories.length > 0 && section('🍽️ Par catégorie', barList(s.categories, {
        label: (i) => (category(i.key) ? `${category(i.key).emoji} ${category(i.key).label}` : 'Sans catégorie'),
      }), s.categories.some((c) => c.key === 'aucune') && h('a', { class: 'btn small ghost', href: '#/classer' }, icon('layers', 16), 'Classer les recettes')),
      s.sources.length > 0 && section('📖 D’où viennent nos plats', barList(s.sources, {
        label: (i) => `${sourceType(i.key).emoji} ${sourceType(i.key).label}`,
      })),
      s.texts.length > 0 && section('🍕 Repas sans recette', barList(s.texts)),
      s.ingredients.length > 0 && section('🥕 Ingrédients les plus présents', h('p', { class: 'small muted' }, 'Nombre de plats qui en contiennent (hors sel, eau, huile).'), barList(s.ingredients)),
      section('📅 Jours les plus remplis', barList(s.weekdays.map((d) => ({ ...d, label: DAY_SHORT[d.day] })))),
      forgotten.length > 0 && favoritesSection(forgotten),
      collection);
  }

  function favoritesSection(list) {
    return section('⭐ À refaire bientôt',
      h('p', { class: 'small muted' }, 'Bien notées, mais pas au menu depuis plus de 3 mois.'),
      h('div', { class: 'stack tight' }, list.map(({ recipe: r, last }) => h('div', { class: 'fav-row' },
        recipeThumb(r, 44),
        h('a', { class: 'grow', href: `#/recette/${r.id}` }, h('strong', null, r.title),
          h('small', { class: 'muted' }, `${formatRating(r.rating)} ★ · ${last ? `dernière fois le ${formatShort(last)}` : 'jamais planifiée'}`)),
        h('button', { class: 'btn small ghost', onclick: () => planSheet(r) }, 'Planifier')))));
  }

  const unsub = store.subscribe((k) => (k === 'plans' || k === 'recipes') && draw());
  draw();
  return { el: h('div', { class: 'page' }, header('Statistiques'), body), cleanup: unsub };
}
