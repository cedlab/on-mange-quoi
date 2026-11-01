// Import d'un fichier de recettes JSON (format on-mange-quoi/recettes).
import { store } from '../../app.js';
import { parseImport } from '../../logic/exchange.js';
import { header, toast } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { thumbFromDataUrl } from '../image.js';
import { fetchPhotoViaRelay } from './link-import.js';

export function importView() {
  const body = h('div', { class: 'stack' });
  const input = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: () => read() });

  function start() {
    const area = h('textarea', { class: 'input', rows: 6, placeholder: 'Colle ici le texte JSON des recettes (par exemple celui préparé par Claude dans Chrome)…' });
    setChildren(body,
      h('div', { class: 'card stack' },
        h('p', null, 'Choisis un fichier de recettes ', h('strong', null, '.json'), ' (par exemple celui que Claude a préparé à partir de ton PDF).'),
        h('button', { class: 'btn primary big', onclick: () => input.click() }, icon('upload', 20), 'Choisir le fichier'),
        input),
      h('div', { class: 'card stack' },
        h('p', null, 'Ou colle le texte des recettes :'),
        area,
        h('button', {
          class: 'btn ghost', onclick: () => {
            if (!area.value.trim()) {
              toast('Colle d’abord le texte.');
              return;
            }
            try {
              preview('Texte collé', parseImport(area.value, store.recipes));
            } catch (e) {
              toast(e.message, { duration: 6000 });
            }
          },
        }, 'Lire le texte')),
      h('p', { class: 'small muted pad-x' }, 'Le fichier ou le texte reste sur ton appareil : seules les recettes sont envoyées dans la base privée de la famille. Les doublons (même titre et même source, ou même lien) sont repérés.'));
  }

  async function read() {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setChildren(body, h('div', { class: 'card stack center' }, h('div', { class: 'spinner' }), h('p', { class: 'muted' }, `Lecture de ${file.name}…`)));
    try {
      const text = await file.text();
      const result = parseImport(text, store.recipes);
      preview(file.name, result);
    } catch (e) {
      toast(e.message, { duration: 6000 });
      start();
    }
  }

  function preview(name, { items, errors }) {
    let skipDuplicates = true;
    const dups = items.filter((i) => i.duplicate).length;
    const photos = items.filter((i) => i.photo || i.imageUrl).length;
    const remote = items.filter((i) => !i.photo && i.imageUrl).length;
    const btn = h('button', { class: 'btn primary big' });
    const label = () => {
      const n = skipDuplicates ? items.length - dups : items.length;
      btn.textContent = `Importer ${plural(n, 'recette', 'recettes')}`;
      btn.disabled = n === 0;
    };
    label();
    btn.addEventListener('click', () => run(skipDuplicates ? items.filter((i) => !i.duplicate) : items));
    setChildren(body,
      h('div', { class: 'card stack' },
        h('h2', null, name),
        h('ul', { class: 'summary' },
          h('li', null, '📖 ', plural(items.length, 'recette lisible', 'recettes lisibles')),
          h('li', null, '📷 ', plural(photos, 'photo', 'photos'),
            remote > 0 && (store.settings.importProxy ? ' (téléchargées par le relais)' : ' — installe le relais (Plus → Import par lien) pour les récupérer')),
          dups > 0 && h('li', null, '♻️ ', plural(dups, 'doublon', 'doublons'), ' (déjà dans l’app ou en double dans le fichier)'),
          errors.length > 0 && h('li', null, '⚠️ ', plural(errors.length, 'recette ignorée', 'recettes ignorées'))),
        dups > 0 && h('label', { class: 'toggle' },
          h('input', { type: 'checkbox', checked: true, onchange: (e) => { skipDuplicates = e.target.checked; label(); } }),
          h('span', { class: 'toggle-ui' }),
          h('span', { class: 'toggle-text' }, 'Ne pas importer les doublons')),
        errors.length > 0 && h('details', null, h('summary', null, 'Voir les recettes ignorées'),
          h('ul', { class: 'small' }, errors.slice(0, 100).map((e) => h('li', null, e)))),
        h('details', null, h('summary', null, 'Aperçu des titres'),
          h('ul', { class: 'small' }, items.slice(0, 50).map((i) => h('li', null, i.recipe.title, i.duplicate ? ' ♻️' : '')),
            items.length > 50 && h('li', { class: 'muted' }, `… et ${items.length - 50} autres`))),
        btn,
        h('button', { class: 'btn ghost', onclick: start }, 'Choisir un autre fichier')));
  }

  async function run(list) {
    const bar = h('progress', { max: list.length * 2, value: 0 });
    const status = h('p', { class: 'muted' }, 'Préparation des photos…');
    setChildren(body, h('div', { class: 'card stack' }, h('h2', null, 'Import en cours'), bar, status,
      h('p', { class: 'small muted' }, 'Garde l’app ouverte jusqu’à la fin.')));
    try {
      let i = 0;
      for (const item of list) {
        if (!item.photo && item.imageUrl) {
          const p = await fetchPhotoViaRelay(item.imageUrl);
          if (p) {
            item.photo = p.photo;
            item.recipe = { ...item.recipe, thumb: p.thumb };
          }
        }
        if (item.photo && !item.recipe.thumb) {
          try {
            item.recipe = { ...item.recipe, thumb: await thumbFromDataUrl(item.photo) };
          } catch {
            item.photo = null;
          }
        }
        bar.value = ++i;
        if (i % 20 === 0) status.textContent = `Préparation des photos… ${i}/${list.length}`;
      }
      status.textContent = 'Envoi des recettes…';
      await store.importRecipes(list, (n) => {
        bar.value = list.length + n;
        status.textContent = `Envoi des recettes… ${n}/${list.length}`;
      });
      setChildren(body, h('div', { class: 'card stack center' },
        h('div', { class: 'empty-emoji' }, '🎉'),
        h('h2', null, `${plural(list.length, 'recette importée', 'recettes importées')} !`),
        h('a', { class: 'btn primary', href: '#/' }, 'Voir les recettes'),
        h('a', { class: 'btn ghost', href: '#/classer' }, 'Classer les recettes par catégorie')));
    } catch (e) {
      console.error(e);
      setChildren(body, h('div', { class: 'card stack' },
        h('h2', null, 'L’import s’est interrompu'),
        h('p', { class: 'muted' }, e.message),
        h('p', { class: 'small muted' }, 'Les recettes déjà envoyées sont conservées. Relance l’import avec le même fichier : les doublons seront ignorés.'),
        h('button', { class: 'btn primary', onclick: start }, 'Recommencer')));
    }
  }

  start();
  return h('div', { class: 'page' }, header('Importer des recettes', { back: '#/plus' }), body);
}
