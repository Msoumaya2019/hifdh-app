// Recalcul du programme après changement d'objectif ou de rythme.
//
// Deux propriétés portent tout : l'historique n'est jamais touché, et rien de ce
// qui reste à faire n'est perdu ni compté deux fois.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planifierRecalcul } from '@/lib/programGenerator';

const MAINTENANT = new Date(2026, 8, 22, 10, 0); // mardi 22 septembre 2026

function seance(id, date, status) {
  return {
    id,
    date,
    surah: 2,
    startAyah: 1,
    endAyah: 5,
    unit: { type: 'verses', count: 5 },
    status,
    createdAt: '',
  };
}

function config(objectif, memorises = []) {
  return {
    memorizedPassages: memorises,
    objective: objectif,
    schedule: { unit: { type: 'verses', count: 5 }, days: [0, 1, 2, 3, 4, 5, 6] },
    onboardingCompleted: true,
  };
}

const OBJECTIF = { type: 'custom', passages: [{ surah: 2, startAyah: 1, endAyah: 20 }] };

test('une séance terminée n\'est jamais supprimée : c\'est l\'historique', () => {
  const existantes = [
    seance('faite_hier', '2026-09-21', 'completed'),
    seance('faite_avant', '2026-09-15', 'completed'),
    seance('a_faire', '2026-09-23', 'todo'),
  ];

  const plan = planifierRecalcul(config(OBJECTIF), existantes, [], MAINTENANT);

  assert.deepEqual(plan.aSupprimer, ['a_faire']);
});

test('toute séance non terminée est remplacée, y compris en retard', () => {
  // Une séance en retard porte sur des versets non mémorisés : les conserver
  // ferait doublon avec le nouveau programme, qui les replanifie depuis
  // aujourd'hui.
  const existantes = [
    seance('en_retard', '2026-09-01', 'todo'),
    seance('aujourd_hui', '2026-09-22', 'todo'),
    seance('a_venir', '2026-10-01', 'todo'),
  ];

  const plan = planifierRecalcul(config(OBJECTIF), existantes, [], MAINTENANT);

  assert.deepEqual(plan.aSupprimer.sort(), ['a_venir', 'aujourd_hui', 'en_retard']);
});

test('les passages mémorisés sont lus dans la base, pas dans la configuration', () => {
  // La configuration n'est écrite qu'à l'onboarding ; terminer une séance ajoute
  // un passage en base. Se fier à `config.memorizedPassages` replanifierait des
  // versets déjà appris.
  const memorisesEnBase = [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }];
  const configPerimee = config(OBJECTIF, []); // configuration vide, comme après des séances

  const plan = planifierRecalcul(configPerimee, [], memorisesEnBase, MAINTENANT);

  const couverts = plan.aCreer.flatMap((s) =>
    Array.from({ length: s.endAyah - s.startAyah + 1 }, (_, i) => s.startAyah + i),
  );

  assert.deepEqual(couverts, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'des versets déjà appris sont replanifiés');
});

test('le recalcul ne produit aucun doublon de date et de sourate', () => {
  const existantes = [seance('a_venir', '2026-09-23', 'todo')];
  const plan = planifierRecalcul(config(OBJECTIF), existantes, [], MAINTENANT);

  const couples = plan.aCreer.map((s) => `${s.date}|${s.surah}`);
  assert.equal(new Set(couples).size, couples.length, 'deux séances partagent la même date et la même sourate');
});

test('le recalcul est idempotent : deux exécutions donnent le même plan', () => {
  const existantes = [seance('faite', '2026-09-20', 'completed'), seance('a_faire', '2026-09-23', 'todo')];

  const premier = planifierRecalcul(config(OBJECTIF), existantes, [], MAINTENANT);
  const second = planifierRecalcul(config(OBJECTIF), existantes, [], MAINTENANT);

  assert.deepEqual(second.aSupprimer, premier.aSupprimer);
  assert.deepEqual(
    second.aCreer.map((s) => `${s.id}|${s.date}|${s.surah}|${s.startAyah}|${s.endAyah}`),
    premier.aCreer.map((s) => `${s.id}|${s.date}|${s.surah}|${s.startAyah}|${s.endAyah}`),
  );
});

test('un objectif entièrement mémorisé ne recrée rien et efface l\'avenir', () => {
  const existantes = [seance('a_faire', '2026-09-23', 'todo')];
  const memorises = [{ surah: 2, startAyah: 1, endAyah: 20, level: 'perfect' }];

  const plan = planifierRecalcul(config(OBJECTIF), existantes, memorises, MAINTENANT);

  assert.deepEqual(plan.aCreer, []);
  assert.deepEqual(plan.aSupprimer, ['a_faire']);
});

test('changer de rythme change le découpage sans changer la couverture', () => {
  const existantes = [];
  const objectif = { type: 'custom', passages: [{ surah: 2, startAyah: 1, endAyah: 20 }] };

  const parTrois = planifierRecalcul(
    { ...config(objectif), schedule: { unit: { type: 'verses', count: 3 }, days: [0, 1, 2, 3, 4, 5, 6] } },
    existantes,
    [],
    MAINTENANT,
  );
  const parCinq = planifierRecalcul(config(objectif), existantes, [], MAINTENANT);

  const couvrir = (plan) =>
    plan.aCreer
      .flatMap((s) => Array.from({ length: s.endAyah - s.startAyah + 1 }, (_, i) => s.startAyah + i))
      .sort((a, b) => a - b);

  assert.deepEqual(couvrir(parTrois), couvrir(parCinq), 'la couverture doit être identique');
  assert.ok(parTrois.aCreer.length > parCinq.aCreer.length, 'un rythme plus fin doit produire plus de séances');
});

test('changer d\'objectif ne reprend pas les passages déjà mémorisés', () => {
  const memorises = [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }];

  const versJuz = planifierRecalcul(
    config({ type: 'specific_juz', juzNumber: 1 }),
    [],
    memorises,
    MAINTENANT,
  );

  const intrus = versJuz.aCreer
    .filter((s) => s.surah === 2)
    .flatMap((s) => Array.from({ length: s.endAyah - s.startAyah + 1 }, (_, i) => s.startAyah + i))
    .filter((a) => a >= 1 && a <= 10);

  assert.deepEqual(intrus, [], 'des versets mémorisés réapparaissent après changement d\'objectif');
});
