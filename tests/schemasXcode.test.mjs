// Lecture de la liste des schémas d'un projet Xcode.
//
// Le script confirme un nom, il ne le choisit pas : il doit donc être tolérant
// au bruit de `xcodebuild`, et ne jamais casser un build valide en sortant en
// erreur. Ces cas figent les deux propriétés.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/lire-schemas-xcodebuild.mjs', import.meta.url));

function lire(entree) {
  const resultat = spawnSync(process.execPath, [SCRIPT], {
    input: entree,
    encoding: 'utf8',
  });
  return {
    code: resultat.status,
    lignes: resultat.stdout.split('\n').filter((l) => l !== ''),
  };
}

test('un JSON pur est lu', () => {
  const sortie = JSON.stringify({
    workspace: { schemes: ['MonApp', 'EXConstants', 'Pods-MonApp'] },
  });
  assert.deepEqual(lire(sortie).lignes, ['MonApp', 'EXConstants', 'Pods-MonApp']);
});

test('la forme « project » est acceptée comme la forme « workspace »', () => {
  // Sans CocoaPods, Expo produit un projet Xcode simple, et la réponse change
  // de clé. Refuser cette forme ferait échouer un build parfaitement valide.
  const sortie = JSON.stringify({ project: { schemes: ['MonApp'] } });
  assert.deepEqual(lire(sortie).lignes, ['MonApp']);
});

test('du bruit autour du JSON ne l’empêche pas d’être lu', () => {
  // Le cas réel : xcodebuild préfixe par des avertissements.
  const bruit =
    'warning: Using the first of multiple matching destinations\n' +
    '2026-09-22 08:00:00.000 xcodebuild[1234:5678] Some note\n';
  const sortie = `${bruit}{"workspace":{"schemes":["MonApp"]}}\n`;

  const resultat = lire(sortie);
  assert.equal(resultat.code, 0);
  assert.deepEqual(resultat.lignes, ['MonApp']);
});

test('un JSON tronqué ne fait pas échouer le script', () => {
  // Il rend la liste vide : l'étape du flux avertit alors, sans interrompre.
  const resultat = lire('{"workspace":{"schemes":["MonApp"');
  assert.equal(resultat.code, 0);
  assert.deepEqual(resultat.lignes, []);
});

test('une entrée vide ne fait pas échouer le script', () => {
  const resultat = lire('');
  assert.equal(resultat.code, 0);
  assert.deepEqual(resultat.lignes, []);
});

test('un JSON valide sans liste de schémas rend une liste vide', () => {
  const resultat = lire(JSON.stringify({ workspace: {} }));
  assert.equal(resultat.code, 0);
  assert.deepEqual(resultat.lignes, []);
});

test('les entrées qui ne sont pas des chaînes sont ignorées', () => {
  // Une liste malformée ne doit pas produire de lignes « undefined », qui
  // seraient ensuite comparées à un nom de schéma.
  const sortie = JSON.stringify({ workspace: { schemes: ['MonApp', 42, null, ''] } });
  assert.deepEqual(lire(sortie).lignes, ['MonApp']);
});

test('les espaces dans un nom de schéma sont préservés', () => {
  // Ils comptent : l'étape suivante met le nom entre guillemets.
  const sortie = JSON.stringify({ workspace: { schemes: ['Mon App'] } });
  assert.deepEqual(lire(sortie).lignes, ['Mon App']);
});
