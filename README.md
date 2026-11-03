# 🍽️ On mange quoi ?

L'application de la famille pour les recettes et les menus de la semaine, sur iPhone et Android.
C'est une application web installable (PWA) : elle s'ouvre en plein écran et fonctionne même sans réseau.

👉 **https://cedlab.github.io/on-mange-quoi/**

## Fonctionnalités

**Disponible (étapes 0, 1 et 2)**

- **Connexion Google obligatoire.** Seuls les membres de la famille y ont accès (Plus → Membres de la famille).
- **Recettes.** Chaque recette a :
  - un titre, une photo, une catégorie et une note en étoiles, demi-étoiles comprises (toucher la moitié gauche d'une étoile) ;
  - des temps de préparation, de cuisson et de repos ;
  - des portions ;
  - des ingrédients (quantité, unité, groupes « Pour la sauce : »), des étapes, des notes et des tags.
- **Source obligatoire** : livre (titre, page, auteur), PDF, site web, Cookidoo, Chronodrive, magazine, recette perso ou d'un proche… Pour une recette Cookidoo ou Chronodrive, le bouton « Ouvrir dans Cookidoo » ouvre directement l'application si elle est installée.
- **Portions et quantités dynamiques.** Avec − / +, toutes les quantités se recalculent. Toucher une quantité (« j'ai 300 g de farine ») ajuste toute la recette et le nombre de portions. Les arrondis sont pensés pour la cuisine : ½ œuf, 5 g près, fractions de cuillère.
- **Recherche et filtres.** La recherche ignore les accents et porte sur le titre, les ingrédients, la source et les tags. Les filtres portent sur la catégorie, la note, le temps total, le type de source et les tags. On peut aussi trier.
- **Mode cuisine.** On coche les étapes au fur et à mesure, et l'écran peut rester allumé (☀).
- **Partage** d'une recette en texte (WhatsApp, SMS, mail…) : ingrédients aux portions affichées, étapes et lien vers la source.
- **Coller une recette** (bouton + → « Coller un texte ») : on copie une recette depuis ses notes, un message ou une page web, et le titre, les portions, les temps, les ingrédients (avec quantités et sous-groupes), les étapes, les astuces et la source sont reconnus. Le formulaire s'ouvre pré-rempli, pour vérifier avant d'enregistrer.
- **Recettes Cookidoo** : sur cookidoo.fr (Safari, connecté), copier la recette du titre à la dernière étape, puis la coller avec le lien de la recette sur une ligne à part. Les avis, la difficulté et les valeurs nutritionnelles sont ignorés, les quantités écrites sur une ligne à part sont recollées, la source devient « Cookidoo » (bouton « Ouvrir dans Cookidoo ») et le tag #thermomix est ajouté. Dans les étapes, les réglages Thermomix (« 10 sec/vitesse 6 ») sont mis en évidence.
- **Importer depuis un lien** (bouton + → « Importer depuis un lien ») : on colle le lien de partage d'une recette (Chronodrive, Marmiton, 750g…). La recette arrive pré-remplie avec sa photo, ses ingrédients, ses étapes, ses portions et ses temps, pour vérification. Sur Android, l'app apparaît aussi dans le menu Partager.
  - Ça passe par un petit **relais Cloudflare gratuit** (`worker/recipe-proxy.js`), à installer une fois : voir Plus → Import par lien.
  - Le relais lit la page et en extrait la recette au format standard schema.org quand le site le fournit, sinon son texte.
  - Il n'accepte que les membres connectés (jeton Firebase vérifié) et l'app (cedlab.github.io), et ne conserve rien.
  - Ne marche pas pour Cookidoo, qui demande une connexion : il reste le copier-coller.
- **Recettes Cookidoo avec Claude dans Chrome** : voir [docs/import-cookidoo-claude-chrome.md](docs/import-cookidoo-claude-chrome.md). Claude lit les recettes dans ta session Cookidoo et prépare un texte JSON à coller dans Plus → Importer des recettes. Les photos sont récupérées par le relais.
- **Import** d'un fichier de recettes JSON, ou d'un texte JSON collé (les ingrédients et étapes peuvent être de simples textes ; une photo peut être donnée par son adresse `imageUrl`, téléchargée par le relais) (Plus → Importer des recettes). Les doublons sont repérés.
- **Sauvegarde** complète en JSON, photos comprises (Plus → Sauvegarder les recettes).
- **Classement rapide** des recettes par catégorie, une par une (Plus → Classer les recettes).
- **Corbeille** : une recette supprimée par erreur se restaure.
- **Temps réel.** Une modification faite sur un téléphone apparaît aussitôt sur les autres.

- **Semaine** (étape 2) : planning du samedi au vendredi avec, pour chaque jour, Midi, Poupette, Soir et Poupette.
  - Ajouter un repas : toucher un créneau, puis choisir une recette (recherche, recettes souvent au menu, mieux notées) ou un texte libre (« Restes », « Cantine »…), avec le nombre de portions.
  - Poupette : bouton « Même chose que les grands ».
  - Vue **compacte** par défaut : la date dans un rond et seuls les repas prévus, pour voir toute la semaine sur un écran. Le bouton en haut à gauche bascule vers la vue détaillée (créneau par créneau).
  - **Texte libre** dans chaque repas (« Raclette chez Paul »), en plus des textes rapides (Restes, Cantine…), avec un bouton 🎤 pour **dicter** (la recherche de recette aussi). Si le navigateur ne sait pas dicter, le bouton n'apparaît pas : le micro du clavier reste disponible.
  - Navigation : semaine par semaine, ou par le calendrier (toucher le titre de la semaine).
  - Sélection : « Sélectionner » pour choisir des jours ; « Période » pour choisir du … au … sur le calendrier, puis faire le menu PDF ou vider ces jours.
  - Depuis une fiche recette : « Planifier un repas ».
- **Menu en PDF** : la grille « Planning des repas » (A4 paysage, une page par semaine, lignes Poupette grisées), pour cette semaine, deux semaines ou une période, ou vierge à remplir à la main. Le PDF se partage ou s'imprime depuis le téléphone.
- **On mange quoi ? 🎲** (dé en haut à gauche des Recettes) : une recette tirée au hasard, avec une petite animation. Le tirage favorise :
  - la saison : légumes et fruits du mois, plats réconfortants en hiver et frais en été, bûche en décembre, crêpes en février… ;
  - les recettes pas mangées depuis longtemps (rien de ce qui a été au menu ces 3 dernières semaines) ;
  - les mieux notées.
  Les raisons du choix sont affichées. Filtres : catégorie, rapide, de saison, bien notées, Thermomix. On peut planifier la recette directement, et 3 autres idées sont proposées. Dans la Semaine, chaque créneau propose aussi une idée (Ajouter, ou 🔀 pour une autre).
- **Stats** (onglet) : ce qu'on mange d'après le planning, sur 4 semaines, 3 mois, 12 mois, tout l'historique ou une période choisie au calendrier.
  - En chiffres : nombre de repas, part de « fait maison », recettes différentes, part de plats de saison, note moyenne, repas de Poupette (dont « comme les grands »).
  - En classements : recettes les plus cuisinées, plats par semaine, catégories, origine des recettes, repas sans recette (Restes, Cantine…), ingrédients les plus présents, jours les plus remplis.
  - « À refaire bientôt » : recettes bien notées oubliées depuis 3 mois.
  - Chiffres de la collection.
- **Réglages du planning** (Plus) : nombre de personnes par repas, portion de Poupette.

**À venir**

| Étape | Contenu |
|---|---|
| 3 | Placards (« j'en ai / j'en ai plus ») et suggestions de recettes avec ce qu'il y a à la maison — mis de côté pour l'instant |
| 4 | Lien de lecture seule pour partager une recette à quelqu'un qui n'a pas l'app, PDF ou image d'une recette |

## Confidentialité

Le dépôt est **public**. Il ne contient **aucune recette ni aucune donnée** : tout est stocké dans Firestore, dans un espace réservé aux membres.

- `.gitignore` exclut les PDF, les archives, les fichiers JSON (sauf `package*.json`), les images et les exports.
- Le test `tests/privacy.test.js` échoue si un tel fichier est suivi par git, ou si un fichier dépasse 300 Ko.
- La configuration Firebase (`src/firebase.js`) n'est pas secrète : l'accès est protégé par la connexion Google et par les règles `firestore.rules`.

## Mise en service (une seule fois)

### 1. Publier les règles Firestore

1. Ouvrir la [console Firebase](https://console.firebase.google.com/) → projet **on-mange-quoi-a0c23** → **Firestore Database** → onglet **Règles**.
2. Remplacer tout le contenu par celui du fichier [`firestore.rules`](firestore.rules), puis cliquer **Publier**.

Les règles :

- réservent toute la base aux adresses de la liste des membres ;
- autorisent toujours l'adresse du propriétaire ;
- prévoient pour l'étape 4 un accès en lecture seule aux recettes partagées explicitement.

### 2. Activer GitHub Pages

1. Sur GitHub : **Settings → Pages → Build and deployment → Source : « GitHub Actions »**.
2. Chaque modification fusionnée dans `main` est testée puis déployée automatiquement (workflow « Déploiement GitHub Pages »).

### 3. Vérifier Firebase Authentication

Dans **Authentication → Méthode de connexion**, **Google** doit être activé. Dans **Authentication → Paramètres → Domaines autorisés**, il faut `cedlab.github.io` (et `localhost` pour le développement).

### 4. Ajouter les membres de la famille

Une fois connecté : **Plus → Membres de la famille → Ajouter un membre**, avec l'adresse du compte Google de la personne.

## Installer sur l'écran d'accueil

- **iPhone (Safari)** : ouvrir l'adresse dans Safari → **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
- **Android (Chrome)** : menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).

Quand une nouvelle version est publiée, un message **« Mettre à jour »** apparaît.

## Format d'import des recettes

```json
{
  "format": "on-mange-quoi/recettes",
  "version": 1,
  "recipes": [
    {
      "title": "Aïoli",
      "servings": 6,
      "prepMin": 60,
      "cookMin": 60,
      "category": "plat",
      "ingredients": [
        { "qty": 1, "unit": "kg", "name": "cabillaud", "note": "ou morue dessalée" },
        { "qty": 2, "unit": "gousse", "name": "ail", "group": "Pour l'aïoli" }
      ],
      "steps": [{ "section": "La veille" }, { "text": "Faire dessaler la morue." }],
      "notes": "…",
      "source": { "type": "livre", "title": "Mon livre", "page": 42 },
      "photo": "data:image/jpeg;base64,…"
    }
  ]
}
```

- Types de source : `livre`, `pdf`, `web`, `cookidoo`, `chronodrive`, `magazine`, `perso`, `autre`.
- Catégories : `aperitif`, `entree`, `plat`, `accompagnement`, `dessert`, `gouter`, `sauce`, `boisson`, `bebe`.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/on-mange-quoi/
npm test         # tests (logique, accès, confidentialité du dépôt)
npm run build    # version de production dans dist/
```

En développement, `#/?demo=1` lance un **mode démo** : les données restent en mémoire, sans Firebase ni connexion réelle. Ce mode n'existe pas dans la version publiée.

### Organisation du code

```
src/
  main.js, app.js        routes, onglets, porte de connexion
  firebase.js            configuration du projet Firebase
  data/                  store.js (état, temps réel), firestore-backend.js, memory-backend.js
  logic/                 logique pure et testée : quantities.js, recipes.js, sources.js, exchange.js, text-import.js, dates.js, plan.js, aisles.js, menu-pdf.js, suggest.js, stats.js
  ui/                    dom.js, components.js, icons.js, image.js, views/
  sw.js, pwa.js          hors ligne et mises à jour
firestore.rules          règles de sécurité (à publier dans la console)
worker/recipe-proxy.js   relais d'import par lien (Worker Cloudflare)
worker/wrangler.toml     sa configuration (déploiement depuis GitHub, répertoire racine « worker »)
```

### Données Firestore

| Collection | Contenu |
|---|---|
| `recipes/{id}` | la recette, avec une vignette `thumb` de quelques Ko |
| `recipePhotos/{id}` | la photo, d'environ 100 Ko, chargée à l'ouverture de la fiche |
| `config/access` | `{ members: [...] }`, la liste des adresses autorisées |
| `plans/{samedi}` | une semaine : `{ days: { "2026-11-07": { midi: [...], midiP: [...], soir: [...], soirP: [...] } } }` |
| `config/settings` | réglages du planning et adresse du relais d'import |
