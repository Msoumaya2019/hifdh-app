// La forme du lecteur : ce qui a été retiré, et ce qui reste.
//
// POURQUOI UN TEST DE FORME, ET PAS SEULEMENT DE CALCUL
// ----------------------------------------------------
// Trois demandes portaient sur ce qui NE DOIT PLUS être à l'écran : le mode
// « verset par verset », la phrase « page hors de ta séance », la plage de
// versets en clair, le repère du geste. Ces phrases ne se calculent pas : elles
// se lisent dans la source, et c'est le seul moyen de les tenir.
//
// LE PIÈGE, ET COMMENT IL EST ÉVITÉ
// ---------------------------------
// Une assertion qui cherche une chaîne est satisfaite par un **commentaire**.
// Ce fichier-ci, par exemple, contient les trois phrases interdites — dans ce
// commentaire-ci. Les contrôles ci-dessous ne cherchent donc pas la phrase dans
// le fichier : ils la cherchent dans ce qui est effectivement **rendu**, en
// s'appuyant sur le fait que ces phrases n'existaient que comme contenu de
// `<Text>`. Un contrôle qui chercherait `indexOf(phrase) === -1` sur tout le
// fichier échouerait sur ce commentaire, ce qui est le signe qu'il aurait été
// faux dans l'autre sens aussi.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');

/**
 * Le texte réellement rendu par un fichier, commentaires retirés.
 *
 * Retirer les commentaires est nécessaire, et ce n'est pas une précaution
 * théorique : le fichier `lecteur.tsx` explique en propres termes ce qui a été
 * retiré, donc il contient les mots qu'on ne veut plus voir à l'écran. Un
 * contrôle naïf accuserait le commentaire qui documente le retrait.
 */
function rendu(chemin) {
  const source = lire(chemin);
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !/^\s*(\/\/|\*)/.test(ligne))
    .join('\n');
}

// === Ce qui a été RETIRÉ ====================================================

test('le mode « verset par verset » n’est plus atteignable depuis le lecteur', () => {
  // La demande était : « pour le moment que tu caches "Verset par verset" et
  // que tu laisse juste la page du moushaf ». Le mode n'a pas été supprimé —
  // il reste dans les données — mais plus aucun onglet n'y mène.
  const source = rendu('app/lecteur.tsx');

  assert.equal(
    source.includes('Verset par verset'),
    false,
    'l’onglet du mode texte ne doit plus être rendu'
  );
  assert.equal(
    source.includes('modeOnglet'),
    false,
    'les styles de l’onglet de mode ne doivent plus être rendus'
  );
});

test('une configuration restée en mode « versets » est ramenée au mode page', () => {
  // Sinon le mode retiré reviendrait par la porte de derrière : une
  // configuration enregistrée avant ce changement afficherait l'écran texte,
  // sans onglet pour en sortir.
  const source = rendu('app/lecteur.tsx');

  assert.match(
    source,
    /if \(existante\?\.affichage\?\.mode === 'versets'\)/,
    'l’ancien mode doit être détecté'
  );
  assert.match(
    source,
    /affichage: \{ mode: 'page' \}/,
    'l’ancien mode doit être remplacé par le mode page'
  );
});

test('les trois phrases retirées ne sont plus rendues', () => {
  const source = rendu('src/components/LecteurPageMoushaf.tsx');

  assert.equal(
    source.includes('Page hors de ta séance'),
    false,
    '« page hors de ta séance » ne doit plus être rendu'
  );
  assert.equal(
    source.includes('porte une partie de ta séance'),
    false,
    'la note de séance ne doit plus être rendue'
  );
  assert.equal(
    source.includes('Glisse la page vers la droite'),
    false,
    'le repère du geste ne doit plus être rendu'
  );
  assert.equal(
    source.includes('{plageDeVersets}'),
    false,
    'la plage de versets en clair ne doit plus être rendue'
  );
});

test('le composant ne rend plus les styles des phrases retirées', () => {
  // Une phrase retirée dont le style reste n'est pas un défaut visible — mais
  // c'est une invitation à la remettre sans réfléchir, et cela laisse croire
  // que l'écran porte encore ces informations.
  const source = lire('src/components/LecteurPageMoushaf.tsx');

  for (const style of ['noteSeance', 'plageVersets', 'repereGeste']) {
    assert.equal(
      source.includes(style),
      false,
      `le style « ${style} » doit avoir disparu avec sa phrase`
    );
  }
});

// === Ce qui a été AJOUTÉ ====================================================

test('la page s’ouvre en plein écran', () => {
  // « Je veux que la page soit au format de l'écran quasiment, ne laissez que
  // ce qui est vraiment utile. » L'état initial est donc vrai — un plein écran
  // qu'il faudrait activer à chaque ouverture ne répondrait pas à la demande.
  const source = rendu('app/lecteur.tsx');
  assert.match(
    source,
    /const \[pleinEcran, setPleinEcran\] = useState\(true\);/,
    'la page doit s’ouvrir plein écran'
  );
});

test('la sortie du plein écran reste portée par l’écran, pas par la page', () => {
  // C'est la règle qui avait déjà été payée une fois : un plein écran dont la
  // sortie vit dans un composant enfant disparaît avec lui. Si la page échoue à
  // charger, le bouton doit rester — sans quoi l'écran devient un cul-de-sac.
  const source = rendu('app/lecteur.tsx');

  assert.match(
    source,
    /accessibilityLabel="Quitter le plein écran"/,
    'l’écran doit porter sa propre sortie de plein écran'
  );
  assert.match(
    source,
    /onPress=\{\(\) => setPleinEcran\(false\)\}/,
    'la sortie de l’écran doit bien remettre le plein écran à faux'
  );
});

test('le surlignage est dessiné derrière l’image, jamais devant', () => {
  // L'ordre compte : une bande posée après l'image passerait par-dessus l'encre
  // et voilerait les signes de vocalisation — ceux qu'on vient lire. Le
  // surlignage doit donc apparaître AVANT le `<Image` dans le rendu.
  const source = rendu('src/components/LecteurPageMoushaf.tsx');

  const positionBande = source.indexOf('styles.bandeSurlignage');
  const positionImage = source.indexOf('<Image');

  assert.ok(positionBande > 0, 'la bande de surlignage doit être rendue');
  assert.ok(positionImage > 0, 'l’image de la page doit être rendue');
  assert.ok(
    positionBande < positionImage,
    'la bande doit être posée avant l’image, donc dessinée en dessous'
  );
});

test('le surlignage est désactivé au toucher', () => {
  // `pointerEvents="none"` : sans lui, la bande intercepterait le geste de
  // tourne-page sur la partie de la page qu'elle couvre — c'est-à-dire
  // exactement là où l'on pose le doigt pour lire.
  const source = rendu('src/components/LecteurPageMoushaf.tsx');
  assert.match(
    source,
    /pointerEvents="none"/,
    'la bande ne doit pas intercepter le geste'
  );
});

test('la navigation et le compteur de page subsistent', () => {
  // « ne laissez que ce qui est vraiment utile » : ce qui reste doit
  // effectivement être là. Tourner la page et savoir où l'on est en font
  // partie ; les phrases explicatives, non.
  const source = rendu('src/components/LecteurPageMoushaf.tsx');

  assert.match(source, /accessibilityLabel="Page précédente"/, 'recoller la page précédente');
  assert.match(source, /accessibilityLabel="Page suivante"/, 'aller à la page suivante');
  assert.match(source, /Aller à…/, 'aller à une page précise');
});

test('le surlignage suit la séance, pas la page affichée', () => {
  // La page qu'on regarde n'est pas forcément celle de la séance : on
  // feuillette. Si la plage n'était pas transmise, `passage` garderait sa
  // valeur par défaut (`null`) et **plus rien ne serait jamais surligné** — sur
  // aucune page, sans que rien d'autre ne change à l'écran. C'est un défaut
  // invisible : le lecteur paraîtrait simplement privé de la fonctionnalité.
  const source = rendu('app/lecteur.tsx');

  assert.match(
    source,
    /passage=\{passage\}/,
    'la plage de la séance doit être transmise à la page'
  );
  // La plage elle-même doit être construite à partir de la séance, et non d'un
  // état vide : un `passage` toujours `null` serait transmis sans rien dire.
  assert.match(
    source,
    /const passage = \{ surah: surahNum, startAyah, endAyah \}/,
    'la plage doit être construite à partir de la sourate et des versets de la séance'
  );
});

test('le nombre de lignes par page vient de la mise en page, pas d’un littéral', () => {
  // Le placement en fraction (`(numero - 1) / LIGNES_PAR_PAGE`) n'est exact que
  // si le diviseur est le vrai nombre de lignes. Écrit en dur à 15, il serait
  // faux le jour où la mise en page dirait autre chose — et les bandes
  // glisseraient sans que rien ne le signale.
  const source = lire('src/components/LecteurPageMoushaf.tsx');
  assert.match(
    source,
    /getLignesParPageMoushaf\(\)/,
    'le nombre de lignes doit être lu dans la mise en page'
  );
  assert.equal(
    /LIGNES_PAR_PAGE\s*=\s*15/.test(source),
    false,
    'le nombre de lignes ne doit pas être écrit en dur'
  );
});

test('chaque bande se pose à la fraction de SON numéro de ligne', () => {
  // Deux contrôles distincts, et il faut les deux.
  //
  // Le premier serait satisfait par un simple `top: 0` si l'on se contentait de
  // chercher `top` : la bande existerait, mais toutes se superposeraient sur la
  // première ligne, et le surlignage désignerait un verset qui n'est pas celui
  // de la séance. Le calcul doit donc **dépendre du numéro de ligne**.
  //
  // Le second vérifie que la bande n'est pas figée en pixels : une bande en
  // pixels ne suivrait pas la page quand elle change de taille à l'écran, alors
  // que c'est précisément ce que le placement en fraction achète.
  const source = rendu('src/components/LecteurPageMoushaf.tsx');

  const calcul = source.match(/top: `\$\{\(([^}]*)\)\s*\*\s*100\}%`/);
  assert.ok(
    calcul !== null,
    'la position verticale d’une bande doit être une fraction de la page'
  );
  assert.match(
    calcul[1],
    /numero/,
    'la position doit dépendre du numéro de ligne, sinon toutes les bandes se superposent'
  );
  assert.match(
    calcul[1],
    /LIGNES_PAR_PAGE/,
    'la position doit être divisée par le nombre de lignes de la page'
  );
  assert.match(
    calcul[1],
    /numero\s*-\s*1/,
    'la première ligne est à 0 %, donc le décalage est `numero - 1`'
  );

  // Et la bande ne doit pas être un littéral : `top` en clair ne suivrait pas
  // la taille de la page.
  assert.equal(
    /top:\s*\d+\s*,/.test(source),
    false,
    'la position verticale ne doit pas être écrite en clair'
  );
});

test('une bande fait exactement la hauteur d’une ligne', () => {
  // Une bande trop courte ne couvrirait qu'une partie de la ligne — le verset
  // paraîtrait à moitié surligné. Une bande trop haute déborderait sur la ligne
  // voisine et désignerait un verset qui n'est pas dans la séance. La hauteur
  // est donc le quinzième de la page, et elle est dérivée de la mise en page
  // pour la même raison que la position.
  const source = rendu('src/components/LecteurPageMoushaf.tsx');

  const hauteur = source.match(/height: `\$\{([^}]*)\}%`/);
  assert.ok(
    hauteur !== null,
    'la hauteur d’une bande doit être une fraction de la page'
  );
  assert.match(
    hauteur[1],
    /1\s*\/\s*LIGNES_PAR_PAGE/,
    'une bande doit faire une ligne, pas une fraction quelconque'
  );
});
