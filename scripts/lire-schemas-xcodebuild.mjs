// Lit la liste des schémas produite par `xcodebuild -list -json`.
//
// Ce script ne CHOISIT pas un schéma : il en confirme un. Le schéma retenu est
// celui du projet de l'application, déduit de son `.xcodeproj`. Prendre le
// premier de la liste compilait un pod — `xcodebuild -list` énumère aussi les
// schémas des dépendances CocoaPods, et `EXConstants` arrive alphabétiquement
// avant l'application.
//
// D'où deux propriétés, et elles comptent plus que la lecture elle-même :
//
//   - il tolère le bruit. `xcodebuild` entoure parfois son JSON
//     d'avertissements ; un `JSON.parse` direct échouerait, et sous `bash -e`
//     cet échec interromprait l'étape — le défaut serait alors attribué au
//     projet, qui n'y est pour rien.
//   - il ne sort JAMAIS en erreur. Il confirme un nom ; un contrôle qui casse
//     un build valide coûte plus cher que le défaut qu'il surveille.
//
// Usage : xcodebuild -list -json | node scripts/lire-schemas-xcodebuild.mjs

import { readFileSync } from 'node:fs';

let texte = '';
try {
  texte = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

// On encadre le JSON par ses premières et dernières accolades : c'est ce qui
// rend la lecture insensible aux avertissements qui l'entourent.
const debut = texte.indexOf('{');
const fin = texte.lastIndexOf('}');
if (debut === -1 || fin === -1 || fin <= debut) process.exit(0);

let donnees;
try {
  donnees = JSON.parse(texte.slice(debut, fin + 1));
} catch {
  process.exit(0);
}

// Selon qu'un espace de travail CocoaPods existe ou non, la réponse est rangée
// sous `workspace` ou sous `project`. Les deux formes sont acceptées.
const info = donnees?.workspace ?? donnees?.project ?? {};
const schemas = info?.schemes;

if (!Array.isArray(schemas)) process.exit(0);

for (const schema of schemas) {
  if (typeof schema === 'string' && schema !== '') console.log(schema);
}
