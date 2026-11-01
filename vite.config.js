import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

// L'application est servie depuis https://cedlab.github.io/on-mange-quoi/
// (surchargeable avec BASE_PATH=/ pour un autre hébergement).
const base = process.env.BASE_PATH || '/on-mange-quoi/';

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Génère dist/sw.js après la compilation : liste de pré-cache de tous les
 * fichiers produits + numéro de version dérivé de leur contenu. Toute
 * modification de l'app change donc sw.js, ce qui déclenche la mise à jour.
 */
function serviceWorker() {
  let outDir;
  return {
    name: 'omq-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle(error) {
      if (error || !existsSync(outDir)) return; // la vraie erreur est affichée par Vite
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(resolve('src/sw.js'), 'utf8');
      const sw = template
        .replace("'__VERSION__'", () => JSON.stringify(version))
        .replace('__PRECACHE__', () => JSON.stringify(['./', ...files]));
      if (sw.includes('__VERSION__') || sw.includes('__PRECACHE__')) throw new Error('sw.js : jetons non remplacés');
      writeFileSync(join(outDir, 'sw.js'), sw);
      console.log(`\n[sw] version ${version}, ${files.length} fichiers pré-cachés`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'dev'),
  },
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
