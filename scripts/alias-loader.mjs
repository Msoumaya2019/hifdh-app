// Chargeur de résolution pour `node --test`.
//
// Quatre rôles :
//   1. résoudre les alias `@/` (vers src/) et `@data/` (vers data/), que Metro
//      lit dans tsconfig.json mais que Node ignore ;
//   2. compléter les extensions absentes des imports relatifs internes
//      (`./programGenerator` -> `./programGenerator.ts`), qu'un empaqueteur
//      accepte et que Node refuse ;
//   3. charger les `.json` comme des modules, ce que Node exige avec un
//      attribut d'import que le code de l'application n'écrit pas ;
//   4. servir une doublure déposée sur disque par le test en cours, à la place
//      du vrai module — le détail, et pourquoi le disque plutôt qu'un `Map`,
//      est dit à `DEPOT_DOUBLURES` plus bas.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = new URL('..', import.meta.url);

const RACINES_ALIAS = [
  ['@/', new URL('src/', RACINE)],
  ['@data/', new URL('data/', RACINE)],
];

const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];

// Une entrée par paquet, jamais un préfixe : une règle trop large remplacerait
// en silence un paquet qu'on voulait réellement charger.
const DOUBLURES = new Map([
  ['expo-sqlite', './stubs/expo-sqlite.mjs'],
]);

/**
 * Le fichier où les tests déposent leurs doublures, et où le chargeur les lit.
 *
 * POURQUOI UN FICHIER, ET NON UN `Map` PARTAGÉ
 * --------------------------------------------
 * La première écriture de ce mécanisme posait un `Map` exporté par
 * `doublures.mjs`, importé ici. Elle ne marchait pas, et la cause n'est pas
 * évidente : **`--import` instancie le chargeur dans un contexte séparé**, si
 * bien que `doublures.mjs` était évalué DEUX fois — une fois pour le test, une
 * fois pour le chargeur. Les deux `Map` étaient distincts, et la doublure posée
 * par le test était invisible ici. Le chargeur servait donc la vraie source, et
 * le test échouait sur un module React Native non transpilé, à cent lieues de
 * la cause.
 *
 * Un état partagé entre deux contextes doit donc passer par le DISQUE. Le
 * fichier est relu à chaque `load` : c'est ce qui rend la doublure visible dès
 * qu'elle est posée, sans dépendre de l'ordre des imports.
 *
 * Le nom porte le PID DU PROCESSUS. `node --test` ouvre un processus par
 * fichier de test, et deux fichiers qui écriraient le même dépôt se feraient
 * perdre mutuellement leurs entrées — un lecteur peut même tomber sur un
 * fichier à moitié réécrit. La raison complète, et la mesure, sont dans
 * `scripts/doublures.mjs`. Le chargeur étant évalué dans le MÊME processus que
 * le test, les deux côtés calculent le même nom.
 */
const NOM_DEPOT = `doublures-deposees.${process.pid}.json`;
const DEPOT_DOUBLURES = new URL(`./${NOM_DEPOT}`, import.meta.url);

/** Le registre des doublures, lu du disque. `{}` si rien n'a été déposé. */
function lireDepot() {
  try {
    if (!existsSync(DEPOT_DOUBLURES)) return {};
    const texte = readFileSync(DEPOT_DOUBLURES, 'utf8').trim();
    return texte === '' ? {} : JSON.parse(texte);
  } catch {
    // Un dépôt à moitié écrit ne doit pas faire échouer un chargement de
    // module : au pire, la doublure manque et le test le dira lui-même.
    return {};
  }
}

function doublurePour(url) {
  const sansRequete = url.split('?')[0];
  const depot = lireDepot();
  return depot[sansRequete] ?? depot[url] ?? null;
}

function resoudreFichier(baseUrl) {
  const chemin = fileURLToPath(baseUrl);
  for (const candidate of [chemin, ...EXTENSIONS.map((e) => `${chemin}${e}`)]) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

export function resolve(specifier, context, next) {
  const doublure = DOUBLURES.get(specifier);
  if (doublure !== undefined) {
    return next(new URL(doublure, import.meta.url).href, context);
  }

  for (const [prefixe, racine] of RACINES_ALIAS) {
    if (specifier.startsWith(prefixe)) {
      const cible = new URL(specifier.slice(prefixe.length), racine);
      const resolu = resoudreFichier(cible);
      if (resolu === null) {
        throw new Error(
          `Alias non résolu : « ${specifier} » (cherché sous ${fileURLToPath(cible)})`,
        );
      }
      return next(resolu, context);
    }
  }

  // Import relatif sans extension : fréquent dans le code de l'application.
  if (specifier.startsWith('.') && context.parentURL !== undefined) {
    const cible = new URL(specifier, context.parentURL);
    const resolu = resoudreFichier(cible);
    if (resolu !== null) {
      return next(resolu, context);
    }
  }

  return next(specifier, context);
}

export function load(url, context, next) {
  // Une doublure porte sa propre source : on la sert à la place du vrai
  // fichier, quelle que soit l'URL demandée. La clé est l'URL cible sans sa
  // chaîne de requête, pour qu'un `?t=…` de cache ne contourne pas la doublure.
  const doublure = doublurePour(url);
  if (doublure !== null) {
    return { format: 'module', shortCircuit: true, source: doublure.source };
  }

  if (url.endsWith('.json')) {
    // Les séparateurs de ligne Unicode sont valides en JSON mais pas dans une
    // chaîne JavaScript : on les échappe avant de réinjecter le contenu.
    const texte = readFileSync(fileURLToPath(url), 'utf8')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
    return { format: 'module', shortCircuit: true, source: `export default ${texte};` };
  }
  return next(url, context);
}
