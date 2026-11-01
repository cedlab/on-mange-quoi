# Importer des recettes Cookidoo avec Claude dans Chrome

Claude dans Chrome lit les recettes dans **ta propre session Cookidoo** (tu es connecté), une à une, et prépare un texte au format de l'app. Ensuite : Plus → Importer des recettes → coller → Lire le texte → Importer.

Usage strictement personnel et familial : Cookidoo réserve ses recettes aux abonnés.

## Texte à donner à Claude dans Chrome

Copie tout le bloc ci-dessous dans Claude dans Chrome, sur un onglet cookidoo.fr où tu es connecté. Remplace la ligne « Recettes à récupérer » par ta liste, ou joins tes photos.

```text
Tu vas m'aider à recopier des recettes de mon compte Cookidoo vers l'application de cuisine de ma famille (« On mange quoi ? »). Je suis connecté à cookidoo.fr dans cet onglet. C'est pour notre usage personnel.

Recettes à récupérer : [écris ici la liste des noms, OU lis les noms des recettes sur les photos que je joins]

Pour chaque recette, l'une après l'autre :
1. Retrouve-la sur cookidoo.fr : dans « Mes recettes », l'historique ou les favoris si elle y est, sinon avec la recherche. Prends la recette dont le titre correspond exactement ; en cas de doute entre plusieurs, prends celle qui ressemble le plus à la photo et signale-le-moi.
2. Ouvre la page de la recette et relève : le titre exact, le nombre de portions, le temps de préparation, le temps total, tous les ingrédients avec quantités et unités (en gardant les sous-parties comme « Pâte », « Garniture »), toutes les étapes de préparation en recopiant exactement les réglages Thermomix (« 10 sec/vitesse 6 », « 3 min/100°C/Ⓡ/vitesse Ⓢ », « mode pétrin »…), les astuces s'il y en a, l'adresse de la page et l'adresse de la grande photo de la recette.
3. Ne modifie rien sur mon compte : pas de favoris, pas de liste de courses, pas de planning.

Quand tu as tout, donne-moi UN bloc de code JSON (```json … ```) exactement dans ce format, sans rien inventer (si une information manque, n'écris pas le champ) :

[
  {
    "title": "Quiche lorraine",
    "servings": 6,
    "prepMin": 15,
    "cookMin": 45,
    "category": "plat",
    "tags": ["thermomix"],
    "source": { "type": "cookidoo", "title": "Cookidoo", "url": "https://cookidoo.fr/recipes/recipe/fr-FR/r130599" },
    "imageUrl": "https://… adresse de la photo …jpg",
    "ingredients": ["Pâte :", "200 g de farine", "100 g de beurre, en morceaux", "Garniture :", "3 œufs"],
    "steps": ["# Pâte", "Mettre la farine et le beurre dans le bol et mixer 10 sec/vitesse 6.", "…"],
    "notes": "Astuce : …"
  }
]

Règles :
- prepMin : temps de préparation en minutes. cookMin : temps total moins temps de préparation, en minutes (seulement si le temps total est indiqué).
- servings : un nombre. Si ce ne sont pas des personnes ou des portions (par exemple « 20 pièces »), ajoute "servingsLabel": "pièces".
- category : une seule valeur parmi aperitif, entree, plat, accompagnement, dessert, gouter, sauce, boisson, bebe.
- ingredients : un ingrédient par texte, la quantité d'abord (« 200 g de farine ») ; une sous-partie est un texte qui finit par « : ».
- steps : une étape par texte, sans numéro ; une sous-partie est un texte qui commence par « # ».
- Recopie fidèlement, en français, sans résumer ni reformuler.
- Au-delà de 8 recettes, fais plusieurs blocs de 8 recettes au maximum ; je les copierai l'un après l'autre.
- À la fin, liste les recettes introuvables ou pour lesquelles tu as un doute.
```

## Dans l'app

1. **Plus → Importer des recettes**.
2. Colle le bloc JSON (avec ou sans les ```json) dans « Ou colle le texte des recettes », puis **Lire le texte**.
3. Vérifie le résumé (recettes, photos, doublons), puis **Importer**.
4. Recommence pour chaque bloc.

Les photos sont téléchargées par le relais d'import (Plus → Import par lien), en version 2 au minimum. Les recettes déjà importées (même lien Cookidoo) sont repérées comme doublons.
