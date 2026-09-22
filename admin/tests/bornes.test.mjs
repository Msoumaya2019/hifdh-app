// ============================================================================
// Les bornes estimees : ce que le tableau de bord affiche, et sur quoi il
// s'appuie pour refuser une saisie.
//
// Les tests portent sur les vraies donnees de l'application — celles que
// `scripts/synchroniser-donnees.mjs` recopie — et non sur des fixtures
// inventees. Un test qui passerait sur une fixture et echouerait sur le
// fichier reel ne prouverait rien : c'est le fichier reel qui sera relu.
// ============================================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  bornesEstimees,
  formaterBorne,
  grouperParSourate,
  indexGlobal,
  limitesDesToumoun,
  verifierCoherence,
  verifierContinuite,
} from '../src/lib/bornes.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DONNEES = join(ICI, '..', 'src', 'donnees');

const fichier = JSON.parse(readFileSync(join(DONNEES, 'thumn_hafs.json'), 'utf8'));
const sourates = JSON.parse(readFileSync(join(DONNEES, 'surahs.json'), 'utf8'));
const thumn = fichier.thumn;
const limites = limitesDesToumoun(thumn);

describe('bornesEstimees', () => {
  it('rend exactement les 151 bornes estimees', () => {
    const bornes = bornesEstimees(thumn);
    assert.equal(bornes.length, 151);
  });

  it('ne retient aucune borne verifiee', () => {
    const verifies = new Set(
      thumn.filter((t) => t.verificationStatus !== 'estimated_offset').map((t) => t.thumnNumber)
    );
    for (const borne of bornesEstimees(thumn)) {
      assert.ok(
        !verifies.has(borne.thumnNumber),
        `le toumoun ${borne.thumnNumber} est verifie et ne devait pas sortir`
      );
    }
  });

  it('rend les bornes dans l\'ordre du Coran', () => {
    const numeros = bornesEstimees(thumn).map((b) => b.thumnNumber);
    const tries = [...numeros].sort((a, b) => a - b);
    assert.deepEqual(numeros, tries);
  });

  it('nomme la limite, c\'est-a-dire le premier verset du toumoun', () => {
    // Et non sa fin. La fin d'un toumoun pair est une fin de rub' al-hizb prise
    // des donnees Hafs de KFGQPC : elle est verifiee. L'afficher comme
    // « estimee » enverrait le relecteur verifier un verset qui n'a jamais ete
    // en doute — et les 151 fins sont dans ce cas, mesure.
    const parNumero = new Map(bornesEstimees(thumn).map((b) => [b.thumnNumber, b]));
    assert.deepEqual(parNumero.get(2).limiteEstimee, { surah: 2, ayah: 13 });
    assert.deepEqual(parNumero.get(8).limiteEstimee, { surah: 2, ayah: 66 });
    assert.deepEqual(parNumero.get(84).limiteEstimee, { surah: 4, ayah: 171 });

    // Les fins correspondantes, pour memoire : ce sont des fins de rub'.
    const t2 = thumn.find((t) => t.thumnNumber === 2);
    assert.deepEqual(
      { surah: t2.hafs.endSurah, ayah: t2.hafs.endAyah },
      { surah: 2, ayah: 25 }
    );
    assert.notDeepEqual(parNumero.get(2).limiteEstimee, {
      surah: t2.hafs.endSurah,
      ayah: t2.hafs.endAyah,
    });
  });

  it('marque l\'ecart quand la valeur Qaloun differe', () => {
    // Le mecanisme est eprouve sur des entrees construites : sur les donnees
    // reelles, le seul ecart porte sur le toumoun 454, et le jour ou il sera
    // relu il quittera les bornes estimees. Un test qui n'existerait que par lui
    // tomberait ce jour-la, sans qu'aucun defaut n'ait ete introduit.
    const synthetique = (hafs, qaloun) => ({
      thumnNumber: 1,
      hizbNumber: 1,
      rubNumber: 1,
      isRubStart: false,
      verificationStatus: 'estimated_offset',
      hafs: {
        startSurah: hafs[0],
        startAyah: hafs[1],
        startAyahId: 1,
        endSurah: hafs[0],
        endAyah: hafs[1],
        endAyahId: 1,
      },
      qalounReference: { startSurah: qaloun[0], startAyah: qaloun[1] },
    });

    // Meme limite des deux cotes : aucun ecart.
    const [identique] = bornesEstimees([synthetique([5, 2], [5, 2])]);
    assert.equal(identique.ecart, false);
    assert.deepEqual(identique.limiteEstimee, { surah: 5, ayah: 2 });
    assert.deepEqual(identique.limiteQaloun, { surah: 5, ayah: 2 });

    // Le numero de verset differe : ecart.
    const [parAyah] = bornesEstimees([synthetique([70, 18], [70, 19])]);
    assert.equal(parAyah.ecart, true);

    // La sourate seule differe : ecart aussi. C'est le cas ou le relecteur
    // ouvrirait le mauvais moushaf.
    const [parSourate] = bornesEstimees([synthetique([5, 2], [4, 2])]);
    assert.equal(parSourate.ecart, true);

    // Et l'ecart reel, tant que le toumoun 454 n'a pas ete relu.
    const parNumero = new Map(bornesEstimees(thumn).map((b) => [b.thumnNumber, b]));
    const toumoun454 = parNumero.get(454);
    if (toumoun454) {
      assert.equal(toumoun454.ecart, true);
      assert.deepEqual(toumoun454.limiteEstimee, { surah: 70, ayah: 18 });
      assert.deepEqual(toumoun454.limiteQaloun, { surah: 70, ayah: 19 });
    }
  });

  it('ne marque l\'ecart que sur la limite, et il est rare', () => {
    // Mesure, et non impression : sur les 151 limites estimees, une seule a une
    // valeur Hafs differente de sa reference Qaloun. C'est peu, et c'est
    // normal — le report conserve le numero de verset tant que le decalage
    // cumulatif est nul. L'incertitude, elle, vient de ce que la sourate n'a pas
    // le meme nombre de versets dans les deux lectures : elle ne se lit pas dans
    // cette colonne, et c'est le statut qui la porte.
    //
    // Le test dit « au plus une, et jamais ailleurs qu'en 454 » plutot que
    // « exactement [454] » : le jour ou le toumoun 454 sera relu, il quittera
    // les bornes estimees, la liste sera vide, et ce test restera vrai. Une
    // assertion sur la liste exacte aurait echoue ce jour-la sans qu'aucun
    // defaut n'ait ete introduit.
    const ecarts = bornesEstimees(thumn).filter((b) => b.ecart);
    assert.ok(ecarts.length <= 1, `${ecarts.length} ecarts sur les limites estimees`);
    for (const borne of ecarts) {
      assert.equal(borne.thumnNumber, 454);
    }
  });

  it('porte le hizb et le rub\' de chaque borne', () => {
    const borne = bornesEstimees(thumn).find((b) => b.thumnNumber === 2);
    assert.equal(borne.hizbNumber, 1);
    assert.equal(borne.rubNumber, 1);
  });
});

describe('formaterBorne', () => {
  it('ecrit sourate:verset', () => {
    assert.equal(formaterBorne({ surah: 2, ayah: 25 }), '2:25');
    assert.equal(formaterBorne({ surah: 114, ayah: 6 }), '114:6');
  });
});

describe('grouperParSourate', () => {
  it('regroupe sans perdre de borne', () => {
    const bornes = bornesEstimees(thumn);
    const groupes = grouperParSourate(bornes, sourates);
    const total = groupes.reduce((somme, g) => somme + g.bornes.length, 0);
    assert.equal(total, bornes.length);
  });

  it('range chaque borne sous la sourate de sa limite estimee', () => {
    const groupes = grouperParSourate(bornesEstimees(thumn), sourates);
    for (const groupe of groupes) {
      for (const borne of groupe.bornes) {
        assert.equal(borne.limiteEstimee.surah, groupe.surah);
      }
    }
  });

  it('range une borne sous la sourate de sa limite, non de sa reference Qaloun', () => {
    // Ce test construit sa borne, et il le faut : sur les donnees reelles, les
    // deux sourates coincident partout — le seul ecart Hafs/Qaloun porte sur le
    // toumoun 454, ou les deux valent la sourate 70. Grouper par l'une ou par
    // l'autre donnerait donc exactement les memes groupes, et le controle ne
    // pourrait pas echouer. C'est le cas ou la limite et la reference divergent
    // qu'il faut eprouver, parce que c'est celui ou le relecteur ouvrirait le
    // mauvais moushaf.
    const groupes = grouperParSourate(
      [
        {
          thumnNumber: 1,
          hizbNumber: 1,
          rubNumber: 1,
          limiteEstimee: { surah: 5, ayah: 2 },
          limiteQaloun: { surah: 4, ayah: 3 },
          ecart: true,
        },
      ],
      sourates
    );
    assert.equal(groupes.length, 1);
    assert.equal(groupes[0].surah, 5);
  });

  it('suit la sourate de la limite, qui est celle ou l\'on ouvre le moushaf', () => {
    // C'est la limite qu'il faut confronter au moushaf, donc c'est sous sa
    // sourate que la ligne doit se lire. Le toumoun 84 commence en 4:171 : il
    // se range sous la sourate 4.
    const groupes = grouperParSourate(bornesEstimees(thumn), sourates);
    const groupe4 = groupes.find((g) => g.surah === 4);
    assert.ok(groupe4, 'la sourate 4 doit avoir un groupe');
    assert.ok(
      groupe4.bornes.some((b) => b.thumnNumber === 84),
      'le toumoun 84 doit etre range sous la sourate 4'
    );
  });

  it('nomme les sourates depuis surahs.json', () => {
    const groupes = grouperParSourate(bornesEstimees(thumn), sourates);
    const groupe2 = groupes.find((g) => g.surah === 2);
    assert.equal(groupe2.nomFr, 'Al-Baqarah (La Vache)');
  });

  it('rend null plutot qu\'un nom invente pour une sourate absente', () => {
    const groupes = grouperParSourate(
      [{ thumnNumber: 1, hizbNumber: 1, rubNumber: 1, limiteEstimee: { surah: 200, ayah: 1 }, limiteQaloun: { surah: 200, ayah: 1 }, ecart: false }],
      sourates
    );
    assert.equal(groupes[0].nomFr, null);
  });

  it('ordonne les groupes par numero de sourate', () => {
    const groupes = grouperParSourate(bornesEstimees(thumn), sourates);
    const numeros = groupes.map((g) => g.surah);
    assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b));
  });
});

describe('indexGlobal', () => {
  it('situe le premier verset du Coran', () => {
    assert.equal(indexGlobal(sourates, { surah: 1, ayah: 1 }), 1);
  });

  it('situe le premier verset de la deuxieme sourate', () => {
    assert.equal(indexGlobal(sourates, { surah: 2, ayah: 1 }), 8);
  });

  it('situe le dernier verset du Coran', () => {
    assert.equal(indexGlobal(sourates, { surah: 114, ayah: 6 }), 6236);
  });

  it('refuse une sourate inconnue', () => {
    assert.equal(indexGlobal(sourates, { surah: 115, ayah: 1 }), null);
  });

  it('refuse un verset au-dela de la sourate', () => {
    // La sourate 1 compte 7 versets : le huitieme n'existe pas.
    assert.equal(indexGlobal(sourates, { surah: 1, ayah: 8 }), null);
    assert.equal(indexGlobal(sourates, { surah: 2, ayah: 287 }), null);
  });

  it('refuse un numero de verset nul ou negatif', () => {
    assert.equal(indexGlobal(sourates, { surah: 1, ayah: 0 }), null);
    assert.equal(indexGlobal(sourates, { surah: 1, ayah: -3 }), null);
  });
});

describe('verifierContinuite', () => {
  it('ne trouve aucune rupture dans les donnees reelles', () => {
    assert.deepEqual(verifierContinuite(thumn), []);
  });

  it('signale un trou entre deux toumoun', () => {
    const rupture = verifierContinuite([
      { ...thumn[0], thumnNumber: 1, hafs: { ...thumn[0].hafs, endAyahId: 19 } },
      { ...thumn[1], thumnNumber: 2, hafs: { ...thumn[1].hafs, startAyahId: 25 } },
    ]);
    assert.equal(rupture.length, 1);
    assert.match(rupture[0], /toumoun 2/);
  });
});

describe('limitesDesToumoun', () => {
  it('rend une limite pour chacun des 480 toumoun', () => {
    assert.equal(limites.length, 480);
  });

  it('porte le premier verset du toumoun et sa position globale', () => {
    const limite2 = limites.find((l) => l.thumnNumber === 2);
    assert.deepEqual(limite2.debut, { surah: 2, ayah: 13 });
    assert.equal(limite2.index, 20);
  });

  it('rend les limites dans l\'ordre du Coran', () => {
    const numeros = limites.map((l) => l.thumnNumber);
    assert.deepEqual(numeros, [...numeros].sort((a, b) => a - b));
  });
});

describe('verifierCoherence', () => {
  it('accepte la limite des donnees', () => {
    // Le toumoun 2 commence en 2:13, entre le debut du toumoun 1 (1:1) et
    // celui du toumoun 3 (2:26).
    assert.equal(verifierCoherence(limites, sourates, 2, { surah: 2, ayah: 13 }), null);
  });

  it('refuse un verset qui n\'existe pas', () => {
    const motif = verifierCoherence(limites, sourates, 2, { surah: 2, ayah: 300 });
    assert.ok(motif, 'un verset hors de la sourate doit etre refuse');
    assert.match(motif, /286/);
  });

  it('refuse une sourate qui n\'existe pas', () => {
    const motif = verifierCoherence(limites, sourates, 2, { surah: 130, ayah: 1 });
    assert.ok(motif);
    assert.match(motif, /114/);
  });

  it('refuse une limite qui precederait le debut du toumoun precedent', () => {
    // Le toumoun 1 commence en 1:1. La limite du toumoun 2 doit le suivre,
    // sinon le toumoun 1 serait vide.
    const motif = verifierCoherence(limites, sourates, 2, { surah: 1, ayah: 1 });
    assert.ok(motif);
    assert.match(motif, /toumoun 1/);
  });

  it('refuse une limite qui atteindrait le debut du toumoun suivant', () => {
    // Le toumoun 3 commence en 2:26 : y placer la limite du toumoun 2 rendrait
    // le toumoun 3 vide.
    const motif = verifierCoherence(limites, sourates, 2, { surah: 2, ayah: 26 });
    assert.ok(motif);
    assert.match(motif, /toumoun 3/);
  });

  it('refuse un toumoun qui n\'est pas dans les donnees', () => {
    const motif = verifierCoherence(limites, sourates, 999, { surah: 2, ayah: 13 });
    assert.ok(motif);
    assert.match(motif, /999/);
  });

  it('accepte une limite voisine plausible', () => {
    // 2:20 tient entre le debut du toumoun 1 (1:1) et celui du toumoun 3 (2:26).
    assert.equal(verifierCoherence(limites, sourates, 2, { surah: 2, ayah: 20 }), null);
  });
});
