// ============================================================================
// La forme des donnees lues.
//
// L'empreinte SHA-256 prouve que la copie est identique a la source. Elle ne
// dit rien de la forme de la source. Ces tests portent donc sur l'autre
// question : ce code sait-il lire ce fichier ?
//
// Chaque refus est verifie sur une valeur fabriquee, et l'acceptation sur le
// vrai fichier — un controle qui n'accepterait jamais rien serait aussi
// inutile qu'un controle qui accepterait tout.
// ============================================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { lireDonneesThumn, lireSourates } from '../src/lib/thumn.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DONNEES = join(ICI, '..', 'src', 'donnees');

const brutThumn = JSON.parse(readFileSync(join(DONNEES, 'thumn_hafs.json'), 'utf8'));
const brutSourates = JSON.parse(readFileSync(join(DONNEES, 'surahs.json'), 'utf8'));

/** Un toumoun minimal et valide, pour fabriquer des cas limites. */
const toumounValide = (numero = 1) => ({
  thumnNumber: numero,
  hizbNumber: 1,
  rubNumber: 1,
  isRubStart: true,
  hafs: { startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, startAyahId: 1, endAyahId: 7 },
  qalounReference: { startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, startAyahId: 1, endAyahId: 7 },
  source: 'test',
  verificationStatus: 'verified_hafs',
});

const fichierDe = (thumn) => ({ metadata: {}, thumn });

describe('lireDonneesThumn', () => {
  it('accepte le fichier reel', () => {
    const lecture = lireDonneesThumn(brutThumn);
    assert.equal(lecture.ok, true);
    assert.equal(lecture.valeur.thumn.length, 480);
  });

  it('refuse une valeur qui n\'est pas un objet', () => {
    assert.equal(lireDonneesThumn(null).ok, false);
    assert.equal(lireDonneesThumn('texte').ok, false);
    assert.equal(lireDonneesThumn(42).ok, false);
  });

  it('refuse un objet sans liste de toumoun', () => {
    const lecture = lireDonneesThumn({ metadata: {} });
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /thumn/);
  });

  it('refuse un fichier qui n\'a pas 480 toumoun', () => {
    // Le cas le plus vicieux : un fichier valide mais tronque. Il s'afficherait
    // partiellement, et l'ecran laisserait croire que le reste est verifie.
    const lecture = lireDonneesThumn(fichierDe([toumounValide(1)]));
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /1 toumoun au lieu de 480/);
  });

  it('refuse un statut inconnu, en le nommant', () => {
    const thumn = Array.from({ length: 480 }, (_, i) => toumounValide(i + 1));
    thumn[17] = { ...thumn[17], verificationStatus: 'peut_etre' };
    const lecture = lireDonneesThumn(fichierDe(thumn));
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /toumoun 18/);
    assert.match(lecture.message, /peut_etre/);
  });

  it('refuse un toumoun sans numero entier', () => {
    const thumn = Array.from({ length: 480 }, (_, i) => toumounValide(i + 1));
    thumn[0] = { ...thumn[0], thumnNumber: 'un' };
    const lecture = lireDonneesThumn(fichierDe(thumn));
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /numero entier/);
  });

  it('refuse un toumoun dont la fin n\'est pas situable', () => {
    // Sans `endAyahId`, aucun controle de coherence n'est possible : mieux vaut
    // le dire que d'afficher une liste qu'on ne saurait pas valider.
    const thumn = Array.from({ length: 480 }, (_, i) => toumounValide(i + 1));
    thumn[0] = { ...thumn[0], hafs: { ...thumn[0].hafs, endAyahId: undefined } };
    const lecture = lireDonneesThumn(fichierDe(thumn));
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /fin situable/);
  });
});

describe('lireSourates', () => {
  it('accepte le fichier reel', () => {
    const lecture = lireSourates(brutSourates);
    assert.equal(lecture.ok, true);
    assert.equal(lecture.valeur.length, 114);
  });

  it('refuse une valeur qui n\'est pas une liste', () => {
    assert.equal(lireSourates({}).ok, false);
    assert.equal(lireSourates(null).ok, false);
  });

  it('refuse une liste qui n\'a pas 114 sourates', () => {
    const lecture = lireSourates(brutSourates.slice(0, 113));
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /113 sourates au lieu de 114/);
  });

  it('refuse une sourate incomplete', () => {
    const copie = brutSourates.map((s) => ({ ...s }));
    delete copie[3].ayahCount;
    const lecture = lireSourates(copie);
    assert.equal(lecture.ok, false);
    assert.match(lecture.message, /sourate 4/);
  });
});
