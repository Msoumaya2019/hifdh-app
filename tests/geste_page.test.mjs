// Le geste de page, et le plein écran du mode « page du moushaf ».
//
// Deux choses sont éprouvées ici, et elles sont de nature différente :
//
//   - le **geste**, qui est de la géométrie : elle se calcule, donc se teste ;
//   - le **plein écran**, qui est une forme : on lit la source pour vérifier
//     que le mode page occupe bien tout l'écran et qu'un moyen de revenir
//     existe — un plein écran sans sortie serait un piège.
//
// Le sens de lecture mérite un mot : le moushaf s'ouvre de droite à gauche, donc
// la page suivante est à droite. Un geste vers la droite avance. L'écrire à
// l'envers est l'erreur naturelle, et c'est ce que le premier test nomme.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DOMINANCE_HORIZONTALE,
  SEUIL_HORIZONTAL,
  gesteDePage,
  pageApresGeste,
} from '@/lib/gestePageMoushaf';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

// === Le sens de lecture =====================================================

test('un glissement vers la droite avance d’une page : le moushaf se lit de droite à gauche', () => {
  // C'est la règle qu'on écrit à l'envers sans s'en apercevoir. Elle est donc
  // dite ici en toutes lettres : page 2 est à droite de page 1.
  assert.equal(gesteDePage(120, 0), 'suivante', 'vers la droite : on avance');
  assert.equal(gesteDePage(-120, 0), 'precedente', 'vers la gauche : on recule');

  assert.equal(pageApresGeste(5, 604, 120, 0), 6);
  assert.equal(pageApresGeste(5, 604, -120, 0), 4);
});

// === Les bornes =============================================================

test('le geste ne sort jamais des 604 pages', () => {
  // À la première page, aller en arrière ne décide rien : il n'y a pas de page
  // 0. Rendre `null` plutôt que 0 évite d'avoir à rattraper un numéro invalide
  // au moment de l'affichage.
  assert.equal(pageApresGeste(1, 604, -120, 0), null, 'rien avant la page 1');
  assert.equal(pageApresGeste(604, 604, 120, 0), null, 'rien après la page 604');

  // Et aux bords, le geste inverse fonctionne toujours.
  assert.equal(pageApresGeste(1, 604, 120, 0), 2);
  assert.equal(pageApresGeste(604, 604, -120, 0), 603);
});

test('la page rendue est toujours entière et dans les bornes', () => {
  for (let depart = 1; depart <= 604; depart++) {
    for (const dx of [-400, -60, -59, 0, 59, 60, 400]) {
      const voulue = pageApresGeste(depart, 604, dx, 0);
      if (voulue === null) continue;
      assert.ok(Number.isInteger(voulue), `page non entière : ${voulue}`);
      assert.ok(voulue >= 1 && voulue <= 604, `page hors bornes : ${voulue}`);
      assert.ok(Math.abs(voulue - depart) === 1, `saut de plus d’une page : ${depart} → ${voulue}`);
    }
  }
});

// === Le seuil ===============================================================

test('sous le seuil, le doigt n’a pas décidé', () => {
  // Un frôlement, ou un doigt qui se pose, n'est pas un geste. Sans ce seuil,
  // chaque appui tournerait la page.
  assert.equal(SEUIL_HORIZONTAL, 60);
  assert.equal(gesteDePage(0, 0), 'aucun');
  assert.equal(gesteDePage(10, 0), 'aucun');
  assert.equal(gesteDePage(59, 0), 'aucun');
  assert.equal(gesteDePage(-59, 0), 'aucun');
  // Au seuil même, on déclenche : une valeur limite doit avoir un sens, et le
  // sens choisi est « atteint ».
  assert.equal(gesteDePage(60, 0), 'suivante');
  assert.equal(gesteDePage(-60, 0), 'precedente');
});

// === L'axe dominant =========================================================

test('un geste vertical, ou plus vertical qu’horizontal, ne tourne pas la page', () => {
  // Le moushaf ne défile pas, mais un geste en biais ne doit pas être pris pour
  // un changement de page. La règle est un rapport, pas une distance : un doigt
  // qui descend de 200 px en avançant de 30 px n'a pas voulu avancer.
  assert.equal(gesteDePage(30, 200), 'aucun', 'franchement vertical');
  assert.equal(gesteDePage(30, -200), 'aucun');
  assert.equal(gesteDePage(200, 199), 'suivante', 'franchement horizontal');
  assert.equal(gesteDePage(-200, 199), 'precedente');

  // L'égalité parfaite ne décide rien : rien ne domine.
  assert.equal(gesteDePage(100, 100), 'aucun');
  assert.equal(gesteDePage(100, -100), 'aucun');

  assert.equal(DOMINANCE_HORIZONTALE, 1);
});

test('un grand geste vertical l’emporte sur un horizontal qui passe pourtant le seuil', () => {
  // Le cas qui compte : 70 px vers la droite — au-dessus du seuil — mais
  // 300 px vers le bas. Le doigt a fait défiler, pas tourné la page.
  assert.equal(gesteDePage(70, 300), 'aucun');
  assert.equal(pageApresGeste(100, 604, 70, 300), null);
});

// === Les entrées aberrantes =================================================

test('aucune entrée aberrante ne produit de page', () => {
  assert.equal(pageApresGeste(Number.NaN, 604, 120, 0), null);
  assert.equal(pageApresGeste(5, Number.NaN, 120, 0), null);
  assert.equal(pageApresGeste(5, 0, 120, 0), null, 'un total nul ne décide rien');
  assert.equal(pageApresGeste(5, -1, 120, 0), null);
  assert.equal(pageApresGeste(5, 604, Number.NaN, 0), null);
  assert.equal(pageApresGeste(5, 604, 120, Number.NaN), null);
  assert.equal(gesteDePage(Number.NaN, 0), 'aucun');
  assert.equal(gesteDePage(0, Number.NaN), 'aucun');
});

// === Les deux fonctions ne peuvent pas diverger ============================

test('pageApresGeste et gesteDePage disent toujours la même chose', () => {
  // Deux fonctions qui portent la même règle finissent par diverger. Ici elles
  // sont comparées sur toute la grille : même silence, même direction.
  const depart = 100;
  for (const dx of [-400, -120, -61, -60, -59, -20, 0, 20, 59, 60, 61, 120, 400]) {
    for (const dy of [-400, -100, -1, 0, 1, 100, 400]) {
      const voulue = pageApresGeste(depart, 604, dx, dy);
      const annonce = gesteDePage(dx, dy);

      if (voulue === null) {
        assert.equal(annonce, 'aucun', `dx=${dx} dy=${dy} : page nulle mais geste « ${annonce} »`);
      } else if (voulue > depart) {
        assert.equal(annonce, 'suivante', `dx=${dx} dy=${dy} : page ${voulue} mais geste « ${annonce} »`);
      } else {
        assert.equal(annonce, 'precedente', `dx=${dx} dy=${dy} : page ${voulue} mais geste « ${annonce} »`);
      }
    }
  }
});

// === Le plein écran, lu dans la source =====================================

test('le mode page occupe tout l’écran, et un moyen d’en sortir existe', () => {
  const lecteur = readFileSync(join(RACINE, 'app/lecteur.tsx'), 'utf8');

  // Le plein écran : l'en-tête et la barre de mode doivent être masqués quand
  // le mode page est actif. Un plein écran qui laisse l'en-tête n'en est pas un.
  assert.match(
    lecteur,
    /pleinEcran/,
    'le lecteur doit porter un état de plein écran',
  );

  // Et il doit y avoir une sortie. Un plein écran sans retour est un piège :
  // c'est la première chose à vérifier, pas la dernière.
  const sorties = [
    /onPress=\{\(\) => setPleinEcran\(false\)\}/,
    /accessibilityLabel="Quitter le plein écran"/,
  ];
  for (const motif of sorties) {
    assert.match(lecteur, motif, `sortie de plein écran manquante : ${motif}`);
  }
});

test('le geste est branché sur le composant de page, pas sur l’écran entier', () => {
  const composant = readFileSync(
    join(RACINE, 'src/components/LecteurPageMoushaf.tsx'),
    'utf8',
  );

  // Le geste appartient à la zone de la page : le poser sur l'écran entier
  // ferait tourner la page depuis les boutons de navigation, ce qui est le
  // comble pour un geste qu'on ajoute justement pour se passer d'eux.
  assert.match(composant, /<GestureDetector\s/, 'le détecteur de geste doit être monté');
  assert.match(composant, /Gesture\.Pan\(\)/, 'un geste de glissement est attendu');
  assert.match(
    composant,
    /onPrecedente|onSuivante/,
    'le geste doit appeler les mêmes commandes que les flèches',
  );

  // La page se tourne au **relâchement**, pas au toucher. Déclenché par
  // `.onBegin`, le geste partirait dès que le doigt se pose : un simple appui
  // tournerait la page, et le doigt n'aurait plus le droit de se raviser.
  assert.match(
    composant,
    /\.onEnd\(/,
    'la décision doit être prise au relâchement (.onEnd), pas au toucher (.onBegin)',
  );
  assert.doesNotMatch(
    composant,
    /\.onBegin\(/,
    'un geste déclenché au toucher ne laisse pas le doigt se raviser',
  );

  // `activeOffsetX` et `failOffsetY` sont ce qui rend le geste horizontal
  // compatible avec le défilement vertical : sans eux, le geste revendique
  // tout mouvement et la page ne défile plus. Les valeurs sont celles du
  // compromis retenu, et un élargissement démesuré les annule.
  assert.match(composant, /\.activeOffsetX\(\[-20, 20\]\)/);
  assert.match(composant, /\.failOffsetY\(\[-20, 20\]\)/);
});

test('la racine de l’application monte le conteneur de gestes', () => {
  // `react-native-gesture-handler` ne fonctionne pas sans son conteneur racine.
  // Le paquet est présent dans les dépendances, mais rien ne le montait : un
  // geste écrit dans un composant aurait alors simplement été ignoré, sans
  // erreur et sans message.
  //
  // Et il ne suffit pas que le nom apparaisse : il figure aussi dans un
  // commentaire et dans l'import. Ce qui compte est que l'**élément** soit
  // monté, donc écrit comme balise, et qu'il enveloppe la navigation.
  const layout = readFileSync(join(RACINE, 'app/_layout.tsx'), 'utf8');
  assert.match(
    layout,
    /<GestureHandlerRootView[\s>]/,
    'la racine doit monter l’élément <GestureHandlerRootView>',
  );
  assert.match(
    layout,
    /<\/GestureHandlerRootView>/,
    'l’élément doit être refermé : sinon il n’enveloppe rien',
  );
  // Sans `flex: 1`, la racine n'a pas de hauteur et l'application s'affiche
  // blanche.
  assert.match(
    layout,
    /<GestureHandlerRootView\s+style=\{\{\s*flex:\s*1\s*\}\}/,
    'la racine a besoin de flex: 1, sinon l’application s’affiche blanche',
  );

  // La pile de navigation doit être **dedans**. Un conteneur monté à côté de
  // la navigation ne recevrait aucun geste.
  const ouverture = layout.indexOf('<GestureHandlerRootView');
  const fermeture = layout.indexOf('</GestureHandlerRootView>');
  const pile = layout.indexOf('<Stack');
  assert.ok(pile > ouverture && pile < fermeture, 'la navigation doit être à l’intérieur');
});

test('les flèches n’ont pas été retirées : le geste s’ajoute, il ne remplace pas', () => {
  const composant = readFileSync(
    join(RACINE, 'src/components/LecteurPageMoushaf.tsx'),
    'utf8',
  );
  // La demande était « pas seulement les flèches ». Les deux doivent rester :
  // un geste est invisible, et un écran sans bouton ne se découvre pas.
  assert.match(composant, /accessibilityLabel="Page précédente"/);
  assert.match(composant, /accessibilityLabel="Page suivante"/);
});
