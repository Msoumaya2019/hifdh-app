// La navigation par onglets : cinq onglets EN HAUT, Amis à la place de Profil.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Le déplacement de la barre du bas vers le haut, et l'échange « Amis entre,
// Profil sort », sont des décisions de STRUCTURE. Elles ne cassent rien quand
// elles sont défaites : l'application démarre, les écrans s'affichent, et seul
// un détail manque — un onglet qui n'est plus là, un profil qu'on ne trouve
// plus, une encoche comptée deux fois. Aucun test de comportement ne les voit,
// parce qu'il n'y a pas de comportement à mesurer : il y a une forme.
//
// Ce que ce fichier garde, et pourquoi chaque garde compte :
//
//   1. `tabBarPosition` vaut `'top'`. C'est la valeur qui a été choisie ; la
//      remettre à `'bottom'` ne lève rien.
//   2. Cinq onglets, pas quatre ni six. La spécification interdit d'en ajouter
//      un sixième, et le commentaire de la pile racine le rappelle. Le compte
//      est donc une contrainte, pas une observation.
//   3. `amis` est l'un des cinq, `profil` n'en est plus.
//   4. Les fichiers suivent : `app/(tabs)/amis.tsx` existe, `app/profil.tsx`
//      existe, `app/(tabs)/profil.tsx` n'existe plus. Un écran présent aux deux
//      endroits se résoudrait vers l'un des deux sans que rien ne le dise.
//   5. La pile racine déclare `profil` et ne déclare plus `amis`. Un écran
//      déclaré à la fois comme onglet et comme écran empilé est le même piège.
//   6. Le profil reste ATTEIGNABLE : la barre pousse `/profil`. Sortir Profil
//      de la barre sans cet avatar le rendrait introuvable, et c'est
//      exactement le genre de régression qu'on ne voit qu'en le cherchant.
//   7. La marge du haut est prise UNE SEULE FOIS. La barre la prend ; les
//      écrans d'onglet ne doivent donc plus la prendre. `SafeAreaProviderCompat`
//      ne retire pas la hauteur de la barre des marges qu'il transmet —
//      vérifié dans son source —, donc `edges={['top']}` sous la barre
//      compterait l'encoche deux fois. Le profil, lui, n'est plus sous la
//      barre : il doit la garder.
//   8. L'appui est émis AVANT de naviguer, et son refus est respecté. C'est ce
//      qui permet à un écran de retenir l'appui. Naviguer d'abord rendrait ce
//      refus sans effet, en silence.
//
// CE QUE CE FICHIER NE PROUVE PAS
// -------------------------------
// Il lit des sources ; il ne rend rien. Il n'établit donc ni que la barre est
// jolie, ni qu'elle tient sur un petit écran, ni que le pouce l'atteint. Ces
// trois choses se regardent sur un téléphone.
//
// Et il ne dit rien de la hauteur RÉELLE de l'encoche : il vérifie que la marge
// est demandée au bon endroit, pas que le téléphone la fournit.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');

/**
 * Le source sans ses commentaires.
 *
 * Sans ce retrait, une phrase écrite dans un commentaire — « la barre est en
 * haut » — satisferait le contrôle qui la cherche. C'est la première façon dont
 * un test de forme se met à ne plus rien mesurer : il lit ce qu'on a écrit SUR
 * le code au lieu de lire le code.
 *
 * Les `//` ne sont retirés qu'en début de ligne : dans une chaîne, `//` ouvre
 * une adresse (`https://…`), pas un commentaire.
 */
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const DISPOSITION = 'app/(tabs)/_layout.tsx';
const BARRE = 'src/components/BarreOngletsHaut.tsx';
const PILE = 'app/_layout.tsx';
const PROFIL = 'app/profil.tsx';

/** Les noms d'onglets déclarés dans la disposition, dans l'ordre du fichier. */
function nomsDesOnglets() {
  const source = sansCommentaires(lire(DISPOSITION));
  const table = source.match(/const TAB_CONFIG = \[([\s\S]*?)\];/);
  assert.ok(table, 'la disposition doit déclarer une table TAB_CONFIG');
  return [...table[1].matchAll(/name: '([a-z-]+)'/g)].map((m) => m[1]);
}

test('la barre d’onglets est en haut', () => {
  const source = sansCommentaires(lire(DISPOSITION));

  assert.match(
    source,
    /tabBarPosition:\s*'top'/,
    'la disposition doit poser tabBarPosition à « top »'
  );
  assert.doesNotMatch(
    source,
    /tabBarPosition:\s*'bottom'/,
    'tabBarPosition ne doit pas valoir « bottom » : la barre du bas a été retirée'
  );
});

test('la barre porte exactement cinq onglets', () => {
  // Cinq, et non « au moins cinq » : la spécification interdit une sixième
  // entrée. Un compte plus grand est un défaut, pas une tolérance.
  assert.deepEqual(
    nomsDesOnglets().length,
    5,
    `cinq onglets attendus, ${nomsDesOnglets().length} déclarés`
  );
});

test('Amis est un onglet, et Profil n’en est plus un', () => {
  const noms = nomsDesOnglets();

  assert.ok(noms.includes('amis'), 'Amis doit être l’un des cinq onglets');
  assert.ok(
    !noms.includes('profil'),
    'Profil ne doit plus figurer dans la barre : il s’ouvre par l’avatar'
  );
});

test('les fichiers d’écran suivent la barre', () => {
  assert.ok(
    existsSync(join(RACINE, 'app/(tabs)/amis.tsx')),
    'app/(tabs)/amis.tsx doit exister : c’est l’écran de l’onglet'
  );
  assert.ok(
    existsSync(join(RACINE, PROFIL)),
    'app/profil.tsx doit exister : le profil redevient un écran empilé'
  );
  assert.ok(
    !existsSync(join(RACINE, 'app/(tabs)/profil.tsx')),
    'app/(tabs)/profil.tsx ne doit plus exister : un écran présent aux deux '
      + 'endroits se résoudrait vers l’un des deux sans que rien ne le dise'
  );
});

test('la pile racine déclare Profil et ne déclare plus Amis', () => {
  const source = sansCommentaires(lire(PILE));

  assert.match(
    source,
    /<Stack\.Screen\s+name="profil"/,
    'la pile racine doit déclarer l’écran profil'
  );
  assert.doesNotMatch(
    source,
    /<Stack\.Screen\s+name="amis"/,
    'la pile racine ne doit plus déclarer amis : il est un onglet'
  );
});

test('la barre rend le profil atteignable', () => {
  const source = sansCommentaires(lire(BARRE));

  assert.match(
    source,
    /router\.push\('\/profil'\)/,
    'la barre doit offrir l’accès au profil, sans quoi sortir Profil de la '
      + 'barre le rendrait introuvable'
  );
  assert.match(
    source,
    /router\.push\('\/notifications'\)/,
    'la barre doit offrir l’accès aux notifications'
  );
});

test('la marge du haut est prise une seule fois', () => {
  const barre = sansCommentaires(lire(BARRE));

  assert.match(
    barre,
    /useSafeAreaInsets\(\)/,
    'la barre doit lire les marges de sécurité'
  );
  assert.match(
    barre,
    /paddingTop:\s*insets\.top/,
    'la barre doit prendre elle-même la marge du haut'
  );

  for (const nom of nomsDesOnglets()) {
    const chemin = `app/(tabs)/${nom}.tsx`;
    const source = sansCommentaires(lire(chemin));

    assert.doesNotMatch(
      source,
      /edges=\{\['top'\]\}/,
      `${chemin} ne doit plus demander la marge du haut : la barre la prend, `
        + 'et elle serait comptée deux fois'
    );
    if (source.includes('SafeAreaView')) {
      assert.match(
        source,
        /edges=\{\['bottom'\]\}/,
        `${chemin} doit protéger le bas, qu’aucune barre ne couvre plus`
      );
    }
  }

  const profil = sansCommentaires(lire(PROFIL));
  assert.match(
    profil,
    /edges=\{\['top'\]\}/,
    'le profil n’est plus sous la barre : il doit garder la marge du haut'
  );
});

test('l’appui est émis avant de naviguer, et son refus est respecté', () => {
  const source = sansCommentaires(lire(BARRE));

  const emission = source.indexOf("type: 'tabPress'");
  const navigation = source.indexOf('navigation.navigate(');

  assert.ok(emission !== -1, 'la barre doit émettre l’événement tabPress');
  assert.ok(navigation !== -1, 'la barre doit naviguer vers l’onglet choisi');
  assert.ok(
    emission < navigation,
    'l’événement doit être émis AVANT de naviguer : émettre après rendrait '
      + 'tout refus sans effet'
  );
  assert.match(
    source,
    /canPreventDefault:\s*true/,
    'l’événement doit être annulable, sans quoi un écran ne peut pas retenir '
      + 'l’appui'
  );
  assert.match(
    source,
    /!evenement\.defaultPrevented/,
    'le refus émis par un écran doit être respecté avant de naviguer'
  );
});
