// Photos des recettes : compressées dans le navigateur avant d'être stockées
// dans Firestore (pas de Firebase Storage). Photo ≈ 480 px (≤ 120 Ko) et
// vignette carrée de 160 px (quelques Ko) pour les listes.

const PHOTO_SIZE = 480;
const THUMB_SIZE = 160;
const MAX_PHOTO_CHARS = 160_000;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de lire l'image."));
    img.src = src;
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function draw(img, w, h, sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}

function thumbOf(img) {
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const c = draw(img, THUMB_SIZE, THUMB_SIZE, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s);
  return c.toDataURL('image/jpeg', 0.7);
}

/** Fichier (appareil photo, galerie) → { photo, thumb } en data URL JPEG. */
export async function processPhoto(fileOrDataUrl) {
  const src = typeof fileOrDataUrl === 'string' ? fileOrDataUrl : await readFile(fileOrDataUrl);
  const img = await loadImage(src);
  const scale = Math.min(1, PHOTO_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = draw(img, Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale));
  let q = 0.8;
  let photo = c.toDataURL('image/jpeg', q);
  while (photo.length > MAX_PHOTO_CHARS && q > 0.4) {
    q -= 0.1;
    photo = c.toDataURL('image/jpeg', q);
  }
  return { photo, thumb: thumbOf(img) };
}

/** Vignette seule à partir d'une photo déjà compressée (import). */
export async function thumbFromDataUrl(dataUrl) {
  return thumbOf(await loadImage(dataUrl));
}
