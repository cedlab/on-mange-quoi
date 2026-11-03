// Donner un fichier fabriqué par l'app (sauvegarde JSON, livre PDF, menu PDF).
// - Ordinateur : téléchargement direct (dossier Téléchargements).
// - Téléphone : feuille de partage (Enregistrer dans Fichiers, WhatsApp…).
//   Si la préparation a été longue, le navigateur refuse d'ouvrir le partage
//   sans nouveau geste : on affiche alors un bouton « Partager » à toucher.
import { sheet, toast } from './components.js';
import { h } from './dom.js';

const isDesktop = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

const sizeLabel = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1e3))} Ko`);

/** Fichier prêt : bouton Partager (geste neuf) et bouton Télécharger. */
function readySheet(file, title) {
  const canShare = navigator.canShare?.({ files: [file] });
  const s = sheet(h('div', { class: 'stack' },
    h('p', null, `✅ ${file.name}`, h('br'), h('small', { class: 'muted' }, sizeLabel(file.size))),
    canShare && h('button', {
      class: 'btn primary big', onclick: async () => {
        try {
          await navigator.share({ files: [file], title });
          s.close();
        } catch (e) {
          if (e.name !== 'AbortError') toast(`Partage impossible : ${e.message}`);
        }
      },
    }, 'Partager / Enregistrer'),
    h('button', { class: `btn ${canShare ? 'ghost' : 'primary big'}`, onclick: () => { downloadFile(file); s.close(); } }, 'Télécharger')),
  { title: 'Fichier prêt' });
}

export async function deliverFile(file, { title = file.name } = {}) {
  if (isDesktop() || !navigator.canShare?.({ files: [file] })) {
    downloadFile(file);
    toast(`${file.name} téléchargé (${sizeLabel(file.size)}).`, { duration: 5000 });
    return;
  }
  try {
    await navigator.share({ files: [file], title });
  } catch (e) {
    if (e.name === 'AbortError') return;
    readySheet(file, title); // NotAllowedError : le geste de départ est trop ancien
  }
}
