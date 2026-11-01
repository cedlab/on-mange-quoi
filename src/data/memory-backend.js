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

  // Documents génériques : chemin « collection/id » → données.
  const docs = new Map();
  const colWatchers = new Map(); // chemin de collection → Set(callback)
  const docWatchers = new Map(); // chemin de document → Set(callback)
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const deepMerge = (a, b) => {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
    return out;
  };
  const colOf = (path) => path.split('/').slice(0, -1).join('/');
  const notify = (path) => {
    const col = colOf(path);
    for (const w of colWatchers.get(col) || []) {
      const list = [...docs.entries()].filter(([p]) => colOf(p) === col).map(([p, d]) => ({ ...structuredClone(d), id: p.split('/').pop() }));
      queueMicrotask(() => w(list));
    }
    for (const w of docWatchers.get(path) || []) {
      const d = docs.get(path);
      queueMicrotask(() => w(d ? structuredClone(d) : null));
    }
  };
  const writeOne = (o) => {
    if (o.op === 'delete') docs.delete(o.path);
    else if (o.op === 'update') {
      if (!docs.has(o.path)) throw new Error(`Document introuvable : ${o.path}`);
      docs.set(o.path, { ...docs.get(o.path), ...structuredClone(o.data) });
    } else docs.set(o.path, o.merge ? deepMerge(docs.get(o.path), o.data) : structuredClone(o.data));
  };

  return {
    kind: 'memory',
    watchCol(path, onChange) {
      if (!colWatchers.has(path)) colWatchers.set(path, new Set());
      colWatchers.get(path).add(onChange);
      const list = [...docs.entries()].filter(([p]) => colOf(p) === path).map(([p, d]) => ({ ...structuredClone(d), id: p.split('/').pop() }));
      queueMicrotask(() => onChange(list));
      return () => colWatchers.get(path).delete(onChange);
    },
    watchDocAt(path, onChange) {
      if (!docWatchers.has(path)) docWatchers.set(path, new Set());
      docWatchers.get(path).add(onChange);
      queueMicrotask(() => onChange(docs.has(path) ? structuredClone(docs.get(path)) : null));
      return () => docWatchers.get(path).delete(onChange);
    },
    newDocId: (colPath) => `${colPath.replace(/\//g, '_')}_${++seq}`,
    async put(path, data, { merge = false } = {}) {
      writeOne({ op: 'set', path, data, merge });
      notify(path);
    },
    async patch(path, data) {
      writeOne({ op: 'update', path, data });
      notify(path);
    },
    async del(path) {
      writeOne({ op: 'delete', path });
      notify(path);
    },
    async writeOps(ops) {
      for (const o of ops) writeOne(o);
      for (const p of new Set(ops.map((o) => o.path))) notify(p);
    },
    onUser(cb) {
      userCb = cb;
      queueMicrotask(() => cb(user));
      return () => { userCb = null; };
    },
    async signIn() {
      user = { uid: 'demo', email, name: 'Démo', photo: '' };
      userCb?.(user);
    },
    async getIdToken() {
      return user ? 'jeton-demo' : null;
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
