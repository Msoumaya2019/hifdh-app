// L'accueil comme point d'entrée : ce qui s'y trouve doit mener quelque part.
//
// Un écran d'accueil qui **affiche** un chiffre sans permettre d'agir dessus
// laisse la personne devant un nombre. C'est ce qui s'était produit : la carte
// « À renforcer » annonçait les passages à travailler sans qu'aucun appui n'y
// mène, alors que l'onglet qui les liste existait déjà et savait s'ouvrir
// directement dessus.
//
// Ce fichier tient l'accord entre deux écrans qui ne peuvent pas se lire :
// l'accueil, qui **émet** le paramètre, et l'onglet Programme, qui le
// **consomme**. Un nom de paramètre mal orthographié de l'autre côté ne casse
// rien à la compilation, et rien à l'exécution non plus : l'onglet s'ouvrirait
// simplement sur « Apprentissage », ce qui ressemblerait à un bouton sans effet.
//
// Ce qui n'est **pas** éprouvé ici : que le geste soit agréable, ni que la
// destination soit la bonne pour l'usage. Cela se voit sur l'appareil.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const ACCUEIL = readFileSync(join(RACINE, 'app/(tabs)/index.tsx'), 'utf8');

// Les commentaires sont retirés avant toute recherche : un contrôle qui lit du
// texte ne doit pas être satisfait par la phrase qui **décrit** la règle. La
// découpe se fait sur les lignes entières et sur les blocs `/* */`, jamais sur
// `//` jusqu'à la fin de ligne — une URL contient `//`.
const CODE = ACCUEIL
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((ligne) => !ligne.trimStart().startsWith('//'))
  .join('\n');

const PROGRAMME = readFileSync(join(RACINE, 'app/(tabs)/programme.tsx'), 'utf8');

/** Le fragment de source qui va de `debut` jusqu'à la parenthèse fermante. */
function jusquaLaParentheseFermante(source, debut) {
  let profondeur = 0;
  for (let i = debut; i < source.length; i += 1) {
    if (source[i] === '(') profondeur += 1;
    else if (source[i] === ')') {
      profondeur -= 1;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  return source.slice(debut);
}

/**
 * La balise `Pressable` complète, de son ouverture à son `>` de fin.
 *
 * Le `>` du `=>` d'un `onPress` ne ferme pas la balise : on compte donc les
 * accolades et les parenthèses, et la balise se termine au `>` rencontré alors
 * que la profondeur est revenue à zéro. Un simple `indexOf('>')` s'arrêterait
 * sur la flèche, et ne verrait ni `style` ni la fin des attributs — mesuré.
 */
function baliseComplete(source, debut) {
  let profondeur = 0;
  let chaine = null;
  for (let i = debut; i < source.length; i += 1) {
    const c = source[i];
    if (chaine !== null) {
      if (c === chaine && source[i - 1] !== '\\') chaine = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') chaine = c;
    else if (c === '(' || c === '{' || c === '[') profondeur += 1;
    else if (c === ')' || c === '}' || c === ']') profondeur -= 1;
    else if (c === '>' && profondeur === 0) return source.slice(debut, i + 1);
  }
  return source.slice(debut);
}

test('la carte « À renforcer » de l’accueil mène à l’onglet qui les liste', () => {
  // La carte doit être **pressable**. C'est la règle même de cette demande :
  // afficher n'est pas agir.
  //
  // Le contrôle porte sur la **balise `Pressable` entière**, de son ouverture à
  // son `>` de fin. Chercher « ce qui suit le style » serait faux : l'ordre des
  // attributs est libre, et dans ce fichier `onPress` est écrit **avant**
  // `style`. Un tel contrôle aurait sauté au `router.push` du bouton suivant, et
  // validé la mauvaise navigation — mesuré.
  const indexStyle = CODE.indexOf('styles.carteCliquable');
  assert.ok(indexStyle > 0, 'le style `carteCliquable` est introuvable dans l’accueil');

  const ouverture = CODE.lastIndexOf('<Pressable', indexStyle);
  assert.ok(
    ouverture > 0,
    'la carte « À renforcer » n’est pas enveloppée dans un Pressable : elle ne réagit pas au doigt'
  );

  // Le `Pressable` trouvé doit être *celui de la carte* : rien ne doit s'ouvrir
  // ou se fermer entre lui et le style, sinon on aurait remonté à un autre.
  const balise = baliseComplete(CODE, ouverture);
  assert.ok(
    balise.includes('styles.carteCliquable'),
    'le Pressable trouvé n’est pas celui de la carte « À renforcer »'
  );

  // Et l'appui navigue vers l'onglet Programme avec le bon onglet demandé.
  const iPush = balise.indexOf('router.push');
  assert.ok(
    iPush > 0,
    'l’appui sur la carte ne déclenche aucune navigation'
  );

  const appel = jusquaLaParentheseFermante(balise, balise.indexOf('(', iPush));
  assert.match(
    appel,
    /pathname:\s*'\/\(tabs\)\/programme'/,
    'la carte mène ailleurs que sur l’onglet Programme'
  );
  assert.match(
    appel,
    /onglet:\s*'renforcer'/,
    'la carte ouvre l’onglet Programme sans demander l’onglet « À renforcer »'
  );

  // L'horodatage : sans une valeur qui change, l'écran Programme — qui reste
  // monté — ne rejouerait pas son effet au second appui, et la carte
  // paraîtrait cassée après la première fois.
  assert.match(
    appel,
    /t:\s*String\(Date\.now\(\)\)/,
    'le paramètre d’horodatage manque : le second appui sur la carte ne ferait rien'
  );
});

test('l’onglet Programme honore l’onglet demandé par l’accueil', () => {
  // Le contrat, côté consommateur. Les deux écrans ne peuvent pas se lire :
  // seul ce contrôle empêche un nom de paramètre de diverger.
  //
  // ATTENTION — le motif doit porter sur **l'appel qui bascule**, pas sur le
  // jeton nu. `params.onglet === 'renforcer'` apparaît deux fois dans ce
  // fichier (la valeur initiale du `useState`, et l'effet). Un contrôle qui
  // cherche la seule chaîne reste vert quand on mute l'effet, puisque
  // l'initialisation le satisfait encore — mesuré : cette mutation n'était
  // **pas** détectée. On ancre donc sur l'instruction complète.
  assert.match(
    PROGRAMME,
    /if \(params\.onglet === 'renforcer'\) setActiveTab\('renforcer'\);/,
    'l’onglet Programme ne bascule plus sur le paramètre `onglet` : l’accueil ouvrirait « Apprentissage »'
  );

  // La bascule doit être dans un effet, et dépendre de `params.t` : l'écran
  // reste monté, donc une valeur initiale lue une seule fois serait ignorée.
  assert.match(
    PROGRAMME,
    /\},\s*\[\s*params\.onglet,\s*params\.t\s*\]\s*\)/,
    'la bascule d’onglet ne dépend pas de l’horodatage : elle ne se rejouerait pas'
  );
});

test('la carte « À renforcer » n’annonce que ce qu’elle peut ouvrir', () => {
  // La carte n'apparaît que s'il y a quelque chose à renforcer. Un lien vers
  // une liste vide serait un lien qui ne mène nulle part.
  assert.match(
    CODE,
    /\{aRenforcer > 0 && \(/,
    'la carte « À renforcer » s’affiche même quand il n’y a rien à renforcer'
  );

  // Et le libellé vocal dit où l'appui mène, au singulier comme au pluriel.
  assert.match(
    CODE,
    /accessibilityLabel=\{`Voir les \$\{aRenforcer\} passage\$\{aRenforcer > 1 \? 's' : ''\} à renforcer`\}/,
    'le libellé d’accessibilité de la carte est absent ou ne dit pas où l’appui mène'
  );
});
