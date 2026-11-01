// Backend en mémoire, même interface que firestore-backend.js.
// Sert aux tests et au mode démo de développement (npm run dev, puis
// #/?demo=1) : aucune donnée n'est envoyée nulle part.

export function createMemoryBackend({ email = 'demo@exemple.fr', members = [email] } = {}) {
  const recipes = new Map();
  const photos = new Map();
  let access = members;
  let user = null;
  let userCb = null;
  const watchers = new Set();
  let seq = 0;
  const emit = () => {
    const list = [...recipes.values()].map((r) => structuredClone(r));
    for (const w of watchers) queueMicrotask(() => w(list, { fromCache: false }));
  };
  const stamp = () => ({ updatedAt: Date.now(), updatedBy: user?.email || null });

  return {
    kind: 'memory',
    onUser(cb) {
      userCb = cb;
      queueMicrotask(() => cb(user));
      return () => { userCb = null; };
    },
    async signIn() {
      user = { uid: 'demo', email, name: 'Démo', photo: '' };
      userCb?.(user);
    },
    async signOut() {
      user = null;
      userCb?.(null);
    },
    async getMembers() {
      if (!user || !access.includes(user.email)) {
        const e = new Error('permission-denied');
        e.code = 'permission-denied';
        throw e;
      }
      return [...access];
    },
    async setMembers(m) {
      access = [...m];
    },
    watchRecipes(onChange) {
      watchers.add(onChange);
      emit();
      return () => watchers.delete(onChange);
    },
    newRecipeId: () => `r${++seq}`,
    async addRecipe(data) {
      const id = `r${++seq}`;
      recipes.set(id, { ...structuredClone(data), id, createdAt: Date.now(), createdBy: user?.email, ...stamp() });
      emit();
      return id;
    },
    async setRecipe(id, data) {
      recipes.set(id, { ...structuredClone(data), id, ...stamp() });
      emit();
    },
    async updateRecipe(id, patch) {
      const r = recipes.get(id);
      if (!r) throw new Error('Recette introuvable');
      recipes.set(id, { ...r, ...structuredClone(patch), ...stamp() });
      emit();
    },
    async removeRecipe(id) {
      recipes.delete(id);
      photos.delete(id);
      emit();
    },
    async getPhoto(id) {
      return photos.get(id) || null;
    },
    async setPhoto(id, data) {
      if (data) photos.set(id, data);
      else photos.delete(id);
    },
    async importRecipes(items, onProgress) {
      let n = 0;
      for (const { recipe, photo } of items) {
        const id = `r${++seq}`;
        recipes.set(id, { ...structuredClone(recipe), id, createdAt: Date.now(), createdBy: user?.email, ...stamp() });
        if (photo) photos.set(id, photo);
        if (++n % 100 === 0) onProgress?.(n);
      }
      onProgress?.(n);
      emit();
    },
  };
}
