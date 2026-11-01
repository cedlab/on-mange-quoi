// État de l'application : utilisateur connecté, accès, recettes (temps réel).
import { OWNER_EMAIL } from '../firebase.js';
import { cleanRecipe, searchText, validateRecipe } from '../logic/recipes.js';
import { guessAisle, ingredientKey } from '../logic/aisles.js';
import { weekStart } from '../logic/dates.js';
import { buildShoppingList, DEFAULT_SETTINGS, entriesBetween, mergeShopping, SLOTS } from '../logic/plan.js';
import { parseIngredientLine, toBase } from '../logic/quantities.js';

const MEMBER_KEY = 'omq.member';

function remember(email) {
  try {
    if (email) localStorage.setItem(MEMBER_KEY, email);
    else localStorage.removeItem(MEMBER_KEY);
  } catch {
    /* stockage indisponible */
  }
}
function remembered() {
  try {
    return localStorage.getItem(MEMBER_KEY);
  } catch {
    return null;
  }
}

export class Store {
  constructor(backend) {
    this.backend = backend;
    /** 'loading' | 'signedOut' | 'checking' | 'denied' | 'ready' | 'error' */
    this.status = 'loading';
    this.user = null;
    this.error = null;
    this.authError = null;
    this.recipes = [];
    this.byId = new Map();
    this.loaded = false;
    this.listeners = new Set();
    this.unwatch = null;
    this.resetPlanning();
  }

  resetPlanning() {
    this.plans = {};
    this.plansLoaded = false;
    this.settings = { ...DEFAULT_SETTINGS };
    this.aisleOverrides = {};
    this.shopping = [];
    this.shoppingMeta = null;
    this.shoppingLoaded = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(kind) {
    for (const fn of this.listeners) fn(kind);
  }

  start() {
    this.backend.onUser((u) => this.onUser(u), (e) => {
      // Échec au retour de la page de connexion Google : affiché sur l'écran de connexion.
      this.authError = e;
      this.emit('status');
    });
    return this;
  }

  async onUser(user) {
    this.unwatch?.();
    this.unwatch = null;
    this.resetPlanning();
    this.user = user;
    this.recipes = [];
    this.byId = new Map();
    this.loaded = false;
    if (!user) {
      this.status = 'signedOut';
      this.emit('status');
      return;
    }
    this.status = 'checking';
    this.emit('status');
    try {
      let members = await this.backend.getMembers();
      if (members === null && user.email === OWNER_EMAIL) {
        members = [OWNER_EMAIL];
        await this.backend.setMembers(members);
      }
      const ok = user.email === OWNER_EMAIL || (members || []).includes(user.email);
      this.status = ok ? 'ready' : 'denied';
    } catch (e) {
      if (e.code === 'permission-denied') this.status = 'denied';
      else if (remembered() === user.email) this.status = 'ready'; // hors ligne : déjà vérifié sur ce téléphone
      else {
        this.status = 'error';
        this.error = e;
      }
    }
    remember(this.status === 'ready' ? user.email : null);
    this.emit('status');
    if (this.status === 'ready') this.watch();
  }

  watch() {
    const onError = (e) => {
      console.error(e);
      if (e.code === 'permission-denied') {
        this.status = 'denied';
        remember(null);
        this.emit('status');
      }
    };
    const b = this.backend;
    const stops = [
      b.watchCol('plans', (list) => {
        this.plans = Object.fromEntries(list.map((p) => [p.id, p]));
        this.plansLoaded = true;
        this.emit('plans');
      }, onError),
      b.watchDocAt('config/settings', (d) => {
        this.settings = { ...DEFAULT_SETTINGS, ...(d || {}) };
        this.emit('plans');
      }, onError),
      b.watchDocAt('config/aisles', (d) => {
        this.aisleOverrides = d?.map || {};
        this.emit('shopping');
      }, onError),
      b.watchDocAt('config/shopping', (d) => {
        this.shoppingMeta = d;
        this.emit('shopping');
      }, onError),
      b.watchCol('shoppingItems', (list) => {
        this.shopping = list;
        this.shoppingLoaded = true;
        this.emit('shopping');
      }, onError),
    ];
    const stopRecipes = this.backend.watchRecipes((list) => {
      for (const r of list) r._search = searchText(r);
      this.recipes = list;
      this.byId = new Map(list.map((r) => [r.id, r]));
      this.loaded = true;
      this.emit('recipes');
    }, onError);
    this.unwatch = () => {
      stopRecipes();
      for (const stop of stops) stop();
    };
  }

  get activeRecipes() {
    return this.recipes.filter((r) => !r.deleted);
  }

  get trashedRecipes() {
    return this.recipes.filter((r) => r.deleted);
  }

  recipe(id) {
    return this.byId.get(id) || null;
  }

  // --- Actions -----------------------------------------------------------------

  /**
   * Crée ou met à jour une recette. photo : undefined (inchangée), null
   * (supprimée) ou { photo, thumb } (nouvelle). Retourne l'identifiant.
   */
  async saveRecipe(id, input, photo) {
    const data = cleanRecipe(input);
    const err = validateRecipe(data);
    if (err) throw new Error(err);
    if (photo === null) data.thumb = null;
    else if (photo) data.thumb = photo.thumb;
    else if (id && this.recipe(id)?.thumb) data.thumb = this.recipe(id).thumb;
    if (id) {
      const prev = this.recipe(id) || {};
      await this.backend.setRecipe(id, {
        ...data, createdAt: prev.createdAt || Date.now(), createdBy: prev.createdBy || this.user?.email || null,
      });
    } else {
      id = await this.backend.addRecipe(data);
    }
    if (photo !== undefined) await this.backend.setPhoto(id, photo ? photo.photo : null);
    return id;
  }

  setRating(id, rating) {
    return this.backend.updateRecipe(id, { rating });
  }

  setCategory(id, category) {
    return this.backend.updateRecipe(id, { category: category || null });
  }

  trash(id) {
    return this.backend.updateRecipe(id, { deleted: true, deletedAt: Date.now() });
  }

  restore(id) {
    return this.backend.updateRecipe(id, { deleted: false, deletedAt: null });
  }

  purge(id) {
    return this.backend.removeRecipe(id);
  }

  getPhoto(id) {
    return this.backend.getPhoto(id);
  }

  importRecipes(items, onProgress) {
    return this.backend.importRecipes(items, onProgress);
  }

  // --- Planning ------------------------------------------------------------------

  /** Remplace les entrées d'un créneau (midi, midiP, soir, soirP) d'un jour. */
  setSlot(date, slot, entries) {
    return this.backend.put(`plans/${weekStart(date)}`, { days: { [date]: { [slot]: entries } } }, { merge: true });
  }

  /** Vide les jours donnés. */
  async clearDays(dates) {
    const byWeek = new Map();
    for (const d of dates) {
      const w = weekStart(d);
      if (!byWeek.has(w)) byWeek.set(w, {});
      byWeek.get(w)[d] = Object.fromEntries(SLOTS.map((s) => [s.id, []]));
    }
    await this.backend.writeOps([...byWeek.entries()].map(([w, days]) => ({ op: 'set', path: `plans/${w}`, data: { days }, merge: true })));
  }

  saveSettings(patch) {
    return this.backend.put('config/settings', patch, { merge: true });
  }

  // --- Liste de courses ---------------------------------------------------------

  /** (Re)génère la liste depuis le planning de la période, en gardant coches et ajouts. */
  async generateShopping(from, to) {
    const generated = buildShoppingList(entriesBetween(this.plans, from, to), this.byId, { aisleOverrides: this.aisleOverrides });
    const { upserts, removals } = mergeShopping(this.shopping, generated);
    const ops = [
      ...removals.map((id) => ({ op: 'delete', path: `shoppingItems/${id}` })),
      ...upserts.map(({ id, ...item }) => ({
        op: 'set', path: `shoppingItems/${id || this.backend.newDocId('shoppingItems')}`, data: item,
      })),
      { op: 'set', path: 'config/shopping', data: { from, to, generatedAt: Date.now() } },
    ];
    await this.backend.writeOps(ops);
    return generated.length;
  }

  toggleItem(id, checked) {
    return this.backend.patch(`shoppingItems/${id}`, { checked });
  }

  /** Ajout à la main : « 6 œufs », « lessive ». */
  addItem(text) {
    const p = parseIngredientLine(text);
    const key = ingredientKey(p.name) || p.name;
    const amounts = p.qty !== undefined ? [toBase(p.qty, p.unit)].map((a) => ({ qty: a.qty, unit: a.unit || null })) : [];
    const id = this.backend.newDocId('shoppingItems');
    return this.backend.put(`shoppingItems/${id}`, {
      key, name: p.name, amounts, aisle: guessAisle(p.name, this.aisleOverrides, key), manual: true, checked: false, recipes: [],
    });
  }

  /** Change le rayon d'un article et le retient pour les prochaines listes. */
  async setItemAisle(item, aisle) {
    await this.backend.writeOps([
      { op: 'update', path: `shoppingItems/${item.id}`, data: { aisle, aisleFixed: true } },
      { op: 'set', path: 'config/aisles', data: { map: { [item.key]: aisle } }, merge: true },
    ]);
  }

  deleteItem(id) {
    return this.backend.del(`shoppingItems/${id}`);
  }

  /** « Courses terminées » : retire les articles cochés. */
  clearChecked() {
    return this.backend.writeOps(this.shopping.filter((i) => i.checked).map((i) => ({ op: 'delete', path: `shoppingItems/${i.id}` })));
  }

  clearShopping() {
    return this.backend.writeOps([
      ...this.shopping.map((i) => ({ op: 'delete', path: `shoppingItems/${i.id}` })),
      { op: 'delete', path: 'config/shopping' },
    ]);
  }

  getMembers() {
    return this.backend.getMembers();
  }

  setMembers(list) {
    return this.backend.setMembers(list);
  }

  signIn() {
    return this.backend.signIn();
  }

  signOut() {
    remember(null);
    return this.backend.signOut();
  }
}
