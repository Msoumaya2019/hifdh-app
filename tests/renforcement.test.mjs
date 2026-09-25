// Ce qui doit apparaître dans la liste « Révision ».
//
// Trois erreurs sont possibles ici, et aucune ne se verrait à l'écran :
//
//   - un passage marqué « à retravailler » qui n'apparaît pas — l'apprenant a
//     dit quelque chose et l'application l'oublie ;
//   - un passage qui apparaît deux fois, parce qu'il est à la fois marqué et
//     dont la révision est due. L'apprenant croit alors à deux passages ;
//   - une révision dont l'échéance n'est pas encore arrivée, et qui encombre la
//     liste de ce qui n'a pas besoin d'être travaillé aujourd'hui.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  passagesARenforcer,
  clePassage,
  effetRenforcement,
} from '@/lib/renforcement';

const AUJOURDHUI = '2026-09-22';

function passage(surah, startAyah, endAyah, level = 'perfect') {
  return { surah, startAyah, endAyah, level };
}

function revision(surah, startAyah, endAyah, nextReviewDate, extra = {}) {
  return {
    id: `review_${surah}_${startAyah}_${endAyah}`,
    surah,
    startAyah,
    endAyah,
    level: 1,
    nextReviewDate,
    reviewCount: 1,
    intervalDays: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

test('un passage marqué à retravailler entre dans la liste', () => {
  const liste = passagesARenforcer([passage(2, 1, 5, 'needs_review')], [], AUJOURDHUI);

  assert.equal(liste.length, 1);
  assert.equal(liste[0].surah, 2);
  assert.equal(liste[0].origine, 'marque');
});

test('un passage parfaitement su n’y entre pas', () => {
  const liste = passagesARenforcer([passage(2, 1, 5, 'perfect')], [], AUJOURDHUI);

  assert.deepEqual(liste, []);
});

test('un passage « unknown » n’y entre pas non plus', () => {
  // « unknown » veut dire « je ne le connais pas », pas « je le connais mal ».
  // C'est le travail d'apprentissage qui l'amènera, pas le renforcement.
  const liste = passagesARenforcer([passage(2, 1, 5, 'unknown')], [], AUJOURDHUI);

  assert.deepEqual(liste, []);
});

test('une révision due entre dans la liste', () => {
  const liste = passagesARenforcer([], [revision(3, 10, 20, '2026-09-22')], AUJOURDHUI);

  assert.equal(liste.length, 1);
  assert.equal(liste[0].origine, 'revision_prevue');
  assert.equal(liste[0].reviewId, 'review_3_10_20');
});

test('une révision à échéance future n’y entre pas', () => {
  const liste = passagesARenforcer([], [revision(3, 10, 20, '2026-09-23')], AUJOURDHUI);

  assert.deepEqual(liste, []);
});

test('une révision en retard y entre', () => {
  // Le cas qui compte : une échéance dépassée pendant une absence. Si la
  // comparaison était une égalité de dates au lieu d'une comparaison d'ordre,
  // ces passages disparaîtraient au lieu de s'accumuler.
  const liste = passagesARenforcer([], [revision(3, 10, 20, '2026-09-01')], AUJOURDHUI);

  assert.equal(liste.length, 1);
});

test('un passage marqué et dû ne figure qu’une fois, et garde sa révision', () => {
  const liste = passagesARenforcer(
    [passage(4, 1, 3, 'needs_review')],
    [revision(4, 1, 3, '2026-09-22')],
    AUJOURDHUI
  );

  assert.equal(liste.length, 1, 'le passage apparaîtrait deux fois');
  assert.equal(liste[0].origine, 'marque', 'le mot de l’apprenant prime');
  assert.equal(
    liste[0].reviewId,
    'review_4_1_3',
    'sans cela, renforcer ce passage n’avancerait pas sa révision'
  );
});

test('l’ordre suit le moushaf, et non l’ordre d’arrivée', () => {
  const liste = passagesARenforcer(
    [passage(10, 1, 2, 'needs_review'), passage(2, 5, 9, 'needs_review')],
    [revision(7, 1, 2, '2026-09-20')],
    AUJOURDHUI
  );

  assert.deepEqual(
    liste.map((p) => [p.surah, p.startAyah]),
    [[2, 5], [7, 1], [10, 1]]
  );
});

test('deux étendues différentes de la même sourate restent distinctes', () => {
  // 2:1-5 et 2:5-15 se recouvrent d'un verset. La table les identifie par leur
  // étendue exacte : les fondre en une seule ligne ferait disparaître l'un des
  // deux passages marqués.
  const liste = passagesARenforcer(
    [passage(2, 1, 5, 'needs_review'), passage(2, 5, 15, 'needs_review')],
    [],
    AUJOURDHUI
  );

  assert.equal(liste.length, 2);
  assert.equal(clePassage(liste[0]) !== clePassage(liste[1]), true);
});

test('« Renforcé » retire le passage et espace sa révision', () => {
  assert.deepEqual(effetRenforcement(true), { niveau: 'perfect', note: 'perfect' });
});

test('« Pas encore » le laisse dans la liste, et le ramène à demain', () => {
  const effet = effetRenforcement(false);

  assert.equal(effet.niveau, 'needs_review', 'le passage doit rester dans la liste');
  // La note « errors » ramène le niveau SRS à 0, dont l'intervalle est d'un
  // jour : c'est ce qui fait revenir le passage demain.
  assert.equal(effet.note, 'errors');
});

test('après « Pas encore », le passage est toujours dans la liste', () => {
  const avant = passage(6, 1, 4, 'perfect');
  const apres = { ...avant, level: effetRenforcement(false).niveau };

  const liste = passagesARenforcer([apres], [], AUJOURDHUI);
  assert.equal(liste.length, 1);
});

test('après « Renforcé », le passage quitte la liste', () => {
  const apres = passage(6, 1, 4, effetRenforcement(true).niveau);

  const liste = passagesARenforcer([apres], [], AUJOURDHUI);
  assert.deepEqual(liste, []);
});
