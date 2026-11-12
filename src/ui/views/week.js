// Onglet « Semaine » : planning du samedi au vendredi (Midi / Poupette / Soir / Poupette).
import { store } from '../../app.js';
import {
  addDays, dayName, dayNumber, daysBetween, formatRange, formatShort, todayISO, weekDays, weekStart, weeksBetween,
} from '../../logic/dates.js';
import {
  dayItems, dayOrder, entryLabel, leftoverCandidates, leftoverOf, leftoversFrom, mealLists, MOMENTS, moveEntry, plannedDays, prepLabel, QUICK_TEXTS, reorderShown, SLOTS, slotEntries,
} from '../../logic/plan.js';
import { filterRecipes, normalizeText } from '../../logic/recipes.js';
import { suggest } from '../../logic/suggest.js';
import { openCalendar } from '../calendar.js';
import { confirmDialog, header, segmented, sheet, stepper, toast } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { recipeThumb, thumbWithSource } from './recipes.js';
import { sourceIcon } from '../source-icon.js';
import { sourceType } from '../../logic/sources.js';
import { micButton } from '../voice.js';
import { plannedFromSelection, selectionLabel } from './selection.js';
import { deliverFile } from '../deliver-file.js';
import { makeSortable } from '../drag-sort.js';

// Premier jour affiché : aujourd'hui par défaut (7 jours à partir de lui).
let currentWeek = null;
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
  const sortable = (list) => {
    makeSortable(list, { onReorder: (from, to) => save(moveEntry(entries, from, to)) });
    return list;
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
  // « C'est une tâche » : « Sortir la viande du congélateur » n'est pas un plat.
  const isTask = h('input', { type: 'checkbox' });
  const freeForm = h('form', {
    class: 'free-text stack tight', onsubmit: async (e) => {
      e.preventDefault();
      const t = freeInput.value.trim();
      if (!t) return;
      freeInput.value = '';
      if (isTask.checked) {
        isTask.checked = false;
        await addTask(date, t, slotId.startsWith('midi') ? 'midi' : 'soir');
        toast(`Tâche ajoutée : ${t}.`);
      } else addText(t);
    },
  },
  h('span', { class: 'field-label' }, '✏️ Texte libre'),
  h('div', { class: 'row gap' }, freeInput,
    // Dictée : le texte dit est écrit dans le champ, il reste à toucher « Ajouter ».
    micButton(freeInput),
    h('button', { class: 'btn primary', type: 'submit' }, 'Ajouter')),
  h('label', { class: 'task-check' }, isTask, h('span', null, '📝 C’est une tâche, pas un repas'), h('small', { class: 'muted' }, ' (ex. sortir la viande du congélateur)')));

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
          for (const l of mealLists(slots)) for (const e of l) if (e.recipeId && !e.leftover) counts.set(e.recipeId, (counts.get(e.recipeId) || 0) + 1);
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
      entries.length > 0 && sortable(h('div', { class: 'slot-entries' }, entries.map((e, i) => {
        const r = e.recipeId ? store.recipe(e.recipeId) : null;
        return h('div', { class: 'slot-entry' },
          // Plusieurs plats : poignée à glisser pour choisir leur ordre.
          entries.length > 1 && h('span', { class: 'drag-handle', title: 'Glisser pour déplacer', 'aria-label': 'Glisser pour déplacer' }, icon('grip', 20)),
          r ? thumbWithSource(r, 44) : h('span', { class: 'thumb thumb-empty', style: { width: '44px', height: '44px' } }, e.text ? '✏️' : '🍽️'),
          h('div', { class: 'grow' },
            h('strong', null, entryLabel(e, store.byId)),
            e.recipeId && h('div', { class: 'mini-stepper' },
              h('button', { class: 'step-btn small', 'aria-label': 'Moins de portions', disabled: e.servings <= 0.5,
                onclick: () => save(entries.map((x, j) => (j === i ? { ...x, servings: Math.max(0.5, x.servings - (x.servings > 1 ? 1 : 0.5)) } : x))) }, icon('minus', 16)),
              h('span', null, fmtServings(e.servings)),
              h('button', { class: 'step-btn small', 'aria-label': 'Plus de portions',
                onclick: () => save(entries.map((x, j) => (j === i ? { ...x, servings: x.servings + (x.servings < 1 ? 0.5 : 1) } : x))) }, icon('plus', 16))),
            e.recipeId && !e.leftover && h('div', { class: 'entry-chips' },
              // Préparer à l'avance (la veille…) : un rappel « À préparer » ce jour-là.
              h('button', {
                class: `prep-chip ${e.prep ? 'on' : ''}`, type: 'button',
                onclick: () => prepSheet(date, e, (prep) => save(entries.map((x, j) => (j === i ? withPrep(x, prep) : x)))),
              }, icon('clock', 15), e.prep ? prepLabel(e.prep) : 'Préparer à l’avance'),
              // Prévoir des restes : ajoutés à un autre repas, portions du plat augmentées.
              (() => {
                const planned = leftoversFrom(store.plans, date, slotId, e.recipeId);
                return h('button', {
                  class: `prep-chip ${planned.length ? 'on' : ''}`, type: 'button',
                  onclick: () => planLeftoversSheet(date, slotId, e, (extra) => save(entries.map((x, j) => (j === i ? { ...x, servings: x.servings + extra } : x)))),
                }, '♻️ ', planned.length ? `Restes : ${planned.map((p) => `${dayName(p.date).slice(0, 3).toLowerCase()}. ${SLOT_WORD[p.slotId]}`).join(', ')}` : 'Prévoir des restes');
              })())),
          // Ouverte avec les portions de ce repas (« ?portions=7 »).
          r && h('a', { class: 'icon-btn', href: `#/recette/${r.id}${e.servings ? `?portions=${e.servings}` : ''}`, 'aria-label': 'Voir la recette', onclick: () => s.close() }, icon('book', 18)),
          h('button', { class: 'icon-btn', 'aria-label': 'Retirer', onclick: () => save(entries.filter((_, j) => j !== i)) }, icon('close', 18)));
      }))),
      slot.child && family.length > 0 && h('button', {
        class: 'btn ghost', onclick: () => save([...entries, ...family.map(({ prep, ...e }) => ({ ...e, servings: store.settings.childServings }))]),
      }, '👧 Même chose que les grands'),
      selectionRow(),
      freeForm,
      h('div', { class: 'chips' },
        h('button', { class: 'chip-select leftover-chip', onclick: () => leftoverSheet(date, slotId, (e) => save([...entries, e])) }, '♻️ Des restes'),
        QUICK_TEXTS.map((t) => h('button', { class: 'chip-select', onclick: () => addText(t) }, t))),
      ideaRow(),
      h('span', { class: 'field-label' }, '📖 Une recette'),
      searchRow,
      results);
    drawResults();
  }
  draw();
  const s = sheet(body, { title: `${dayName(date)} ${dayNumber(date)} · ${slot.label}`, className: 'tall' });
}

// --- Préparer à l'avance et tâches ---------------------------------------------------

const MOMENT_WORD = { matin: 'matin', midi: 'midi', soir: 'soir' };
const SLOT_WORD = { midi: 'midi', midiP: 'midi (Poupette)', soir: 'soir', soirP: 'soir (Poupette)' };

function withPrep(entry, prep) {
  const { prep: _old, ...rest } = entry;
  return prep ? { ...rest, prep } : rest;
}

/** Choix du moment de préparation d'un plat (la veille au soir par défaut). */
function prepSheet(mealDate, entry, onSave) {
  const cur = entry.prep || { offset: 1, moment: 'soir' };
  let offset = cur.offset;
  let moment = cur.moment;
  const body = h('div', { class: 'stack' });
  const choices = [
    { offset: 1, label: 'La veille', sub: formatShort(addDays(mealDate, -1)) },
    { offset: 0, label: 'Le jour même', sub: formatShort(mealDate) },
    { offset: 2, label: '2 jours avant', sub: formatShort(addDays(mealDate, -2)) },
  ];
  function draw() {
    const custom = !choices.some((c) => c.offset === offset);
    setChildren(body,
      h('p', { class: 'small muted' }, `${entryLabel(entry, store.byId)}, pour ${dayName(mealDate).toLowerCase()} ${dayNumber(mealDate)}.`),
      h('div', { class: 'menu flat' },
        choices.map((c) => h('button', { class: `menu-item ${offset === c.offset ? 'on' : ''}`, onclick: () => { offset = c.offset; draw(); } },
          h('span', { class: 'menu-icon' }, offset === c.offset ? icon('check', 20) : ''), h('span', { class: 'grow' }, c.label, h('small', null, c.sub)))),
        h('button', {
          class: `menu-item ${custom ? 'on' : ''}`, onclick: () => openCalendar({
            title: 'Préparer quel jour ?', from: addDays(mealDate, -1), planned: plannedDays(store.plans),
            actions: [{ label: 'Ce jour-là', primary: true, onPick: (d) => { offset = Math.max(0, Math.min(14, daysBetween(d, mealDate).length - 1)); draw(); } }],
          }),
        }, h('span', { class: 'menu-icon' }, custom ? icon('check', 20) : icon('calendar', 20)),
        h('span', { class: 'grow' }, 'Autre jour…', h('small', null, custom ? formatShort(addDays(mealDate, -offset)) : 'Sur le calendrier')))),
      h('span', { class: 'field-label' }, 'À quel moment ?'),
      segmented(MOMENTS.map((m) => ({ value: m.id, label: m.label })), moment, (v) => { moment = v; }),
      h('button', { class: 'btn primary big', onclick: () => { s.close(); onSave({ offset, moment, done: false }); } }, icon('clock', 20), 'Me le rappeler'),
      entry.prep && h('button', { class: 'btn danger-ghost', onclick: () => { s.close(); onSave(null); } }, 'Retirer le rappel'));
  }
  draw();
  const s = sheet(body, { title: 'Préparer à l’avance' });
}

/** Tâches enregistrées d'un jour, telles quelles. */
function ownTasks(date) {
  return store.plans[weekStart(date)]?.days?.[date]?.tasks || [];
}
const newTaskId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const shortDay = (d) => `${dayName(d).toLowerCase()} ${dayNumber(d)}`;
const gap = (from, to) => daysBetween(from, to).length - 1; // jours de from à to

async function addTask(date, text, moment) {
  await store.setDayTasks(date, [...ownTasks(date), { id: newTaskId(), text, moment, done: false }]);
}

/** Nouvelle tâche (« Sortir la viande du congélateur »), depuis le + d'un jour. */
function taskSheet(date) {
  const input = h('input', { class: 'input grow', placeholder: 'Ex. sortir la viande du congélateur', autocomplete: 'off', enterkeyhint: 'done' });
  let moment = 'matin';
  const s = sheet(h('form', {
    class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      const t = input.value.trim();
      if (!t) return;
      s.close();
      await addTask(date, t, moment).catch((err) => toast(`Non enregistré : ${err.message}`));
    },
  },
  h('div', { class: 'row gap' }, input, micButton(input)),
  h('span', { class: 'field-label' }, 'À quel moment ?'),
  segmented(MOMENTS.map((m) => ({ value: m.id, label: m.label })), moment, (v) => { moment = v; }),
  h('button', { class: 'btn primary big', type: 'submit' }, 'Ajouter la tâche')),
  { title: `Tâche · ${dayName(date)} ${dayNumber(date)}` });
  setTimeout(() => input.focus(), 250);
}

async function setTaskDone(date, t, done) {
  if (t.kind === 'prep') {
    const list = slotEntries(store.plans, t.mealDate, t.slotId);
    await store.setSlot(t.mealDate, t.slotId, list.map((x, j) => (j === t.index ? { ...x, prep: { ...x.prep, done } } : x)));
  } else {
    await store.setDayTasks(date, ownTasks(date).map((x, j) => (j === t.index ? { ...x, done } : x)));
  }
}

/** Choix d'un repas : jour (pastilles), repas, portions. Renvoie { el, value() }. */
function mealPicker({ from, date, slotId = 'soir', servings, count = 7 }) {
  let d = date;
  let slot = slotId;
  let n = servings ?? defaultServings(slotId);
  const el = h('div', { class: 'stack tight' });
  const portions = stepper({ value: n, min: 0.5, max: 30, step: 0.5, label: 'Portions', format: fmtServings, onchange: (v) => { n = v; } });
  const days = Array.from({ length: count }, (_, i) => addDays(from, i));
  function draw() {
    setChildren(el,
      h('div', { class: 'plan-days' }, days.map((x) => h('button', {
        type: 'button', class: `day-pill ${x === d ? 'selected' : ''}`, onclick: () => { d = x; draw(); },
      }, h('small', null, dayName(x).slice(0, 3)), h('strong', null, String(dayNumber(x)))))),
      segmented(SLOTS.map((x) => ({ value: x.id, label: x.child ? `Poupette ${x.id === 'midiP' ? 'midi' : 'soir'}` : x.label })), slot, (v) => {
        slot = v;
        n = defaultServings(v);
        portions.setValue(n);
      }, { className: 'wrap-seg' }),
      portions);
  }
  draw();
  return { el, value: () => ({ date: d, slotId: slot, servings: n }) };
}

/** Recette préparée un jour et mangée à un repas : crée le repas avec son rappel. */
async function planPrepared(prepDate, moment, recipe, meal) {
  const entry = { recipeId: recipe.id, title: recipe.title, servings: meal.servings, prep: { offset: gap(prepDate, meal.date), moment, done: false } };
  await store.setSlot(meal.date, meal.slotId, [...slotEntries(store.plans, meal.date, meal.slotId), entry]);
}

/** ‹ jour › : avancer ou reculer d'un jour. */
function dayStepper(day, { onPrev, onNext, prevDisabled, nextDisabled }) {
  return h('div', { class: 'day-stepper' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Un jour avant', disabled: prevDisabled, onclick: onPrev }, icon('back', 20)),
    h('strong', null, `${dayName(day)} ${dayNumber(day)}`),
    h('button', { type: 'button', class: 'icon-btn flip', 'aria-label': 'Un jour après', disabled: nextDisabled, onclick: onNext }, icon('back', 20)));
}

/** Toucher une ligne « À préparer » : changer le jour, le moment, cocher, ouvrir la recette… */
function prepEditSheet(t) {
  const body = h('div', { class: 'stack' });
  let { offset, moment } = t.entry.prep;
  let done = Boolean(t.entry.prep.done);
  const r = store.recipe(t.entry.recipeId);
  const save = (prep) => {
    const list = slotEntries(store.plans, t.mealDate, t.slotId);
    return store.setSlot(t.mealDate, t.slotId, list.map((x, j) => (j === t.index ? withPrep(x, prep) : x)))
      .catch((e) => toast(`Non enregistré : ${e.message}`));
  };
  const apply = () => { save({ offset, moment, done }); draw(); };
  function draw() {
    const day = addDays(t.mealDate, -offset);
    setChildren(body,
      h('p', { class: 'small muted' }, `Pour ${shortDay(t.mealDate)} ${SLOT_WORD[t.slotId]}${t.entry.servings ? ` · ${fmtServings(t.entry.servings)}` : '.'}`),
      h('span', { class: 'field-label' }, 'Je la prépare…'),
      dayStepper(day, {
        onPrev: () => { offset = Math.min(14, offset + 1); apply(); },
        onNext: () => { offset = Math.max(0, offset - 1); apply(); },
        prevDisabled: offset >= 14, nextDisabled: offset <= 0,
      }),
      segmented(MOMENTS.map((m) => ({ value: m.id, label: m.label })), moment, (v) => { moment = v; apply(); }),
      h('button', { class: `btn ${done ? 'ghost' : 'primary'}`, onclick: () => { done = !done; apply(); } }, icon('check', 18), done ? 'Fait ✓ (annuler)' : 'Marquer comme fait'),
      r && h('a', { class: 'btn ghost', href: `#/recette/${r.id}${t.entry.servings ? `?portions=${t.entry.servings}` : ''}`, onclick: () => s.close() }, icon('book', 18), `Voir la recette${t.entry.servings ? ` (${fmtServings(t.entry.servings)})` : ''}`),
      h('button', { class: 'btn danger-ghost', onclick: () => { save(null); s.close(); } }, 'Retirer le rappel'));
  }
  draw();
  const s = sheet(body, { title: `Préparation : ${entryLabel(t.entry, store.byId)}` });
}

/** Préparation sans repas choisi : changer de jour, rattacher à un repas, supprimer… */
function prepAloneSheet(date, t) {
  const body = h('div', { class: 'stack' });
  let day = date;
  let { moment } = t;
  let done = t.done;
  const r = store.recipe(t.recipeId);
  const strip = ({ kind, index, ...x }) => x;
  const item = () => ({ ...strip(t), moment, done });
  // Déplacer d'un jour : retirée de l'ancien jour, ajoutée au nouveau.
  const move = async (to) => {
    const from = day;
    day = to;
    draw();
    try {
      await store.setDayTasks(from, ownTasks(from).filter((x) => x.id !== t.id));
      await store.setDayTasks(to, [...ownTasks(to), item()]);
    } catch (e) {
      toast(`Non enregistré : ${e.message}`);
    }
  };
  const update = () => store.setDayTasks(day, ownTasks(day).map((x) => (x.id === t.id ? item() : x))).catch((e) => toast(`Non enregistré : ${e.message}`));
  let picker = null;
  function draw() {
    setChildren(body,
      h('p', { class: 'small muted' }, 'Le repas n’est pas encore choisi.'),
      h('span', { class: 'field-label' }, 'Je la prépare…'),
      dayStepper(day, { onPrev: () => move(addDays(day, -1)), onNext: () => move(addDays(day, 1)) }),
      segmented(MOMENTS.map((m) => ({ value: m.id, label: m.label })), moment, (v) => { moment = v; update(); }),
      h('button', { class: `btn ${done ? 'ghost' : 'primary'}`, onclick: () => { done = !done; update(); draw(); } }, icon('check', 18), done ? 'Fait ✓ (annuler)' : 'Marquer comme fait'),
      picker
        ? h('div', { class: 'card stack tight' },
          h('span', { class: 'field-label' }, 'Pour quel repas ?'), picker.el,
          h('button', {
            class: 'btn primary', onclick: async () => {
              if (!r) return;
              s.close();
              try {
                await planPrepared(day, moment, r, picker.value());
                await store.setDayTasks(day, ownTasks(day).filter((x) => x.id !== t.id));
                toast(`${r.title} : au menu ${shortDay(picker.value().date)} ${SLOT_WORD[picker.value().slotId]}.`);
              } catch (e) {
                toast(`Non enregistré : ${e.message}`);
              }
            },
          }, 'Mettre au menu'))
        : r && h('button', { class: 'btn ghost', onclick: () => { picker = mealPicker({ from: day, date: addDays(day, 1), servings: t.servings }); draw(); } }, icon('calendar', 18), 'Choisir le repas…'),
      r && h('a', { class: 'btn ghost', href: `#/recette/${r.id}${t.servings ? `?portions=${t.servings}` : ''}`, onclick: () => s.close() }, icon('book', 18), 'Voir la recette'),
      h('button', {
        class: 'btn danger-ghost', onclick: async () => {
          s.close();
          await store.setDayTasks(day, ownTasks(day).filter((x) => x.id !== t.id)).catch((e) => toast(`Non enregistré : ${e.message}`));
        },
      }, 'Supprimer'));
  }
  draw();
  const s = sheet(body, { title: `Préparation : ${r?.title || t.title || 'Recette'}` });
}

/** + d'un jour → « Préparer une recette » : la recette, le moment, puis pour quel repas. */
function prepFirstSheet(date) {
  const body = h('div', { class: 'stack' });
  let recipe = null;
  let moment = 'soir';
  let picker = null;
  let query = '';
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Chercher une recette…', autocomplete: 'off', oninput: () => { query = search.value; drawList(); } });
  const list = h('div', { class: 'slot-results' });
  function drawList() {
    const found = normalizeText(query) ? filterRecipes(store.recipes, { q: query }).slice(0, 30)
      : [...store.activeRecipes].sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title, 'fr')).slice(0, 15);
    setChildren(list, found.map((r) => h('button', { class: 'slot-result', onclick: () => { recipe = r; picker = mealPicker({ from: date, date: addDays(date, 1) }); draw(); } },
      recipeThumb(r, 40), h('span', { class: 'grow' }, r.title), icon('back', 18))),
    !found.length && h('p', { class: 'muted small' }, 'Aucune recette trouvée.'));
  }
  function draw() {
    if (!recipe) {
      setChildren(body, h('div', { class: 'row gap' }, search, micButton(search, { onFinal: () => { query = search.value; drawList(); } })), list);
      drawList();
      return;
    }
    const create = async (meal) => {
      s.close();
      try {
        if (meal) {
          await planPrepared(date, moment, recipe, meal);
          toast(`${recipe.title} : préparée ${shortDay(date)}, au menu ${shortDay(meal.date)} ${SLOT_WORD[meal.slotId]}.`);
        } else {
          await store.setDayTasks(date, [...ownTasks(date), { id: newTaskId(), recipeId: recipe.id, title: recipe.title, servings: store.settings.familyServings, moment, done: false }]);
          toast(`${recipe.title} : à préparer ${shortDay(date)}.`);
        }
      } catch (e) {
        toast(`Non enregistré : ${e.message}`);
      }
    };
    setChildren(body,
      h('div', { class: 'row gap' }, recipeThumb(recipe, 44), h('strong', { class: 'grow' }, recipe.title),
        h('button', { class: 'btn small ghost', onclick: () => { recipe = null; draw(); } }, 'Changer')),
      h('span', { class: 'field-label' }, `Je la prépare ${shortDay(date)}…`),
      segmented(MOMENTS.map((m) => ({ value: m.id, label: m.label })), moment, (v) => { moment = v; }),
      h('span', { class: 'field-label' }, 'Pour quel repas ?'),
      picker.el,
      h('button', { class: 'btn primary big', onclick: () => create(picker.value()) }, '🔪 Préparer et mettre au menu'),
      h('button', { class: 'btn ghost', onclick: () => create(null) }, 'Pas encore décidé (juste la préparer)'));
  }
  draw();
  const s = sheet(body, { title: `Préparer une recette · ${shortDay(date)}`, className: 'tall' });
  setTimeout(() => search.focus(), 250);
}

/** Ligne « À préparer » ou tâche, avec sa case à cocher. */
function taskLine(date, t) {
  const toggle = h('button', {
    class: `task-box ${t.done ? 'done' : ''}`, 'aria-label': t.done ? 'Marquer à faire' : 'Marquer fait',
    onclick: () => setTaskDone(date, t, !t.done).catch((e) => toast(`Non enregistré : ${e.message}`)),
  }, t.done && icon('check', 14));
  if (t.kind === 'prep' || t.kind === 'prepAlone') {
    const label = t.kind === 'prep' ? entryLabel(t.entry, store.byId) : (store.recipe(t.recipeId)?.title || t.title || 'Recette');
    const servings = t.kind === 'prep' ? t.entry.servings : t.servings;
    const forWhen = t.kind === 'prep' ? `pour ${dayName(t.mealDate).slice(0, 3).toLowerCase()}. ${SLOT_WORD[t.slotId]}` : 'repas pas encore choisi';
    return h('div', { class: `cday-task ${t.done ? 'done' : ''}` }, toggle,
      h('button', { class: 'task-text', onclick: () => (t.kind === 'prep' ? prepEditSheet(t) : prepAloneSheet(date, t)) },
        h('span', { class: 'task-moment' }, MOMENT_WORD[t.moment]),
        h('span', null, '🔪 À préparer : ', h('strong', null, label)),
        h('small', null, ` · ${forWhen}${servings ? ` · ${fmtServings(servings)}` : ''}`)));
  }
  return h('div', { class: `cday-task ${t.done ? 'done' : ''}` }, toggle,
    h('button', {
      class: 'task-text', onclick: async () => {
        if (await confirmDialog(`Supprimer la tâche « ${t.text} » ?`, { ok: 'Supprimer', danger: true })) {
          await store.setDayTasks(date, ownTasks(date).filter((_, j) => j !== t.index));
        }
      },
    }, h('span', { class: 'task-moment' }, MOMENT_WORD[t.moment]), h('span', null, '📝 ', t.text)));
}

// --- Restes ------------------------------------------------------------------------------

/** « ♻️ Des restes » : choisir un plat des jours d'avant. */
function leftoverSheet(date, slotId, onPick) {
  const list = leftoverCandidates(store.plans, date, slotId);
  const slot = SLOTS.find((x) => x.id === slotId);
  const servings = defaultServings(slotId);
  const s = sheet(h('div', { class: 'stack' },
    list.length
      ? h('div', { class: 'slot-results' }, list.map((c) => {
        const r = c.entry.recipeId ? store.recipe(c.entry.recipeId) : null;
        return h('button', { class: 'slot-result', onclick: () => { s.close(); onPick(leftoverOf(c.entry, { date: c.date, slotId: c.slotId }, servings)); } },
          r ? thumbWithSource(r, 40) : h('span', { class: 'thumb thumb-empty', style: { width: '40px', height: '40px' } }, '✏️'),
          h('span', { class: 'grow' }, entryLabel(c.entry, store.byId), h('small', { class: 'muted block' }, `${dayName(c.date).toLowerCase()} ${dayNumber(c.date)} · ${SLOT_WORD[c.slotId]}`)),
          icon('plus', 18));
      }))
      : h('p', { class: 'muted small' }, 'Aucun plat dans les 7 derniers jours du planning.'),
    h('button', { class: 'btn ghost', onclick: () => { s.close(); onPick({ text: 'Restes' }); } }, '♻️ Des restes, sans préciser')),
  { title: `Restes pour ${dayName(date).toLowerCase()} ${dayNumber(date)} · ${slot.child ? 'Poupette' : slot.label.toLowerCase()}`, className: 'tall' });
}

/** « ♻️ Prévoir des restes » : où les manger, combien de portions (ajoutées au plat cuisiné). */
function planLeftoversSheet(mealDate, mealSlot, entry, addToOriginal) {
  let date = mealSlot.startsWith('midi') ? mealDate : addDays(mealDate, 1);
  let target = mealSlot.startsWith('midi') ? 'soir' : 'midi';
  let portions = store.settings.familyServings;
  let addPortions = true;
  const days = Array.from({ length: 7 }, (_, i) => addDays(mealDate, i));
  const body = h('div', { class: 'stack' });
  const portionStepper = stepper({ value: portions, min: 0.5, max: 30, step: 0.5, label: 'Portions de restes', format: fmtServings, onchange: (v) => { portions = v; draw(); } });
  function draw() {
    const same = date === mealDate && target === mealSlot;
    setChildren(body,
      h('p', { class: 'small muted' }, `${entryLabel(entry, store.byId)} (${fmtServings(entry.servings)}), ${dayName(mealDate).toLowerCase()} ${dayNumber(mealDate)} ${SLOT_WORD[mealSlot]}.`),
      h('span', { class: 'field-label' }, 'Les restes seront mangés…'),
      h('div', { class: 'plan-days' }, days.map((d) => h('button', {
        class: `day-pill ${d === date ? 'selected' : ''}`, onclick: () => { date = d; draw(); },
      }, h('small', null, dayName(d).slice(0, 3)), h('strong', null, String(dayNumber(d)))))),
      segmented(SLOTS.map((x) => ({ value: x.id, label: x.child ? `Poupette ${x.id === 'midiP' ? 'midi' : 'soir'}` : x.label })), target, (v) => {
        target = v;
        portions = SLOTS.find((x) => x.id === v).child ? store.settings.childServings : store.settings.familyServings;
        portionStepper.setValue(portions);
        draw();
      }, { className: 'wrap-seg' }),
      portionStepper,
      h('label', { class: 'task-check' },
        h('input', { type: 'checkbox', checked: addPortions, onchange: (ev) => { addPortions = ev.target.checked; draw(); } }),
        h('span', null, addPortions ? `Cuisiner pour ${fmtServings(entry.servings + portions)} (${String(entry.servings).replace('.', ',')} + ${String(portions).replace('.', ',')} de restes)` : 'Ne pas changer les portions du plat')),
      h('button', {
        class: 'btn primary big', disabled: same, onclick: async () => {
          s.close();
          try {
            await store.setSlot(date, target, [...slotEntries(store.plans, date, target), leftoverOf(entry, { date: mealDate, slotId: mealSlot }, portions)]);
            if (addPortions) await addToOriginal(portions);
            toast(`Restes prévus : ${dayName(date).toLowerCase()} ${dayNumber(date)} ${SLOT_WORD[target]}.`);
          } catch (e) {
            toast(`Non enregistré : ${e.message}`);
          }
        },
      }, '♻️ Prévoir ces restes'),
      same && h('p', { class: 'small muted' }, 'Choisis un autre repas que celui du plat.'));
  }
  draw();
  const s = sheet(body, { title: 'Prévoir des restes' });
}

// --- Vue Semaine -------------------------------------------------------------------

/** Petite image d'un plat avec, en bas à droite, le symbole de sa source (🥕, C vert…). */
function withSource(r, img) {
  const t = r?.source?.type && r.source.type !== 'autre' ? r.source.type : null;
  if (!t) return img;
  return h('span', { class: 'mini-src-wrap' }, img,
    h('span', { class: 'src-badge mini', title: sourceType(t).label, role: 'img', 'aria-label': `Source : ${sourceType(t).label}` }, sourceIcon(t)));
}

export function weekView(_, query = {}) {
  const today = todayISO();
  if (query.date) currentWeek = query.date < today || query.date > addDays(today, 6) ? query.date : today;
  if (!currentWeek) currentWeek = today;
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

  const toggleSel = (date) => {
    if (selected.has(date)) selected.delete(date);
    else selected.add(date);
    draw();
  };

  /** Choix du repas à remplir pour un jour (vue compacte). */
  function addChooser(date) {
    const s = sheet(h('div', { class: 'menu flat' }, dayOrder(store.plans, date).map((id) => SLOTS.find((x) => x.id === id)).map((slot) => {
      const entries = slotEntries(store.plans, date, slot.id);
      return h('button', { class: 'menu-item', onclick: () => { s.close(); openSlot(date, slot.id); } },
        h('span', { class: 'menu-icon' }, slot.child ? '👧' : slot.id === 'midi' ? '☀️' : '🌙'),
        h('span', { class: 'grow' }, slot.child ? `Poupette ${slot.id === 'midiP' ? 'midi' : 'soir'}` : slot.label,
          h('small', null, entries.length ? entries.map((e) => entryLabel(e, store.byId)).join(' · ') : 'Rien de prévu')),
        icon('back', 18));
    }),
    h('button', { class: 'menu-item', onclick: () => { s.close(); prepFirstSheet(date); } },
      h('span', { class: 'menu-icon' }, '🔪'),
      h('span', { class: 'grow' }, 'Préparer une recette', h('small', null, 'Ce jour-là, pour un repas plus tard (brownie, tiramisu…)')),
      icon('back', 18)),
    h('button', { class: 'menu-item', onclick: () => { s.close(); taskSheet(date); } },
      h('span', { class: 'menu-icon' }, '📝'),
      h('span', { class: 'grow' }, 'Une tâche', h('small', null, 'Pas un repas : sortir la viande, acheter le pain…')),
      icon('back', 18))), { title: `${dayName(date)} ${dayNumber(date)}` });
  }

  /** Vue compacte : la date dans un rond, seuls les repas prévus sont affichés. */
  function compactDay(date) {
    const isSel = selected.has(date);
    // Repas prévus et tâches, mélangés dans l'ordre choisi pour ce jour.
    const items = dayItems(store.plans, date);
    const shown = items.filter((i) => i.type === 'task' || i.filled);
    const mealCount = shown.filter((i) => i.type === 'slot').length;
    const mealLine = (slot) => {
      const entries = slotEntries(store.plans, date, slot.id);
      return h('button', { class: `cday-line ${slot.child ? 'child' : ''}`, onclick: () => (selecting ? toggleSel(date) : openSlot(date, slot.id)) },
      h('span', { class: 'cday-label' }, slot.child ? `👧 ${slot.id === 'midiP' ? 'Midi' : 'Soir'}` : slot.label),
      h('span', { class: 'cday-meals' }, entries.map((e) => {
        const r = e.recipeId ? store.recipe(e.recipeId) : null;
        return h('span', { class: `cday-meal ${e.text ? 'free' : ''}` },
          // Plat de l'onglet Recettes : sa photo (sinon une petite icône livre),
          // avec le petit symbole de sa provenance.
          r?.thumb ? withSource(r, h('img', { src: r.thumb, alt: '' }))
            : e.recipeId ? withSource(r, h('span', { class: 'cday-recipe-icon', title: 'Recette', 'aria-label': 'Recette' }, icon('book', 13))) : null,
          e.leftover && h('span', { class: 'cday-leftover', 'aria-hidden': 'true' }, '♻️'),
          entryLabel(e, store.byId),
          e.prep && h('span', { class: 'cday-prep-mark', title: `Préparé à l’avance : ${prepLabel(e.prep).toLowerCase()}`, 'aria-label': 'Préparé à l’avance' }, icon('clock', 13)));
      })));
    };
    const lines = h('div', { class: 'cday-lines' }, shown.map((i) => (i.type === 'task' ? taskLine(date, i.task) : mealLine(SLOTS.find((s) => s.id === i.id)))));
    // Appui long sur un repas ou une tâche, puis glisser : Poupette avant Midi,
    // tâche entre deux repas… (ce jour-là seulement).
    if (!selecting && shown.length > 1) {
      makeSortable(lines, {
        longPress: true,
        onReorder: (from, to) => store.setDayOrder(date, reorderShown(items.map((i) => i.key), shown.map((i) => i.key), from, to))
          .catch((e) => toast(`Non enregistré : ${e.message}`)),
      });
    }
    return h('section', { class: `cday ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${isSel ? 'selected' : ''}`, id: `jour-${date}` },
      h('button', {
        class: 'cday-date', 'aria-label': `${dayName(date)} ${dayNumber(date)}`,
        onclick: () => (selecting ? toggleSel(date) : addChooser(date)),
      },
      selecting && isSel ? icon('check', 18) : h('strong', null, String(dayNumber(date))),
      h('small', null, `${dayName(date).slice(0, 3).toLowerCase()}.`)),
      h('div', { class: 'cday-card' },
        shown.length > 0 && lines,
        !mealCount && h('button', { class: 'cday-empty', onclick: () => (selecting ? toggleSel(date) : addChooser(date)) }, shown.length ? 'Aucun repas prévu' : 'Rien de prévu'),
        !selecting && h('button', { class: 'cday-add', 'aria-label': `Ajouter un repas le ${dayName(date).toLowerCase()} ${dayNumber(date)}`, onclick: () => addChooser(date) }, icon('plus', 18))));
  }

  function draw() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(currentWeek, i));
    const end = days[6];
    const planned = plannedDays(store.plans);
    setChildren(content,
      h('div', { class: 'week-nav' },
        h('button', { class: 'icon-btn', 'aria-label': '7 jours avant', onclick: () => go(addDays(currentWeek, -7)) }, icon('back', 20)),
        h('button', {
          class: 'week-title', onclick: () => openCalendar({
            title: 'Aller à…', from: currentWeek, planned,
            actions: [{ label: 'Voir à partir de ce jour', primary: true, onPick: (a) => go(a) }],
          }),
        }, h('strong', null, `${formatShort(currentWeek).replace(/^\S+ /, '')} → ${formatShort(end).replace(/^\S+ /, '')}`), h('small', null, currentWeek === today ? 'À partir d’aujourd’hui' : 'Toucher pour le calendrier')),
        h('button', { class: 'icon-btn flip', 'aria-label': '7 jours après', onclick: () => go(addDays(currentWeek, 7)) }, icon('back', 20))),
      currentWeek !== today && h('button', { class: 'link-btn', onclick: () => go(today) }, '↩︎ Revenir à aujourd’hui'),
      !selecting && h('div', { class: 'week-actions' },
        h('button', { class: 'btn small primary', onclick: () => pdfMenu(weekStart(currentWeek)) }, '📄 Menu PDF'),
        h('button', { class: 'btn small ghost', onclick: () => { selecting = true; draw(); } }, icon('check', 18), 'Sélectionner'),
        h('button', {
          class: 'btn small ghost', onclick: () => openCalendar({
            title: 'Choisir une période', from: currentWeek, to: end, planned,
            hint: 'Touche le premier jour, puis le dernier.',
            actions: [
              { label: '📄 Menu PDF de ces jours', primary: true, onPick: (a, b) => exportMenuPdf(a, b) },
              { label: 'Sélectionner ces jours', onPick: (a, b) => { selecting = true; selected.clear(); for (const d of daysBetween(a, b)) selected.add(d); go(a); } },
            ],
          }),
        }, icon('calendar', 18), 'Période')),
      h('div', { class: 'cweek' }, days.map(compactDay)));
    drawSelection();
  }

  const unsub = store.subscribe((k) => (k === 'plans' || k === 'recipes') && draw());
  draw();
  return {
    el: h('div', { class: 'page' },
      header('Planning', {
        actions: [
          h('button', { class: 'icon-btn', 'aria-label': 'Menu en PDF', onclick: () => pdfMenu(weekStart(currentWeek)) }, icon('download')),
          h('a', { class: 'icon-btn', href: '#/reglages', 'aria-label': 'Réglages du planning' }, icon('users')),
        ],
      }),
      content,
      selBar),
    cleanup: unsub,
  };
}
