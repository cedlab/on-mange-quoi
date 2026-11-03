// État de l'application : utilisateur connecté, accès, recettes (temps réel).
import { OWNER_EMAIL } from '../firebase.js';
import { cleanRecipe, searchText, validateRecipe } from '../logic/recipes.js';
import { weekStart } from '../logic/dates.js';
import { sourceMigration } from '../logic/sources.js';
import { DEFAULT_SETTINGS, SLOTS } from '../logic/plan.js';

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
    this.selection = [];
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
      b.watchCol('selection', (list) => {
        this.selection = list.sort((x, y) => (y.addedAt || 0) - (x.addedAt || 0));
        this.emit('selection');
      }, onError),
      b.watchCol('plans', (list) => {
        this.plans = Object.fromEntries(list.map((p) => [p.id, p]));
        this.plansLoaded = true;
        this.emit('plans');
      }, onError),
      b.watchDocAt('config/settings', (d) => {
        this.settings = { ...DEFAULT_SETTINGS, ...(d || {}) };
        this.emit('plans');
      }, onError),
    ];
    const stopRecipes = this.backend.watchRecipes((list) => {
      for (const r of list) r._search = searchText(r);
      this.recipes = list;
      this.byId = new Map(list.map((r) => [r.id, r]));
      this.loaded = true;
      this.emit('recipes');
      this.#migrateSources(list);
    }, onError);
    this.unwatch = () => {
      stopRecipes();
      for (const stop of stops) stop();
    };
  }

  // #quitoque / #thermomix : anciens tags devenus des sources (corrigé une fois, en silence).
  #migrating = new Set();
  #migrateSources(list) {
    for (const r of list) {
      const fix = sourceMigration(r);
      if (!fix || this.#migrating.has(r.id)) continue;
      this.#migrating.add(r.id);
      this.backend.updateRecipe(r.id, fix).catch(() => this.#migrating.delete(r.id));
    }
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

  // --- Mes envies (recettes et idées « à faire un de ces jours ») ------------

  isSelected(recipeId) {
    return this.selection.some((i) => i.recipeId === recipeId);
  }

  #who() {
    return { addedAt: Date.now(), addedBy: this.user?.email || null, addedByName: (this.user?.name || '').split(' ')[0] || null };
  }

  /** Ajoute ou retire une recette de la sélection ; renvoie true si elle y est désormais. */
  async toggleSelection(recipe) {
    if (this.isSelected(recipe.id)) {
      await this.backend.del(`selection/${recipe.id}`);
      return false;
    }
    await this.backend.put(`selection/${recipe.id}`, { recipeId: recipe.id, title: recipe.title, ...this.#who() });
    return true;
  }

  addSelectionText(text) {
    return this.backend.put(`selection/${this.backend.newDocId('selection')}`, { text: text.trim(), ...this.#who() });
  }

  removeSelection(id) {
    return this.backend.del(`selection/${id}`);
  }

  /** Remet un élément retiré (bouton « Annuler »). */
  restoreSelection(item) {
    const { id, updatedAt, updatedBy, ...data } = item;
    return this.backend.put(`selection/${id}`, data);
  }

  saveSettings(patch) {
    return this.backend.put('config/settings', patch, { merge: true });
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

  getIdToken() {
    return this.backend.getIdToken();
  }

  signOut() {
    remember(null);
    return this.backend.signOut();
  }
}
