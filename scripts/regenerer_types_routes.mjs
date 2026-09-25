// Regénère le fichier de types des routes d'Expo Router.
//
// POURQUOI CE SCRIPT EXISTE
// -------------------------
// `.expo/types/router.d.ts` est écrit par le serveur de développement d'Expo,
// et il est ignoré par Git — c'est un cache. Mais il est aussi **inclus dans la
// vérification de types** (`tsconfig.json`), et il n'est régénéré que pendant
// `expo start`, c'est-à-dire quand un client demande le paquet. Ajouter un écran
// puis lancer `tsc --noEmit` sans serveur fait donc échouer la vérification sur
// une route qui existe : le fichier de types, lui, ne le sait pas encore.
//
// La correction n'est pas d'assouplir la vérification, mais de **régénérer le
// cache**. Ce script appelle directement le générateur d'`expo-router` — celui
// que le serveur emploie — sans démarrer de serveur ni demander de paquet.
//
// LE DOSSIER DE SORTIE DOIT EXISTER, ET LE GÉNÉRATEUR NE LE CRÉE PAS
// -----------------------------------------------------------------
// C'est le défaut qui a rendu deux poussées rouges, et il est instructif :
// `regenerateDeclarations` écrit par `writeFileSync` sans créer le dossier
// parent. Sur un CLONE NEUF — où `.expo/` n'existe pas, puisqu'il est ignoré par
// Git — elle lève
//
//     ENOENT: no such file or directory, open '…/.expo/types/router.d.ts'
//
// En local, le dossier existait depuis un `expo start`, et le défaut restait
// donc invisible. C'est la même leçon que pour les types eux-mêmes : ce qui
// n'existe que par l'état de la machine ne se vérifie nulle part ailleurs.
//
// À lancer après avoir ajouté ou renommé un fichier dans `app/`.
//
// Usage : node scripts/regenerer_types_routes.mjs [dossier-de-sortie]

import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Le dossier de sortie se donne en argument, et c'est ce qui rend ce script
// ÉPROUVABLE : un test le pointe vers un dossier NEUF, pour reproduire l'état
// d'un clone — celui où `.expo/` n'existe pas encore. Sans cela, le seul moyen
// d'éprouver le défaut serait de casser le dépôt.
const sortie = process.argv[2] ? path.resolve(process.argv[2]) : path.join(racine, '.expo', 'types');

// Le générateur lit les routes par un `require.context` simulé, dont la racine
// vient de cette variable. Le serveur la pose ; sans elle, il n'énumère rien et
// écrit un fichier vide — donc un cache qui a l'air régénéré et ne l'est pas.
process.env.EXPO_ROUTER_APP_ROOT = path.join(racine, 'app');

const { regenerateDeclarations } = await import('expo-router/build/typed-routes/index.js');

const fichier = path.join(sortie, 'router.d.ts');
const avant = existsSync(fichier)
  ? { date: statSync(fichier).mtimeMs, taille: statSync(fichier).size }
  : null;

mkdirSync(sortie, { recursive: true });
regenerateDeclarations(sortie);

// `regenerateDeclarations` est **temporisée** (un délai d'une seconde) : elle
// rend la main tout de suite et écrit plus tard. On attend donc l'écriture —
// mais sur une ÉCHÉANCE, et en comparant la DATE DE MODIFICATION plutôt que la
// seule présence : là où le cache existe déjà, attendre sa présence rendrait la
// main immédiatement, sur le contenu PRÉCÉDENT — soit exactement le défaut que
// ce script existe pour corriger. Un `setTimeout` fixe ne dit rien non plus le
// jour où la machine est lente : il rend la main avant l'écriture.
const ECHEANCE_MS = 15000;
const echeance = Date.now() + ECHEANCE_MS;
let ecrit = false;

while (Date.now() < echeance) {
  await new Promise((resoudre) => setTimeout(resoudre, 100));
  if (!existsSync(fichier)) continue;

  const maintenant = statSync(fichier);
  const change =
    avant === null || maintenant.mtimeMs !== avant.date || maintenant.size !== avant.taille;
  if (change) {
    ecrit = true;
    break;
  }
}

if (!ecrit) {
  console.error(`Le generateur n'a pas ecrit ${fichier} en ${ECHEANCE_MS} ms.`);
  console.error(
    "Le cache n'a donc PAS ete regenere, et la verification de types lirait l'ancien : " +
      'mieux vaut echouer ici que passer au vert sur un cache perime.'
  );
  process.exit(1);
}

const contenu = readFileSync(fichier, 'utf8');

const routes = [...contenu.matchAll(/pathname: `([^`]+)`/g)].map((m) => m[1]);
const uniques = [...new Set(routes)].sort();

console.log(`${fichier} : ${contenu.length} octets`);
console.log(`${uniques.length} routes :`);
for (const route of uniques) console.log(`  ${route}`);
