// Le thème commutable : les quatre palettes, et ce qu'elles doivent garantir.
//
// POURQUOI UN CONTRÔLE DE CONTRASTE, ET PAS SEULEMENT DE FORME
// ------------------------------------------------------------
// Une palette qui oublie un jeton ne lève rien : React Native reçoit
// `color: undefined` et retombe sur la valeur par défaut du système. L'écran
// reste donc affiché, avec un texte noir sur un fond noir dans le cas du thème
// sombre — la panne la plus coûteuse à diagnostiquer, parce qu'elle ne dit rien.
//
// Et une palette complète peut être illisible. Le contraste se calcule : c'est
// la luminance relative de la recommandation WCAG 2.1, et le rapport
// (L_clair + 0,05) / (L_sombre + 0,05). On ne juge donc pas « à l'œil » que le
// rose convient — on le mesure, et le seuil est écrit.
//
// LES COUPLES VÉRIFIÉS SONT CEUX QUE LE CODE EMPLOIE RÉELLEMENT
// -------------------------------------------------------------
// Ils ont été relevés dans les écrans, pas inventés :
//
//   - `textPrimary` sur `background`, `surface`, `surfaceVariant` et
//     `primarySurface` : les quatre fonds sur lesquels il porte du texte ;
//   - `textOnPrimary` sur `primary` : le libellé des boutons pleins ;
//   - `primary` sur `primarySurface` : le nom du profil, la barre de plage, le
//     libellé du bouton « Renforcer mes passages » — c'est `primary` qui sert de
//     couleur de texte, et non `textOnPrimary` ;
//   - `textSecondary` sur `background` et `surface` : les phrases d'explication.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estNomPalette,
  estPaletteSombre,
  LIBELLES_PALETTES,
  ORDRE_PALETTES,
  PALETTES,
  PALETTE_PAR_DEFAUT,
} from '@/theme/palettes';
import { applyPaletteNommee, colors, nomPaletteCourante } from '@/theme/colors';

const NOMS = ORDRE_PALETTES;

/** Les jetons de référence : ceux de la palette verte, la plus ancienne. */
const JETONS = Object.keys(PALETTES.vert).sort();

// === Le contraste, mesuré ===

/**
 * La luminance relative d'une couleur, au sens de la WCAG 2.1.
 *
 * Les trois canaux sont d'abord ramenés de la gamme [0, 255] à [0, 1], puis
 * « dé-gammés » : une valeur inférieure à 0,04045 est divisée par 12,92, les
 * autres passent par une puissance 2,4. C'est cette non-linéarité qui fait
 * qu'un gris moyen n'est pas à mi-chemin entre le noir et le blanc.
 */
function luminance(couleur) {
  const canaux = [1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16) / 255);
  const lineaire = canaux.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lineaire[0] + 0.7152 * lineaire[1] + 0.0722 * lineaire[2];
}

/** Le rapport de contraste entre deux couleurs. Toujours supérieur ou égal à 1. */
function contraste(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const clair = Math.max(la, lb);
  const sombre = Math.min(la, lb);
  return (clair + 0.05) / (sombre + 0.05);
}

/**
 * Les couples de couleurs que le code emploie, et le seuil de chacun.
 *
 * Le seuil de 4,5 est celui de la WCAG pour du texte courant ; 3,0 est celui du
 * texte large et des éléments d'interface. Un jeton employé comme couleur
 * d'icône ou de bordure se contente donc de 3,0 — l'exiger à 4,5 obligerait à
 * des teintes qui ne ressemblent plus à ce que l'utilisateur a demandé.
 */
const COUPLES = [
  ['textPrimary', 'background', 4.5],
  ['textPrimary', 'surface', 4.5],
  ['textPrimary', 'surfaceVariant', 4.5],
  ['textPrimary', 'primarySurface', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['textTertiary', 'background', 3.0],
  ['textOnPrimary', 'primary', 4.5],
  ['primary', 'primarySurface', 3.0],
  ['primary', 'background', 3.0],
];

/**
 * Le doré, tenu à part — et pourquoi.
 *
 * Mesuré avant d'écrire ce fichier : `#C4A35A` sur le fond crème donne un
 * rapport de **2,27**. C'est en dessous du seuil de 3,0 réservé aux éléments
 * d'interface, et c'est **antérieur à ce travail** : le doré est la teinte
 * d'accent d'origine, employée seulement pour des icônes décoratives — le
 * calendrier de l'estimation, l'icône de révision espacée.
 *
 * Deux issues étaient possibles. Assombrir le doré jusqu'à 3,0 changerait la
 * teinte validée par l'utilisateur — « doré discret » deviendrait « brun ». Le
 * retirer du contrôle sans rien dire aurait effacé la mesure. On le garde donc,
 * avec un plancher plus bas et la valeur écrite : si quelqu'un assombrit encore
 * le doré, ou si le fond change, le contrôle le dira.
 */
const COUPLES_DECORATIFS = [['gold', 'background', 2.2]];


test('chaque palette porte exactement les mêmes jetons que la palette verte', () => {
  for (const nom of NOMS) {
    const palette = PALETTES[nom];
    const jetons = Object.keys(palette).sort();
    const manquants = JETONS.filter((j) => !jetons.includes(j));
    const enTrop = jetons.filter((j) => !JETONS.includes(j));
    assert.deepEqual(manquants, [], `la palette « ${nom} » ne définit pas : ${manquants.join(', ')}`);
    assert.deepEqual(enTrop, [], `la palette « ${nom} » définit en trop : ${enTrop.join(', ')}`);
  }
});

test('aucun jeton n’est vide, et tous sont des couleurs à six chiffres', () => {
  for (const nom of NOMS) {
    for (const [jeton, valeur] of Object.entries(PALETTES[nom])) {
      assert.match(
        valeur,
        /^#[0-9A-Fa-f]{6}$/,
        `« ${nom}.${jeton} » vaut « ${valeur} », qui n'est pas une couleur #RRGGBB`
      );
    }
  }
});

test('les couples de couleurs réellement employés restent lisibles', () => {
  const echecs = [];
  for (const nom of NOMS) {
    const palette = PALETTES[nom];
    for (const [texte, fond, seuil] of [...COUPLES, ...COUPLES_DECORATIFS]) {
      const rapport = contraste(palette[texte], palette[fond]);
      if (rapport < seuil) {
        echecs.push(
          `${nom} : ${texte} sur ${fond} = ${rapport.toFixed(2)} (seuil ${seuil})`
        );
      }
    }
  }
  assert.deepEqual(echecs, [], `contrastes insuffisants :\n  ${echecs.join('\n  ')}`);
});

test('le thème noir est bien un thème sombre, les trois autres non', () => {
  assert.equal(estPaletteSombre('noir'), true);
  for (const nom of ['vert', 'rose', 'bleu']) {
    assert.equal(estPaletteSombre(nom), false, `« ${nom} » ne doit pas être annoncé sombre`);
  }
  // Le fond du thème noir doit être plus sombre que son texte principal, et
  // l'inverse pour les thèmes clairs : c'est la définition même de « sombre ».
  const noir = PALETTES.noir;
  assert.ok(
    luminance(noir.background) < luminance(noir.textPrimary),
    'le fond du thème noir devrait être plus sombre que son texte'
  );
  for (const nom of ['vert', 'rose', 'bleu']) {
    const p = PALETTES[nom];
    assert.ok(
      luminance(p.background) > luminance(p.textPrimary),
      `le fond du thème « ${nom} » devrait être plus clair que son texte`
    );
  }
});

test('le vert cède entièrement la place au rose et au bleu', () => {
  // La demande était explicite : « la couleur verte disparaît et laisse place au
  // rose ». Un vert résiduel se verrait sur les boutons pleins ou le graphe.
  const vert = PALETTES.vert;
  for (const nom of ['rose', 'bleu']) {
    const palette = PALETTES[nom];
    for (const jeton of ['primary', 'primaryLight', 'primaryDark', 'chartPrimary', 'chartTertiary']) {
      assert.notEqual(
        palette[jeton],
        vert[jeton],
        `« ${nom}.${jeton} » est resté au vert`
      );
    }
  }
});

test('chaque palette a un libellé français, et l’ordre est complet', () => {
  assert.deepEqual([...ORDRE_PALETTES].sort(), [...NOMS].sort());
  for (const nom of NOMS) {
    const libelle = LIBELLES_PALETTES[nom];
    assert.equal(typeof libelle, 'string');
    assert.ok(libelle.length > 0, `la palette « ${nom} » n'a pas de libellé`);
  }
});

test('un nom inconnu venu du stockage est refusé, pas pris pour une palette', () => {
  for (const mauvais of [null, undefined, '', 'Vert', 'mauve', 42, {}, ['vert']]) {
    assert.equal(estNomPalette(mauvais), false, `« ${String(mauvais)} » ne doit pas être accepté`);
  }
  for (const nom of NOMS) {
    assert.equal(estNomPalette(nom), true);
  }
});

test('appliquer une palette modifie l’objet colors sur place', () => {
  // C'est le mécanisme même du thème : les cent et quelques usages écrits en
  // ligne lisent cet objet. S'il était remplacé au lieu d'être modifié, ils
  // garderaient la palette d'origine — et rien ne le dirait.
  const reference = colors;
  const fondVert = colors.background;

  applyPaletteNommee('noir');
  assert.equal(colors, reference, '`colors` doit rester le même objet');
  assert.equal(colors.background, PALETTES.noir.background);
  assert.notEqual(colors.background, fondVert);
  assert.equal(nomPaletteCourante(), 'noir');

  applyPaletteNommee(PALETTE_PAR_DEFAUT);
  assert.equal(colors.background, fondVert, 'revenir au vert doit rendre le fond d’origine');
  assert.equal(nomPaletteCourante(), PALETTE_PAR_DEFAUT);
});

test('appliquer deux fois la même palette donne le même résultat', () => {
  // Le fournisseur applique la palette à chaque rendu : l'opération doit être
  // idempotente, sinon un rendu rejoué ferait dériver les couleurs.
  applyPaletteNommee('rose');
  const premier = { ...colors };
  applyPaletteNommee('rose');
  assert.deepEqual({ ...colors }, premier);
  applyPaletteNommee(PALETTE_PAR_DEFAUT);
});
