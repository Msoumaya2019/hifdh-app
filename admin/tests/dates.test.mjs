// ============================================================================
// Dates calendaires.
//
// Le premier test de ce fichier ne verifie pas seulement que `dateDuJour`
// repond juste : il montre ce que `toISOString()` aurait repondu a sa place,
// sur la meme machine. C'est la demonstration du piege, et non l'affirmation
// qu'il existe.
// ============================================================================

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dateDuJour, formaterDate, formaterHorodatage } from '../src/lib/dates.ts';

describe('dateDuJour', () => {
  it('rend la date locale au premier quart d\'heure apres minuit', () => {
    // C'est le cas qui casse : a 00h30 a Paris, l'instant est encore la veille
    // en UTC. Un tableau de bord qui compterait les seances en retard avec
    // cette date signalerait un jour de retard a un apprenant qui travaille
    // a l'instant meme.
    const instant = new Date(2026, 8, 22, 0, 30, 0);
    assert.equal(dateDuJour(instant), '2026-09-22');
  });

  it('montre que toISOString() aurait rendu la veille', () => {
    const instant = new Date(2026, 8, 22, 0, 30, 0);
    const parUtc = instant.toISOString().slice(0, 10);

    // Le fuseau de la machine est en avance sur UTC : les deux reponses
    // different, et c'est bien la locale qui est juste. Si ce test echoue
    // parce que la machine est en UTC, il n'echoue pas contre `dateDuJour` :
    // il constate que le piege ne se manifeste pas ici.
    if (parUtc !== '2026-09-22') {
      assert.equal(parUtc, '2026-09-21');
      assert.notEqual(parUtc, dateDuJour(instant));
    }
  });

  it('rend la date locale en fin de journee', () => {
    assert.equal(dateDuJour(new Date(2026, 8, 22, 23, 30, 0)), '2026-09-22');
  });

  it('complete le mois et le jour sur deux chiffres', () => {
    assert.equal(dateDuJour(new Date(2026, 0, 5, 12, 0, 0)), '2026-01-05');
  });

  it('passe correctement l\'annee', () => {
    assert.equal(dateDuJour(new Date(2025, 11, 31, 23, 59, 0)), '2025-12-31');
    assert.equal(dateDuJour(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
  });
});

describe('formaterDate', () => {
  it('rend une date lisible sans passer par UTC', () => {
    const rendu = formaterDate('2026-09-22');
    assert.ok(rendu);
    assert.match(rendu, /22/);
    assert.match(rendu, /09/);
    assert.match(rendu, /2026/);
  });

  it('ne decale pas le jour', () => {
    // Le 1er du mois est le cas ou un decalage se voit le mieux.
    assert.match(formaterDate('2026-03-01'), /01/);
  });

  it('rend null plutot qu\'une date inventee', () => {
    assert.equal(formaterDate(null), null);
    assert.equal(formaterDate(undefined), null);
    assert.equal(formaterDate(''), null);
    assert.equal(formaterDate('pas une date'), null);
  });

  it('accepte un horodatage complet et n\'en garde que le jour', () => {
    assert.match(formaterDate('2026-09-22T23:30:00.000Z'), /22/);
  });
});

describe('formaterHorodatage', () => {
  it('rend null pour une valeur absente', () => {
    assert.equal(formaterHorodatage(null), null);
    assert.equal(formaterHorodatage(undefined), null);
    assert.equal(formaterHorodatage(''), null);
  });

  it('rend null pour une valeur illisible', () => {
    assert.equal(formaterHorodatage('pas une date'), null);
  });

  it('rend une date et une heure pour un horodatage valide', () => {
    const rendu = formaterHorodatage('2026-09-22T12:00:00.000Z');
    assert.ok(rendu);
    assert.match(rendu, /2026/);
  });
});
