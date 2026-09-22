// L'activité hebdomadaire, et la page comme unité de mesure.
//
// Deux choses peuvent se tromper ici sans que cela se voie à l'écran :
//
//   - la découpe des semaines. Une semaine qui commence le dimanche au lieu du
//     lundi déplace une séance d'une barre à l'autre, et le total du mois reste
//     juste : personne ne le remarque ;
//   - la mesure en pages. Compter « une page touchée » comme une page faite
//     gonflerait l'activité sans rapport avec le travail fourni. La mesure est
//     donc une fraction, et c'est vérifiable au verset près.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeActiviteHebdomadaire, pagesEquivalentes } from '@/lib/progress';
import { getPageOfAyahId, getVersesOnPage } from '@/data/quranData';
import { ayahRefToAyahId } from '@/data/quranData';

const LUNDI = new Date(2026, 8, 21); // lundi 21 septembre 2026
const MARDI = new Date(2026, 8, 22); // mardi 22 septembre 2026

function seance(id, date, surah, startAyah, endAyah, status = 'completed') {
  return {
    id,
    date,
    surah,
    startAyah,
    endAyah,
    unit: { type: 'verses', count: endAyah - startAyah + 1 },
    status,
    createdAt: `${date}T08:00:00.000Z`,
  };
}

/** Les identifiants globaux d'une plage. */
function ids(surah, startAyah, endAyah) {
  const ensemble = new Set();
  const base = ayahRefToAyahId({ surah, ayah: 1 });
  for (let a = startAyah; a <= endAyah; a++) ensemble.add(base + a - 1);
  return ensemble;
}

test('les semaines vont du lundi au dimanche, la dernière étant celle en cours', () => {
  const semaines = computeActiviteHebdomadaire([], 8, MARDI);

  assert.equal(semaines.length, 8);

  const premiere = semaines[0];
  const derniere = semaines.at(-1);

  // 21 septembre moins sept semaines = 3 août.
  assert.equal(premiere.debut, '2026-08-03');
  assert.equal(premiere.fin, '2026-08-09');
  assert.equal(derniere.debut, '2026-09-21');
  assert.equal(derniere.fin, '2026-09-27');
  assert.equal(derniere.enCours, true, 'la dernière semaine est celle en cours');
  assert.equal(
    semaines.filter((s) => s.enCours).length,
    1,
    'une seule semaine en cours'
  );

  // Chaque semaine dure sept jours, et la suivante commence le lendemain.
  for (let i = 1; i < semaines.length; i++) {
    const finPrecedente = new Date(`${semaines[i - 1].fin}T12:00:00`);
    const debut = new Date(`${semaines[i].debut}T12:00:00`);
    const ecart = Math.round((debut - finPrecedente) / 86400000);
    assert.equal(ecart, 1, `écart entre ${semaines[i - 1].fin} et ${semaines[i].debut}`);
  }
});

test('une séance tombe dans la semaine de son lundi, dimanche compris', () => {
  const sessions = [
    seance('lundi', '2026-09-21', 2, 1, 5),
    seance('dimanche', '2026-09-27', 2, 6, 10),
    seance('lundi-suivant', '2026-09-28', 2, 11, 15),
  ];

  const semaines = computeActiviteHebdomadaire(sessions, 8, MARDI);
  const derniere = semaines.at(-1);

  assert.equal(derniere.seances, 2, 'lundi et dimanche sont la même semaine');
  assert.equal(derniere.versets, 10);
  assert.equal(
    semaines.reduce((total, s) => total + s.seances, 0),
    2,
    'la séance du lundi suivant est hors de la fenêtre'
  );
});

test('une page entièrement mémorisée compte pour 1', () => {
  // Page 401 = 29:39 à 29:45.
  const surLaPage = getVersesOnPage(401);
  assert.equal(surLaPage, 7);
  assert.equal(pagesEquivalentes(ids(29, 39, 45)), 1);
});

test('une page à moitié sue compte pour la moitié', () => {
  // 4 versets sur 7 : 0,571… arrondi à 0,6.
  assert.equal(pagesEquivalentes(ids(29, 39, 42)), 0.6);
  // 1 verset sur 7 : 0,142… arrondi à 0,1. Toucher une page ne la fait pas.
  assert.equal(pagesEquivalentes(ids(29, 39, 39)), 0.1);
});

test('la mesure ne dépasse jamais une page par page touchée', () => {
  const page = getVersesOnPage(401);
  const tous = ids(29, 39, 45);
  assert.equal(tous.size, page);

  // Deux fois les mêmes versets ne comptent pas deux fois : c'est un ensemble.
  const deuxFois = new Set([...tous, ...tous]);
  assert.equal(pagesEquivalentes(deuxFois), 1);
});

test('des séances qui se recouvrent dans la même semaine ne comptent pas double', () => {
  const sessions = [
    seance('a', '2026-09-21', 2, 1, 10),
    seance('b', '2026-09-22', 2, 5, 15),
    seance('c', '2026-09-22', 2, 11, 20, 'todo'),
  ];

  const derniere = computeActiviteHebdomadaire(sessions, 8, MARDI).at(-1);

  // Union de 2:1-10 et 2:5-15 : 15 versets distincts, pas 21.
  assert.equal(derniere.versets, 15, 'les versets distincts, pas la somme des longueurs');
  assert.equal(derniere.seances, 2, 'la séance à faire ne compte pas');
});

test('la fenêtre est déterministe : la même référence donne le même résultat', () => {
  const sessions = [seance('a', '2026-09-21', 2, 1, 5)];
  const une = computeActiviteHebdomadaire(sessions, 8, LUNDI);
  const deux = computeActiviteHebdomadaire(sessions, 8, LUNDI);
  assert.deepEqual(une, deux);

  // Le lundi et le mardi de la même semaine décrivent la même fenêtre.
  assert.deepEqual(computeActiviteHebdomadaire(sessions, 8, LUNDI), computeActiviteHebdomadaire(sessions, 8, MARDI));
});

test('chaque page a un identifiant de verset qui la retrouve', () => {
  // Aller-retour : l'identifiant d'un verset redonne sa page.
  const problemes = [];
  for (const [surah, ayah, page] of [
    [1, 1, 1],
    [2, 1, 2],
    [29, 39, 401],
    [114, 6, 604],
  ]) {
    const rendue = getPageOfAyahId(ayahRefToAyahId({ surah, ayah }));
    if (rendue !== page) problemes.push(`${surah}:${ayah} → ${rendue} au lieu de ${page}`);
  }
  assert.deepEqual(problemes, []);
});
