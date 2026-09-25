// La forme de l'écran Programme : deux entrées distinctes, et un état ÉTEINT qui
// se DIT au lieu de faire disparaître les données.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// La demande décrit cet écran en deux points, et aucun des deux ne se voit à la
// compilation :
//
//   - « deux entrées distinctes », Apprentissage (livre ouvert) et Révision
//     (deux flèches circulaires). Deux libellés nus se ressemblent ; c'est
//     l'icône qui les sépare, et rien ne dirait qu'on l'a perdue ;
//   - « si Révisions est désactivé dans le Profil, adapter l'affichage sans
//     supprimer les données ». Un écran qui masquerait la liste en silence
//     laisserait croire à une suppression — le seul défaut que cette phrase
//     interdit.
//
// Ce qui n'est PAS éprouvé ici : que les deux entrées soient agréables à viser,
// ni que le bandeau soit bien placé. Cela se voit sur l'appareil.
//
// Ce fichier lit une SOURCE : il ne rend rien, il ne traverse aucune donnée.
// Une expression régulière qui ne correspond plus rend une chaîne vide, et une
// chaîne vide ne se plaint pas. D'où `scripts/falsifier_programme_ecran.py`, qui
// défait chaque propriété une par une et exige que le test tombe — sur le test
// NOMMÉ pour elle, et pas sur un voisin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = readFileSync(join(RACINE, 'app/(tabs)/programme.tsx'), 'utf8');

// Les commentaires sont retirés avant toute recherche. Ce fichier en contient
// qui NOMMENT les deux entrées et leurs icônes : un contrôle satisfait par la
// phrase qui décrit la règle ne mesure plus rien.
const CODE = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((ligne) => !ligne.trimStart().startsWith('//'))
  .join('\n');

/**
 * Le bloc de la `Pressable` qui bascule sur `onglet`, de son ouverture à sa
 * fermeture.
 *
 * On ancre sur l'`onPress`, et non sur `setActiveTab('...')` seul : l'effet qui
 * honore le paramètre venu de l'accueil écrit lui aussi
 * `setActiveTab('renforcer')`, et un `indexOf` sur ce jeton serait tombé sur
 * l'effet — mesuré, le bloc rendu n'aurait alors contenu ni icône ni libellé.
 */
function blocEntree(source, onglet) {
  const ancre = `onPress={() => setActiveTab('${onglet}')}`;
  const i = source.indexOf(ancre);
  if (i < 0) return null;

  const debut = source.lastIndexOf('<Pressable', i);
  const fin = source.indexOf('</Pressable>', i);
  if (debut < 0 || fin < 0) return null;

  return source.slice(debut, fin + '</Pressable>'.length);
}

test('les deux entrées se distinguent par leur icône ET par leur mot', () => {
  const apprentissage = blocEntree(CODE, 'apprentissage');
  assert.ok(
    apprentissage !== null,
    'l’entrée « Apprentissage » est introuvable : l’écran n’a plus ses deux entrées'
  );
  assert.match(
    apprentissage,
    /name="book-outline"/,
    'l’entrée « Apprentissage » n’a plus son livre ouvert : les deux entrées ne se distinguent plus'
  );
  assert.match(
    apprentissage,
    /^ *Apprentissage$/m,
    'l’entrée ne porte plus le mot « Apprentissage »'
  );

  const revision = blocEntree(CODE, 'renforcer');
  assert.ok(
    revision !== null,
    'l’entrée « Révision » est introuvable : l’écran n’a plus ses deux entrées'
  );
  assert.match(
    revision,
    /name="sync-outline"/,
    'l’entrée « Révision » n’a plus ses deux flèches circulaires : les deux entrées ne se distinguent plus'
  );

  // Le mot VISIBLE, et pas celui du libellé vocal : l'`accessibilityLabel` de
  // cette entrée contient lui aussi « Révision », donc un contrôle qui
  // chercherait le seul mot resterait vert alors que l'entrée afficherait autre
  // chose. On exige donc la ligne entière.
  assert.match(
    revision,
    /^ *Révision$/m,
    'l’entrée n’affiche plus le mot « Révision » : deux noms pour un même endroit feraient douter d’y être arrivé'
  );
});

test('les révisions éteintes se DISENT : l’écran lit le réglage et l’annonce', () => {
  // Le réglage doit être LU ici, et par la fonction qui porte la règle « absent
  // vaut actif ». Recopier la règle sur place serait l'inverser un jour sans que
  // rien ne le dise.
  assert.match(
    CODE,
    /const revisionsOuvertes = revisionsActives\(config\);/,
    'l’écran ne lit plus le réglage du profil : l’interrupteur n’aurait plus aucun effet ici'
  );

  const iBandeau = CODE.indexOf('{!revisionsOuvertes && (');
  assert.ok(
    iBandeau > 0,
    'aucun bandeau n’annonce que les révisions sont éteintes : l’entrée semblerait cassée, la liste étant là sans que rien ne l’explique'
  );

  // Le bandeau va de sa condition jusqu'à l'introduction qui suit. On ne prend
  // pas « N caractères après » : une fenêtre de taille fixe finirait par
  // contenir autre chose, et le contrôle ne mesurerait plus le bandeau.
  const fin = CODE.indexOf('{aRenforcer.length > 0 && (', iBandeau);
  assert.ok(fin > iBandeau, 'la fin du bandeau est introuvable');
  const bandeau = CODE.slice(iBandeau, fin);

  assert.match(
    bandeau,
    /Révisions désactivées/,
    'le bandeau ne nomme plus l’état : la personne ne saurait pas que le réglage est éteint'
  );
  // Le mot de la demande, mot pour mot : « sans supprimer les données ». Un
  // bandeau qui annoncerait l'état sans dire que rien n'est perdu laisserait
  // croire à un effacement.
  assert.match(
    bandeau,
    /conservés/,
    'le bandeau ne dit plus que les passages sont conservés : l’extinction passerait pour une suppression'
  );
  assert.match(
    bandeau,
    /supprimé/,
    'le bandeau ne dit plus que rien n’est supprimé'
  );
  assert.match(
    bandeau,
    /router\.push\('\/profil'\)/,
    'le bandeau ne dit pas OÙ changer le réglage : il annonce un état sans issue'
  );
});

test('le nombre n’est annoncé que si les révisions sont proposées', () => {
  // Un nombre à côté d'une entrée éteinte annoncerait un travail qui n'est plus
  // demandé. L'entrée, elle, reste — c'est la liste qui reste consultable.
  assert.match(
    CODE,
    /\{revisionsOuvertes && aRenforcer\.length > 0 \? ` \(\$\{aRenforcer\.length\}\)` : ''\}/,
    'le nombre de passages s’affiche même quand les révisions sont éteintes'
  );
});
