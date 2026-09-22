// Pagination du moushaf : 604 pages, et ce que l'application en déduit.
//
// Le découpage en pages porte désormais l'affichage « page par page » et la
// mesure d'activité en pages. Une page fausse ne se voit pas sur un écran : elle
// se voit sur les invariants — 604 pages numérotées de 1 à 604, sans trou ni
// recul, la première et la dernière connues, et 6 236 versets répartis une fois.
//
// Le même contrôle existe en Python (`data/quran/verifier_pages.py`), sur le
// fichier de données. Ici, il porte sur ce que le code de l'application calcule
// réellement : l'index construit au chargement, les bornes, la traversée d'une
// page à cheval sur deux sourates.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAllSurahs,
  getPageBounds,
  getPageCount,
  getPageOfAyah,
  getPageVerses,
  getPagesOfRange,
  getTotalAyahs,
  getVersesOnPage,
  getJuzOfAyah,
} from '@/data/quranData';

import quranTextData from '@data/quran/quran_text_uthmani.json' with { type: 'json' };

const VERSETS = quranTextData;
const TOTAL_VERSETS = 6236;
const TOTAL_PAGES = 604;

test('la pagination couvre les 6 236 versets sans trou ni recul', () => {
  const pages = VERSETS.map((v) => v.page);

  assert.equal(pages.length, TOTAL_VERSETS, 'nombre de versets');
  assert.equal(new Set(pages).size, TOTAL_PAGES, 'nombre de pages distinctes');
  assert.deepEqual(
    [...new Set(pages)].sort((a, b) => a - b),
    Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1),
    'les pages doivent être exactement 1..604'
  );

  const reculs = pages
    .map((p, i) => (i > 0 && p < pages[i - 1] ? `${i}: ${pages[i - 1]} puis ${p}` : null))
    .filter(Boolean);
  assert.deepEqual(reculs, [], 'aucune page ne doit reculer');

  const sauts = pages
    .map((p, i) => (i > 0 && p > pages[i - 1] + 1 ? `${pages[i - 1]} puis ${p}` : null))
    .filter(Boolean);
  assert.deepEqual(sauts, [], 'aucune page ne doit être sautée');
});

test('les bornes connues du moushaf de Médine sont respectées', () => {
  assert.deepEqual(getPageBounds(1), { start: { surah: 1, ayah: 1 }, end: { surah: 1, ayah: 7 } });
  assert.deepEqual(getPageBounds(2), { start: { surah: 2, ayah: 1 }, end: { surah: 2, ayah: 5 } });
  assert.deepEqual(getPageBounds(604), {
    start: { surah: 112, ayah: 1 },
    end: { surah: 114, ayah: 6 },
  });
});

test('getPageOfAyah rend la page portée par la donnée, pour les 6 236 versets', () => {
  const ecarts = [];
  for (const verset of VERSETS) {
    const rendue = getPageOfAyah(verset.surah, verset.ayah);
    if (rendue !== verset.page) {
      ecarts.push(`${verset.surah}:${verset.ayah} → ${rendue} au lieu de ${verset.page}`);
    }
  }
  assert.deepEqual(ecarts, [], `${ecarts.length} écart(s)`);
});

test('le nombre de versets par page totalise 6 236', () => {
  let total = 0;
  const vides = [];
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const n = getVersesOnPage(page);
    if (n === 0) vides.push(page);
    total += n;
  }
  assert.deepEqual(vides, [], 'aucune page ne doit être vide');
  assert.equal(total, TOTAL_VERSETS, 'total des versets répartis par page');
  assert.equal(getPageCount(), TOTAL_PAGES);
  assert.equal(getTotalAyahs(), TOTAL_VERSETS);
});

test('la page 401 est celle de la photo : 29:39 à 29:45', () => {
  // Bornes relevées sur une page imprimée du moushaf : le premier verset est
  // « وَقَـٰرُونَ وَفِرْعَوْنَ وَهَـٰمَـٰنَ » (29:39) et le dernier se termine par
  // « وَٱللَّهُ يَعْلَمُ مَا تَصْنَعُونَ » (29:45). 29:46 est déjà sur la 402.
  assert.deepEqual(getPageBounds(401), {
    start: { surah: 29, ayah: 39 },
    end: { surah: 29, ayah: 45 },
  });
  assert.equal(getVersesOnPage(401), 7);
  assert.equal(getPageOfAyah(29, 45), 401);
  assert.equal(getPageOfAyah(29, 46), 402);
});

test('une page peut traverser une frontière de sourate', () => {
  // La dernière page porte les trois dernières sourates : la traversée de
  // sourate n'est donc pas un cas d'école, c'est la dernière page du moushaf.
  const versets = getPageVerses(604);
  const attendu = 4 + 5 + 6; // 112 (4), 113 (5), 114 (6)
  assert.equal(versets.length, attendu, `${versets.length} versets au lieu de ${attendu}`);
  assert.deepEqual(
    versets.map((v) => v.surah),
    [112, 112, 112, 112, 113, 113, 113, 113, 113, 114, 114, 114, 114, 114, 114],
    'sourates des versets de la page 604'
  );
  assert.equal(versets[0].ayah, 1);
  assert.equal(versets.at(-1).ayah, 6);
});

test('getPageVerses rend le texte, et le même que le verset isolé', () => {
  const versets = getPageVerses(401);
  assert.equal(versets.length, 7);
  assert.equal(versets[0].surah, 29);
  assert.equal(versets[0].ayah, 39);
  assert.equal(versets.at(-1).ayah, 45);

  const source = VERSETS.find((v) => v.surah === 29 && v.ayah === 39);
  assert.equal(versets[0].text, source.text, 'le texte rendu doit être celui de la source');

  // Une page hors bornes ne doit rien rendre, et ne pas lever.
  assert.deepEqual(getPageVerses(0), []);
  assert.deepEqual(getPageVerses(605), []);
  assert.equal(getPageBounds(0), null);
  assert.equal(getPageBounds(605), null);
});

test('les pages d’une plage de versets suivent la plage', () => {
  assert.deepEqual(getPagesOfRange(29, 39, 45), [401], 'une plage dans une seule page');
  assert.deepEqual(getPagesOfRange(29, 39, 46), [401, 402], 'une plage à cheval sur deux pages');
  assert.deepEqual(getPagesOfRange(1, 1, 7), [1]);
  assert.deepEqual(getPagesOfRange(2, 1, 5), [2]);
});

test('chaque sourate commence et finit sur une page connue et ordonnée', () => {
  const problemes = [];
  for (const surah of getAllSurahs()) {
    const premiere = getPageOfAyah(surah.number, 1);
    const derniere = getPageOfAyah(surah.number, surah.ayahCount);
    if (premiere === null || derniere === null) {
      problemes.push(`${surah.number} : page introuvable`);
      continue;
    }
    if (premiere > derniere) {
      problemes.push(`${surah.number} : commence page ${premiere} et finit page ${derniere}`);
    }
  }
  assert.deepEqual(problemes, []);
});

test('le juz’ d’un verset est lisible, et cohérent avec sa page', () => {
  assert.equal(getJuzOfAyah(1, 1), 1);
  assert.equal(getJuzOfAyah(29, 39), 20, 'la page 401 porte l’en-tête « Juz’ 20 »');
  assert.equal(getJuzOfAyah(114, 6), 30);
  assert.equal(getJuzOfAyah(2, 1), 1);

  // Le juz' ne recule jamais au fil des versets, et reste dans 1..30.
  let precedent = 0;
  for (const verset of VERSETS) {
    const juz = verset.juz;
    assert.ok(juz >= 1 && juz <= 30, `${verset.surah}:${verset.ayah} → juz ${juz}`);
    assert.ok(juz >= precedent, `${verset.surah}:${verset.ayah} : le juz' recule`);
    precedent = juz;
  }
});
