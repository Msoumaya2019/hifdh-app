// Sonde de harnais.
//
// Ce fichier ne teste pas l'application : il établit que le dispositif lui-même
// fonctionne. Sans lui, une suite verte ne prouverait rien — un fichier que rien
// n'exécute passe inaperçu, et un alias non résolu ferait croire à un projet
// sans code testable.
//
// Il doit rester dans la suite : il tombera le jour où le chargeur cassera.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getSurah, getAllSurahs, getTotalAyahs, getJuz, getAllThumn } from '@/data/quranData';
import { computeObjectiveRanges } from '@/lib/programGenerator';

test('le harnais : les alias « @/ » sont résolus', () => {
  // Si ce test échoue sur ERR_MODULE_NOT_FOUND, le chargeur n'est pas branché.
  assert.equal(typeof getSurah, 'function');
  assert.equal(getSurah(1).ayahCount, 7, 'la sourate 1 compte 7 versets');
  assert.equal(getSurah(114).ayahCount, 6, 'la sourate 114 compte 6 versets');
});

test('le harnais : les données « @data/ » sont chargées', () => {
  assert.equal(getAllSurahs().length, 114);
  assert.equal(getTotalAyahs(), 6236);
  assert.equal(getAllThumn().length, 480);
  assert.equal(getJuz(1).end.surah, 2);
});

test('le harnais : les modules de calcul sont chargeables', () => {
  const ranges = computeObjectiveRanges({ type: 'juz_amma' });
  assert.ok(Array.isArray(ranges));
  assert.ok(ranges.length > 0);
});
