// Le récitateur : visible en permanence, et changeable d'un seul geste.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// La demande décrit ce point en trois mots — « directement visible » — et aucun
// des trois ne se voit à la compilation :
//
//   - le récitateur courant doit être lisible SANS ouvrir de panneau. Il vivait
//     dans une ligne secondaire de la barre, et seulement pendant qu'une séance
//     jouait : au repos, rien ne disait ce qu'on allait entendre ;
//   - il doit s'ouvrir et se changer en un geste. Le changer demandait
//     d'ouvrir les réglages, puis de retrouver la bonne section parmi six ;
//   - il ne doit y avoir QU'UN endroit où le changer. Laisser la section dans
//     les réglages en plus de la ligne ferait deux commandes pour un même
//     réglage, et l'une des deux finirait par mentir sur l'état de l'autre.
//
// Ce qui n'est PAS éprouvé ici : que la liste soit agréable à parcourir, ni que
// les dix noms tiennent à l'écran. Cela se voit sur l'appareil.
//
// Ce fichier lit une SOURCE : il ne rend rien, il ne traverse aucune donnée. Une
// expression régulière qui ne correspond plus rend une chaîne vide, et une
// chaîne vide ne se plaint pas. D'où `scripts/falsifier_lecteur_recitateur.py`,
// qui défait chaque propriété une par une et exige que le test tombe — sur le
// test NOMMÉ pour elle, et pas sur un voisin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const SOURCE = readFileSync(join(RACINE, 'src/components/LecteurAudio.tsx'), 'utf8');

// Les commentaires sont retirés avant toute recherche. Ce fichier en contient
// qui NOMMENT la ligne et son libellé : un contrôle satisfait par la phrase qui
// décrit la règle ne mesure plus rien.
const CODE = SOURCE
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((ligne) => !ligne.trimStart().startsWith('//'))
  .join('\n');

/** Le texte entre `debut` et la PREMIÈRE `fin` qui suit, bornes comprises. */
function entre(source, debut, fin) {
  const i = source.indexOf(debut);
  if (i < 0) return null;
  const j = source.indexOf(fin, i);
  if (j < 0) return null;
  return source.slice(i, j + fin.length);
}

/** Le montage de la ligne, écrit une seule fois, réemployé partout. */
const MONTAGE = '<ChoixRecitateur courant={recitateur} choisir={changerRecitateur} />';

test('la ligne nomme le récitateur courant, et elle est visible même quand rien ne joue', () => {
  assert.match(
    CODE,
    /Récitateur : \{courant\.nom\}/,
    'la ligne n’affiche plus le nom du récitateur courant : il faut ouvrir un panneau pour savoir ce qu’on entend'
  );

  // Le libellé vocal doit porter le nom ET l'action : un lecteur d'écran qui
  // annoncerait seulement « Récitateur » laisserait la personne deviner lequel.
  assert.match(
    CODE,
    /accessibilityLabel=\{`Récitateur : \$\{courant\.nom\}\. Appuyer pour changer\.`\}/,
    'le libellé vocal ne nomme plus le récitateur courant, ni ce que le geste fait'
  );

  // La ligne est montée DEUX fois : au repos, et pendant une séance. La première
  // est celle qui compte — c'est avant de commencer qu'on choisit.
  const auRepos = entre(CODE, 'if (!enSeance) {', 'libelleOuvrir}</Text>');
  assert.ok(
    auRepos !== null,
    'la branche « rien ne joue » est introuvable : la barre a changé de forme'
  );
  assert.ok(
    auRepos.includes(MONTAGE),
    'au repos, la barre ne montre plus le récitateur : on ne peut plus le choisir avant de commencer'
  );

  const pendant = entre(CODE, 'styles.barre}>', '{reglages && (');
  assert.ok(
    pendant !== null,
    'la branche « une séance joue » est introuvable : la barre a changé de forme'
  );
  assert.ok(
    pendant.includes(MONTAGE),
    'pendant une séance, la barre ne montre plus le récitateur'
  );
});

test('un seul geste ouvre la liste des dix, un seul geste applique le choix', () => {
  assert.match(
    CODE,
    /onPress=\{\(\) => setOuverte\(\(v\) => !v\)\}/,
    'la ligne n’ouvre plus la liste : le récitateur serait visible mais intouchable'
  );

  const iListe = CODE.indexOf('{ouverte && (');
  assert.ok(
    iListe > 0,
    'aucune liste ne s’ouvre depuis la ligne : la ligne promettrait un geste sans effet'
  );

  // La liste va de sa condition jusqu'à la fermeture du `ScrollView`. On ne
  // prend pas « N caractères après » : une fenêtre de taille fixe finirait par
  // contenir autre chose, et le contrôle ne mesurerait plus la liste.
  const fin = CODE.indexOf('</ScrollView>', iListe);
  assert.ok(fin > iListe, 'la fin de la liste est introuvable');
  const liste = CODE.slice(iListe, fin);

  // Les DIX : la demande a été de les garder tous. Un `slice(0, 3)` passerait
  // inaperçu à l'œil, et c'est exactement le genre de retrait qu'on ne veut pas.
  assert.match(
    liste,
    /RECITATEURS\.map\(\(r\) => \{/,
    'la liste n’est plus celle des récitateurs : elle est écrite à la main, donc elle dérivera'
  );

  assert.match(
    liste,
    /onPress=\{\(\) => choisirEtFermer\(r\.id\)\}/,
    'un nom de la liste n’applique plus le choix en un geste'
  );

  // Choisir doit APPLIQUER puis FERMER. Appliquer sans fermer laisserait croire
  // qu'il reste à confirmer ; fermer sans appliquer ne changerait rien.
  assert.match(
    CODE,
    /const choisirEtFermer = \(id: string\) => \{\n\s*choisir\(id\);\n\s*setOuverte\(false\);\n\s*\};/,
    'le choix n’applique plus le récitateur, ou ne referme plus la liste'
  );
});

test('le récitateur n’a qu’un endroit où se changer : il a quitté les réglages', () => {
  assert.ok(
    !CODE.includes('titre="Récitateur"'),
    'la section « Récitateur » est revenue dans les réglages : deux commandes pour un même réglage, dont une mentira'
  );

  // Une seule liste, et c'est celle de la ligne. Un second `map` sur
  // `RECITATEURS` serait le début d'un second endroit où les choisir.
  const listes = CODE.split('RECITATEURS.map(').length - 1;
  assert.equal(
    listes,
    1,
    `les récitateurs sont listés ${listes} fois : il doit n’y avoir qu’un seul endroit où les choisir`
  );
});
