// Enregistrement du service worker, mise à jour et installation.
import { toast } from './ui/components.js';

let deferredPrompt = null;
const installListeners = new Set();

export function canPromptInstall() {
  return Boolean(deferredPrompt);
}
export function onInstallAvailable(fn) {
  installListeners.add(fn);
  return () => installListeners.delete(fn);
}
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach((fn) => fn());
});

export let swRegistration = null;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const base = import.meta.env.BASE_URL;

  // On ne recharge que si l'utilisateur a demandé la mise à jour. Lors de la
  // toute première installation, le service worker prend aussi le contrôle
  // (clients.claim) : recharger à ce moment-là ferait « sauter » l'écran.
  let updateRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    location.reload();
  });

  const offerUpdate = (worker) => {
    toast('Une nouvelle version d’« On mange quoi ? » est disponible.', {
      action: 'Mettre à jour',
      duration: 0,
      onAction: () => {
        updateRequested = true;
        worker.postMessage('SKIP_WAITING');
      },
    });
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' });
      swRegistration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          // Une version est déjà active : la nouvelle attend l'accord de l'utilisateur.
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
        });
      });
      // Vérifie les mises à jour au retour sur l'app (les PWA restent longtemps ouvertes).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker non enregistré', e);
    }
  });
}

export async function checkForUpdate() {
  if (!swRegistration) return false;
  await swRegistration.update();
  return Boolean(swRegistration.waiting || swRegistration.installing);
}
