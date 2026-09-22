// Objectif : traduction en plages de versets, puis soustraction des passages
// déjà mémorisés.
//
// L'objectif est la première étape du programme : une plage qui sort de sa
// sourate produit des séances portant sur des versets qui n'existent pas.

import test from 'node:test';
import assert from 'node:assert/strict';

import { computeObjectiveRanges, subtractMemorized } from '@/lib/programGenerator';
import { getAllJuz, getAllHizb, getSurah, getAllSurahs } from '@/data/quranData';

// Une plage est un triplet { surah, startAyah, endAyah }.
function versetsDe(ranges) {
  const cles = [];
  for (const r of ranges) {
    for (let a = r.startAyah; a <= r.endAyah; a++) {
      cles.push(`${r.surah}:${a}`);
    }
  }
  return cles;
}

// Plages dont la fin dépasse le nombre de versets de leur sourate : le symptôme
// exact d'une division qui traverse plusieurs sourates et a été écrasée en une
// seule plage.
function plagesHorsSourate(ranges) {
  const fautives = [];
  for (const r of ranges) {
    const surah = getSurah(r.surah);
    if (surah === undefined) {
      fautives.push(`sourate ${r.surah} inexistante`);
      continue;
    }
    if (r.startAyah < 1 || r.endAyah > surah.ayahCount) {
      fautives.push(
        `${r.surah}:${r.startAyah}-${r.endAyah} dépasse la sourate ${r.surah} (${surah.ayahCount} versets)`,
      );
    }
  }
  return fautives;
}

// === Invariant général ===

test('toute plage produite reste à l\'intérieur de sa sourate', () => {
  const cas = [
    { type: 'full_quran' },
    { type: 'juz_amma' },
    { type: 'hizb_sabbih' },
    { type: 'specific_juz', juzNumber: 1 },
    { type: 'specific_juz', juzNumber: 15 },
    { type: 'specific_hizb', hizbNumbers: [1] },
    { type: 'specific_hizb', hizbNumbers: [7, 8] },
    { type: 'custom', passages: [{ surah: 18, startAyah: 1, endAyah: 10 }] },
  ];

  const fautives = [];
  for (const objectif of cas) {
    for (const p of plagesHorsSourate(computeObjectiveRanges(objectif))) {
      fautives.push(`[${objectif.type}] ${p}`);
    }
  }

  assert.deepEqual(fautives, []);
});

// === Taille couverte : la mesure qui démasque une plage écrasée ===

test('un juz\' couvre exactement le nombre de versets de ce juz\'', () => {
  for (const juz of getAllJuz()) {
    const attendu = juz.end.ayahId - juz.start.ayahId + 1;
    const obtenu = versetsDe(computeObjectiveRanges({ type: 'specific_juz', juzNumber: juz.juzNumber }));
    assert.equal(
      obtenu.length,
      attendu,
      `juz ${juz.juzNumber} : ${obtenu.length} versets couverts au lieu de ${attendu}`,
    );
  }
});

test('un hizb couvre exactement le nombre de versets de ce hizb', () => {
  for (const hizb of getAllHizb()) {
    const attendu = hizb.end.ayahId - hizb.start.ayahId + 1;
    const obtenu = versetsDe(
      computeObjectiveRanges({ type: 'specific_hizb', hizbNumbers: [hizb.hizbNumber] }),
    );
    assert.equal(
      obtenu.length,
      attendu,
      `hizb ${hizb.hizbNumber} : ${obtenu.length} versets couverts au lieu de ${attendu}`,
    );
  }
});

test('le Coran entier couvre les 6236 versets, chacun une seule fois', () => {
  const cles = versetsDe(computeObjectiveRanges({ type: 'full_quran' }));
  assert.equal(cles.length, 6236);
  assert.equal(new Set(cles).size, 6236, 'des versets sont comptés deux fois');
});

test('Juz \'Amma couvre les sourates 78 à 114', () => {
  const ranges = computeObjectiveRanges({ type: 'juz_amma' });
  assert.deepEqual(
    ranges.map((r) => r.surah),
    Array.from({ length: 114 - 78 + 1 }, (_, i) => 78 + i),
  );
  const attendu = getAllSurahs()
    .filter((s) => s.number >= 78)
    .reduce((total, s) => total + s.ayahCount, 0);
  assert.equal(versetsDe(ranges).length, attendu);
});

// === Soustraction des passages mémorisés ===

const OBJECTIF_10 = [{ surah: 2, startAyah: 1, endAyah: 10 }];

test('un passage mémorisé au milieu découpe la plage en deux', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 2, startAyah: 4, endAyah: 6, level: 'perfect' },
  ]);

  assert.deepEqual(restant, [
    { surah: 2, startAyah: 1, endAyah: 3 },
    { surah: 2, startAyah: 7, endAyah: 10 },
  ]);
});

test('les versets mémorisés ne réapparaissent jamais dans le reste à apprendre', () => {
  const memorise = { surah: 2, startAyah: 4, endAyah: 6, level: 'perfect' };
  const restant = subtractMemorized(OBJECTIF_10, [memorise]);

  const clesRestantes = versetsDe(restant);
  const clesMemorisees = versetsDe([memorise]);

  assert.equal(clesRestantes.length + clesMemorisees.length, 10, 'des versets ont été perdus ou dupliqués');
  assert.deepEqual(
    clesRestantes.filter((c) => clesMemorisees.includes(c)),
    [],
    'un verset mémorisé figure encore dans le programme',
  );
  assert.equal(new Set(clesRestantes).size, clesRestantes.length, 'un verset est présent deux fois');
});

test('un passage mémorisé qui couvre tout l\'objectif ne laisse rien à apprendre', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' },
  ]);
  assert.deepEqual(restant, []);
});

test('un passage mémorisé à cheval sur le début retire la bonne partie', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 2, startAyah: 1, endAyah: 3, level: 'needs_review' },
  ]);
  assert.deepEqual(restant, [{ surah: 2, startAyah: 4, endAyah: 10 }]);
});

test('un passage marqué « unknown » n\'est pas retiré du programme', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 2, startAyah: 4, endAyah: 6, level: 'unknown' },
  ]);
  assert.deepEqual(restant, OBJECTIF_10);
});

test('un passage mémorisé dans une autre sourate ne change rien', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 3, startAyah: 1, endAyah: 5, level: 'perfect' },
  ]);
  assert.deepEqual(restant, OBJECTIF_10);
});

test('deux passages mémorisés successifs se soustraient tous les deux', () => {
  const restant = subtractMemorized(OBJECTIF_10, [
    { surah: 2, startAyah: 2, endAyah: 3, level: 'perfect' },
    { surah: 2, startAyah: 7, endAyah: 8, level: 'needs_review' },
  ]);
  assert.deepEqual(restant, [
    { surah: 2, startAyah: 1, endAyah: 1 },
    { surah: 2, startAyah: 4, endAyah: 6 },
    { surah: 2, startAyah: 9, endAyah: 10 },
  ]);
});

test('aucun passage mémorisé : l\'objectif est rendu tel quel', () => {
  assert.deepEqual(subtractMemorized(OBJECTIF_10, []), OBJECTIF_10);
});
