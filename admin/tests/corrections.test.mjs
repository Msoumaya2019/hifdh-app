// ============================================================================
// Ce qui sort du tableau de bord, et ce qui n'en sort pas.
//
// Le fichier de corrections sera applique par un script de l'application, qui
// modifiera un fichier de divisions. Une ligne incoherente qui passerait
// jusqu'a lui serait bien plus couteuse a rattraper qu'un refus ici : ces
// tests portent donc surtout sur les refus.
//
// Ce qui est relu est une LIMITE, c'est-a-dire le **premier verset** d'un
// toumoun — la valeur que porte `estimated_offset`. Les vecteurs de ce fichier
// sont donc les debuts reels, releves dans `thumn_hafs.json` :
//
//   toumoun 1 : debut 1:1   (verified_hafs, ouvre un rub')
//   toumoun 2 : debut 2:13  (estimee)      fin 2:25
//   toumoun 3 : debut 2:26  (verified_hafs, ouvre un rub')
//   toumoun 83: debut 4:163 (verified_hafs)
//   toumoun 84: debut 4:171 (estimee)      fin 4:176
//   toumoun 85: debut 5:1   (verified_hafs, ouvre un rub')
//
// L'ancien vecteur etait `2:25`, c'est-a-dire la **fin** du toumoun 2 : un
// relecteur envoye la verifiait un verset qui n'a jamais ete en doute, et la
// limite reellement estimee — 2:13 — n'etait relue par personne.
// ============================================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { bornesEstimees, limitesDesToumoun } from '../src/lib/bornes.ts';
import {
  analyserEntier,
  borneRetenue,
  construireFichierCorrections,
  resumerVerifications,
  texteFichierCorrections,
  validerSaisie,
} from '../src/lib/corrections.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DONNEES = join(ICI, '..', 'src', 'donnees');

const thumn = JSON.parse(readFileSync(join(DONNEES, 'thumn_hafs.json'), 'utf8')).thumn;
const sourates = JSON.parse(readFileSync(join(DONNEES, 'surahs.json'), 'utf8'));
const limites = limitesDesToumoun(thumn);

describe('limitesDesToumoun', () => {
  it('rend le debut du toumoun, et non sa fin', () => {
    // Le controle de coherence s'appuie sur cette liste : si elle portait la
    // fin, l'intervalle ou une correction est acceptee serait decale d'un
    // toumoun entier, et une borne fausse passerait.
    const toumoun2 = limites.find((l) => l.thumnNumber === 2);
    assert.deepEqual(toumoun2.debut, { surah: 2, ayah: 13 });
    assert.notDeepEqual(toumoun2.debut, { surah: 2, ayah: 25 });
  });

  it('porte l\'index global du debut', () => {
    // 2:13 est le 20e verset du Coran : la sourate 2 commence au verset 8.
    assert.equal(limites.find((l) => l.thumnNumber === 2).index, 20);
    assert.equal(limites.find((l) => l.thumnNumber === 1).index, 1);
  });

  it('couvre les 480 toumoun, dans l\'ordre', () => {
    assert.equal(limites.length, 480);
    for (let i = 1; i < limites.length; i += 1) {
      assert.ok(
        limites[i].index > limites[i - 1].index,
        `toumoun ${limites[i].thumnNumber} ne suit pas le precedent`
      );
    }
  });
});

describe('analyserEntier', () => {
  it('accepte un entier positif', () => {
    assert.equal(analyserEntier('2'), 2);
    assert.equal(analyserEntier('25'), 25);
    assert.equal(analyserEntier('  114  '), 114);
  });

  it('refuse une chaine vide ou blanche', () => {
    assert.equal(analyserEntier(''), null);
    assert.equal(analyserEntier('   '), null);
  });

  it('refuse un nombre decimal', () => {
    // `Number('2.5')` vaut 2.5, et un `parseInt` en ferait 2 en silence :
    // aucune des deux conversions ne doit passer pour un numero de verset.
    assert.equal(analyserEntier('2.5'), null);
  });

  it('refuse un signe', () => {
    assert.equal(analyserEntier('-3'), null);
    assert.equal(analyserEntier('+3'), null);
  });

  it('refuse du texte', () => {
    assert.equal(analyserEntier('abc'), null);
    assert.equal(analyserEntier('2a'), null);
    assert.equal(analyserEntier('0x10'), null);
  });

  it('accepte zero, que le controle de coherence refusera ensuite', () => {
    // Les deux controles sont separes : `analyserEntier` dit « c'est un
    // entier », `verifierCoherence` dit « ce verset existe ». Zero est un
    // entier, et n'est pas un verset.
    assert.equal(analyserEntier('0'), 0);
  });
});

describe('validerSaisie', () => {
  it('refuse une saisie incomplete', () => {
    const resultat = validerSaisie(limites, sourates, 2, '', '25');
    assert.equal(resultat.ok, false);
    assert.match(resultat.message, /entiers/);
  });

  it('refuse un verset qui n\'existe pas', () => {
    const resultat = validerSaisie(limites, sourates, 2, '2', '300');
    assert.equal(resultat.ok, false);
    assert.match(resultat.message, /286/);
  });

  it('refuse un verset zero', () => {
    const resultat = validerSaisie(limites, sourates, 2, '2', '0');
    assert.equal(resultat.ok, false);
  });

  it('refuse une limite egale a l\'estimation, en renvoyant vers Confirmer', () => {
    // 2:13 est deja le debut du toumoun 2. L'enregistrer comme « corrigee »
    // ferait croire a un travail de relecture qui n'a pas eu lieu.
    const resultat = validerSaisie(limites, sourates, 2, '2', '13');
    assert.equal(resultat.ok, false);
    assert.match(resultat.message, /Confirmer/);
  });

  it('refuse une limite qui atteindrait le toumoun suivant', () => {
    // Le toumoun 3 commence en 2:26 : s'y arreter recouvrirait son premier
    // verset.
    const resultat = validerSaisie(limites, sourates, 2, '2', '26');
    assert.equal(resultat.ok, false);
    assert.match(resultat.message, /toumoun 3/);
  });

  it('accepte une correction plausible et rend les deux nombres', () => {
    const resultat = validerSaisie(limites, sourates, 2, '2', '24');
    assert.equal(resultat.ok, true);
    assert.equal(resultat.surah, 2);
    assert.equal(resultat.ayah, 24);
  });

  it('accepte les deux bords de l\'intervalle, et refuse ce qui les depasse', () => {
    // L'intervalle du toumoun 2 va de 1:2 (juste apres le debut du toumoun 1)
    // a 2:25 (juste avant le debut du toumoun 3). Les deux bords sont inclus ;
    // au-dela, l'un des deux toumoun voisins serait vide.
    assert.equal(validerSaisie(limites, sourates, 2, '1', '2').ok, true);
    assert.equal(validerSaisie(limites, sourates, 2, '2', '25').ok, true);

    const tropTot = validerSaisie(limites, sourates, 2, '1', '1');
    assert.equal(tropTot.ok, false);
    assert.match(tropTot.message, /toumoun 1/);

    assert.equal(validerSaisie(limites, sourates, 2, '2', '26').ok, false);
  });

  it('accepte une correction qui change de sourate', () => {
    // Le toumoun 2 s'etend du 1:2 au 2:25 : une limite en 1:3 tient donc dans
    // l'intervalle, bien qu'elle ramene le debut du toumoun dans la sourate 1.
    assert.equal(validerSaisie(limites, sourates, 2, '1', '3').ok, true);
    assert.equal(validerSaisie(limites, sourates, 2, '2', '24').ok, true);
  });

  it('refuse une limite qui atteindrait le suivant, meme en changeant de sourate', () => {
    // Le toumoun 85 commence en 5:1. Le toumoun 84 (4:171 - 4:176) ne peut
    // donc pas etre etendu jusque dans la sourate 5 : 5:1 est deja le suivant.
    const refus = validerSaisie(limites, sourates, 84, '5', '1');
    assert.equal(refus.ok, false);
    assert.match(refus.message, /toumoun 85/);

    // Et 5:6, qui est plus loin encore, est refuse pour la meme raison.
    assert.equal(validerSaisie(limites, sourates, 84, '5', '6').ok, false);
  });

  it('accepte une limite du toumoun 84 prise dans sa propre sourate', () => {
    assert.equal(validerSaisie(limites, sourates, 84, '4', '175').ok, true);
  });
});

describe('resumerVerifications', () => {
  const bornes = bornesEstimees(thumn);

  it('compte tout comme restant quand rien n\'est relu', () => {
    const resume = resumerVerifications(bornes, []);
    assert.deepEqual(resume, { total: 151, confirmees: 0, corrigees: 0, restantes: 151 });
  });

  it('separe les confirmations des corrections', () => {
    const resume = resumerVerifications(bornes, [
      { thumnNumber: 2, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
      { thumnNumber: 4, statut: 'corrigee', limiteSurah: 2, limiteAyah: 42, note: null },
    ]);
    assert.deepEqual(resume, { total: 151, confirmees: 1, corrigees: 1, restantes: 149 });
  });

  it('ignore une ligne qui ne porte pas sur une borne estimee', () => {
    // Le toumoun 1 est verifie : une ligne a son sujet ne doit pas gonfler le
    // compte, sinon le total depasserait les 151 bornes a relire.
    const resume = resumerVerifications(bornes, [
      { thumnNumber: 1, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
    ]);
    assert.deepEqual(resume, { total: 151, confirmees: 0, corrigees: 0, restantes: 151 });
  });
});

describe('construireFichierCorrections', () => {
  const meta = { genereLe: '2026-09-22T12:00:00.000Z', sourceEmpreinte: 'abc123' };

  it('produit un fichier versionne, date et marque', () => {
    const fichier = construireFichierCorrections(
      [{ thumnNumber: 2, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null }],
      meta
    );
    assert.equal(fichier.version, 1);
    assert.equal(fichier.genereLe, meta.genereLe);
    assert.equal(fichier.sourceEmpreinte, 'abc123');
    assert.equal(fichier.total, 1);
  });

  it('trie les lignes par numero de toumoun', () => {
    const fichier = construireFichierCorrections(
      [
        { thumnNumber: 20, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
        { thumnNumber: 4, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
        { thumnNumber: 12, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
      ],
      meta
    );
    assert.deepEqual(
      fichier.corrections.map((c) => c.thumnNumber),
      [4, 12, 20]
    );
  });

  it('refuse une correction sans limite complete', () => {
    assert.throws(
      () =>
        construireFichierCorrections(
          [{ thumnNumber: 2, statut: 'corrigee', limiteSurah: 2, limiteAyah: null, note: null }],
          meta
        ),
      /corrige sans borne complete/
    );
  });

  it('refuse une confirmation qui porte une limite', () => {
    assert.throws(
      () =>
        construireFichierCorrections(
          [{ thumnNumber: 2, statut: 'confirmee', limiteSurah: 2, limiteAyah: 13, note: null }],
          meta
        ),
      /confirme et porte pourtant une borne/
    );
  });

  it('refuse un toumoun en double', () => {
    assert.throws(
      () =>
        construireFichierCorrections(
          [
            { thumnNumber: 2, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
            { thumnNumber: 2, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null },
          ],
          meta
        ),
      /deux fois/
    );
  });

  it('refuse un numero hors des 480 toumoun', () => {
    assert.throws(
      () =>
        construireFichierCorrections(
          [{ thumnNumber: 481, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null }],
          meta
        ),
      /hors bornes/
    );
    assert.throws(
      () =>
        construireFichierCorrections(
          [{ thumnNumber: 0, statut: 'confirmee', limiteSurah: null, limiteAyah: null, note: null }],
          meta
        ),
      /hors bornes/
    );
  });

  it('produit un JSON relisible, termine par un retour a la ligne', () => {
    const texte = texteFichierCorrections(
      construireFichierCorrections(
        [
          {
            thumnNumber: 2,
            statut: 'corrigee',
            limiteSurah: 2,
            limiteAyah: 24,
            note: 'relu sur le moushaf',
          },
        ],
        meta
      )
    );
    assert.ok(texte.endsWith('\n'));
    const relu = JSON.parse(texte);
    assert.equal(relu.corrections[0].limiteAyah, 24);
    assert.equal(relu.corrections[0].note, 'relu sur le moushaf');
  });

  it('accepte un fichier vide', () => {
    const fichier = construireFichierCorrections([], meta);
    assert.equal(fichier.total, 0);
    assert.deepEqual(fichier.corrections, []);
  });
});

describe('borneRetenue', () => {
  const borne = bornesEstimees(thumn).find((b) => b.thumnNumber === 2);

  it('rend l\'estimation quand rien n\'a ete dit', () => {
    assert.deepEqual(borneRetenue(borne, undefined), { surah: 2, ayah: 13 });
  });

  it('rend l\'estimation quand la limite a ete confirmee', () => {
    assert.deepEqual(
      borneRetenue(borne, {
        thumnNumber: 2,
        statut: 'confirmee',
        limiteSurah: null,
        limiteAyah: null,
        note: null,
      }),
      { surah: 2, ayah: 13 }
    );
  });

  it('rend la limite corrigee quand il y en a une', () => {
    assert.deepEqual(
      borneRetenue(borne, {
        thumnNumber: 2,
        statut: 'corrigee',
        limiteSurah: 2,
        limiteAyah: 24,
        note: null,
      }),
      { surah: 2, ayah: 24 }
    );
  });

  it('rend l\'estimation si la correction est incomplete', () => {
    // Une ligne « corrigee » sans limite ne devrait pas exister — la contrainte
    // SQL l'interdit. Si elle arrive quand meme, on n'invente pas une limite.
    assert.deepEqual(
      borneRetenue(borne, {
        thumnNumber: 2,
        statut: 'corrigee',
        limiteSurah: null,
        limiteAyah: null,
        note: null,
      }),
      { surah: 2, ayah: 13 }
    );
  });
});
