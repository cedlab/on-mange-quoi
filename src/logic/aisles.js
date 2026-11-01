// Rayons du magasin : classement automatique des ingrédients de la liste de
// courses. Dictionnaire générique (aucune donnée personnelle) ; chaque
// ingrédient peut ensuite être reclassé à la main (mémorisé pour la famille).
import { normalizeText } from './recipes.js';

export const AISLES = [
  { id: 'fruits-legumes', label: 'Fruits et légumes', emoji: '🥕' },
  { id: 'boulangerie', label: 'Boulangerie', emoji: '🥖' },
  { id: 'boucherie', label: 'Boucherie, volaille', emoji: '🥩' },
  { id: 'poissonnerie', label: 'Poissonnerie', emoji: '🐟' },
  { id: 'charcuterie', label: 'Charcuterie, traiteur', emoji: '🥓' },
  { id: 'cremerie', label: 'Crèmerie, œufs', emoji: '🥛' },
  { id: 'fromages', label: 'Fromages', emoji: '🧀' },
  { id: 'epicerie-salee', label: 'Épicerie salée', emoji: '🍝' },
  { id: 'conserves', label: 'Conserves, bocaux', emoji: '🥫' },
  { id: 'epices', label: 'Épices, condiments, sauces', emoji: '🧂' },
  { id: 'epicerie-sucree', label: 'Épicerie sucrée, pâtisserie', emoji: '🍫' },
  { id: 'petit-dejeuner', label: 'Petit-déjeuner', emoji: '🥣' },
  { id: 'surgeles', label: 'Surgelés', emoji: '🧊' },
  { id: 'boissons', label: 'Boissons', emoji: '🧃' },
  { id: 'bebe', label: 'Bébé', emoji: '🍼' },
  { id: 'maison', label: 'Maison, hygiène', emoji: '🧻' },
  { id: 'autre', label: 'Autres', emoji: '🛒' },
];

const BY_ID = Object.fromEntries(AISLES.map((a) => [a.id, a]));
export const aisle = (id) => BY_ID[id] || BY_ID.autre;
export const aisleOrder = (id) => {
  const i = AISLES.findIndex((a) => a.id === id);
  return i < 0 ? AISLES.length : i;
};

// Ordre important : le premier motif trouvé l'emporte (« crème de marrons »
// avant « crème », « jus de citron » avant « citron », « surgelé » avant tout).
const RULES = [
  ['surgeles', /\bsurgel|(?<!sucre )\bglaces?\b(?! pile)|sorbet|\bcongel/],
  ['bebe', /\bpetits? pots?\b(?! de)|lait (?:de croissance|infantile|1er age|2e age)|\bbebe\b|\bcompote bebe/],
  ['epicerie-sucree', /creme de marron|pate a tartiner|chocolat|cacao|sucre|cassonade|vergeoise|miel|confiture|levure chimique|sachet de levure|levure\b(?! de boulanger)|vanill|extrait d|arome|amande en poudre|poudre d'amande|poudre de noisette|noix de coco rapee|coco rapee|pepites|nappage|gelatine|agar|biscuit|boudoir|speculoos|meringue|sirop|caramel|praline|fruits confits|pate d'amande|fecule|maizena|colorant|cerneaux|amandes?\b|noisettes?\b|pistaches?\b|noix\b|raisins secs|abricots secs|pruneaux|dattes/],
  ['petit-dejeuner', /cereales|muesli|flocons d'avoine|porridge|\bthe\b|\bcafe\b|tisane|biscottes/],
  ['boissons', /\bvin\b|vin blanc|vin rouge|porto|cognac|rhum|biere|cidre|champagne|calvados|whisky|kirsch|grand marnier|cointreau|liqueur|jus d'orange|jus de pomme|eau gazeuse|limonade|soda|sirop de/],
  ['conserves', /en conserve|en boite|\bboite\b|concentre de tomate|coulis de tomate|tomates? concassees|pulpe de tomate|passata|pois chiches|haricots rouges|haricots blancs|lentilles cuisinees|mais doux|thon|sardines|maquereaux|anchois|olives|capres|cornichons|lait de coco|creme de coco|lait concentre|fond de|bouillon|cube|marrons? cuits/],
  ['epices', /\bsel\b|fleur de sel|poivre|epice|curry|cumin|paprika|piment|cannelle|muscade|gingembre en poudre|curcuma|safran|herbes de provence|origan|thym seche|laurier|clou de girofle|4 epices|quatre epices|ras el hanout|moutarde|vinaigre|ketchup|mayonnaise|sauce soja|sauce|tabasco|harissa|pesto|huile|bicarbonate/],
  ['epicerie-salee', /pates|spaghetti|tagliatelle|penne|fusilli|macaroni|lasagne|cannelloni|nouilles|vermicelle|riz|semoule|quinoa|boulgour|polenta|lentilles|farine|chapelure|pain de mie|crepes? (?:sarrasin)?|chips|crackers|gressins|puree en flocons|flocons de pomme de terre|pate (?:brisee|feuilletee|sablee|a pizza)|feuilles de brick|galettes|tortillas|wraps|biscottes/],
  ['boulangerie', /\bpain\b|baguette|brioche|croissant|viennoiserie|pain de campagne|pain complet/],
  ['poissonnerie', /poisson|saumon|cabillaud|colin|merlu|lieu|sole|dorade|bar\b|truite|thon frais|crevette|gambas|langoustine|moules|bulots|coquilles saint|noix de saint|calamar|encornet|seiche|poulpe|morue|haddock|crabe|homard|huitres|fruits de mer|surimi/],
  ['charcuterie', /jambon|lardons|bacon|saucisson|chorizo|pancetta|coppa|rillettes|pate de campagne|terrine|foie gras|knacki|saucisses? de strasbourg|allumettes|traiteur/],
  ['boucherie', /boeuf|veau|porc|agneau|mouton|poulet|dinde|canard|lapin|pintade|caille|viande|steak|viande hachee|escalope|cote de boeuf|cote de porc|roti|filet mignon|magret|cuisse|blanc de poulet|blanc de dinde|saucisse|merguez|chipolata|jarret|paleron|bourguignon|blanquette|osso|gigot|epaule|echine|travers|onglet|bavette|entrecote|chair a saucisse|foie\b|rognon|joue/],
  ['fromages', /fromage|parmesan|gruyere|emmental|comte|beaufort|mozzarella|feta|chevre|roquefort|camembert|brie|reblochon|raclette|mascarpone|ricotta|cheddar|pecorino|grana|bleu\b|tomme|cantal|morbier|saint-nectaire|munster|maroilles|boursin|kiri|vache qui rit|cancoillotte/],
  ['cremerie', /\boeufs?\b|\boeuf\b|jaune|blanc d'oeuf|blancs d'oeufs|lait\b|creme|beurre|yaourt|yogourt|fromage blanc|petit suisse|skyr|faisselle|margarine|chantilly|creme fraiche/],
  ['fruits-legumes', /pomme de terre|patate|carotte|oignon|echalote|ail\b|tomate|courgette|aubergine|poivron|concombre|salade|laitue|mache|roquette|epinard|chou|brocoli|poireau|celeri|navet|radis|betterave|haricots verts|petits pois|pois gourmands|fenouil|artichaut|asperge|champignon|potiron|potimarron|butternut|courge|endive|blette|avocat|citron|orange|pomme|poire|banane|fraise|framboise|myrtille|cerise|abricot|peche|nectarine|prune|raisin|kiwi|ananas|mangue|melon|pastèque|pasteque|clementine|mandarine|pamplemousse|grenade|figue|rhubarbe|persil|ciboulette|coriandre|basilic|menthe|estragon|aneth|cerfeuil|romarin|thym\b|sauge|gingembre|piment frais|citronnelle|fruit|legume|herbes? fraiches|mesclun|cresson|panais|topinambour|patate douce|edamame|soja frais|germes/],
  ['maison', /papier|essuie|sac poubelle|lessive|liquide vaisselle|eponge|savon|shampo|dentifrice|mouchoir|aluminium|film alimentaire|papier cuisson/],
];

/** Rayon deviné d'après le nom ; `overrides` : { clé d'ingrédient: rayon } choisis par la famille. */
export function guessAisle(name, overrides = {}, key = ingredientKey(name)) {
  if (overrides[key]) return overrides[key];
  const n = normalizeText(name);
  for (const [id, re] of RULES) if (re.test(n)) return id;
  return 'autre';
}

const KEEP_S = new Set(['ananas', 'anchois', 'gras', 'jus', 'mais', 'noix', 'pois', 'radis', 'riz', 'avis', 'frais', 'bras', 'cassis', 'brebis', 'pancetta', 'paris', 'gros', 'tapas', 'couscous', 'bas', 'dos', 'puis', 'sans', 'sous', 'plus', 'tres', 'moins']);

function singular(word) {
  if (word.length <= 3 || KEEP_S.has(word)) return word;
  if (word.endsWith('eaux')) return word.slice(0, -1);
  if (word.endsWith('aux') && !word.endsWith('eaux')) return `${word.slice(0, -3)}al`;
  if (/[sx]$/.test(word)) return word.slice(0, -1);
  return word;
}

/**
 * Clé d'un ingrédient pour additionner les quantités : minuscules, sans
 * accents, au singulier, sans les précisions entre parenthèses.
 * « Œufs » = « oeuf » ; « Carottes » = « carotte ».
 */
export function ingredientKey(name) {
  return normalizeText(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
    .trim();
}

// Ingrédients de base qu'on a presque toujours : regroupés à part.
const STAPLES = /^(?:sel|poivre|sel et poivre|sel poivre|poivre du moulin|fleur de sel|gros sel|sel fin|eau|eau froide|eau chaude|eau tiede|eau bouillante|glacon|huile|huile d'olive|huile de tournesol|huile neutre|filet d'huile|un peu d'huile)$/;

export function isStaple(name) {
  return STAPLES.test(ingredientKey(name));
}
