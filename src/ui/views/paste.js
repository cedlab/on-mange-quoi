// « Coller une recette » : texte libre → formulaire pré-rempli à vérifier.
import { navigate } from '../../app.js';
import { parseRecipeText } from '../../logic/text-import.js';
import { header, sheet, toast } from '../components.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { setDraft } from './recipe-form.js';

const KEY = 'omq.pasteDraft';

function saved() {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function pasteView() {
  const area = h('textarea', {
    class: 'input paste-area', rows: 14,
    placeholder: 'Colle ici le texte de la recette (notes, message, page web…)\n\nGâteau au yaourt\nPour 6 personnes\n\n1 pot de yaourt\n3 œufs\n…\n\nMélanger le yaourt et le sucre…',
  });
  area.value = saved();
  area.addEventListener('input', () => {
    try {
      sessionStorage.setItem(KEY, area.value);
    } catch {
      /* ignoré */
    }
  });

  const analyse = () => {
    const text = area.value.trim();
    if (!text) {
      toast('Colle d’abord le texte de la recette.');
      return;
    }
    // Juste un lien : import par lien.
    if (/^https?:\/\/\S+$/i.test(text)) {
      navigate(`/recette/lien?url=${encodeURIComponent(text)}`);
      return;
    }
    const draft = parseRecipeText(text);
    if (!draft.source) draft.source = { type: 'perso', title: 'Moi' };
    setDraft(draft);
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignoré */
    }
    navigate('/recette/nouvelle?brouillon=1');
  };

  const pasteBtn = navigator.clipboard?.readText && h('button', {
    class: 'btn ghost', type: 'button', onclick: async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (t) {
          area.value = t;
          area.dispatchEvent(new Event('input'));
        } else toast('Le presse-papiers est vide.');
      } catch {
        toast('Appuie longuement dans la zone de texte puis « Coller ».');
        area.focus();
      }
    },
  }, icon('download', 18), 'Coller');

  return h('div', { class: 'page' },
    header('Coller une recette', { back: '#/' }),
    h('div', { class: 'stack' },
      h('p', { class: 'small muted' },
        'Copie une recette depuis tes notes, un message ou une page web, colle-la ici : le titre, les portions, les temps, les ingrédients et les étapes sont reconnus. Tu vérifies ensuite avant d’enregistrer.'),
      h('div', { class: 'card stack' },
        area,
        h('div', { class: 'row gap' },
          pasteBtn && h('div', { class: 'grow row' }, pasteBtn),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { area.value = ''; area.dispatchEvent(new Event('input')); area.focus(); } }, 'Effacer')),
        h('button', { class: 'btn primary big', type: 'button', onclick: analyse }, '✨ Créer la recette')),
      h('details', { class: 'card' },
        h('summary', null, 'Conseils pour un meilleur résultat'),
        h('ul', { class: 'small help-list' },
          h('li', null, 'Le titre sur la première ligne.'),
          h('li', null, 'Un ingrédient par ligne, la quantité en premier : « 200 g de farine ».'),
          h('li', null, 'Les parties « Ingrédients » et « Préparation » aident, mais ne sont pas obligatoires.'),
          h('li', null, 'Une ligne « Source : Nadine » ou un lien internet remplit la source.')))));
}

/** Choix proposés par le bouton « + » des recettes. */
export function newRecipeMenu() {
  const s = sheet(h('div', { class: 'menu flat' },
    h('button', { class: 'menu-item', onclick: () => { s.close(); navigate('/recette/lien'); } },
      h('span', { class: 'menu-icon' }, icon('link', 20)),
      h('span', { class: 'grow' }, 'Importer depuis un lien', h('small', null, 'Chronodrive, Marmiton, 750g…'))),
    h('button', { class: 'menu-item', onclick: () => { s.close(); navigate('/recette/coller'); } },
      h('span', { class: 'menu-icon' }, '✨'),
      h('span', { class: 'grow' }, 'Coller un texte', h('small', null, 'Depuis tes notes, un message, une page web'))),
    h('button', { class: 'menu-item', onclick: () => { s.close(); navigate('/recette/nouvelle'); } },
      h('span', { class: 'menu-icon' }, icon('edit', 20)),
      h('span', { class: 'grow' }, 'Saisir à la main', h('small', null, 'Formulaire vide'))),
    h('button', { class: 'menu-item', onclick: () => { s.close(); navigate('/importer'); } },
      h('span', { class: 'menu-icon' }, icon('upload', 20)),
      h('span', { class: 'grow' }, 'Importer un fichier', h('small', null, 'Fichier JSON (sauvegarde, PDF converti…)')))),
  { title: 'Ajouter une recette' });
}
