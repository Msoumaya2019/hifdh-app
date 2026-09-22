// Accord entre les deux versions de l'application.
//
// La version vit dans deux fichiers, et un seul est lu par les flux de
// compilation : `app.json` nomme l'artefact produit (`hifdh-1.0.3.apk`),
// `package.json` sert à npm et n'est lu par personne d'autre.
//
// Deux endroits qui portent la même vérité sans pouvoir se lire dérivent tôt ou
// tard, et l'écart ne se voit que dans un nom de fichier — c'est-à-dire au
// moment où l'on croit télécharger la bonne version. Ce test les tient
// ensemble, faute de pouvoir les fusionner : npm exige un champ `version`, et
// Expo exige le sien.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lire = (nom) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../${nom}`, import.meta.url)), 'utf8'));

test('la version d’app.json et celle de package.json s’accordent', () => {
  const versionExpo = lire('app.json').expo.version;
  const versionNpm = lire('package.json').version;

  assert.equal(
    versionNpm,
    versionExpo,
    `app.json annonce ${versionExpo}, package.json annonce ${versionNpm}. ` +
      "Les flux nomment l'artefact d'après app.json : aligner les deux avant de publier."
  );
});

test('la version est une suite de nombres séparés par des points', () => {
  // Le nom de l'artefact est bâti par concaténation : une version vide ou
  // exotique produirait `hifdh-.apk` ou un nom que le repérage ne retrouverait
  // pas, et l'échec surviendrait après la compilation, pas avant.
  const version = lire('app.json').expo.version;
  assert.match(version, /^\d+\.\d+\.\d+$/, `version inattendue : ${version}`);
});
