// Normalisation de l'URL du projet Supabase.
//
// Le cas couvert est celui qui se produit réellement : on copie l'URL de l'API
// REST affichée par le tableau de bord, et le client attend l'URL du projet.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normaliserUrlSupabase, premierNonVide } from '@/lib/configSupabase';

const PROJET = 'https://ebyjqlujcvhoopguxkaw.supabase.co';

test('l’URL de l’API REST est ramenée à celle du projet', () => {
  // C'est la forme affichée par le tableau de bord, et celle qu'on copie.
  assert.equal(
    normaliserUrlSupabase('https://ebyjqlujcvhoopguxkaw.supabase.co/rest/v1/'),
    PROJET
  );
  assert.equal(
    normaliserUrlSupabase('https://ebyjqlujcvhoopguxkaw.supabase.co/rest/v1'),
    PROJET
  );
});

test('les autres suffixes d’API connus sont retirés eux aussi', () => {
  for (const suffixe of ['/auth/v1', '/storage/v1', '/graphql/v1', '/realtime/v1']) {
    assert.equal(
      normaliserUrlSupabase(`${PROJET}${suffixe}`),
      PROJET,
      `suffixe ${suffixe} non retiré`
    );
    assert.equal(
      normaliserUrlSupabase(`${PROJET}${suffixe}/`),
      PROJET,
      `suffixe ${suffixe} avec barre finale non retiré`
    );
  }
});

test('des suffixes empilés sont tous retirés', () => {
  // Le cas d'une URL déjà passée par une première normalisation, puis
  // complétée à la main.
  assert.equal(normaliserUrlSupabase(`${PROJET}/rest/v1/auth/v1`), PROJET);
});

test('une URL déjà correcte n’est pas modifiée', () => {
  assert.equal(normaliserUrlSupabase(PROJET), PROJET);
  assert.equal(normaliserUrlSupabase(`${PROJET}/`), PROJET);
});

test('un schéma absent est complété en https', () => {
  // Une référence de projet recopiée seule : sans schéma, `fetch` échouerait
  // sur une URL relative, sans message exploitable.
  assert.equal(normaliserUrlSupabase('ebyjqlujcvhoopguxkaw.supabase.co'), PROJET);
  assert.equal(
    normaliserUrlSupabase('ebyjqlujcvhoopguxkaw.supabase.co/rest/v1/'),
    PROJET
  );
});

test('un schéma explicite est respecté', () => {
  // Utile pour un projet Supabase auto-hébergé, en clair sur un réseau local.
  assert.equal(
    normaliserUrlSupabase('http://localhost:8000/rest/v1/'),
    'http://localhost:8000'
  );
});

test('les espaces autour sont ignorés', () => {
  assert.equal(normaliserUrlSupabase(`  ${PROJET}/rest/v1/  `), PROJET);
});

test('une entrée vide ou absente rend une chaîne vide', () => {
  // C'est ce que l'appelant interprète comme « non configuré ».
  for (const entree of ['', '   ', null, undefined]) {
    assert.equal(normaliserUrlSupabase(entree), '');
  }
});

test('une URL inattendue est rendue telle quelle, pas devinée', () => {
  // On ne retire que des suffixes connus : mieux vaut une URL intacte qui
  // échouera visiblement qu'une URL « réparée » qui échouera autrement.
  const inattendue = 'https://exemple.fr/mon/api';
  assert.equal(normaliserUrlSupabase(inattendue), inattendue);
});

// === Lecture des clés ===

test('une valeur vide ne l’emporte pas sur une valeur renseignée', () => {
  // C'est le défaut réel : `app.json` portait « supabaseUrl: "" ». Avec `??`,
  // cette chaîne vide — qui n'est pas nulle — aurait masqué la variable
  // d'environnement, et l'application se serait crue non configurée.
  assert.equal(premierNonVide('', 'https://projet.supabase.co'), 'https://projet.supabase.co');
  assert.equal(premierNonVide('   ', 'valeur'), 'valeur');
  assert.equal(premierNonVide(null, 'valeur'), 'valeur');
  assert.equal(premierNonVide(undefined, 'valeur'), 'valeur');
});

test('la première valeur renseignée l’emporte, dans l’ordre', () => {
  assert.equal(premierNonVide('a', 'b', 'c'), 'a');
  assert.equal(premierNonVide('', 'b', 'c'), 'b');
  assert.equal(premierNonVide('', '', 'c'), 'c');
});

test('les espaces autour sont retirés', () => {
  assert.equal(premierNonVide('  valeur  '), 'valeur');
});

test('aucune valeur renseignée rend une chaîne vide', () => {
  // C'est ce que l'appelant interprète comme « non configuré ».
  assert.equal(premierNonVide(), '');
  assert.equal(premierNonVide('', null, undefined, '  '), '');
});
