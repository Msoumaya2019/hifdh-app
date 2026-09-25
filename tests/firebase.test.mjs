// Accord entre l'identifiant d'application Android et son projet Firebase.
//
// POURQUOI CE TEST EXISTE
// -----------------------
// Les notifications Android exigent que l'identifiant de paquet déclaré dans
// `app.json` soit EXACTEMENT celui de l'application enregistrée dans Firebase,
// c'est-à-dire celui de `google-services.json`. Les deux fichiers portent la
// même vérité, ne peuvent pas se lire entre eux, et **rien ne le signale quand
// ils divergent**.
//
// Ce que produit un désaccord, mesuré et décrit dans `docs/notifications-push.md`
// § 4.3 : Firebase répond au téléphone
//
//     403 PERMISSION_DENIED: Requests from this Android client application are
//     blocked
//
// et l'application ne reçoit **jamais** de jeton. Le symptôme est un écran de
// réglages qui affiche une erreur technique sans dire pourquoi — aucune
// compilation n'a échoué, aucun contrôle n'a rougi. C'est précisément le genre
// de panne silencieuse qu'un test doit transformer en échec bruyant.
//
// CE QUI EST ÉPROUVÉ
// ------------------
// 1. le paquet d'`app.json` est celui d'un client de `google-services.json` ;
// 2. le fichier est bien déclaré (`android.googleServicesFile`), sans quoi Expo
//    ne l'empaquette pas et la compilation Android reste verte **sans** le
//    projet Firebase — donc sans notifications ;
// 3. le fichier déclaré existe réellement sur le disque ;
// 4. le projet porte un identifiant, celui qu'on cite au diagnostic.
//
// CE QUI N'EST PAS ÉPROUVÉ ICI
// ----------------------------
// Que les notifications **arrivent**. Ce test tient un accord entre deux
// fichiers ; il ne remplace pas un envoi réel, et ne prétend pas le faire.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Lire un JSON du dépôt, depuis la racine. */
const lire = (nom) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../${nom}`, import.meta.url)), 'utf8'));

/** Le chemin, depuis la racine, du fichier déclaré dans `app.json`. */
const cheminDeclare = () =>
  lire('app.json').expo.android?.googleServicesFile ?? null;

test('le paquet d’app.json est bien celui enregistré dans Firebase', () => {
  const paquet = lire('app.json').expo.android?.package;
  assert.ok(paquet, "app.json ne déclare pas android.package");

  const firebase = lire('google-services.json');
  const paquets = (firebase.client ?? []).map(
    (c) => c?.client_info?.android_client_info?.package_name
  );

  assert.ok(
    paquets.length > 0,
    'google-services.json ne porte aucun client Android : il a peut-être été ' +
      'téléchargé pour un autre type d’application, ou vidé'
  );

  assert.ok(
    paquets.includes(paquet),
    `app.json déclare le paquet ${paquet}, que google-services.json ne connaît ` +
      `pas (il porte : ${paquets.join(', ')}). Firebase refuserait chaque ` +
      'tentative de jeton avec « 403 PERMISSION_DENIED », et l’application ' +
      'n’aurait jamais de notification Android, sans qu’aucune compilation échoue.'
  );
});

test('app.json déclare le fichier Firebase dans le bloc Android', () => {
  // Sans cette déclaration, `expo prebuild` ne lit pas le fichier : la
  // compilation réussit, le projet Firebase est absent du binaire, et il n'y a
  // aucun jeton. Le défaut ne se voit qu'à l'usage.
  assert.ok(
    cheminDeclare() !== null,
    "app.json ne déclare pas android.googleServicesFile : la compilation ne " +
      'lirait pas google-services.json, et Android ne recevrait aucun jeton'
  );
});

test('le fichier Firebase déclaré existe sur le disque', () => {
  const chemin = cheminDeclare();
  if (chemin === null) return; // le test précédent dit déjà quoi faire
  const absolu = fileURLToPath(new URL(`../${chemin}`, import.meta.url));
  assert.ok(
    existsSync(absolu),
    `app.json déclare ${chemin}, qui n’existe pas : la compilation échouerait ` +
      'sur un fichier absent, ou l’ignorerait si Expo tolère l’absence'
  );
});

test('le projet Firebase a un identifiant, et il est lisible', () => {
  // L'identifiant n'est pas nécessaire à la compilation, mais il est la
  // première chose qu'on demande au diagnostic : « quel projet Firebase ? ».
  // Un fichier sans identifiant ne viendrait pas de la console Firebase.
  const projet = lire('google-services.json').project_info?.project_id;
  assert.ok(
    typeof projet === 'string' && projet.length > 0,
    'google-services.json ne porte pas de project_info.project_id : ' +
      'le diagnostic ne pourrait pas nommer le projet Firebase utilisé'
  );
});
