// Onglet « Semaine » : planning du samedi au vendredi (Midi / Poupette / Soir / Poupette).
import { store } from '../../app.js';
import {
  addDays, dayName, dayNumber, daysBetween, formatLong, formatRange, formatShort, todayISO, weekDays, weekStart, weeksBetween,
} from '../../logic/dates.js';
import { entryLabel, plannedDays, QUICK_TEXTS, SLOTS, slotEntries } from '../../logic/plan.js';
import { filterRecipes, normalizeText } from '../../logic/recipes.js';
import { suggest } from '../../logic/suggest.js';
import { openCalendar } from '../calendar.js';
import { confirmDialog, header, sheet, toast } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { recipeThumb } from './recipes.js';
import { micButton } from '../voice.js';
import { plannedFromSelection, selectionLabel } from './selection.js';
import { deliverFile } from '../deliver-file.js';

let currentWeek = null;
const VIEW_KEY = 'omq.weekView';
function loadView() {
  try {
    return localStorage.getItem(VIEW_KEY) || 'compact';
  } catch {
    return 'compact';
  }
}
let viewMode = loadView();
let selecting = false;
const selected = new Set();

const fmtServings = (n) => `${String(n).replace('.', ',')} pers.`;

function defaultServings(slotId) {
  const slot = SLOTS.find((s) => s.id === slotId);
  return slot?.child ? store.settings.childServings : store.settings.familyServings;
}

// --- Menu PDF (partagé avec les autres écrans) --------------------------------

/** Menu PDF des semaines couvrant la période (jours hors période laissés vides). */
export async function exportMenuPdf(from, to, { blank = false } = {}) {
  toast('Préparation du PDF…', { duration: 1500 });
  try {
    const [{ jsPDF }, { buildMenuPdf }] = await Promise.all([import('jspdf'), import('../../logic/menu-pdf.js')]);
    const inRange = new Set(daysBetween(from, to));
    const weeks = weeksBetween(from, to).map((start) => {
      const cells = {};
      if (!blank) {
        for (const d of weekDays(start)) {
          cells[d] = Object.fromEntries(SLOTS.map((s) => [s.id, slotEntries(store.plans, d, s.id).map((e) => entryLabel(e, store.byId))]));
        }
      }
      return { start, cells, inRange: blank ? null : inRange };
    });
    const doc = buildMenuPdf(jsPDF, weeks);
    const name = `menu-${weeks[0].start}${weeks.length > 1 ? `-${weeks.length}-semaines` : ''}.pdf`;
    const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
    await deliverFile(file, { title: 'Menu de la semaine' });
  } catch (e) {
    console.error(e);
    toast(`PDF impossible : ${e.message}`);
  }
}

/** Choix du PDF : cette semaine, plusieurs semaines, période, grille vierge. */
export function pdfMenu(week) {
  const s = sheet(h('div', { class: 'menu flat' },
    h('button', { class: 'menu-item', onclick: () => { s.close(); exportMenuPdf(week, addDays(week, 6)); } },
      h('span', { class: 'menu-icon' }, '📄'), h('span', { class: 'grow' }, 'Cette semaine', h('small', null, formatRange(week, addDays(week, 6))))),
    h('button', { class: 'menu-item', onclick: () => { s.close(); exportMenuPdf(week, addDays(week, 13)); } },
      h('span', { class: 'menu-icon' }, '📑'), h('span', { class: 'grow' }, 'Cette semaine et la suivante', h('small', null, 'Une page par semaine'))),
    h('button', {
      class: 'menu-item', onclick: () => {
        s.close();
        openCalendar({
          title: 'Menu PDF : quelle période ?', from: week, to: addDays(week, 6), planned: plannedDays(store.plans),
          actions: [{ label: '📄 Créer le PDF', primary: true, onPick: (a, b) => exportMenuPdf(a, b) }],
        });
      },
    }, h('span', { class: 'menu-icon' }, icon('calendar', 20)), h('span', { class: 'grow' }, 'Choisir les jours…', h('small', null, 'Sur le calendrier'))),
    h('button', { class: 'menu-item', onclick: () => { s.close(); exportMenuPdf(week, addDays(week, 6), { blank: true }); } },
      h('span', { class: 'menu-icon' }, '✏️'), h('span', { class: 'grow' }, 'Grille vierge', h('small', null, 'À remplir à la main')))),
  { title: 'Menu en PDF' });
}

// --- Choix d'un plat pour un créneau -----------------------------------------------

export function openSlot(date, slotId) {
  const slot = SLOTS.find((s) => s.id === slotId);
  const body = h('div', { class: 'stack slot-sheet' });
  let query = '';
  let entries = slotEntries(store.plans, date, slotId).map((e) => ({ ...e }));
  const save = async (next) => {
    entries = next;
    draw();
    try {
      await store.setSlot(date, slotId, next);
    } catch (e) {
      toast(`Non enregistré : ${e.message}`);
    }
  };
  const addRecipe = (r) => save([...entries, { recipeId: r.id, title: r.title, servings: defaultServings(slotId) }]);
  const addText = (text) => text && save([...entries, { text }]);
  // Depuis Mes envies : ajouté au repas, et retiré de la sélection (avec « Garder »).
  const addFromSelection = async (item) => {
    const r = item.recipeId ? store.recipe(item.recipeId) : null;
    await save([...entries, r ? { recipeId: r.id, title: r.title, servings: defaultServings(slotId) } : { text: item.text }]);
    await plannedFromSelection(item, `${dayName(date)} ${dayNumber(date)}, ${slot.label.toLowerCase()}`);
    draw();
  };
  const selectionRow = () => {
    const items = store.selection.filter((i) => i.text || (store.recipe(i.recipeId) && !store.recipe(i.recipeId).deleted));
    return items.length > 0 && h('div', { class: 'stack tight' },
      h('span', { class: 'field-label' }, '🔖 Mes envies'),
      h('div', { class: 'sel-strip' }, items.map((i) => {
        const r = i.recipeId ? store.recipe(i.recipeId) : null;
        return h('button', { class: 'sel-chip', onclick: () => addFromSelection(i) },
          r ? recipeThumb(r, 32) : h('span', { class: 'thumb thumb-empty', style: { width: '32px', height: '32px' } }, '✏️'),
          h('span', null, selectionLabel(i)), icon('plus', 16));
      })));
  };

  // Idée au hasard (de saison, pas mangée récemment) adaptée au créneau.
  const ideaSeen = [];
  let idea = null;
  const nextIdea = () => {
    const cat = slot.child ? 'bebe' : 'plat';
    const enough = store.activeRecipes.filter((r) => r.category === cat).length >= 3;
    const opts = { plans: store.plans, today: todayISO(), count: 1, exclude: [...ideaSeen, ...entries.map((e) => e.recipeId)] };
    [idea] = suggest(store.recipes, { ...opts, filters: enough ? { categories: [cat] } : {} });
    if (!idea && ideaSeen.length) {
      ideaSeen.length = 0;
      [idea] = suggest(store.recipes, { ...opts, exclude: [], filters: enough ? { categories: [cat] } : {} });
    }
    if (idea) ideaSeen.push(idea.recipe.id);
  };
  const ideaRow = () => idea && h('div', { class: 'idea-row' },
    recipeThumb(idea.recipe, 44),
    h('div', { class: 'grow' },
      h('small', null, '🎲 Une idée'),
      h('strong', null, idea.recipe.title),
      idea.reasons[0] && h('small', { class: 'muted' }, idea.reasons[0])),
    h('button', { class: 'btn small primary', onclick: () => { const r = idea.recipe; nextIdea(); addRecipe(r); } }, 'Ajouter'),
    h('button', { class: 'icon-btn small', 'aria-label': 'Une autre idée', onclick: () => { nextIdea(); draw(); } }, icon('shuffle', 18)));
  nextIdea();

  // Texte libre : « Raclette chez Paul », « Pâtes au beurre »…
  const freeInput = h('input', { class: 'input grow', placeholder: 'Ex. Raclette chez Paul, pâtes au beurre…', autocomplete: 'off', enterkeyhint: 'done' });
  const freeForm = h('form', {
    class: 'free-text stack tight', onsubmit: (e) => {
      e.preventDefault();
      const t = freeInput.value.trim();
      if (!t) return;
      freeInput.value = '';
      addText(t);
    },
  },
  h('span', { class: 'field-label' }, '✏️ Texte libre'),
  h('div', { class: 'row gap' }, freeInput,
    // Dictée : le texte dit est écrit dans le champ, il reste à toucher « Ajouter ».
    micButton(freeInput),
    h('button', { class: 'btn primary', type: 'submit' }, 'Ajouter')));

  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Chercher une recette…', autocomplete: 'off', enterkeyhint: 'search',
    oninput: () => { query = search.value; drawResults(); },
  });
  const results = h('div', { class: 'slot-results' });
  const searchRow = h('div', { class: 'row gap' }, search, micButton(search));

  /** Recettes proposées : recherche, sinon les plus souvent planifiées puis les mieux notées. */
  function drawResults() {
    let list;
    if (normalizeText(query)) list = filterRecipes(store.recipes, { q: query }).slice(0, 30);
    else {
      const counts = new Map();
      for (const plan of Object.values(store.plans)) {
        for (const slots of Object.values(plan.days || {})) {
          for (const l of Object.values(slots || {})) for (const e of l || []) if (e.recipeId) counts.set(e.recipeId, (counts.get(e.recipeId) || 0) + 1);
        }
      }
      list = store.activeRecipes
        .map((r) => ({ r, score: (counts.get(r.id) || 0) * 10 + (r.rating || 0) }))
        .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, 'fr'))
        .slice(0, 12)
        .map((x) => x.r);
    }
    setChildren(results,
      !normalizeText(query) && list.length > 0 && h('p', { class: 'small muted' }, 'Souvent au menu et les mieux notées'),
      list.map((r) => h('button', { class: 'slot-result', onclick: () => addRecipe(r) },
        recipeThumb(r, 40), h('span', { class: 'grow' }, r.title), icon('plus', 18))),
      normalizeText(query) && !list.length && h('p', { class: 'muted small' }, 'Aucune recette trouvée.'),
      normalizeText(query) && h('button', { class: 'slot-result', onclick: () => { addText(query.trim()); search.value = ''; query = ''; drawResults(); } },
        h('span', { class: 'thumb thumb-empty', style: { width: '40px', height: '40px' } }, '✏️'),
        h('span', { class: 'grow' }, `Écrire « ${query.trim()} »`)));
  }

  function draw() {
    const family = slot.child ? slotEntries(store.plans, date, slotId === 'midiP' ? 'midi' : 'soir').filter((e) => e.recipeId) : [];
    setChildren(body,
      entries.length > 0 && h('div', { class: 'slot-entries' }, entries.map((e, i) => {
        const r = e.recipeId ? store.recipe(e.recipeId) : null;
        return h('div', { class: 'slot-entry' },
          r ? recipeThumb(r, 44) : h('span', { class: 'thumb thumb-empty', style: { width: '44px', height: '44px' } }, e.text ? '✏️' : '🍽️'),
          h('div', { class: 'grow' },
            h('strong', null, entryLabel(e, store.byId)),
            e.recipeId && h('div', { class: 'mini-stepper' },
              h('button', { class: 'step-btn small', 'aria-label': 'Moins de portions', disabled: e.servings <= 0.5,
                onclick: () => save(entries.map((x, j) => (j === i ? { ...x, servings: Math.max(0.5, x.servings - (x.servings > 1 ? 1 : 0.5)) } : x))) }, icon('minus', 16)),
              h('span', null, fmtServings(e.servings)),
              h('button', { class: 'step-btn small', 'aria-label': 'Plus de portions',
                onclick: () => save(entries.map((x, j) => (j === i ? { ...x, servings: x.servings + (x.servings < 1 ? 0.5 : 1) } : x))) }, icon('plus', 16)))),
          r && h('a', { class: 'icon-btn', href: `#/recette/${r.id}`, 'aria-label': 'Voir la recette', onclick: () => s.close() }, icon('book', 18)),
          h('button', { class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => save(entries.filter((_, j) => j !== i)) }, icon('close', 18)));
      })),
      slot.child && family.length > 0 && h('button', {
        class: 'btn ghost', onclick: () => save([...entries, ...family.map((e) => ({ ...e, servings: store.settings.childServings }))]),
      }, '👧 Même chose que les grands'),
      selectionRow(),
      freeForm,
      h('div', { class: 'chips' }, QUICK_TEXTS.map((t) => h('button', { class: 'chip-select', onclick: () => addText(t) }, t))),
      ideaRow(),
      h('span', { class: 'field-label' }, '📖 Une recette'),
      searchRow,
      results);
    drawResults();
  }
  draw();
  const s = sheet(body, { title: `${dayName(date)} ${dayNumber(date)} · ${slot.label}`, className: 'tall' });
}

// --- Vue Semaine -------------------------------------------------------------------

function entryChip(e) {
  const r = e.recipeId ? store.recipe(e.recipeId) : null;
  return h('span', { class: `meal ${e.text ? 'meal-text' : ''}` },
    r?.thumb ? h('img', { class: 'meal-thumb', src: r.thumb, alt: '' }) : h('span', { class: 'meal-thumb meal-emoji' }, e.text ? '✏️' : icon('book', 15)),
    h('span', { class: 'meal-title' }, entryLabel(e, store.byId)),
    e.recipeId && e.servings && h('span', { class: 'meal-servings' }, String(e.servings).replace('.', ',')));
}

export function weekView(_, query = {}) {
  const today = todayISO();
  if (query.date) currentWeek = weekStart(query.date);
  if (!currentWeek) currentWeek = weekStart(today);
  const content = h('div', { class: 'week' });
  const selBar = h('div', { class: 'selection-bar hidden' });

  const go = (w) => {
    currentWeek = w;
    draw();
    window.scrollTo(0, 0);
  };

  function drawSelection() {
    selBar.classList.toggle('hidden', !selecting);
    if (!selecting) return;
    const days = [...selected].sort();
    const a = days[0];
    const b = days[days.length - 1];
    setChildren(selBar,
      h('div', { class: 'row gap' },
        h('strong', { class: 'grow' }, days.length ? `${plural(days.length, 'jour', 'jours')} sélectionné${days.length > 1 ? 's' : ''}` : 'Touche les jours à sélectionner'),
        h('button', { class: 'btn small ghost', onclick: () => { selecting = false; selected.clear(); draw(); } }, 'Annuler')),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn small primary grow', disabled: !days.length, onclick: () => exportMenuPdf(a, b) }, '📄 Menu PDF'),
        h('button', {
          class: 'btn small danger-ghost', disabled: !days.length, onclick: async () => {
            if (!(await confirmDialog(`Vider ${plural(days.length, 'jour', 'jours')} du planning ?`, { ok: 'Vider', danger: true }))) return;
            await store.clearDays(days);
            selected.clear();
            draw();
          },
        }, 'Vider')),
      days.length > 1 && h('p', { class: 'small muted' }, `Du ${formatShort(a)} au ${formatShort(b)}`));
  }

  function dayCard(date) {
    const isSel = selected.has(date);
    const card = h('section', { class: `day-card ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${isSel ? 'selected' : ''}`, id: `jour-${date}` },
      h('header', {
        class: 'day-head', onclick: selecting ? () => { if (isSel) selected.delete(date); else selected.add(date); draw(); } : null,
      },
        selecting && h('span', { class: `day-check ${isSel ? 'on' : ''}` }, isSel ? icon('check', 16) : null),
        h('div', { class: 'day-date' }, h('span', { class: 'day-num' }, String(dayNumber(date))), h('span', null, formatLong(date).replace(/^\S+ \d+ /, ''))),
        h('strong', { class: 'day-name' }, dayName(date)),
        date === today && h('span', { class: 'badge' }, 'Aujourd’hui')),
      SLOTS.map((slot) => {
        const entries = slotEntries(store.plans, date, slot.id);
        return h('button', { class: `slot-row ${slot.child ? 'child' : ''} ${entries.length ? '' : 'empty'}`, onclick: () => openSlot(date, slot.id) },
          h('span', { class: 'slot-label' }, slot.child ? '👧 Poupette' : slot.label),
          h('span', { class: 'slot-meals' }, entries.length ? entries.map(entryChip) : h('span', { class: 'slot-add' }, '+ Ajouter')));
      }));
    return card;
  }

  const toggleSel = (date) => {
    if (selected.has(date)) selected.delete(date);
    else selected.add(date);
    draw();
  };

  /** Choix du repas à remplir pour un jour (vue compacte). */
  function addChooser(date) {
    const s = sheet(h('div', { class: 'menu flat' }, SLOTS.map((slot) => {
      const entries = slotEntries(store.plans, date, slot.id);
      return h('button', { class: 'menu-item', onclick: () => { s.close(); openSlot(date, slot.id); } },
        h('span', { class: 'menu-icon' }, slot.child ? '👧' : slot.id === 'midi' ? '☀️' : '🌙'),
        h('span', { class: 'grow' }, slot.child ? `Poupette ${slot.id === 'midiP' ? 'midi' : 'soir'}` : slot.label,
          h('small', null, entries.length ? entries.map((e) => entryLabel(e, store.byId)).join(' · ') : 'Rien de prévu')),
        icon('back', 18));
    })), { title: `${dayName(date)} ${dayNumber(date)}` });
  }

  /** Vue compacte : la date dans un rond, seuls les repas prévus sont affichés. */
  function compactDay(date) {
    const isSel = selected.has(date);
    const filled = SLOTS.map((slot) => ({ slot, entries: slotEntries(store.plans, date, slot.id) })).filter((x) => x.entries.length);
    return h('section', { class: `cday ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${isSel ? 'selected' : ''}`, id: `jour-${date}` },
      h('button', {
        class: 'cday-date', 'aria-label': `${dayName(date)} ${dayNumber(date)}`,
        onclick: () => (selecting ? toggleSel(date) : addChooser(date)),
      },
      selecting && isSel ? icon('check', 18) : h('strong', null, String(dayNumber(date))),
      h('small', null, `${dayName(date).slice(0, 3).toLowerCase()}.`)),
      h('div', { class: 'cday-card' },
        filled.length
          ? filled.map(({ slot, entries }) => h('button', { class: `cday-line ${slot.child ? 'child' : ''}`, onclick: () => (selecting ? toggleSel(date) : openSlot(date, slot.id)) },
            h('span', { class: 'cday-label' }, slot.child ? `👧 ${slot.id === 'midiP' ? 'Midi' : 'Soir'}` : slot.label),
            h('span', { class: 'cday-meals' }, entries.map((e) => {
              const r = e.recipeId ? store.recipe(e.recipeId) : null;
              return h('span', { class: `cday-meal ${e.text ? 'free' : ''}` },
                // Plat de l'onglet Recettes : sa photo, sinon une petite icône livre.
                r?.thumb ? h('img', { src: r.thumb, alt: '' })
                  : e.recipeId ? h('span', { class: 'cday-recipe-icon', title: 'Recette', 'aria-label': 'Recette' }, icon('book', 13)) : null,
                entryLabel(e, store.byId));
            }))))
          : h('button', { class: 'cday-empty', onclick: () => (selecting ? toggleSel(date) : addChooser(date)) }, 'Rien de prévu'),
        !selecting && h('button', { class: 'cday-add', 'aria-label': `Ajouter un repas le ${dayName(date).toLowerCase()} ${dayNumber(date)}`, onclick: () => addChooser(date) }, icon('plus', 18))));
  }

  function draw() {
    const days = weekDays(currentWeek);
    const end = days[6];
    const compact = viewMode === 'compact';
    const planned = plannedDays(store.plans);
    setChildren(content,
      h('div', { class: 'week-nav' },
        h('button', { class: 'icon-btn', 'aria-label': 'Semaine précédente', onclick: () => go(addDays(currentWeek, -7)) }, icon('back', 20)),
        h('button', {
          class: 'week-title', onclick: () => openCalendar({
            title: 'Aller à…', from: currentWeek, planned,
            actions: [{ label: 'Voir cette semaine', primary: true, onPick: (a) => go(weekStart(a)) }],
          }),
        }, h('strong', null, `${formatShort(currentWeek).replace(/^\S+ /, '')} → ${formatShort(end).replace(/^\S+ /, '')}`), h('small', null, 'Semaine · toucher pour le calendrier')),
        h('button', { class: 'icon-btn flip', 'aria-label': 'Semaine suivante', onclick: () => go(addDays(currentWeek, 7)) }, icon('back', 20))),
      currentWeek !== weekStart(today) && h('button', { class: 'link-btn', onclick: () => go(weekStart(today)) }, '↩︎ Revenir à cette semaine'),
      !compact && h('div', { class: 'day-strip' }, days.map((d) => h('button', {
        class: `day-pill ${d === today ? 'today' : ''} ${planned.has(d) ? 'planned' : ''} ${selected.has(d) ? 'selected' : ''}`,
        onclick: () => {
          if (selecting) {
            if (selected.has(d)) selected.delete(d);
            else selected.add(d);
            draw();
          } else document.getElementById(`jour-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, h('small', null, dayName(d).slice(0, 3)), h('strong', null, String(dayNumber(d)))))),
      !selecting && h('div', { class: 'week-actions' },
        h('button', { class: 'btn small primary', onclick: () => pdfMenu(currentWeek) }, '📄 Menu PDF'),
        h('button', { class: 'btn small ghost', onclick: () => { selecting = true; draw(); } }, icon('check', 18), 'Sélectionner'),
        h('button', {
          class: 'btn small ghost', onclick: () => openCalendar({
            title: 'Choisir une période', from: currentWeek, to: end, planned,
            hint: 'Touche le premier jour, puis le dernier.',
            actions: [
              { label: '📄 Menu PDF de ces jours', primary: true, onPick: (a, b) => exportMenuPdf(a, b) },
              { label: 'Sélectionner ces jours', onPick: (a, b) => { selecting = true; selected.clear(); for (const d of daysBetween(a, b)) selected.add(d); go(weekStart(a)); } },
            ],
          }),
        }, icon('calendar', 18), 'Période')),
      compact ? h('div', { class: 'cweek' }, days.map(compactDay)) : days.map(dayCard));
    drawSelection();
    viewBtn.setAttribute('aria-label', compact ? 'Vue détaillée' : 'Vue compacte');
    viewBtn.title = compact ? 'Vue détaillée' : 'Vue compacte';
  }

  const viewBtn = h('button', {
    class: 'icon-btn', onclick: () => {
      viewMode = viewMode === 'compact' ? 'detail' : 'compact';
      try {
        localStorage.setItem(VIEW_KEY, viewMode);
      } catch {
        /* ignoré */
      }
      draw();
    },
  }, icon('layers'));
  const unsub = store.subscribe((k) => (k === 'plans' || k === 'recipes') && draw());
  draw();
  return {
    el: h('div', { class: 'page' },
      header('Semaine', {
        lead: viewBtn,
        actions: [
          h('button', { class: 'icon-btn', 'aria-label': 'Menu en PDF', onclick: () => pdfMenu(currentWeek) }, icon('download')),
          h('a', { class: 'icon-btn', href: '#/reglages', 'aria-label': 'Réglages du planning' }, icon('users')),
        ],
      }),
      content,
      selBar),
    cleanup: unsub,
  };
}
