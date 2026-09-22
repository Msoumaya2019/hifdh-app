// Chargeur de résolution pour `node --test`.
//
// Trois rôles :
//   1. résoudre les alias `@/` (vers src/) et `@data/` (vers data/), que Metro
//      lit dans tsconfig.json mais que Node ignore ;
//   2. compléter les extensions absentes des imports relatifs internes
//      (`./programGenerator` -> `./programGenerator.ts`), qu'un empaqueteur
//      accepte et que Node refuse ;
//   3. charger les `.json` comme des modules, ce que Node exige avec un
//      attribut d'import que le code de l'application n'écrit pas.

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
