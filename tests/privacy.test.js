// Garde-fou : le dépôt est public. Aucune recette, aucun PDF, aucune donnée
// personnelle ne doit y être commitée (tout est dans Firestore).
import { execSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ALLOWED_JSON = new Set(['package.json', 'package-lock.json']);
const FORBIDDEN = /\.(pdf|zip|z\d\d|7z|csv|xlsx?|docx?|jpe?g|heic|webp|txt)$/i;

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return null; // pas de dépôt git (archive) : rien à vérifier
  }
}

describe('confidentialité du dépôt', () => {
  const files = trackedFiles();
  it.skipIf(!files)('ne contient ni PDF, ni archive, ni export de données', () => {
    const bad = files.filter((f) => FORBIDDEN.test(f) || (f.endsWith('.json') && !ALLOWED_JSON.has(f)));
    expect(bad).toEqual([]);
  });
  it.skipIf(!files)('ne contient pas de gros fichier (hors package-lock)', () => {
    const big = files.filter((f) => f !== 'package-lock.json' && statSync(f, { throwIfNoEntry: false })?.size > 300_000);
    expect(big).toEqual([]);
  });
});
