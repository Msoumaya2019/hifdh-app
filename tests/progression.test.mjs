// Progression : versets mémorisés, objectif, hizb terminés.
//
// Le pourcentage de Coran mémorisé est le chiffre principal de l'accueil. Il est
// calculé à partir des passages marqués par l'utilisateur, qui peuvent se
// chevaucher : compter la longueur de chaque passage gonfle le total.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMemorizedVerseCount,
  getObjectiveVerseCount,
  getMemorizedInObjective,
  computeProgressStats,
  getTotalQuranVerses,
} from '@/lib/progress';
import { getAllSurahs, getAllHizb, getAllThumn } from '@/data/quranData';
import { aujourdHui } from '@/lib/dates';

/** Passages couvrant un intervalle d'identifiants globaux, une entrée par sourate. */
function passagesPourIds(debut, fin, level = 'perfect') {
  const passages = [];
  for (const s of getAllSurahs()) {
    const premier = s.startAyahId;
    const dernier = s.startAyahId + s.ayahCount - 1;
    if (dernier < debut || premier > fin) continue;
    passages.push({
      surah: s.number,
      startAyah: Math.max(debut, premier) - premier + 1,
      endAyah: Math.min(fin, dernier) - premier + 1,
      level,
    });
  }
  return passages;
}

const CONFIG = {
  memorizedPassages: [],
  objective: { type: 'full_quran' },
  schedule: { unit: { type: 'verses', count: 5 }, days: [1, 3, 5] },
  onboardingCompleted: true,
};

// === Double comptage ===

test('deux passages qui se chevauchent comptent les versets une seule fois', () => {
  const memorises = [
    { surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' },
    { surah: 2, startAyah: 5, endAyah: 15, level: 'perfect' },
  ];

  assert.equal(
    getMemorizedVerseCount(memorises),
    15,
    'les versets de 2:5 à 2:10 sont comptés deux fois',
  );
});

test('un passage entièrement contenu dans un autre ne double pas le total', () => {
  const memorises = [
    { surah: 2, startAyah: 1, endAyah: 20, level: 'perfect' },
    { surah: 2, startAyah: 8, endAyah: 12, level: 'needs_review' },
  ];
  assert.equal(getMemorizedVerseCount(memorises), 20);
});

test('les passages marqués « unknown » ne sont jamais comptés', () => {
  const memorises = [
    { surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' },
    { surah: 2, startAyah: 11, endAyah: 20, level: 'unknown' },
  ];
  assert.equal(getMemorizedVerseCount(memorises), 10);
});

test('le Coran entier mémorisé compte exactement 6236 versets', () => {
  assert.equal(getMemorizedVerseCount(passagesPourIds(1, 6236)), 6236);
  assert.equal(getTotalQuranVerses(), 6236);
});

test('un hizb entier mémorisé compte exactement ses versets', () => {
  for (const hizb of getAllHizb()) {
    const attendu = hizb.end.ayahId - hizb.start.ayahId + 1;
    const obtenu = getMemorizedVerseCount(passagesPourIds(hizb.start.ayahId, hizb.end.ayahId));
    assert.equal(obtenu, attendu, `hizb ${hizb.hizbNumber}`);
  }
});

// === Objectif ===

test('la taille de l\'objectif correspond à la division visée', () => {
  for (const hizb of getAllHizb()) {
    const attendu = hizb.end.ayahId - hizb.start.ayahId + 1;
    const obtenu = getObjectiveVerseCount({ type: 'specific_hizb', hizbNumbers: [hizb.hizbNumber] });
    assert.equal(obtenu, attendu, `hizb ${hizb.hizbNumber}`);
  }
});

test('les versets mémorisés dans l\'objectif ne sont pas comptés deux fois', () => {
  const objectif = { type: 'custom', passages: [{ surah: 2, startAyah: 1, endAyah: 30 }] };
  const memorises = [
    { surah: 2, startAyah: 1, endAyah: 20, level: 'perfect' },
    { surah: 2, startAyah: 10, endAyah: 30, level: 'perfect' },
  ];

  // L'union des deux passages couvre 2:1 à 2:30, soit 30 versets.
  assert.equal(getMemorizedInObjective(objectif, memorises), 30);
});

test('les versets mémorisés hors de l\'objectif ne sont pas comptés', () => {
  const objectif = { type: 'specific_juz', juzNumber: 30 };
  const memorises = [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }];
  assert.equal(getMemorizedInObjective(objectif, memorises), 0);
});

// === Statistiques ===

test('un seul hizb mémorisé donne un hizb terminé, pas zéro', () => {
  const hizb = getAllHizb().at(-1); // hizb 60
  const memorises = passagesPourIds(hizb.start.ayahId, hizb.end.ayahId);

  const stats = computeProgressStats(CONFIG, [], memorises, 0);

  assert.equal(stats.hizbCompleted, 1, 'le compteur de hizb terminés reste à zéro');
  assert.equal(stats.quranPercentage, Math.round((memorises.length > 0 ? hizb.end.ayahId - hizb.start.ayahId + 1 : 0) / 6236 * 1000) / 10);
});

test('le Coran entier mémorisé donne 60 hizb et 100 %', () => {
  const stats = computeProgressStats(CONFIG, [], passagesPourIds(1, 6236), 0);

  assert.equal(stats.hizbCompleted, 60);
  assert.equal(stats.quranPercentage, 100);
  assert.equal(stats.objectivePercentage, 100);
});

test('un hizb incomplet n\'est pas compté comme terminé', () => {
  const hizb = getAllHizb().at(-1);
  const memorises = passagesPourIds(hizb.start.ayahId, hizb.end.ayahId - 1);

  const stats = computeProgressStats(CONFIG, [], memorises, 0);
  assert.equal(stats.hizbCompleted, 0, 'un verset manquant suffit à ne pas terminer le hizb');
});

test('les versets d\'aujourd\'hui ne comptent que les séances terminées', () => {
  const aujourdHuiStr = aujourdHui();
  const seances = [
    { id: 'a', date: aujourdHuiStr, surah: 2, startAyah: 1, endAyah: 5, status: 'completed', unit: { type: 'verses', count: 5 }, createdAt: '' },
    { id: 'b', date: aujourdHuiStr, surah: 2, startAyah: 6, endAyah: 10, status: 'todo', unit: { type: 'verses', count: 5 }, createdAt: '' },
    { id: 'c', date: '2000-01-01', surah: 2, startAyah: 11, endAyah: 15, status: 'completed', unit: { type: 'verses', count: 5 }, createdAt: '' },
  ];

  const stats = computeProgressStats(CONFIG, seances, [], 0);
  assert.equal(stats.todayVerses, 5, 'seules les séances terminées du jour comptent');
  assert.equal(stats.totalLearningDays, 2);
});

test('le total des toumoun mémorisés donne le bon pourcentage', () => {
  const thumn = getAllThumn()[0];
  const memorises = passagesPourIds(thumn.hafs.startAyahId, thumn.hafs.endAyahId);

  const attendu = thumn.hafs.endAyahId - thumn.hafs.startAyahId + 1;
  assert.equal(getMemorizedVerseCount(memorises), attendu);

  const stats = computeProgressStats(CONFIG, [], memorises, 0);
  assert.equal(stats.quranPercentage, Math.round(attendu / 6236 * 1000) / 10);
});
