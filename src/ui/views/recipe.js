// Fiche d'une recette : portions et quantités dynamiques, étapes, source.
import { navigate, store } from '../../app.js';
import {
  factorForIngredient, factorForServings, formatQuantity, formatServings, ingredientToLine, unitLabel, fixThermomixIcons, parseIngredientLine } from '../../logic/quantities.js';
import {
  CATEGORIES, category, formatMinutes, formatRating, MAX_STARS, normalizeRating, starFills, totalMinutes,
} from '../../logic/recipes.js';
import { openLabel, sourceLabel, sourceType } from '../../logic/sources.js';
import { TM_SETTING } from '../../logic/text-import.js';
import { confirmDialog, emptyState, header, promptDecimal, segmented, sheet, stepper, toast } from '../components.js';
import { addDays, dayName, dayNumber, formatShort, todayISO } from '../../logic/dates.js';
import { SLOTS, slotEntries } from '../../logic/plan.js';
import { h, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { bookmarkButton } from './selection.js';
import { sourceIcon, sourceTag } from '../source-icon.js';

/** Facteur d'échelle par recette (conservé pendant la session). */
const factors = new Map();
/** Étapes cochées pendant la préparation. */
const doneSteps = new Map();
let wakeLock = null;
/** Photos déjà chargées (évite un rechargement à chaque mise à jour). */
export const photoCache = new Map();

function starInput(r) {
  const wrap = h('div', { class: 'stars-input', role: 'radiogroup', 'aria-label': `Note : ${formatRating(r.rating)} sur ${MAX_STARS}` });
  const save = async (value) => {
    const v = normalizeRating(r.rating) === value ? 0 : value;
    try {
      await store.setRating(r.id, v);
    } catch (e) {
      toast(`Note non enregistrée : ${e.message}`);
    }
  };
  // Chaque étoile a deux moitiés : à gauche la demi-étoile, à droite l'étoile entière.
  const half = (value, side) => h('button', {
    type: 'button', class: `star-half ${side}`, role: 'radio', 'aria-checked': String(normalizeRating(r.rating) === value),
    'aria-label': `${formatRating(value)} sur ${MAX_STARS}`, onclick: () => save(value),
  });
  starFills(r.rating).forEach((f, i) => wrap.append(h('span', { class: 'star-cell' }, '★',
    h('span', { class: 'star-fill', style: { width: `${f * 100}%` } }, '★'),
    half(i + 0.5, 'left'), half(i + 1, 'right'))));
  return wrap;
}

export function chooseCategory(r) {
  const s = sheet(h('div', { class: 'cat-grid' },
    CATEGORIES.map((c) => h('button', {
      class: `cat-card ${r.category === c.id ? 'on' : ''}`,
      onclick: async () => {
        s.close();
        await store.setCategory(r.id, r.category === c.id ? null : c.id);
      },
    }, h('span', { class: 'cat-emoji' }, c.emoji), c.label))), { title: 'Catégorie' });
}

/** Texte d'une étape, réglages Thermomix (« 10 sec/vitesse 6 ») en évidence. */
function stepText(raw) {
  const text = fixThermomixIcons(raw); // aussi pour les recettes déjà enregistrées
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(new RegExp(TM_SETTING.source, 'gi'))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    // Ⓡ et Ⓢ s'affichent avec les mêmes pictos que sur le Thermomix.
    parts.push(h('strong', { class: 'tm' }, m[0].split(/([ⓇⓈ])/).filter(Boolean).map((x) => (x === 'Ⓡ'
      ? h('span', { class: 'tm-icon', title: 'Sens inverse', role: 'img', 'aria-label': 'sens inverse' }, icon('tmReverse', 19))
      : x === 'Ⓢ'
        ? h('span', { class: 'tm-icon', title: 'Vitesse mijotage', role: 'img', 'aria-label': 'mijotage' }, icon('tmSpoon', 19))
        : x))));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

/** « Planifier » : choisir le jour, le repas et les portions. */
/**
 * « Planifier » : choisir le jour, le repas et les portions.
 * r : recette, ou null avec { text } pour une idée sans recette.
 * onPlanned(date, slotId) : appelé une fois le repas ajouté.
 */
export function planSheet(r, { text = null, onPlanned } = {}) {
  const today = todayISO();
  let date = today;
  let slotId = 'soir';
  let servings = store.settings.familyServings;
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const body = h('div', { class: 'stack' });
  const servingStepper = r && stepper({ value: servings, min: 0.5, max: 30, step: 0.5, label: 'Portions', format: (v) => `${String(v).replace('.', ',')} pers.`, onchange: (v) => { servings = v; } });
  function draw() {
    setChildren(body,
      h('div', { class: 'plan-days' }, days.map((d) => h('button', {
        class: `day-pill ${d === date ? 'selected' : ''} ${d === today ? 'today' : ''}`, onclick: () => { date = d; draw(); },
      }, h('small', null, dayName(d).slice(0, 3)), h('strong', null, String(dayNumber(d)))))),
      segmented(SLOTS.map((s) => ({ value: s.id, label: s.child ? `Poupette ${s.id === 'midiP' ? 'midi' : 'soir'}` : s.label })), slotId, (v) => {
        slotId = v;
        servings = SLOTS.find((s) => s.id === v).child ? store.settings.childServings : store.settings.familyServings;
        servingStepper?.setValue(servings);
      }, { className: 'wrap-seg' }),
      servingStepper,
      h('button', {
        class: 'btn primary big', onclick: async () => {
          const entries = slotEntries(store.plans, date, slotId);
          const entry = r ? { recipeId: r.id, title: r.title, servings } : { text };
          try {
            await store.setSlot(date, slotId, [...entries, entry]);
            s.close();
            const label = SLOTS.find((x) => x.id === slotId);
            const where = `${formatShort(date)}, ${label.child ? 'Poupette' : label.label.toLowerCase()}`;
            if (onPlanned) onPlanned(date, slotId, where);
            else toast(`Ajouté au menu : ${where}.`, { action: 'Voir', onAction: () => navigate(`/semaine?date=${date}`) });
          } catch (e) {
            toast(`Non enregistré : ${e.message}`);
          }
        },
      }, icon('calendar', 20), 'Mettre au menu'));
  }
  draw();
  const s = sheet(body, { title: `Mettre au menu « ${r ? r.title : text} »` });
}

/** Texte de la recette pour le partage (WhatsApp, SMS, mail…). */
export function recipeShareText(r, factor = 1) {
  const lines = [`🍽️ ${r.title}`];
  if (r.servings) lines.push(`Pour ${formatServings(r.servings, factor)} ${r.servingsLabel || 'personnes'}`);
  else if (factor !== 1) lines.push(`Quantités × ${String(Math.round(factor * 100) / 100).replace('.', ',')}`);
  const t = [r.prepMin && `préparation ${formatMinutes(r.prepMin)}`, r.cookMin && `cuisson ${formatMinutes(r.cookMin)}`, r.restMin && `repos ${formatMinutes(r.restMin)}`].filter(Boolean);
  if (t.length) lines.push(`⏱ ${t.join(', ')}`);
  lines.push('', 'INGRÉDIENTS');
  let group = null;
  for (const ing of r.ingredients || []) {
    if ((ing.group || null) !== group) {
      group = ing.group || null;
      if (group) lines.push(`${group} :`);
    }
    lines.push(`• ${ingredientToLine({ ...ing, raw: undefined }, factor)}`);
  }
  if (r.steps?.length) {
    lines.push('', 'PRÉPARATION');
    let n = 0;
    for (const s of r.steps) {
      if (s.section) lines.push('', s.section);
      else lines.push(`${++n}. ${s.text.replace(/Ⓡ/g, 'sens inverse').replace(/vitesse\s*Ⓢ/gi, 'vitesse mijotage').replace(/Ⓢ/g, 'mijotage')}`);
    }
  }
  if (r.notes) lines.push('', `💡 ${r.notes}`);
  lines.push('', `Source : ${sourceType(r.source?.type).label} — ${sourceLabel(r.source)}`);
  if (r.source?.url) lines.push(r.source.url);
  return lines.join('\n');
}

async function share(r, factor) {
  const text = recipeShareText(r, factor);
  try {
    if (navigator.share) {
      await navigator.share({ title: r.title, text });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Recette copiée : colle-la dans un message.');
  } catch {
    sheet(h('textarea', { class: 'input share-text', readonly: true, rows: 14 }, text), { title: 'Texte à copier' });
  }
}

async function toggleWakeLock(btn) {
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    } else if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        btn.classList.remove('on');
      });
    } else {
      toast('Cette option n’est pas disponible sur ce téléphone.');
      return;
    }
    btn.classList.toggle('on', Boolean(wakeLock));
    toast(wakeLock ? 'L’écran restera allumé pendant la recette.' : 'Mise en veille normale.');
  } catch (e) {
    toast(`Impossible : ${e.message}`);
  }
}

export function recipeView({ id }) {
  const r = store.recipe(id);
  if (!r) {
    return h('div', { class: 'page' }, header('Recette', { back: '#/' }),
      store.loaded ? emptyState('🤷', 'Recette introuvable', 'Elle a peut-être été supprimée.') : h('div', { class: 'spinner' }));
  }
  const factor = factors.get(id) || 1;
  const setFactor = (f) => {
    if (Math.abs(f - 1) < 1e-9) factors.delete(id);
    else factors.set(id, f);
    render();
  };
  const done = doneSteps.get(id) || new Set();
  doneSteps.set(id, done);

  const cached = photoCache.get(id);
  const photo = h('div', { class: 'recipe-photo' },
    cached ? h('img', { src: cached, alt: r.title }) : r.thumb ? h('img', { src: r.thumb, alt: '', class: 'blur' }) : null);
  if (!cached && !r.thumb) photo.classList.add('hidden');
  if (!cached && r.thumb !== null) {
    store.getPhoto(id).then((data) => {
      if (!data) return;
      photoCache.set(id, data);
      photo.classList.remove('hidden');
      setChildren(photo, h('img', { src: data, alt: r.title }));
    }).catch(() => {});
  }

  const body = h('div', { class: 'stack' });
  const wakeBtn = h('button', { class: `icon-btn ${wakeLock ? 'on' : ''}`, 'aria-label': 'Garder l’écran allumé', title: 'Garder l’écran allumé', onclick: () => toggleWakeLock(wakeBtn) }, icon('sun'));

  function servingsBlock() {
    const f = factors.get(id) || 1;
    if (r.servings) {
      const current = r.servings * f;
      return h('div', { class: 'servings card' },
        h('button', { class: 'step-btn', 'aria-label': 'Une portion de moins', disabled: current <= 1, onclick: () => setFactor(factorForServings(r.servings, Math.max(1, Math.ceil(current) - 1))) }, icon('minus', 20)),
        h('div', { class: 'servings-value' },
          h('strong', null, formatServings(r.servings, f)),
          h('span', null, r.servingsLabel || (current > 1 ? 'personnes' : 'personne'))),
        h('button', { class: 'step-btn', 'aria-label': 'Une portion de plus', onclick: () => setFactor(factorForServings(r.servings, Math.floor(current) + 1)) }, icon('plus', 20)),
        f !== 1 && h('button', { class: 'icon-btn', 'aria-label': 'Revenir aux quantités d’origine', onclick: () => setFactor(1) }, icon('reset', 20)));
    }
    return h('div', { class: 'servings card' },
      h('button', { class: 'step-btn', 'aria-label': 'Diviser', disabled: f <= 0.5, onclick: () => setFactor(Math.max(0.5, f - 0.5)) }, icon('minus', 20)),
      h('div', { class: 'servings-value' },
        h('strong', null, `× ${String(Math.round(f * 100) / 100).replace('.', ',')}`),
        h('span', null, 'quantités')),
      h('button', { class: 'step-btn', 'aria-label': 'Multiplier', onclick: () => setFactor(f + 0.5) }, icon('plus', 20)),
      h('button', {
        class: 'btn small ghost', onclick: async () => {
          const n = await promptDecimal({ title: 'Pour combien de personnes est cette recette ?', hint: 'Le nombre de portions de la recette d’origine.', suffix: 'pers.' });
          if (n) {
            await store.saveRecipe(id, { ...r, servings: Math.round(n) });
            toast('Portions enregistrées.');
          }
        },
      }, 'Préciser les portions'),
      f !== 1 && h('button', { class: 'icon-btn', 'aria-label': 'Revenir aux quantités d’origine', onclick: () => setFactor(1) }, icon('reset', 20)));
  }

  function ingredientsBlock() {
    const f = factors.get(id) || 1;
    const items = [];
    let group = null;
    for (const raw of r.ingredients || []) {
      // « &frac12; c. à café de sel » enregistré tel quel par un ancien import : relu.
      const ing = !raw.qty && /&(frac\d+|amp|nbsp);/.test(raw.name || '') ? { ...parseIngredientLine(raw.name), ...(raw.group ? { group: raw.group } : {}) } : raw;
      if ((ing.group || null) !== group) {
        group = ing.group || null;
        if (group) items.push(h('li', { class: 'ing-group' }, group));
      }
      const q = formatQuantity(ing, f);
      items.push(h('li', { class: `ing ${ing.optional ? 'optional' : ''}` },
        q
          ? h('button', {
            class: 'ing-qty', 'aria-label': `Changer la quantité : ${q} ${ing.name}`,
            onclick: async () => {
              const v = await promptDecimal({
                title: `Quantité de ${ing.name}`,
                value: Math.round(ing.qty * f * 100) / 100,
                suffix: unitLabel(ing.unit, 2) || '',
                hint: 'Toute la recette (et le nombre de portions) s’ajuste en proportion.',
                ok: 'Ajuster la recette',
              });
              if (v) setFactor(factorForIngredient(ing, v));
            },
          }, q)
          : h('span', { class: 'ing-qty empty' }, ''),
        h('span', { class: 'ing-name' }, ing.name, ing.note && h('small', null, ` (${ing.note})`))));
    }
    return h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', null, 'Ingrédients'),
        h('span', { class: 'small muted' }, 'Touchez une quantité pour l’ajuster')),
      items.length ? h('ul', { class: 'ing-list' }, items) : h('p', { class: 'muted' }, 'Aucun ingrédient.'));
  }

  function stepsBlock() {
    if (!r.steps?.length) return null;
    let n = 0;
    const items = r.steps.map((s, i) => {
      if (s.section) return h('li', { class: 'step-section' }, s.section);
      n += 1;
      const li = h('li', {
        class: `step ${done.has(i) ? 'done' : ''}`,
        onclick: () => {
          if (done.has(i)) done.delete(i);
          else done.add(i);
          li.classList.toggle('done');
        },
      }, h('span', { class: 'step-num' }, String(n)), h('p', null, stepText(s.text)));
      return li;
    });
    return h('section', { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', null, 'Préparation'), h('span', { class: 'small muted' }, 'Touchez une étape une fois faite')),
      h('ol', { class: 'steps' }, items));
  }

  function sourceBlock() {
    const src = r.source || {};
    const t = sourceType(src.type);
    const link = openLabel(src);
    return h('section', { class: 'card source-card' },
      h('div', { class: 'row gap' },
        h('span', { class: 'source-emoji' }, sourceIcon(src.type)),
        h('div', { class: 'grow' },
          h('div', { class: 'small muted' }, `Source : ${t.label}`),
          h('strong', null, sourceLabel(src)))),
      link && h('a', { class: `btn ${src.type === 'cookidoo' || src.type === 'chronodrive' ? 'primary' : 'ghost'}`, href: src.url, target: '_blank', rel: 'noopener' }, icon('external', 18), link),
      r.origin?.title && h('p', { class: 'small muted' }, `Importée de « ${r.origin.title} »${r.origin.page ? `, page ${r.origin.page}` : ''}.`));
  }

  function render() {
    const f = factors.get(id) || 1;
    const c = category(r.category);
    const times = [
      r.prepMin && ['Préparation', r.prepMin], r.cookMin && ['Cuisson', r.cookMin], r.restMin && ['Repos', r.restMin],
    ].filter(Boolean);
    const total = totalMinutes(r);
    setChildren(body,
      h('div', { class: 'recipe-head' },
        h('h1', { class: 'recipe-title' }, r.title),
        h('div', { class: 'row gap wrap' },
          h('button', { class: `chip-select ${c ? 'on' : ''}`, onclick: () => chooseCategory(r) }, c ? `${c.emoji} ${c.label}` : '+ Catégorie'),
          r.source?.type && r.source.type !== 'autre' && h('span', { class: 'src-chip' }, sourceTag(r.source.type)),
          starInput(r)),
        times.length > 0 && h('div', { class: 'times' },
          times.map(([l, m]) => h('span', null, h('small', null, l), formatMinutes(m))),
          times.length > 1 && h('span', null, h('small', null, 'Total'), formatMinutes(total))),
        r.tags?.length > 0 && h('div', { class: 'chips' }, r.tags.map((t) => h('span', { class: 'tag' }, `#${t}`)))),
      servingsBlock(),
      ingredientsBlock(),
      stepsBlock(),
      r.notes && h('section', { class: 'card notes' }, h('h2', null, 'Notes'), h('p', { class: 'pre' }, r.notes)),
      sourceBlock(),
      h('button', { class: 'btn primary', onclick: () => planSheet(r) }, icon('calendar', 20), 'Planifier un repas'),
      bookmarkButton(r, { labels: { off: 'Ajouter à mes envies', on: 'Dans mes envies' } }),
      h('div', { class: 'row gap wrap' },
        h('button', { class: 'btn ghost grow', onclick: () => share(r, f) }, icon('share', 20), 'Partager'),
        h('a', { class: 'btn ghost grow', href: `#/recette/${id}/modifier` }, icon('edit', 20), 'Modifier')),
      h('button', {
        class: 'btn danger-ghost', onclick: async () => {
          if (!(await confirmDialog(`Mettre « ${r.title} » à la corbeille ?`, { ok: 'Mettre à la corbeille', danger: true }))) return;
          await store.trash(id);
          toast('Recette mise à la corbeille.', { action: 'Annuler', onAction: () => store.restore(id) });
          navigate('/', { replace: true });
        },
      }, icon('trash', 18), 'Mettre à la corbeille'));
  }
  render();

  return h('div', { class: 'page recipe-page' },
    header('', {
      back: '#/',
      actions: [wakeBtn, h('a', { class: 'icon-btn', href: `#/recette/${id}/modifier`, 'aria-label': 'Modifier' }, icon('edit'))],
    }),
    photo,
    body);
}

