// Les doublures de modules, vues du côté d'un test.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `src/lib/sync/discussion.ts` lit son client (`@/lib/supabase`) et sa session
// (`@/lib/auth`) par des imports statiques. Pour l'éprouver sans réseau, il
// faut donc substituer ces deux modules — et `mock.module` de `node:test` ne
// le permet pas ici : la substitution n'agit que sur un module **non encore
// chargé**, or l'import statique en tête du fichier de test compte comme ce
// premier chargement. Il faudrait n'écrire aucun `import` et tout passer par
// `await import()`, ce qui rendrait le fichier illisible.
//
// On passe donc par le chargeur, qui décide quelle SOURCE sert une URL — un
// pouvoir que `mock.module` n'a pas.
//
// POURQUOI LE DÉPÔT PASSE PAR LE DISQUE, ET NON PAR UN `Map` EXPORTÉ
// ------------------------------------------------------------------
// La première écriture posait ici un `Map` que le chargeur importait. Elle ne
// marchait pas : **`--import` instancie le chargeur dans un contexte séparé**,
// si bien que ce fichier était évalué DEUX fois — une fois pour le test, une
// fois pour le chargeur. Les deux `Map` étaient distincts, la doublure posée
// par le test restait invisible au chargeur, et le test échouait sur un module
// React Native non transpilé, à cent lieues de la cause.
//
// Un état partagé entre deux contextes passe donc par le DISQUE. `poserDoublure`
// écrit le fichier, le chargeur le relit à chaque `load`. C'est quelques
// lectures de plus par exécution, et c'est la seule forme qui marche.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = new URL('..', import.meta.url);

// Le même chemin que celui lu par `alias-loader.mjs`. Les deux constantes sont
// écrites séparément, faute d'état partagé possible — mais elles portent le
// même nom de fichier, et le dépôt est ignoré par git.
//
// LE NOM PORTE LE PID DU PROCESSUS, et ce n'est pas un détail. `node --test`
// ouvre un processus par fichier de test, et deux fichiers écrivent ce dépôt :
// chacun relit, modifie, réécrit — et `writeFileSync` tronque avant d'écrire.
// Deux écrivains concurrents se font donc perdre leurs entrées, et un lecteur
// peut tomber sur un fichier à moitié réécrit. Les deux défauts ont été
// observés ensemble : « Unexpected non-whitespace character after JSON » sur
// les vingt tests de deux fichiers lancés côte à côte, et des doublures qui
// disparaissent — parce que `retirerToutesLesDoublures` SUPPRIME le fichier en
// sortie de test, effaçant du même coup celles de l'autre processus.
//
// Mesuré : les deux fichiers ensemble donnaient 20 échecs sur 40 ; chacun seul,
// 31/31 et 9/9. Un nom par processus sépare les écrivains sans rien changer
// d'autre — `--import` évalue le chargeur dans le MÊME processus que le test,
// donc les deux côtés calculent le même nom.
const NOM_DEPOT = `doublures-deposees.${process.pid}.json`;
const DEPOT = new URL(`./${NOM_DEPOT}`, import.meta.url);

/** L'URL absolue d'un fichier du dépôt, telle que le chargeur la verra. */
export function urlDe(cheminRelatif) {
  return pathToFileURL(fileURLToPath(new URL(cheminRelatif, RACINE))).href;
}

/** Le dépôt tel qu'il est sur le disque : `{ url: { source } }`. */
export function lireDepot() {
  if (!existsSync(DEPOT)) return {};
  const texte = readFileSync(DEPOT, 'utf8').trim();
  return texte === '' ? {} : JSON.parse(texte);
}

function ecrireDepot(depot) {
  writeFileSync(DEPOT, JSON.stringify(depot, null, 2), 'utf8');
}

/** Pose une doublure : `source` est le texte du module qui sera servi. */
export function poserDoublure(cheminRelatif, source) {
  const depot = lireDepot();
  depot[urlDe(cheminRelatif)] = { source };
  ecrireDepot(depot);
}

/** Retire une doublure. */
export function retirerDoublure(cheminRelatif) {
  const depot = lireDepot();
  delete depot[urlDe(cheminRelatif)];
  ecrireDepot(depot);
}

/** Retire toutes les doublures. À appeler en sortie de test, et par le harnais. */
export function retirerToutesLesDoublures() {
  if (existsSync(DEPOT)) rmSync(DEPOT, { force: true });
}

/**
 * La doublure du client Supabase.
 *
 * Le faux est posé dans `globalThis` et la source le lit à l'appel : c'est ce
 * qui permet de changer la réponse entre deux tests sans recharger le module.
 * Le nom est préfixé pour ne pas se confondre avec une globale de l'application.
 */
export const CLE_FAUX_CLIENT = '__hifdhFauxClient';

export function poserFauxClient(client) {
  globalThis[CLE_FAUX_CLIENT] = client;
  poserDoublure(
    'src/lib/supabase.ts',
    `// Doublure : le client est celui que le test a posé dans globalThis.
export function getClientDonnees() {
  return globalThis.${CLE_FAUX_CLIENT} ?? null;
}
export function getSupabase() {
  return globalThis.${CLE_FAUX_CLIENT} ?? null;
}
export function isSupabaseConfigured() {
  return globalThis.${CLE_FAUX_CLIENT} !== null;
}
`
  );
}

/**
 * La doublure de la session.
 *
 * `utilisateurCourant` est déclarée `async` et `await` la valeur posée : le
 * test peut donc y mettre une promesse qui ne rend JAMAIS, ce qui est le seul
 * moyen d'atteindre réellement le délai dépassé.
 */
export const CLE_FAUSSE_SESSION = '__hifdhFausseSession';

export function poserFausseSession(valeur) {
  globalThis[CLE_FAUSSE_SESSION] = valeur;
  poserDoublure(
    'src/lib/auth.ts',
    `// Doublure : la session vient de globalThis.
export async function utilisateurCourant() {
  return await globalThis.${CLE_FAUSSE_SESSION};
}
export async function seDeconnecter() {}
export function ecouterSession() { return () => {}; }
export const LONGUEUR_MOT_DE_PASSE = 6;
`
  );
}

/** Retire les deux doublures, et les valeurs globales qu'elles lisent. */
export function retirerDoublures() {
  retirerDoublure('src/lib/supabase.ts');
  retirerDoublure('src/lib/auth.ts');
  delete globalThis[CLE_FAUX_CLIENT];
  delete globalThis[CLE_FAUSSE_SESSION];
}
