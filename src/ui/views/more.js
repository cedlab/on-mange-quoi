// Onglet « Plus » : compte, membres, import/sauvegarde, corbeille, réglages.
import { navigate, store } from '../../app.js';
import { OWNER_EMAIL } from '../../firebase.js';
import { buildExport } from '../../logic/exchange.js';
import { CATEGORIES } from '../../logic/recipes.js';
import { checkForUpdate, isIOS, isStandalone } from '../../pwa.js';
import { applyTheme, getTheme } from '../../theme.js';
import { confirmDialog, emptyState, header, promptText, segmented, sheet, toast } from '../components.js';
import { formatDate, h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { recipeThumb } from './recipes.js';

function item(href, ic, label, sub, onclick) {
  const content = [h('span', { class: 'menu-icon' }, icon(ic, 22)), h('span', { class: 'grow' }, label, sub && h('small', null, sub)), icon('back', 18)];
  return onclick
    ? h('button', { class: 'menu-item', onclick }, content)
    : h('a', { class: 'menu-item', href }, content);
}

async function exportBackup(btn) {
  btn.disabled = true;
  const old = btn.textContent;
  try {
    const recipes = store.activeRecipes;
    const photos = new Map();
    let i = 0;
    for (const r of recipes) {
      btn.textContent = `Préparation… ${++i}/${recipes.length}`;
      if (r.thumb) {
        const p = await store.getPhoto(r.id).catch(() => null);
        if (p) photos.set(r.id, p);
      }
    }
    const blob = new Blob([JSON.stringify(buildExport(recipes, photos))], { type: 'application/json' });
    const name = `on-mange-quoi-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name }).catch(() => {});
    } else {
      const a = h('a', { href: URL.createObjectURL(blob), download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
  } catch (e) {
    toast(`Sauvegarde impossible : ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function installHelp() {
  sheet(h('div', { class: 'stack' },
    isIOS()
      ? h('ol', { class: 'help-list' },
        h('li', null, 'Ouvre cette page dans ', h('strong', null, 'Safari'), '.'),
        h('li', null, 'Touche ', h('strong', null, 'Partager'), ' (le carré avec une flèche).'),
        h('li', null, 'Choisis ', h('strong', null, '« Sur l’écran d’accueil »'), ', puis ', h('strong', null, 'Ajouter'), '.'))
      : h('ol', { class: 'help-list' },
        h('li', null, 'Ouvre cette page dans ', h('strong', null, 'Chrome'), '.'),
        h('li', null, 'Menu ', h('strong', null, '⋮'), ' → ', h('strong', null, 'Installer l’application'), ' (ou « Ajouter à l’écran d’accueil »).')),
    h('p', { class: 'small muted' }, 'Une fois installée, l’app s’ouvre en plein écran et fonctionne même sans réseau.')),
  { title: 'Installer sur l’écran d’accueil' });
}

export function moreView() {
  const u = store.user;
  const backupBtn = h('button', { class: 'menu-item', onclick: () => exportBackup(backupBtn) },
    h('span', { class: 'menu-icon' }, icon('download', 22)),
    h('span', { class: 'grow' }, 'Sauvegarder les recettes', h('small', null, 'Fichier JSON avec les photos, à garder sur ton ordinateur')),
    icon('back', 18));
  const trashCount = store.trashedRecipes.length;
  const uncategorized = store.activeRecipes.filter((r) => !r.category).length;
  return h('div', { class: 'page' },
    header('Plus'),
    h('div', { class: 'card account' },
      u.photo ? h('img', { class: 'account-photo', src: u.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'account-photo' }, '🙂'),
      h('div', { class: 'grow' }, h('strong', null, u.name || u.email), h('small', { class: 'muted' }, u.email)),
      h('button', {
        class: 'icon-btn', 'aria-label': 'Se déconnecter', onclick: async () => {
          if (await confirmDialog('Se déconnecter de ce téléphone ?', { ok: 'Se déconnecter' })) store.signOut();
        },
      }, icon('logout'))),
    h('div', { class: 'menu' },
      item('#/membres', 'users', 'Membres de la famille', 'Qui peut utiliser l’app'),
      item('#/recette/coller', 'edit', 'Coller une recette', 'Depuis tes notes, un message, une page web'),
      item('#/importer', 'upload', 'Importer des recettes', 'Fichier JSON'),
      backupBtn,
      item('#/classer', 'layers', 'Classer les recettes', uncategorized ? `${plural(uncategorized, 'recette', 'recettes')} sans catégorie` : 'Toutes ont une catégorie'),
      item('#/corbeille', 'trash', 'Corbeille', trashCount ? plural(trashCount, 'recette', 'recettes') : 'Vide')),
    h('div', { class: 'card stack' },
      h('h2', null, 'Apparence'),
      segmented([{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }], getTheme(), applyTheme)),
    h('div', { class: 'menu' },
      !isStandalone() && item(null, 'download', 'Installer sur l’écran d’accueil', null, installHelp),
      item(null, 'reset', 'Rechercher une mise à jour', `Version ${__APP_VERSION__}`, async () => {
        const found = await checkForUpdate().catch(() => false);
        if (!found) toast('L’app est à jour.');
      })));
}

export function membersView() {
  const list = h('div', { class: 'stack' });
  let members = [];
  async function load() {
    setChildren(list, h('div', { class: 'spinner' }));
    try {
      members = (await store.getMembers()) || [];
      draw();
    } catch (e) {
      setChildren(list, h('p', { class: 'muted' }, `Impossible de lire la liste : ${e.message}`));
    }
  }
  async function save(next) {
    try {
      await store.setMembers(next);
      members = next;
      draw();
    } catch (e) {
      toast(`Non enregistré : ${e.message}`);
    }
  }
  function draw() {
    const all = [...new Set([OWNER_EMAIL, ...members])];
    setChildren(list,
      h('div', { class: 'menu' }, all.map((m) => h('div', { class: 'menu-item' },
        h('span', { class: 'menu-icon' }, '👤'),
        h('span', { class: 'grow' }, m, m === store.user.email && h('small', null, 'C’est toi'), m === OWNER_EMAIL && h('small', null, 'Toujours autorisé')),
        m !== OWNER_EMAIL && h('button', {
          class: 'icon-btn', 'aria-label': `Retirer ${m}`, onclick: async () => {
            if (await confirmDialog(`Retirer ${m} ? Cette personne n’aura plus accès aux recettes ni aux menus.`, { ok: 'Retirer', danger: true })) {
              await save(members.filter((x) => x !== m));
            }
          },
        }, icon('trash', 20))))),
      h('button', {
        class: 'btn primary', onclick: async () => {
          const email = await promptText({
            title: 'Ajouter un membre', type: 'email', placeholder: 'prenom.nom@gmail.com', ok: 'Ajouter',
            hint: 'L’adresse du compte Google avec lequel la personne se connectera.',
          });
          if (!email) return;
          const e = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
            toast('Adresse invalide.');
            return;
          }
          if (all.includes(e)) {
            toast('Déjà dans la liste.');
            return;
          }
          await save([...members.filter((x) => x !== OWNER_EMAIL), OWNER_EMAIL, e].filter((x, i, a) => a.indexOf(x) === i));
          toast(`${e} peut maintenant se connecter.`);
        },
      }, icon('plus', 20), 'Ajouter un membre'),
      h('p', { class: 'small muted' }, 'Tous les membres ont les mêmes droits : voir et modifier les recettes, les menus, les courses, et gérer cette liste.'));
  }
  load();
  return h('div', { class: 'page' }, header('Membres de la famille', { back: '#/plus' }), list);
}

export function trashView() {
  const items = store.trashedRecipes.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const content = !items.length
    ? emptyState('🗑️', 'La corbeille est vide', 'Les recettes supprimées arrivent ici et peuvent être restaurées.')
    : h('div', { class: 'stack' },
      h('div', { class: 'menu' }, items.map((r) => h('div', { class: 'menu-item' },
        recipeThumb(r, 44),
        h('span', { class: 'grow' }, r.title, h('small', null, r.deletedAt ? `Supprimée le ${formatDate(r.deletedAt)}` : '')),
        h('button', { class: 'btn small ghost', onclick: async () => { await store.restore(r.id); toast('Recette restaurée.'); } }, 'Restaurer'),
        h('button', {
          class: 'icon-btn', 'aria-label': 'Supprimer définitivement', onclick: async () => {
            if (await confirmDialog(`Supprimer définitivement « ${r.title} » ?`, { ok: 'Supprimer', danger: true })) await store.purge(r.id);
          },
        }, icon('trash', 20))))),
      h('button', {
        class: 'btn danger-ghost', onclick: async () => {
          if (!(await confirmDialog(`Supprimer définitivement ${plural(items.length, 'recette', 'recettes')} ?`, { ok: 'Vider la corbeille', danger: true }))) return;
          for (const r of items) await store.purge(r.id);
          toast('Corbeille vidée.');
        },
      }, 'Vider la corbeille'));
  return h('div', { class: 'page' }, header('Corbeille', { back: '#/plus' }), content);
}

/** Classement rapide : une recette sans catégorie à la fois. */
export function sortView() {
  const skipped = new Set();
  const body = h('div', { class: 'stack' });
  const unsub = store.subscribe((k) => k === 'recipes' && draw());
  function draw() {
    const todo = store.activeRecipes.filter((r) => !r.category && !skipped.has(r.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    const left = store.activeRecipes.filter((r) => !r.category).length;
    if (!todo.length) {
      setChildren(body, emptyState('✅', left ? 'Fini pour cette fois' : 'Toutes les recettes sont classées',
        left ? `${plural(left, 'recette passée', 'recettes passées')} sans catégorie.` : null,
        h('a', { class: 'btn primary', href: '#/' }, 'Voir les recettes')));
      return;
    }
    const r = todo[0];
    const ings = (r.ingredients || []).slice(0, 8).map((i) => i.name).join(', ');
    setChildren(body,
      h('p', { class: 'small muted center-text' }, `Encore ${plural(left, 'recette', 'recettes')} à classer`),
      h('div', { class: 'card sort-card' },
        recipeThumb(r, 96),
        h('h2', null, r.title),
        ings && h('p', { class: 'small muted' }, ings)),
      h('div', { class: 'cat-grid' }, CATEGORIES.map((c) => h('button', {
        class: 'cat-card', onclick: async () => {
          try {
            await store.setCategory(r.id, c.id);
          } catch (e) {
            toast(e.message);
          }
        },
      }, h('span', { class: 'cat-emoji' }, c.emoji), c.label))),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => { skipped.add(r.id); draw(); } }, 'Passer'),
        h('button', { class: 'btn ghost grow', onclick: () => navigate(`/recette/${r.id}`) }, 'Voir la recette')));
  }
  draw();
  return { el: h('div', { class: 'page' }, header('Classer les recettes', { back: '#/plus' }), body), cleanup: unsub };
}

export function comingSoonView(title, emoji, text, step) {
  return () => h('div', { class: 'page' }, header(title),
    emptyState(emoji, `${title} : bientôt`, text, h('p', { class: 'small muted' }, `Arrive à l’étape ${step}.`)));
}

