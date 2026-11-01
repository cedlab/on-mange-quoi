// Onglet « Courses » : liste générée depuis le planning, rangée par rayon,
// cochable en temps réel sur tous les téléphones.
import { store } from '../../app.js';
import { aisle, AISLES, aisleOrder } from '../../logic/aisles.js';
import { addDays, formatShort, todayISO, weekStart } from '../../logic/dates.js';
import { formatAmounts, plannedDays, shoppingText } from '../../logic/plan.js';
import { openCalendar } from '../calendar.js';
import { confirmDialog, emptyState, header, sheet, toast } from '../components.js';
import { h, plural, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { makeShopping } from './week.js';

function itemMenu(item) {
  const s = sheet(h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, item.recipes?.length ? `Pour : ${item.recipes.join(', ')}` : 'Ajouté à la main'),
    h('p', { class: 'field-label' }, 'Rayon'),
    h('div', { class: 'aisle-grid' }, AISLES.map((a) => h('button', {
      class: `aisle-btn ${item.aisle === a.id ? 'on' : ''}`,
      onclick: async () => {
        s.close();
        await store.setItemAisle(item, a.id);
        toast(`« ${item.name} » sera rangé dans ${a.label}.`);
      },
    }, h('span', null, a.emoji), a.label))),
    h('button', { class: 'btn danger-ghost', onclick: async () => { s.close(); await store.deleteItem(item.id); } }, icon('trash', 18), 'Retirer de la liste')),
  { title: item.name });
}

function itemRow(item) {
  const q = formatAmounts(item.amounts);
  return h('div', { class: `shop-item ${item.checked ? 'checked' : ''}` },
    h('button', {
      class: 'shop-check', 'aria-pressed': String(Boolean(item.checked)), 'aria-label': `${item.checked ? 'Décocher' : 'Cocher'} ${item.name}`,
      onclick: () => store.toggleItem(item.id, !item.checked),
    }, h('span', { class: 'check-box' }, item.checked ? icon('check', 16) : null),
      h('span', { class: 'shop-text' },
        h('span', { class: 'shop-name' }, item.name),
        item.recipes?.length > 0 && !item.checked && h('small', null, item.recipes.join(', '))),
      q && h('span', { class: 'shop-qty' }, q)),
    h('button', { class: 'icon-btn small', 'aria-label': `Options pour ${item.name}`, onclick: () => itemMenu(item) }, icon('more', 18)));
}

export function shoppingView() {
  const body = h('div', { class: 'stack' });
  const input = h('input', { class: 'input', placeholder: 'Ajouter : « 6 œufs », « lessive »…', autocomplete: 'off', enterkeyhint: 'done' });
  const add = async (e) => {
    e?.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    try {
      await store.addItem(t);
    } catch (err) {
      toast(`Non ajouté : ${err.message}`);
    }
  };

  const choosePeriod = () => {
    const w = weekStart(todayISO());
    openCalendar({
      title: 'Courses pour quels jours ?', from: store.shoppingMeta?.from || w, to: store.shoppingMeta?.to || addDays(w, 6),
      planned: plannedDays(store.plans), hint: 'Touche le premier jour, puis le dernier.',
      actions: [{ label: '🛒 Créer la liste', primary: true, onPick: (a, b) => makeShopping(a, b) }],
    });
  };

  function draw() {
    if (!store.shoppingLoaded) {
      setChildren(body, h('div', { class: 'spinner' }));
      return;
    }
    const items = store.shopping.slice().sort((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.name.localeCompare(b.name, 'fr'));
    const meta = store.shoppingMeta;
    const w = weekStart(todayISO());
    if (!items.length) {
      setChildren(body,
        h('form', { class: 'add-item', onsubmit: add }, input, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Ajouter' }, icon('plus', 20))),
        emptyState('🛒', 'La liste est vide', 'Crée-la à partir des repas prévus dans la Semaine, ou ajoute des articles à la main.',
          h('button', { class: 'btn primary', onclick: () => makeShopping(w, addDays(w, 6)) }, 'Courses de cette semaine'),
          h('button', { class: 'btn ghost', onclick: choosePeriod }, icon('calendar', 18), 'Choisir les jours')));
      return;
    }
    const todo = items.filter((i) => !i.checked && !i.staple);
    const staples = items.filter((i) => !i.checked && i.staple);
    const done = items.filter((i) => i.checked);
    const groups = [];
    for (const i of todo) {
      if (groups[groups.length - 1]?.aisle !== i.aisle) groups.push({ aisle: i.aisle, items: [] });
      groups[groups.length - 1].items.push(i);
    }
    setChildren(body,
      meta?.from && h('div', { class: 'card shop-head' },
        h('div', { class: 'grow' },
          h('small', { class: 'muted' }, 'Repas prévus'),
          h('strong', null, meta.from === meta.to ? formatShort(meta.from) : `du ${formatShort(meta.from)} au ${formatShort(meta.to)}`)),
        h('button', { class: 'btn small ghost', onclick: () => makeShopping(meta.from, meta.to), title: 'Recalculer après un changement du planning' }, icon('reset', 16), 'Mettre à jour'),
        h('button', { class: 'icon-btn', 'aria-label': 'Changer de période', onclick: choosePeriod }, icon('calendar', 20))),
      h('div', { class: 'shop-progress' },
        h('progress', { max: items.length, value: done.length }),
        h('small', { class: 'muted' }, `${done.length} / ${items.length} dans le panier`)),
      h('form', { class: 'add-item', onsubmit: add }, input, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Ajouter' }, icon('plus', 20))),
      groups.map((g) => h('section', { class: 'shop-group' },
        h('h3', null, `${aisle(g.aisle).emoji} ${aisle(g.aisle).label}`),
        h('div', { class: 'shop-list' }, g.items.map(itemRow)))),
      staples.length > 0 && h('details', { class: 'shop-group staples' },
        h('summary', null, `🏠 Sûrement déjà à la maison (${staples.length})`),
        h('div', { class: 'shop-list' }, staples.map(itemRow))),
      done.length > 0 && h('section', { class: 'shop-group done' },
        h('h3', null, `✅ Dans le panier (${done.length})`),
        h('div', { class: 'shop-list' }, done.map(itemRow)),
        h('button', {
          class: 'btn ghost', onclick: async () => {
            if (await confirmDialog(`Retirer les ${plural(done.length, 'article coché', 'articles cochés')} de la liste ?`, { ok: 'Courses terminées' })) await store.clearChecked();
          },
        }, '🎉 Courses terminées : retirer les articles cochés')));
  }

  async function share() {
    const items = store.shopping.slice().sort((a, b) => aisleOrder(a.aisle) - aisleOrder(b.aisle) || a.name.localeCompare(b.name, 'fr'));
    const text = shoppingText(items, (id) => `${aisle(id).emoji} ${aisle(id).label}`);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Liste de courses', text });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Liste copiée.');
    } catch {
      sheet(h('textarea', { class: 'input share-text', readonly: true, rows: 14 }, text), { title: 'Texte à copier' });
    }
  }

  const unsub = store.subscribe((k) => (k === 'shopping') && draw());
  draw();
  return {
    el: h('div', { class: 'page' },
      header('Courses', {
        actions: [
          h('button', { class: 'icon-btn', 'aria-label': 'Partager la liste', onclick: share }, icon('share')),
          h('button', {
            class: 'icon-btn', 'aria-label': 'Vider la liste', onclick: async () => {
              if (store.shopping.length && await confirmDialog('Vider toute la liste de courses ?', { ok: 'Vider', danger: true })) await store.clearShopping();
            },
          }, icon('trash')),
        ],
      }),
      body),
    cleanup: unsub,
  };
}
