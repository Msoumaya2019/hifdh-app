// Pavage des divisions coraniques.
//
// Ces quatre niveaux portent toute la progression de l'application : un trou ou
// un recouvrement fausse le pourcentage mémorisé, le programme et les
// statistiques. Les 480 toumoun étant *dérivés* (quran-meta ne les fournit pas
// pour Hafs), c'est le niveau le plus exposé : une borne écrasée pendant la
// dérivation produirait une division vide, invisible à l'œil dans l'interface.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAllJuz,
  getAllHizb,
  getAllRub,
  getAllThumn,
  getAllSurahs,
  getTotalAyahs,
} from '@/data/quranData';

const TOTAL_VERSETS = 6236;

// Retourne la liste des problèmes plutôt que d'affirmer directement : le message
// d'échec nomme alors la division fautive, au lieu de dire « tableau différent ».
function problemesDePavage(bornes) {
  const problemes = [];

  for (let i = 0; i < bornes.length; i++) {
    if (bornes[i].numero !== i + 1) {
      problemes.push(`division d'indice ${i} numérotée ${bornes[i].numero}`);
    }
  }

  if (bornes[0]?.debut !== 1) {
    problemes.push(`la première commence au verset ${bornes[0]?.debut}, pas 1`);
  }
  if (bornes.at(-1)?.fin !== TOTAL_VERSETS) {
    problemes.push(`la dernière finit au verset ${bornes.at(-1)?.fin}, pas ${TOTAL_VERSETS}`);
  }

  for (const b of bornes) {
    if (b.fin < b.debut) {
      problemes.push(`division ${b.numero} vide ou inversée : ${b.debut} -> ${b.fin}`);
    }
  }

  for (let i = 0; i < bornes.length - 1; i++) {
    const fin = bornes[i].fin;
    const debut = bornes[i + 1].debut;
    if (debut !== fin + 1) {
      problemes.push(
        `discontinuité entre ${bornes[i].numero} et ${bornes[i + 1].numero} : ` +
          `fin=${fin}, début suivant=${debut} (écart ${debut - fin - 1})`,
      );
    }
  }

  return problemes;
}

const NIVEAUX = [
  {
    nom: 'juz',
    attendu: 30,
    bornes: () =>
      getAllJuz().map((d) => ({ numero: d.juzNumber, debut: d.start.ayahId, fin: d.end.ayahId })),
  },
  {
    nom: 'hizb',
    attendu: 60,
    bornes: () =>
      getAllHizb().map((d) => ({ numero: d.hizbNumber, debut: d.start.ayahId, fin: d.end.ayahId })),
  },
  {
    nom: 'rub',
    attendu: 240,
    bornes: () =>
      getAllRub().map((d) => ({ numero: d.rubNumber, debut: d.start.ayahId, fin: d.end.ayahId })),
  },
  {
    nom: 'thumn',
    attendu: 480,
    bornes: () =>
      getAllThumn().map((t) => ({
        numero: t.thumnNumber,
        debut: t.hafs.startAyahId,
        fin: t.hafs.endAyahId,
      })),
  },
];

for (const niveau of NIVEAUX) {
  test(`${niveau.nom} : ${niveau.attendu} divisions attendues`, () => {
    assert.equal(niveau.bornes().length, niveau.attendu);
  });

  test(`${niveau.nom} : pave exactement le Coran, sans trou ni recouvrement`, () => {
    assert.deepEqual(problemesDePavage(niveau.bornes()), []);
  });
}

test('imbrication : chaque rub\' appartient au hizb attendu (4 par hizb)', () => {
  const problemes = [];
  getAllRub().forEach((rub, i) => {
    const attendu = Math.floor(i / 4) + 1;
    if (rub.hizbNumber !== attendu) {
      problemes.push(`rub ${rub.rubNumber} -> hizb ${rub.hizbNumber}, attendu ${attendu}`);
    }
  });
  assert.deepEqual(problemes, []);
});

test('imbrication : chaque thumn appartient au hizb et au rub\' attendus', () => {
  const problemes = [];
  getAllThumn().forEach((thumn, i) => {
    const hizbAttendu = Math.floor(i / 8) + 1;
    const rubAttendu = Math.floor(i / 2) + 1;
    if (thumn.hizbNumber !== hizbAttendu) {
      problemes.push(`thumn ${thumn.thumnNumber} -> hizb ${thumn.hizbNumber}, attendu ${hizbAttendu}`);
    }
    if (thumn.rubNumber !== rubAttendu) {
      problemes.push(`thumn ${thumn.thumnNumber} -> rub ${thumn.rubNumber}, attendu ${rubAttendu}`);
    }
  });
  assert.deepEqual(problemes, []);
});

test('les thumn marqués isRubStart sont exactement les débuts de rub\'', () => {
  const debutsRub = new Set(getAllRub().map((r) => r.start.ayahId));
  const marques = new Set(getAllThumn().filter((t) => t.isRubStart).map((t) => t.hafs.startAyahId));

  const sansMarque = [...debutsRub].filter((id) => !marques.has(id)).sort((a, b) => a - b);
  const enTrop = [...marques].filter((id) => !debutsRub.has(id)).sort((a, b) => a - b);

  assert.deepEqual(sansMarque, [], 'débuts de rub\' sans thumn isRubStart');
  assert.deepEqual(enTrop, [], 'thumn isRubStart hors début de rub\'');
  assert.equal(marques.size, 240);
});

test('les sourates s\'enchaînent sans trou, de 1 à 6236', () => {
  const surahs = getAllSurahs();
  assert.equal(surahs.length, 114);
  assert.equal(getTotalAyahs(), TOTAL_VERSETS);

  const problemes = [];
  let precedent = 0;
  for (const s of surahs) {
    if (s.startAyahId !== precedent + 1) {
      problemes.push(`sourate ${s.number} : startAyahId ${s.startAyahId} après ${precedent}`);
    }
    precedent = s.startAyahId + s.ayahCount - 1;
  }
  assert.deepEqual(problemes, []);
  assert.equal(precedent, TOTAL_VERSETS);
});
