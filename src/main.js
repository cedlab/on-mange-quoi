import './styles.css';
import { route, setGateView, setStore, startRouter } from './app.js';
import { Store } from './data/store.js';
import { registerServiceWorker } from './pwa.js';
import { initTheme } from './theme.js';
import { gateView } from './ui/views/login.js';
import { recipesView } from './ui/views/recipes.js';
import { recipeView } from './ui/views/recipe.js';
import { recipeFormView } from './ui/views/recipe-form.js';
import { importView } from './ui/views/import.js';
import { pasteView } from './ui/views/paste.js';
import { ideaView } from './ui/views/idea.js';
import { statsView } from './ui/views/stats.js';
import { comingSoonView, membersView, moreView, settingsView, sortView, trashView } from './ui/views/more.js';
import { weekView } from './ui/views/week.js';
import { shoppingView } from './ui/views/shopping.js';

initTheme();
registerServiceWorker();

route('/', recipesView, { tab: 'recipes' });
route('/recette/nouvelle', (_, query) => recipeFormView({}, query), { tab: 'recipes' });
route('/recette/coller', pasteView, { tab: 'recipes' });
route('/idee', ideaView, { tab: 'recipes' });
route('/recette/:id/modifier', recipeFormView, { tab: 'recipes' });
route('/recette/:id', recipeView, { tab: 'recipes', live: true });
route('/importer', importView, { tab: 'more' });
route('/classer', sortView, { tab: 'more' });
route('/plus', moreView, { tab: 'more', live: true });
route('/membres', membersView, { tab: 'more' });
route('/corbeille', trashView, { tab: 'more', live: true });
route('/semaine', weekView, { tab: 'week' });
route('/courses', shoppingView, { tab: 'shopping' });
route('/reglages', settingsView, { tab: 'more' });
route('/stats', statsView, { tab: 'stats' });
route('/placards', comingSoonView('Placards', '🧺', 'Ce que tu as à la maison, et des idées de recettes avec.', 3), { tab: 'pantry' });

function isDemo() {
  try {
    if (/[?&]demo=1/.test(location.hash + location.search)) sessionStorage.setItem('omq.demo', '1');
    return sessionStorage.getItem('omq.demo') === '1';
  } catch {
    return false;
  }
}

async function createBackend() {
  // Mode démo (développement uniquement) : données en mémoire, sans Firebase.
  if (import.meta.env.DEV && isDemo()) {
    const { createMemoryBackend } = await import('./data/memory-backend.js');
    return createMemoryBackend();
  }
  const { createFirebaseBackend } = await import('./data/firestore-backend.js');
  return createFirebaseBackend();
}

createBackend().then((backend) => {
  const store = new Store(backend);
  setStore(store);
  if (import.meta.env.DEV) window.__omq = { store }; // tests de bout en bout (développement seulement)
  setGateView(gateView);
  startRouter();
  store.start();
});
