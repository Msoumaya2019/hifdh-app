// ============================================================================
// Le suivi des apprenants : traduction des codes, et lecture des compteurs.
//
// Le point sensible de ce fichier est le `null`. Un compteur absent, une date
// absente, un objectif inconnu : chacun doit rester visible comme une absence,
// et non se replier sur zero ou sur une valeur de remplacement. Un apprenant
// qui n'a jamais termine de seance n'est pas un apprenant « en retard de 0 ».
// ============================================================================

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  afficherNombre,
  direDerniereSeance,
  ecartEnJours,
  nombre,
  objectifLisible,
  synthetiser,
} from '../src/lib/apprenants.ts';

describe('objectifLisible', () => {
  it('traduit les six objectifs de l\'application', () => {
    assert.deepEqual(objectifLisible('full_quran'), { texte: 'Coran entier', traduit: true });
    assert.deepEqual(objectifLisible('juz_amma'), { texte: "Juz' 'Amma", traduit: true });
    assert.deepEqual(objectifLisible('hizb_sabbih'), {
      texte: 'Hizb Sabbih (hizb 60)',
      traduit: true,
    });
    assert.deepEqual(objectifLisible('specific_juz'), { texte: "Juz' choisi", traduit: true });
    assert.deepEqual(objectifLisible('specific_hizb'), {
      texte: 'Hizb(s) choisi(s)',
      traduit: true,
    });
    assert.deepEqual(objectifLisible('custom'), { texte: 'Passages choisis', traduit: true });
  });

  it('rend null quand il n\'y a pas d\'objectif', () => {
    assert.equal(objectifLisible(null), null);
    assert.equal(objectifLisible(undefined), null);
    assert.equal(objectifLisible(''), null);
  });

  it('rend le code tel quel, et le dit, quand il est inconnu', () => {
    // Un objectif ajoute dans l'application ne doit pas etre traduit au juge,
    // ni masque : il doit apparaitre, signale comme non traduit.
    assert.deepEqual(objectifLisible('juz_tabarak'), {
      texte: 'juz_tabarak',
      traduit: false,
    });
  });

  it('ne traduit pas « hizb_sabbih » en un hizb quelconque', () => {
    // Le hizb Sabbih est le hizb 60, celui qui commence a la sourate 87. Le
    // confondre avec le hizb 1 enverrait l'apprenant au mauvais endroit.
    const libelle = objectifLisible('hizb_sabbih');
    assert.match(libelle.texte, /60/);
  });
});

describe('nombre', () => {
  it('accepte un nombre', () => {
    assert.equal(nombre(0), 0);
    assert.equal(nombre(42), 42);
    assert.equal(nombre(-3), -3);
  });

  it('accepte un entier rendu en chaine, comme le fait PostgREST pour BIGINT', () => {
    assert.equal(nombre('0'), 0);
    assert.equal(nombre('1234'), 1234);
    assert.equal(nombre('  17  '), 17);
  });

  it('refuse une valeur absente plutot que de la lire zero', () => {
    // `Number(null)` vaut 0 et `Number('')` vaut 0 : aucune des deux conversions
    // ne doit passer. Une absence n'est pas un zero.
    assert.equal(nombre(null), null);
    assert.equal(nombre(undefined), null);
    assert.equal(nombre(''), null);
    assert.equal(nombre('   '), null);
  });

  it('refuse ce qui n\'est pas un entier', () => {
    assert.equal(nombre('2.5'), null);
    assert.equal(nombre(2.5), null);
    assert.equal(nombre('beaucoup'), null);
    assert.equal(nombre({}), null);
    assert.equal(nombre([]), null);
    assert.equal(nombre(Number.NaN), null);
    assert.equal(nombre(Number.POSITIVE_INFINITY), null);
  });
});

describe('afficherNombre', () => {
  it('rend le nombre quand il y en a un', () => {
    assert.equal(afficherNombre(7), '7');
    assert.equal(afficherNombre('7'), '7');
    assert.equal(afficherNombre(0), '0');
  });

  it('rend un tiret quand il n\'y en a pas', () => {
    assert.equal(afficherNombre(null), '—');
    assert.equal(afficherNombre(undefined), '—');
    assert.equal(afficherNombre(''), '—');
  });
});

describe('ecartEnJours', () => {
  it('compte zero pour le meme jour', () => {
    assert.equal(ecartEnJours('2026-09-22', '2026-09-22'), 0);
  });

  it('compte un jour', () => {
    assert.equal(ecartEnJours('2026-09-21', '2026-09-22'), 1);
  });

  it('compte sur un changement de mois', () => {
    assert.equal(ecartEnJours('2026-08-31', '2026-09-01'), 1);
  });

  it('compte sur un changement d\'annee', () => {
    assert.equal(ecartEnJours('2025-12-31', '2026-01-01'), 1);
  });

  it('traverse le changement d\'heure sans perdre un jour', () => {
    // En France, le dernier dimanche d'octobre compte 25 heures. Un calcul en
    // millisecondes divise par 24 donnerait 1,04 jour, et un arrondi vers le
    // bas donnerait 1 — mais sans arrondi du tout, on lirait « 1,04 jour ».
    assert.equal(ecartEnJours('2026-10-24', '2026-10-26'), 2);
  });

  it('rend null quand une date manque', () => {
    assert.equal(ecartEnJours(null, '2026-09-22'), null);
    assert.equal(ecartEnJours(undefined, '2026-09-22'), null);
    assert.equal(ecartEnJours('', '2026-09-22'), null);
  });

  it('rend null quand une date est illisible', () => {
    assert.equal(ecartEnJours('pas une date', '2026-09-22'), null);
  });
});

describe('direDerniereSeance', () => {
  it('dit « aujourd\'hui » pour le jour meme', () => {
    assert.equal(direDerniereSeance('2026-09-22', '2026-09-22'), "aujourd'hui");
  });

  it('dit « hier »', () => {
    assert.equal(direDerniereSeance('2026-09-21', '2026-09-22'), 'hier');
  });

  it('compte les jours au-dela', () => {
    assert.equal(direDerniereSeance('2026-09-12', '2026-09-22'), 'il y a 10 jours');
  });

  it('rend null quand il n\'y a jamais eu de seance', () => {
    // Le point important : un compte qui n'a jamais travaille ne doit pas
    // s'afficher « il y a 0 jours », ce qui le ferait passer pour actif.
    assert.equal(direDerniereSeance(null, '2026-09-22'), null);
    assert.equal(direDerniereSeance(undefined, '2026-09-22'), null);
  });
});

describe('synthetiser', () => {
  const ligne = (partiel = {}) => ({
    user_id: 'u',
    nom: 'Nom',
    role: 'apprenant',
    inscrit_le: '2026-01-01T00:00:00Z',
    versets_memorises: 0,
    passages_memorises: 0,
    seances_total: 0,
    seances_terminees: 0,
    seances_retard: 0,
    revisions_dues: 0,
    derniere_seance: null,
    objectif: null,
    ...partiel,
  });

  it('compte les comptes', () => {
    const synthese = synthetiser([ligne(), ligne(), ligne()]);
    assert.equal(synthese.comptes, 3);
  });

  it('separe les administrateurs', () => {
    const synthese = synthetiser([
      ligne({ role: 'administrateur' }),
      ligne({ role: 'apprenant' }),
    ]);
    assert.equal(synthese.administrateurs, 1);
  });

  it('compte les retards et les revisions dues', () => {
    const synthese = synthetiser([
      ligne({ seances_retard: 2, revisions_dues: 5 }),
      ligne({ seances_retard: 0, revisions_dues: 1 }),
      ligne({ seances_retard: 3, revisions_dues: 0 }),
    ]);
    assert.equal(synthese.avecRetard, 2);
    assert.equal(synthese.avecRevisionsDues, 2);
  });

  it('compte les comptes sans aucune seance terminee', () => {
    const synthese = synthetiser([
      ligne({ derniere_seance: '2026-09-20' }),
      ligne({ derniere_seance: null }),
    ]);
    assert.equal(synthese.sansSeance, 1);
  });

  it('ne compte pas un retard absent comme un retard nul', () => {
    // Une valeur absente ne doit pas etre comptee « en retard », ni exclue du
    // compte : elle est simplement inconnue, donc non comptee.
    const synthese = synthetiser([ligne({ seances_retard: null })]);
    assert.equal(synthese.avecRetard, 0);
  });

  it('accepte une liste vide', () => {
    assert.deepEqual(synthetiser([]), {
      comptes: 0,
      administrateurs: 0,
      avecRetard: 0,
      avecRevisionsDues: 0,
      sansSeance: 0,
    });
  });
});
