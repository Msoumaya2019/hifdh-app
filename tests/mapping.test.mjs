// Conversion entre l'instantané et les lignes distantes.
//
// Le risque couvert ici n'est pas une erreur visible mais une corruption
// silencieuse : une colonne mal nommée rend `undefined` sans rien signaler.
// L'aller-retour est donc la propriété centrale.

import test from 'node:test';
import assert from 'node:assert/strict';

import { versLignes, depuisLignes } from '@/lib/sync/mapping';
import { validerSnapshot, VERSION_INSTANTANE } from '@/lib/sync/snapshot';

const MAINTENANT = new Date(2026, 8, 22, 10, 0);

const CONFIG = {
  memorizedPassages: [],
  objective: { type: 'full_quran' },
  schedule: { unit: { type: 'verses', count: 5 }, days: [1, 2, 3, 4, 5] },
  onboardingCompleted: true,
};

function instantane(surcharge = {}) {
  return {
    version: VERSION_INSTANTANE,
    updatedAt: '2026-09-22T08:00:00.000Z',
    config: structuredClone(CONFIG),
    memorized: [
      { surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' },
      { surah: 112, startAyah: 1, endAyah: 4, level: 'needs_review' },
    ],
    sessions: [
      {
        id: 'session_1_0',
        date: '2026-09-22',
        surah: 2,
        startAyah: 1,
        endAyah: 5,
        unit: { type: 'verses', count: 5 },
        status: 'todo',
        createdAt: '2026-09-22T08:00:00.000Z',
      },
      {
        id: 'session_1_1',
        date: '2026-09-21',
        surah: 2,
        startAyah: 6,
        endAyah: 10,
        unit: { type: 'verses', count: 5 },
        status: 'completed',
        completedAt: '2026-09-21T19:30:00.000Z',
        createdAt: '2026-09-20T08:00:00.000Z',
      },
    ],
    reviews: [
      {
        id: 'review_session_1_1',
        surah: 2,
        startAyah: 6,
        endAyah: 10,
        level: 2,
        nextReviewDate: '2026-09-25',
        lastReviewedAt: '2026-09-21T19:30:00.000Z',
        reviewCount: 1,
        intervalDays: 3,
        createdAt: '2026-09-21T19:30:00.000Z',
      },
    ],
    ...surcharge,
  };
}

test('l’aller-retour par les lignes distantes rend exactement l’instantané', () => {
  const depart = instantane();
  const retrouve = depuisLignes(versLignes(depart), MAINTENANT);

  assert.deepEqual(
    {
      config: retrouve.config,
      memorized: retrouve.memorized,
      sessions: retrouve.sessions,
      reviews: retrouve.reviews,
    },
    {
      config: depart.config,
      memorized: depart.memorized,
      sessions: depart.sessions,
      reviews: depart.reviews,
    }
  );
});

test('l’instantané reconstruit reste valide au regard de la validation', () => {
  const resultat = validerSnapshot(depuisLignes(versLignes(instantane()), MAINTENANT));
  assert.equal(resultat.ok, true, JSON.stringify(resultat.problemes ?? []));
});

test('les colonnes portent bien les noms attendus par le schéma', () => {
  // Un renommage ici ne casserait rien visiblement : la valeur vaudrait
  // simplement `undefined`. On fixe donc les noms explicitement.
  const lignes = versLignes(instantane());

  assert.deepEqual(Object.keys(lignes.sessions[0]).sort(), [
    'completed_at',
    'created_at',
    'date',
    'end_ayah',
    'id',
    'start_ayah',
    'status',
    'surah',
    'unit_json',
  ]);
  assert.deepEqual(Object.keys(lignes.memorized[0]).sort(), [
    'end_ayah',
    'level',
    'start_ayah',
    'surah',
  ]);
  assert.deepEqual(Object.keys(lignes.reviews[0]).sort(), [
    'created_at',
    'end_ayah',
    'id',
    'interval_days',
    'last_reviewed_at',
    'level',
    'next_review_date',
    'review_count',
    'start_ayah',
    'surah',
  ]);
});

test('une séance non terminée n’a pas de clé « completedAt »', () => {
  // `{ completedAt: undefined }` n'est pas équivalent à une clé absente : la
  // comparaison d'aller-retour le verrait, et un écran pourrait afficher
  // « terminée le undefined ».
  const retrouve = depuisLignes(versLignes(instantane()), MAINTENANT);
  assert.ok(!('completedAt' in retrouve.sessions[0]));
  assert.equal(retrouve.sessions[1].completedAt, '2026-09-21T19:30:00.000Z');
});

test('un élément de révision jamais révisé n’a pas de clé « lastReviewedAt »', () => {
  const depart = instantane({
    reviews: [
      {
        id: 'review_1',
        surah: 1,
        startAyah: 1,
        endAyah: 7,
        level: 0,
        nextReviewDate: '2026-09-22',
        reviewCount: 0,
        intervalDays: 1,
        createdAt: '2026-09-22T08:00:00.000Z',
      },
    ],
  });

  const retrouve = depuisLignes(versLignes(depart), MAINTENANT);
  assert.ok(!('lastReviewedAt' in retrouve.reviews[0]));
});

test('une date sérialisée en horodatage complet est ramenée au jour', () => {
  const lignes = versLignes(instantane());
  lignes.sessions[0].date = '2026-09-22T00:00:00+02:00';

  const retrouve = depuisLignes(lignes, MAINTENANT);
  assert.equal(retrouve.sessions[0].date, '2026-09-22');
});

test('les nombres restent des nombres, pas des chaînes', () => {
  // PostgREST peut sérialiser un entier en chaîne selon le type de colonne :
  // on le vérifie, parce qu'un « 5 » en texte casserait les comparaisons de
  // versets sans rien lever.
  const retrouve = depuisLignes(versLignes(instantane()), MAINTENANT);
  assert.equal(typeof retrouve.sessions[0].surah, 'number');
  assert.equal(typeof retrouve.sessions[0].startAyah, 'number');
  assert.equal(typeof retrouve.memorized[0].endAyah, 'number');
  assert.equal(typeof retrouve.reviews[0].reviewCount, 'number');
  assert.equal(typeof retrouve.reviews[0].level, 'number');
});

test('des nombres reçus en texte sont convertis, pas recopiés', () => {
  const lignes = versLignes(instantane());
  lignes.sessions[0].surah = '2';
  lignes.sessions[0].start_ayah = '1';
  lignes.sessions[0].end_ayah = '5';
  lignes.reviews[0].level = '2';

  const retrouve = depuisLignes(lignes, MAINTENANT);
  assert.equal(retrouve.sessions[0].surah, 2);
  assert.equal(retrouve.sessions[0].endAyah, 5);
  assert.equal(retrouve.reviews[0].level, 2);
});

test('un instantané vide traverse la conversion sans erreur', () => {
  const vide = instantane({ config: null, memorized: [], sessions: [], reviews: [] });
  const retrouve = depuisLignes(versLignes(vide), MAINTENANT);

  assert.equal(retrouve.config, null);
  assert.deepEqual(retrouve.sessions, []);
  assert.deepEqual(retrouve.memorized, []);
  assert.deepEqual(retrouve.reviews, []);
});

test('une configuration absente reste nulle plutôt que de devenir un objet vide', () => {
  // La nuance compte : `estVide` traite « pas de configuration » comme
  // « appareil vierge », et une configuration vide le rendrait non vierge.
  const lignes = versLignes(instantane({ config: null }));
  assert.equal(lignes.config, null);
  assert.equal(depuisLignes(lignes, MAINTENANT).config, null);
});
