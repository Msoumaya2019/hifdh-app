// Révision espacée (SRS).
//
// Le niveau de maîtrise pilote l'intervalle avant la prochaine révision. Deux
// propriétés comptent pour l'utilisateur : un passage réussi s'espace, un
// passage oublié revient vite.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNewCard,
  reviewCard,
  getRetentionPercentage,
} from '@/lib/spacedRepetition';

test('une nouvelle carte part du niveau 0, à réviser dès demain', () => {
  const carte = createNewCard();
  assert.equal(carte.level, 0);
  assert.equal(carte.reviewCount, 0);
  assert.equal(carte.intervalDays, 1);
});

test('une réponse parfaite fait monter d\'un niveau', () => {
  const apres = reviewCard(createNewCard(), 'perfect');
  assert.equal(apres.level, 1);
  assert.equal(apres.reviewCount, 1);
});

test('des révisions parfaites successives espacent les intervalles', () => {
  let carte = createNewCard();
  const intervalles = [];

  for (let i = 0; i < 9; i++) {
    carte = reviewCard(carte, 'perfect');
    intervalles.push(carte.intervalDays);
  }

  // Les intervalles doivent croître (au sens large) : un passage su se révise
  // de moins en moins souvent.
  for (let i = 1; i < intervalles.length; i++) {
    assert.ok(
      intervalles[i] >= intervalles[i - 1],
      `l'intervalle recule au niveau ${i + 1} : ${intervalles[i - 1]} -> ${intervalles[i]}`,
    );
  }

  assert.ok(intervalles.at(-1) > intervalles[0], 'les intervalles n\'augmentent jamais');
  assert.equal(carte.level, 8, 'le niveau doit plafonner à 8');
});

test('le niveau plafonne à 8 et ne dépasse jamais les intervalles connus', () => {
  let carte = createNewCard();
  for (let i = 0; i < 20; i++) carte = reviewCard(carte, 'perfect');

  assert.equal(carte.level, 8);
  assert.equal(carte.intervalDays, 90);
  assert.equal(carte.reviewCount, 20);
});

test('une hésitation reste un succès et fait monter d\'un niveau', () => {
  let carte = createNewCard();
  carte = reviewCard(carte, 'perfect'); // niveau 1
  carte = reviewCard(carte, 'hesitant');
  assert.equal(carte.level, 2);
});

test('des erreurs font redescendre au niveau 0 et revenir dès demain', () => {
  let carte = createNewCard();
  for (let i = 0; i < 5; i++) carte = reviewCard(carte, 'perfect');
  assert.ok(carte.level >= 5);

  const apres = reviewCard(carte, 'errors');
  assert.equal(apres.level, 0, 'le niveau doit repartir de zéro');
  assert.equal(apres.intervalDays, 1, 'le passage doit revenir dès demain');
  assert.equal(apres.reviewCount, carte.reviewCount + 1, 'la révision reste dans l\'historique');
});

test('« à réapprendre » remet aussi le niveau à zéro', () => {
  let carte = createNewCard();
  for (let i = 0; i < 4; i++) carte = reviewCard(carte, 'perfect');

  const apres = reviewCard(carte, 'relearn');
  assert.equal(apres.level, 0);
  assert.equal(apres.intervalDays, 1);
});

test('le facteur de facilité ne descend jamais sous 1,3', () => {
  let carte = createNewCard();
  for (let i = 0; i < 15; i++) carte = reviewCard(carte, 'relearn');

  assert.ok(carte.easinessFactor >= 1.3, `facteur ${carte.easinessFactor} sous le plancher`);
});

test('la rétention va de 0 % à 100 % sans dépasser', () => {
  assert.equal(getRetentionPercentage(0), 0);
  assert.equal(getRetentionPercentage(8), 100);
  assert.equal(getRetentionPercentage(4), 50);
  assert.equal(getRetentionPercentage(20), 100, 'la rétention ne doit pas dépasser 100 %');
});

test('le niveau après échec ne dépend pas du niveau atteint avant', () => {
  const depuisBas = reviewCard(reviewCard(createNewCard(), 'perfect'), 'errors');
  const depuisHaut = (() => {
    let carte = createNewCard();
    for (let i = 0; i < 7; i++) carte = reviewCard(carte, 'perfect');
    return reviewCard(carte, 'errors');
  })();

  assert.equal(depuisBas.level, depuisHaut.level);
  assert.equal(depuisBas.intervalDays, depuisHaut.intervalDays);
});
