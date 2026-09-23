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
// À lancer après avoir ajouté ou renommé un fichier dans `app/`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Le générateur lit les routes par un `require.context` simulé, dont la racine
// vient de cette variable. Le serveur la pose ; sans elle, il n'énumère rien et
// écrit un fichier vide — donc un cache qui a l'air régénéré et ne l'est pas.
process.env.EXPO_ROUTER_APP_ROOT = path.join(racine, 'app');

const { regenerateDeclarations } = await import('expo-router/build/typed-routes/index.js');

const sortie = path.join(racine, '.expo', 'types');
regenerateDeclarations(sortie);

// `regenerateDeclarations` est **temporisée** (un délai d'une seconde) : elle
// rend la main tout de suite et écrit plus tard. Attendre ici est donc
// nécessaire — sans quoi le script se terminerait avant l'écriture, et le
// fichier resterait tel qu'avant sans que rien ne le dise.
await new Promise((resoudre) => setTimeout(resoudre, 2000));

const { readFileSync } = await import('node:fs');
const fichier = path.join(sortie, 'router.d.ts');
const contenu = readFileSync(fichier, 'utf8');

const routes = [...contenu.matchAll(/pathname: `([^`]+)`/g)].map((m) => m[1]);
const uniques = [...new Set(routes)].sort();

console.log(`${fichier} : ${contenu.length} octets`);
console.log(`${uniques.length} routes :`);
for (const route of uniques) console.log(`  ${route}`);
