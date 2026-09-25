// Toute route écrite dans le code doit exister — et toute route déclarée doit
// être atteignable, ou l'assumer par écrit.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Le projet a `experiments.typedRoutes: true`, et l'on pourrait croire que
// `tsc` suffit. Il ne suffit pas, et c'est mesuré : les types de routes sont
// ENGENDRÉS par le serveur de développement d'Expo, dans `.expo/types/router.d.ts`
// — un dossier que `.gitignore` exclut (`.expo/`). En intégration continue, ce
// fichier **n'existe pas** : `tsconfig.json` l'inclut, mais un `include` qui ne
// désigne rien n'est pas une erreur, et expo-router retombe alors sur un type
// permissif. **Aucune route n'y est donc jamais vérifiée.**
//
// En local, la situation est pire d'une autre façon : le fichier existe, mais il
// date du dernier `expo start`. Une route ajoutée depuis échoue au typecheck
// alors qu'elle est juste, et une route SUPPRIMÉE depuis continue de passer
// alors qu'elle est morte. C'est exactement ce qui s'est produit en déplaçant
// `profil` et `amis` : le fichier engendré listait encore l'ancienne disposition.
//
// Ce test lit donc les DEUX côtés — les routes que le code réclame, et les
// fichiers qui existent — et exige qu'ils s'accordent. Il ne dépend d'aucun
// fichier engendré, donc il dit la même chose en local et en intégration
// continue.
//
// LES QUATRE FORMES RECONNUES, ET POURQUOI LES QUATRE
// ---------------------------------------------------
// `router.push('/x')`, `router.push({ pathname: '/x', … })` — cette seconde
// forme est multiligne à l'accueil, donc une recherche ligne à ligne la
// manquerait —, `href="/x"` et `destination="/x"`. La quatrième a été ajoutée
// après avoir constaté qu'elle manquait : `/profil-public` n'est atteint que par
// un accessoire `destination`, et le premier scanneur ne le voyait pas.
//
// CE QU'IL NE PROUVE PAS
// ----------------------
// Il ne suit pas les routes construites dynamiquement — un chemin assemblé par
// concaténation ou interpolation lui échappe, et c'est écrit ici pour qu'on ne
// le lui fasse pas dire. Il ne dit rien non plus de la FORME des paramètres
// attendus par l'écran visé : `/discussion` existe, mais rien ne vérifie ici
// qu'il reçoit bien un `amiId`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/** Les dossiers où du code peut écrire une route. */
const SOURCES = ['app', 'src'];

/** Le dossier des routes. */
const DOSSIER_ROUTES = 'app';

/** Les fichiers de route ne sont pas des écrans : ils ne naviguent pas. */
const IGNORES = new Set(['_layout.tsx', '+not-found.tsx']);

/**
 * Les routes qui ne sont JAMAIS nommées par du code, et qui ont une raison.
 *
 * Le test refuse toute autre route jamais nommée : un écran que rien n'ouvre est
 * un écran mort, et c'est exactement ce qu'un déplacement d'écran laisse
 * derrière lui sans que rien ne le signale.
 */
const ATTEINTES_AUTREMENT = new Map([
  ['/progres', 'un onglet : c’est la barre qui le nomme, pas une chaîne de route'],
  ['/lien', 'un lien de courriel (hifdh://lien), déclaré dans `app.json`'],
]);

function fichiers(racine, chemin) {
  const trouves = [];
  for (const entree of readdirSync(join(racine, chemin))) {
    const relatif = join(chemin, entree);
    const stat = statSync(join(racine, relatif));
    if (stat.isDirectory()) {
      trouves.push(...fichiers(racine, relatif));
    } else if (/\.(ts|tsx)$/.test(entree)) {
      trouves.push(relatif);
    }
  }
  return trouves;
}

/**
 * Les routes que les FICHIERS déclarent.
 *
 * Un groupe `(tabs)` ne fait pas partie de l'URL : il se retire. `index` désigne
 * le chemin de son dossier, pas un segment « index ». Un fichier dont le nom
 * porte des crochets est une route dynamique : elle se compare autrement, on la
 * laisse de côté et on refuse d'en trouver — plutôt que de la contourner en
 * silence le jour où il en apparaît une.
 */
function routesDesFichiers() {
  const routes = new Set();
  const dynamiques = [];

  for (const chemin of fichiers(RACINE, DOSSIER_ROUTES)) {
    const nom = chemin.split(sep).pop();
    if (IGNORES.has(nom)) continue;
    if (nom.includes('[')) {
      dynamiques.push(chemin);
      continue;
    }

    const segments = relative(DOSSIER_ROUTES, chemin)
      .split(sep)
      .filter((s) => !s.startsWith('('))
      .join('/')
      .replace(/\.(ts|tsx)$/, '')
      .replace(/\/?index$/, '');

    routes.add('/' + segments);
  }

  return { routes, dynamiques };
}

/** La forme comparable d'une route écrite : les groupes se retirent. */
const normaliser = (chemin) =>
  '/' +
  chemin
    .split('/')
    .filter((s) => s.length > 0 && !s.startsWith('('))
    .join('/');

/** Les routes que le CODE réclame, fichier par fichier. */
function routesReclamees() {
  const MOTIFS = [
    // `router.push('/x')` et `router.push({\n  pathname: '/x', … })`.
    /router\.(?:push|replace|navigate)\(\s*(?:\{\s*pathname:\s*)?'([^']+)'/g,
    // Les accessoires : `<Link href="/x">`, `destination="/x"`.
    /(?:href|destination)=["'](\/[^"']*)["']/g,
  ];

  const trouvees = [];
  for (const dossier of SOURCES) {
    for (const chemin of fichiers(RACINE, dossier)) {
      const source = readFileSync(join(RACINE, chemin), 'utf8');
      for (const motif of MOTIFS) {
        for (const m of source.matchAll(motif)) {
          trouvees.push({ chemin, route: m[1] });
        }
      }
    }
  }
  return trouvees;
}

test('les routes réclamées par le code existent toutes', () => {
  const { routes } = routesDesFichiers();
  const reclamees = routesReclamees();

  assert.ok(
    reclamees.length > 0,
    'aucune route réclamée : le motif ne désigne plus rien, et ce test ne '
      + 'mesurerait plus rien'
  );

  const inconnues = reclamees
    .filter(({ route }) => !routes.has(normaliser(route)))
    .map(({ chemin, route }) => `${chemin} : « ${route} »`);

  assert.deepEqual(
    inconnues,
    [],
    `route(s) réclamée(s) sans fichier correspondant :\n  ${inconnues.join('\n  ')}`
  );
});

test('aucun écran n’est laissé sans chemin pour l’ouvrir', () => {
  const { routes, dynamiques } = routesDesFichiers();
  const reclamees = new Set(routesReclamees().map(({ route }) => normaliser(route)));

  const jamaisNommees = [...routes]
    .filter((r) => !reclamees.has(r))
    .sort();

  // La comparaison est EXACTE, dans les deux sens : une route oubliée fait
  // échouer le test, et une route de la liste qui se met à être nommée le fait
  // échouer aussi — sinon la liste se remplirait de justifications périmées.
  assert.deepEqual(
    jamaisNommees,
    [...ATTEINTES_AUTREMENT.keys()].sort(),
    'la liste des routes atteintes autrement ne correspond plus au réel. '
      + 'Une route jamais nommée est un écran mort ; une entrée de la liste qui '
      + 'est désormais nommée est une justification périmée.'
  );

  assert.deepEqual(
    dynamiques,
    [],
    'des routes dynamiques sont apparues : elles ne sont pas comparées par ce '
      + 'test, qui doit alors être étendu plutôt que contourné'
  );
});
