// Les ornements de la page du moushaf — de vrais dessins, pas une imitation.
//
// POURQUOI DU SVG, ET NON UNE IMAGE
// ---------------------------------
// Les ornements du moushaf de Madine — médaillon de verset, cartouche de
// sourate, encadrement, cartouche du numéro de page — sont des dessins
// géométriques. Les mesurer sur la page imprimée puis les écrire ici en tracés
// donne le même dessin à toutes les tailles, sans crénelage, et sans ajouter au
// paquet les 95 Mo d'images que prendraient 604 planches scannées.
//
// Les couleurs sont celles RELEVÉES sur la page imprimée (voir `PROVENANCE`) :
// le brun de la bordure, le crème des cartouches, le violet des fleurons, et le
// noir de l'encre. Elles sont données en hexadécimal, directement lisibles.
//
// CE QUI EST UN DESSIN DU MOUSHAF, ET CE QUI N'EN EST PAS UN
// ----------------------------------------------------------
// Le médaillon de verset, le cartouche du numéro et le cartouche de sourate
// sont dessinés par le **calligraphe** : leurs caractères sont des jeux de
// glyphes à part, absents des 604 polices de page, et leurs valeurs y sont
// dessinées par la police de page elle-même. On ne les redessine donc pas à la
// main pour le texte : on ne fait que **placer le support** (la forme) autour du
// caractère que la police fournit déjà.
//
// L'encadrement, lui, n'est pas du texte : c'est un motif, et il est redessiné.

import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';

/**
 * Les couleurs relevées sur la page imprimée du moushaf de Madine.
 *
 * Elles ne viennent pas de la charte de l'application : ce sont celles de
 * l'imprimé, échantillonnées sur la page 177 (voir `.tmp-atours.py` du journal
 * de mesures). Un ornement qui reprendrait les verts de l'application ne
 * ressemblerait plus au moushaf, et c'est justement l'imprimé qu'on veut.
 */
export const teintesMoushaf = {
  /** Le brun de l'encadrement et des liserés. */
  brun: '#B07B4F',
  /** Le brun foncé des traits de contour. */
  brunFonce: '#7A4A28',
  /** Le crème des cartouches et du fond du médaillon. */
  creme: '#ECDDD4',
  /** Le crème clair, pour les fonds larges. */
  cremeClair: '#F2E6DC',
  /** Le violet des fleurons. */
  violet: '#6B4A9E',
  /** Le violet clair des fleurons secondaires. */
  violetClair: '#9B7BC4',
  /** L'encre du texte. */
  encre: '#1C1C1C',
} as const;

/** Les deux pointes de l'ovale : rondelles pleines, côtés opposés. */
function Fleuron({ cx, cy, r, z }: { cx: number; cy: number; r: number; z: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy - z} r={r * 0.55} fill={teintesMoushaf.violet} />
      <Circle
        cx={cx}
        cy={cy + z}
        r={r * 0.55}
        fill={teintesMoushaf.violetClair}
      />
    </G>
  );
}

/**
 * Le médaillon d'un numéro de verset.
 *
 * Un ovale crème cerclé d'un liseré brun, et deux pointes violettes aux deux
 * extrêmes de l'axe vertical — c'est exactement le dessin de l'imprimé, relevé
 * au grossissement × 7 sur le verset 8 de la page 177. Le caractère du numéro
 * n'est pas dessiné ici : il vient de la police de page, et il est posé
 * **par-dessus** ce support, à sa place dans la ligne.
 *
 * Le dessin est volontairement sans texte : `children` reçoit le glyphe.
 */
export function MedaillonVerset({
  taille,
  children,
}: {
  /** Diamètre de la hauteur du médaillon, en pixels. */
  taille: number;
  children?: ReactNode;
}) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 100 100">
      {/* Les deux pointes, dessinées d'abord : le corps de l'ovale les recouvre
          en son milieu, comme sur l'imprimé, où elles semblent sortir de
          derrière l'ovale. */}
      <Fleuron cx={50} cy={50} r={16} z={46} />
      <Ellipse
        cx={50}
        cy={50}
        rx={33}
        ry={42}
        fill={teintesMoushaf.creme}
        stroke={teintesMoushaf.brunFonce}
        strokeWidth={3.4}
      />
      <Ellipse
        cx={50}
        cy={50}
        rx={28}
        ry={37}
        fill="none"
        stroke={teintesMoushaf.brun}
        strokeWidth={1.6}
      />
      <Ellipse
        cx={50}
        cy={50}
        rx={24}
        ry={33}
        fill="none"
        stroke={teintesMoushaf.brunFonce}
        strokeWidth={0.9}
      />
      {children}
    </Svg>
  );
}

/**
 * Le cartouche qui porte le numéro de la page, en pied de page.
 *
 * Un rectangle aux angles abattus, crème, cerclé de brun, posé sur un fond de
 * même crème plus clair — c'est le dessin relevé sous la page 177, où le numéro
 * s'écrit `١٧٧` en chiffres arabes.
 */
export function CartoucheNumero({
  largeur,
  hauteur,
  children,
}: {
  largeur: number;
  hauteur: number;
  children?: ReactNode;
}) {
  const a = 10; // l'abattement des angles, dans le repère 100 x 40
  return (
    <Svg width={largeur} height={hauteur} viewBox="0 0 100 40" preserveAspectRatio="none">
      <Rect x={0} y={0} width={100} height={40} fill={teintesMoushaf.cremeClair} />
      <Path
        d={`M ${a} 3 H ${100 - a} L 100 ${3 + a} V ${37 - a} L ${100 - a} 37 H ${a}
            L 0 ${37 - a} V ${3 + a} Z`}
        fill={teintesMoushaf.creme}
        stroke={teintesMoushaf.brunFonce}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
      {children}
    </Svg>
  );
}

/**
 * Le bandeau qui porte le nom de la sourate, en tête de page.
 *
 * Un cartouche aux angles abattus, avec un fleuron losangé de chaque côté — le
 * même que la page imprimée place à gauche et à droite du nom. Le nom lui-même
 * est composé en police de texte, par-dessus, comme le fait le moushaf : le
 * calligraphe écrit `سُورَةُ` suivi du nom, et ce n'est pas un glyphe de page.
 *
 * Le tracé se fait dans un repère de 300 x 34, et `preserveAspectRatio="none"`
 * l'étire à la largeur réelle du bloc : le cartouche occupe donc toute la
 * largeur, comme sur l'imprimé, où il court d'un bord à l'autre de la page.
 */
export function BandeauSourate({
  largeur,
  hauteur,
  children,
}: {
  largeur: number;
  hauteur: number;
  children?: ReactNode;
}) {
  const a = 8; // l'abattement des angles, dans le repère 300 x 34
  return (
    <Svg width={largeur} height={hauteur} viewBox="0 0 300 34" preserveAspectRatio="none">
      <Path
        d={`M ${a} 2 H ${300 - a} L 300 ${2 + a} V ${32 - a} L ${300 - a} 32 H ${a}
            L 0 ${32 - a} V ${2 + a} Z`}
        fill={teintesMoushaf.creme}
        stroke={teintesMoushaf.brun}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      {/* Les deux fleurons latéraux, posés en retrait du bord et non dessus. */}
      {[
        { x: 20, y: 17 },
        { x: 280, y: 17 },
      ].map(({ x, y }, i) => (
        <G key={i}>
          <Path
            d={`M ${x} ${y - 8} L ${x + 8} ${y} L ${x} ${y + 8} L ${x - 8} ${y} Z`}
            fill={teintesMoushaf.violetClair}
            stroke={teintesMoushaf.brunFonce}
            strokeWidth={0.9}
            vectorEffect="non-scaling-stroke"
          />
          <Circle cx={x} cy={y} r={2} fill={teintesMoushaf.violet} />
        </G>
      ))}
      {children}
    </Svg>
  );
}

/**
 * Le filet qui encadre la page — quatre traits, comme l'imprimé.
 *
 * L'imprimé en a deux : l'extérieur, épais, et l'intérieur, fin, avec un espace
 * entre eux. On ne redessine pas le treillis de fleurons qui court dans cet
 * espace : reproduire un ornement aussi dense sans le scanner demanderait soit
 * de l'inventer, soit d'embarquer une image — et un dessin inventé ne serait
 * plus celui de l'imprimé.
 *
 * Ce qui est reproduit ici est donc la **structure** du cadre (deux filets, un
 * épais puis un fin), à ses mesures relevées sur la page, en teinte brune.
 * L'écart est assez grand pour que la page se lise comme un moushaf encadré,
 * sans qu'on prétende avoir redessiné le treillis.
 */
export function CadreDePage({
  largeur,
  hauteur,
}: {
  largeur: number;
  hauteur: number;
}) {
  const margeExterieure = Math.max(3, largeur * 0.055);
  const margeInterieure = margeExterieure + Math.max(2, largeur * 0.022);
  return (
    <Svg width={largeur} height={hauteur} style={{ position: 'absolute', left: 0, top: 0 }}>
      <Rect
        x={margeExterieure}
        y={margeExterieure}
        width={largeur - 2 * margeExterieure}
        height={hauteur - 2 * margeExterieure}
        fill="none"
        stroke={teintesMoushaf.brunFonce}
        strokeWidth={Math.max(1, largeur * 0.005)}
      />
      <Rect
        x={margeInterieure}
        y={margeInterieure}
        width={largeur - 2 * margeInterieure}
        height={hauteur - 2 * margeInterieure}
        fill="none"
        stroke={teintesMoushaf.brun}
        strokeWidth={Math.max(0.6, largeur * 0.0022)}
      />
    </Svg>
  );
}
