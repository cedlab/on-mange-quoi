// Création / modification d'une recette.
import { back, navigate, store } from '../../app.js';
import { ingredientsToText, parseIngredientsText, parseStepsText, stepsToText } from '../../logic/quantities.js';
import { CATEGORIES } from '../../logic/recipes.js';
import { detectSourceType, SOURCE_TYPES } from '../../logic/sources.js';
import { emptyState, header, toast } from '../components.js';
import { h, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { processPhoto } from '../image.js';
import { photoCache } from './recipe.js';

const TITLE_LABEL = {
  livre: ['Titre du livre', 'Le Larousse de la cuisine'],
  pdf: ['Nom du PDF', 'Mes recettes de Noël'],
  web: ['Nom du site', 'Marmiton'],
  cookidoo: ['Nom (facultatif)', 'Cookidoo'],
  chronodrive: ['Nom (facultatif)', 'Chronodrive'],
  magazine: ['Nom du magazine', 'Maxi Cuisine'],
  perso: ['De qui vient la recette ?', 'Mamie, Nadine, moi…'],
  autre: ['Précise la source', 'Restaurant, émission de télé…'],
};
const WITH_URL = new Set(['web', 'cookidoo', 'chronodrive']);
const WITH_PAGE = new Set(['livre', 'pdf', 'magazine']);

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint && h('small', { class: 'muted' }, hint));
}

/** Brouillon venu de « Coller une recette », repris par le formulaire. */
let pendingDraft = null;
export function setDraft(draft) {
  pendingDraft = draft;
}

export function recipeFormView({ id } = {}, query = {}) {
  const existing = id ? store.recipe(id) : null;
  if (id && !existing) {
    return h('div', { class: 'page' }, header('Modifier', { back: '#/' }),
      store.loaded ? emptyState('🤷', 'Recette introuvable') : h('div', { class: 'spinner' }));
  }
  const blank = { source: { type: 'perso', title: '' }, ingredients: [], steps: [], tags: [], rating: 0 };
  const fromDraft = !id && query.brouillon && pendingDraft;
  const r = existing ? structuredClone(existing) : fromDraft ? { ...blank, ...structuredClone(pendingDraft) } : blank;
  // undefined : inchangée ; null : retirée ; { photo, thumb } : nouvelle (ou venue d'un import par lien)
  let photo = fromDraft && pendingDraft._photo ? pendingDraft._photo : undefined;
  let category = r.category || null;
  const src = { ...r.source };

  // --- Photo
  const photoBox = h('div', { class: 'photo-edit' });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*', class: 'hidden',
    onchange: async () => {
      const f = fileInput.files?.[0];
      fileInput.value = '';
      if (!f) return;
      try {
        photo = await processPhoto(f);
        drawPhoto();
      } catch (e) {
        toast(e.message);
      }
    },
  });
  function drawPhoto() {
    const current = photo === undefined ? (photoCache.get(id) || r.thumb) : photo?.photo;
    setChildren(photoBox,
      current ? h('img', { src: current, alt: '' }) : h('div', { class: 'photo-placeholder' }, icon('camera', 32)),
      h('div', { class: 'row gap' },
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => fileInput.click() }, icon('camera', 18), current ? 'Changer la photo' : 'Ajouter une photo'),
        current && h('button', { type: 'button', class: 'btn small danger-ghost', onclick: () => { photo = null; drawPhoto(); } }, 'Retirer')),
      fileInput);
  }
  drawPhoto();

  // --- Champs simples
  const title = h('input', { class: 'input big', value: r.title || '', placeholder: 'Gratin dauphinois', required: true, autocomplete: 'off' });
  const num = (v, ph) => h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: '0', value: v || '', placeholder: ph });
  const servings = num(r.servings, '4');
  const servingsLabel = h('input', { class: 'input', value: r.servingsLabel || '', placeholder: 'personnes' });
  const prep = num(r.prepMin, '15');
  const cook = num(r.cookMin, '30');
  const rest = num(r.restMin, '0');
  const ingredients = h('textarea', {
    class: 'input', rows: 9, placeholder: '200 g de farine\n3 œufs\n50 cl de lait\n\nPour la sauce :\n2 c. à s. de crème',
  }, ingredientsToText(r.ingredients));
  ingredients.value = ingredientsToText(r.ingredients);
  const steps = h('textarea', { class: 'input', rows: 9, placeholder: 'Préchauffer le four à 180 °C.\nMélanger la farine et les œufs.\n# Pour la sauce\nFaire chauffer la crème.' });
  steps.value = stepsToText(r.steps);
  const notes = h('textarea', { class: 'input', rows: 3, placeholder: 'Astuces, variantes, accord…' });
  notes.value = r.notes || '';
  const tags = h('input', { class: 'input', value: (r.tags || []).join(', '), placeholder: 'rapide, végétarien, Noël…', autocomplete: 'off' });

  // --- Catégorie
  const catBox = h('div', { class: 'chips' });
  function drawCats() {
    setChildren(catBox, CATEGORIES.map((c) => h('button', {
      type: 'button', class: `chip-select ${category === c.id ? 'on' : ''}`,
      onclick: () => { category = category === c.id ? null : c.id; drawCats(); },
    }, `${c.emoji} ${c.label}`)));
  }
  drawCats();

  // --- Source
  const srcBox = h('div', { class: 'stack tight' });
  const srcUrl = h('input', { class: 'input', type: 'url', inputmode: 'url', value: src.url || '', placeholder: 'https://…', autocomplete: 'off' });
  const srcTitle = h('input', { class: 'input', value: src.title || '', autocomplete: 'off' });
  const srcPage = h('input', { class: 'input num', type: 'number', inputmode: 'numeric', min: '1', value: src.page || '', placeholder: '42' });
  const srcAuthor = h('input', { class: 'input', value: src.author || '', placeholder: 'Facultatif', autocomplete: 'off' });
  srcUrl.addEventListener('input', () => {
    const t = detectSourceType(srcUrl.value);
    if (t && t !== src.type && (WITH_URL.has(src.type) || t !== 'web')) {
      src.type = t;
      drawSource();
    }
  });
  function drawSource() {
    const [label, ph] = TITLE_LABEL[src.type] || TITLE_LABEL.autre;
    srcTitle.placeholder = ph;
    setChildren(srcBox,
      h('div', { class: 'source-types' }, SOURCE_TYPES.map((t) => h('button', {
        type: 'button', class: `source-type ${src.type === t.id ? 'on' : ''}`,
        onclick: () => { src.type = t.id; drawSource(); },
      }, h('span', null, t.emoji), t.label))),
      WITH_URL.has(src.type) && field('Lien de la recette', srcUrl,
        src.type === 'cookidoo' ? 'Sur le téléphone, ce lien ouvrira directement l’app Cookidoo.' : null),
      field(label, srcTitle),
      WITH_PAGE.has(src.type) && field('Page', srcPage),
      src.type === 'livre' && field('Auteur', srcAuthor),
      !WITH_URL.has(src.type) && field('Lien (facultatif)', srcUrl));
  }
  drawSource();

  const saveBtn = h('button', { class: 'btn primary big grow', type: 'submit' }, icon('check', 20), 'Enregistrer');

  async function submit(e) {
    e.preventDefault();
    const data = {
      ...r,
      title: title.value,
      category,
      servings: servings.value,
      servingsLabel: servingsLabel.value,
      prepMin: prep.value,
      cookMin: cook.value,
      restMin: rest.value,
      ingredients: parseIngredientsText(ingredients.value),
      steps: parseStepsText(steps.value),
      notes: notes.value,
      tags: tags.value.split(/[,;#]/),
      source: {
        type: src.type, title: srcTitle.value, url: srcUrl.value,
        page: WITH_PAGE.has(src.type) ? srcPage.value : '', author: src.type === 'livre' ? srcAuthor.value : '',
      },
    };
    saveBtn.disabled = true;
    try {
      const newId = await store.saveRecipe(id || null, data, photo);
      if (photo) photoCache.set(newId, photo.photo);
      else if (photo === null) photoCache.delete(newId);
      toast(id ? 'Recette enregistrée.' : 'Recette ajoutée.');
      if (fromDraft) pendingDraft = null;
      if (id) back(`/recette/${id}`);
      else navigate(`/recette/${newId}`, { replace: true });
    } catch (err) {
      toast(err.message, { duration: 5000 });
      saveBtn.disabled = false;
    }
  }

  return h('div', { class: 'page' },
    header(id ? 'Modifier la recette' : 'Nouvelle recette', { back: id ? `#/recette/${id}` : '#/' }),
    h('form', { class: 'stack form', onsubmit: submit },
      fromDraft && h('div', { class: 'card notice' },
        h('strong', null, r.source?.url && !r.fromText ? `✨ Recette importée de ${r.source.title || 'la page'}` : '✨ Recette détectée'),
        r.fromText && h('p', { class: 'small' }, 'Le site ne fournit pas la recette sous forme structurée : elle a été reconstituée à partir du texte de la page, vérifie-la bien.'),
        h('p', { class: 'small' }, `${r.ingredients.length} ingrédient${r.ingredients.length > 1 ? 's' : ''} et ${r.steps.filter((x) => x.text).length} étape${r.steps.length > 1 ? 's' : ''} reconnus. Vérifie, complète (source, catégorie, photo…) puis enregistre.`)),
      photoBox,
      field('Titre *', title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Catégorie'), catBox),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Source * (d’où vient la recette ?)'), srcBox),
      h('div', { class: 'grid-2' }, field('Portions', servings), field('Unité', servingsLabel, 'personnes, parts, pièces…')),
      h('div', { class: 'grid-3' }, field('Préparation (min)', prep), field('Cuisson (min)', cook), field('Repos (min)', rest)),
      field('Ingrédients', ingredients, 'Un par ligne, avec la quantité : « 200 g de farine ». Une ligne finissant par « : » crée un groupe (« Pour la sauce : »).'),
      field('Étapes', steps, 'Une étape par ligne. « # Titre » pour une partie (« # La pâte »).'),
      field('Notes', notes),
      field('Tags', tags, 'Séparés par des virgules.'),
      h('div', { class: 'sticky-actions' }, saveBtn)));
}
