// Les réglages d'apprentissage : ce que « absent » veut dire, et ce qu'une
// écriture ne doit pas effacer.
//
// DEUX DÉFAUTS SILENCIEUX SONT GARDÉS ICI, ET AUCUN NE SE VOIT À L'ÉCRAN :
//
//   1. **« absent » lu comme « désactivé ».** La configuration déjà enregistrée
//      chez ceux qui utilisent l'application n'a pas ce champ — il vient d'être
//      ajouté. Le lire à l'envers éteindrait la révision de tout le monde à la
//      mise à jour, et l'apprenant croirait avoir perdu ses passages ;
//   2. **une écriture qui remplace la ligne entière.** `saveUserConfig` remplace
//      TOUT : écrire un objet partiel effacerait l'objectif, l'agenda et les
//      passages mémorisés. Un interrupteur de révision qui efface la progression
//      est exactement le genre de défaut qui ne se signale pas.
//
// LE SECOND EST ÉPROUVÉ SUR CE QUI PART RÉELLEMENT. `@/lib/database` est
// remplacé au niveau du chargeur (`scripts/doublures.mjs`), et la doublure
// enregistre la charge écrite. Un test qui lirait le code source ne dirait que
// ce que le module prétend faire.
//
// LA DOUBLURE EST POSÉE AVANT LE PREMIER IMPORT, et c'est une contrainte du
// chargeur : il sert la doublure au moment du `load`, et Node met ensuite le
// module en cache. Importer `@/lib/apprentissage` d'abord figerait le VRAI
// `@/lib/database` dans ses dépendances, et la doublure n'aurait plus aucun
// effet — le banc passerait au vert sans rien traverser.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { poserDoublure, retirerToutesLesDoublures } from '../scripts/doublures.mjs';

/** La clé du journal partagé avec la doublure, qui s'évalue dans un autre contexte. */
const CLE = '__apprentissage_journal';

globalThis[CLE] = { config: null, lectures: 0, ecrites: [] };

poserDoublure(
  'src/lib/database.ts',
  [
    `export async function getUserConfig() {`,
    `  globalThis.${CLE}.lectures += 1;`,
    `  return globalThis.${CLE}.config;`,
    `}`,
    `export async function saveUserConfig(config) {`,
    `  globalThis.${CLE}.ecrites.push(config);`,
    `}`,
    `export async function getMemorizedPassages() { return []; }`,
  ].join('\n')
);

after(() => {
  retirerToutesLesDoublures();
  delete globalThis[CLE];
});

/** Remet le journal à zéro et fixe ce que la doublure rendra. */
function poserConfig(config) {
  globalThis[CLE] = { config, lectures: 0, ecrites: [] };
}

/** Une configuration complète, telle qu'elle existe après le questionnaire. */
function configComplete() {
  return {
    memorizedPassages: [{ surah: 2, startAyah: 1, endAyah: 5, level: 'perfect' }],
    objective: { type: 'juz_amma' },
    schedule: { unit: { type: 'verses', count: 3 }, days: [1, 2, 3, 4, 5, 6, 0] },
    onboardingCompleted: true,
    audio: { recitateurId: 'alafasy', vitesse: 1 },
  };
}

test('absent vaut ACTIF : une configuration sans le champ garde la révision', async () => {
  const { revisionsActives } = await import('@/lib/apprentissage');

  assert.equal(revisionsActives(null), true, 'aucune configuration lue n’est pas un refus');
  assert.equal(
    revisionsActives({ apprentissage: undefined }),
    true,
    'le champ absent est l’état de TOUTE configuration déjà enregistrée'
  );
  assert.equal(revisionsActives({ apprentissage: {} }), true, 'un objet vide ne désactive rien');
  assert.equal(revisionsActives({ apprentissage: { revisions: true } }), true);
});

test('désactivé est un refus EXPLICITE, et lui seul', async () => {
  const { revisionsActives } = await import('@/lib/apprentissage');
  assert.equal(revisionsActives({ apprentissage: { revisions: false } }), false);
});

test('enregistrer le réglage ne touche à RIEN d’autre dans la configuration', async () => {
  const config = configComplete();
  poserConfig(config);

  const { enregistrerRevisions } = await import('@/lib/apprentissage');
  await enregistrerRevisions(false);

  const journal = globalThis[CLE];
  assert.equal(journal.ecrites.length, 1, 'une seule écriture, et une seule');

  const ecrite = journal.ecrites[0];
  assert.equal(ecrite.apprentissage.revisions, false, 'le réglage demandé est bien écrit');

  // Le cœur du contrôle : `saveUserConfig` remplace la ligne entière, donc tout
  // ce qui n'est pas recopié est PERDU. On compare champ par champ.
  assert.deepEqual(ecrite.memorizedPassages, config.memorizedPassages, 'progression intacte');
  assert.deepEqual(ecrite.objective, config.objective, 'objectif intact');
  assert.deepEqual(ecrite.schedule, config.schedule, 'agenda intact');
  assert.deepEqual(ecrite.audio, config.audio, 'réglages audio intacts');
  assert.equal(ecrite.onboardingCompleted, true, 'questionnaire toujours marqué fait');
});

test('la relecture précède l’écriture, et c’est elle qui porte le reste', async () => {
  // Ce que la doublure rend est ce qui sera écrit : si le module écrivait un
  // objet fabriqué de son côté, `memorizedPassages` ne serait pas celui-ci.
  poserConfig({
    memorizedPassages: [{ surah: 114, startAyah: 1, endAyah: 6, level: 'needs_review' }],
    objective: { type: 'specific_juz', juzNumber: 30 },
    schedule: { unit: { type: 'half_page' }, days: [0, 6] },
    onboardingCompleted: true,
  });

  const { enregistrerRevisions } = await import('@/lib/apprentissage');
  await enregistrerRevisions(true);

  const journal = globalThis[CLE];
  assert.equal(journal.lectures, 1, 'la configuration est relue une fois avant d’écrire');
  assert.equal(journal.ecrites[0].memorizedPassages[0].surah, 114);
  assert.equal(journal.ecrites[0].objective.juzNumber, 30);
});

test('sans configuration enregistrée, il n’y a rien à régler', async () => {
  poserConfig(null);

  const { enregistrerRevisions } = await import('@/lib/apprentissage');
  const ecrit = await enregistrerRevisions(false);

  // Inventer une configuration par défaut ici déciderait à la place de
  // l'apprenant d'un objectif et d'un rythme qu'il n'a jamais choisis.
  assert.equal(
    globalThis[CLE].ecrites.length,
    0,
    'aucune configuration inventée quand il n’y en a pas'
  );

  // Et l'appelant doit pouvoir le SAVOIR. Ne rien écrire en silence ferait
  // revenir l'interrupteur tout seul au rendu suivant : l'écran afficherait un
  // réglage qui n'a pas été enregistré, sans un mot.
  assert.equal(ecrit, false, 'le refus d’écrire se voit dans la valeur rendue');
});

test('un enregistrement réussi se distingue d’un refus d’écrire', async () => {
  poserConfig(configComplete());

  const { enregistrerRevisions } = await import('@/lib/apprentissage');
  assert.equal(await enregistrerRevisions(true), true, 'écrit quand il y a de quoi écrire');
});
