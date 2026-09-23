// Où tombe chaque verset sur la page du moushaf : les zones mesurées.
//
// D'OÙ VIENNENT CES ZONES, ET POURQUOI ELLES EXISTENT
// ---------------------------------------------------
// La page affichée est une **image** de la page imprimée. Une image ne se
// colore pas : pour surligner le verset qu'on écoute, il faut savoir où il est.
//
// La mise en page (`moushaf_layout.json`) le dit à la **ligne** — assez pour
// marquer « la séance est ici », pas assez pour suivre une récitation : une
// ligne qui porte trois versets courts les marque toutes les trois.
//
// `zones_surlignage.json` le dit au **mot**, parce qu'il vient de la table
// `glyphs` de la base qui accompagne les images — celle qui a servi à les
// dessiner. Chaque mot y porte la boîte exacte de son tracé. Les zones sont donc
// **mesurées**, jamais devinées, et leur provenance complète est dans
// `data/quran/generer_zones_surlignage.py`.
//
// CE QUE CE MODULE REND, ET EN QUELLE UNITÉ
// ------------------------------------------
// Des **fractions de la page**, de 0 à 1. C'est ce qui permet à la bande de
// suivre la page quelle que soit sa taille à l'écran, sans conversion à chaque
// rendu et sans dépendre du format de l'appareil.
//
// La conversion depuis les pixels est faite **ici, et nulle part ailleurs** :
// les dimensions viennent du fichier lui-même (`provenance.largeurPage`), et non
// d'une constante recopiée. Si la source changeait de format, la conversion
// suivrait — et le contrôle `verifier:zones` refuserait un fichier dont les
// boîtes sortent de la page.
//
// LA BANDE VERTICALE EST CELLE DE LA LIGNE
// -----------------------------------------
// La hauteur vient de la **ligne entière**, et non du mot : l'étendue verticale
// d'un mot dépend de ses lettres, et donner à chaque zone la hauteur de son
// encre ferait clignoter les bandes d'une même ligne. La largeur, elle, est
// propre au verset — c'est elle qui le distingue de ses voisins.

import zonesData from '@data/quran/zones_surlignage.json';
import type { AyahRef } from '@/types';

/**
 * Un verset, nommé comme dans le reste de l'application.
 *
 * Un alias, et non une seconde déclaration : ce module en portait une copie,
 * tout comme `plan.ts`, et rien ne comparait les trois formes.
 */
export type RefVerset = AyahRef;

/** Une zone de surlignage, en fractions de la page. */
export interface ZoneVerset {
  /** Le numéro de ligne, de 1 à 15. */
  ligne: number;
  /** Le bord droit (le début du verset, en lecture arabe), de 0 à 1. */
  droite: number;
  /** Le bord gauche (la fin du verset), de 0 à 1. */
  gauche: number;
  /** Le haut de la bande, de 0 à 1. */
  haut: number;
  /** Le bas de la bande, de 0 à 1. */
  bas: number;
}

interface PageBrute {
  lignes?: (number[] | null)[];
  zones?: number[][];
}

const donnees = zonesData as unknown as {
  provenance?: { largeurPage?: number; hauteurPage?: number };
  pages?: Record<string, PageBrute>;
};

/**
 * Les dimensions de la page, lues dans le fichier de zones.
 *
 * Elles ne sont pas recopiées depuis `pagesMoushaf.ts` : ce sont celles dans
 * lesquelles les boîtes ont été **mesurées**. Les recopier ferait dépendre la
 * géométrie d'une seconde constante, qui pourrait diverger sans que rien ne le
 * dise.
 */
export const LARGEUR_MESUREE = donnees.provenance?.largeurPage ?? 1920;
export const HAUTEUR_MESUREE = donnees.provenance?.hauteurPage ?? 3106;

/** Le nombre de zones décrites, toutes pages confondues. Sert aux contrôles. */
export function nombreDeZones(): number {
  let total = 0;
  for (const page of Object.values(donnees.pages ?? {})) total += page.zones?.length ?? 0;
  return total;
}

/**
 * Les zones d'un verset sur une page, en fractions, dans l'ordre des lignes.
 *
 * Rend un tableau vide quand le verset n'est pas sur cette page — jamais `null` :
 * « rien à surligner » et « la page est inconnue » mènent au même dessin.
 */
export function zonesDuVerset(page: number, surah: number, ayah: number): ZoneVerset[] {
  const brute = donnees.pages?.[String(page)];
  if (brute === undefined || !Array.isArray(brute.zones)) return [];
  if (!Array.isArray(brute.lignes)) return [];

  const zones: ZoneVerset[] = [];
  for (const zone of brute.zones) {
    if (!Array.isArray(zone) || zone.length < 5) continue;
    const [zSurah, zAyah, zLigne, zGauche, zDroite] = zone;
    if (zSurah !== surah || zAyah !== ayah) continue;

    const bande = brute.lignes[zLigne - 1];
    if (bande === null || bande === undefined || !Array.isArray(bande)) continue;

    zones.push({
      ligne: zLigne,
      droite: zDroite / LARGEUR_MESUREE,
      gauche: zGauche / LARGEUR_MESUREE,
      haut: bande[0] / HAUTEUR_MESUREE,
      bas: bande[1] / HAUTEUR_MESUREE,
    });
  }
  return zones.sort((a, b) => a.ligne - b.ligne);
}

/**
 * Élargit une zone d'une marge, en fractions, sans sortir de la page.
 *
 * La marge existe parce que la boîte mesurée est celle de l'**encre** : collée
 * au tracé, la bande rogne l'extrémité des lettres et se lit comme un défaut.
 * Quelques millièmes suffisent. Le bornage évite qu'une zone au bord de la page
 * déborde de son cadre.
 */
export function zoneAvecMarge(
  zone: ZoneVerset,
  margeX: number,
  margeY: number
): ZoneVerset {
  return {
    ligne: zone.ligne,
    droite: Math.min(1, zone.droite + margeX),
    gauche: Math.max(0, zone.gauche - margeX),
    haut: Math.max(0, zone.haut - margeY),
    bas: Math.min(1, zone.bas + margeY),
  };
}

/**
 * La position d'une zone, en pourcentages de la page.
 *
 * Ce que le style attend : une distance depuis le bord **gauche** de la page
 * pour `left`, et une largeur. Le sens de l'axe horizontal est celui de la
 * lecture arabe — `droite` est le bord par lequel le verset COMMENCE, `gauche`
 * celui par lequel il FINIT — et c'est donc `gauche` qui donne le `left`.
 *
 * Cette conversion est ici, et non dans le composant, parce qu'une inversion des
 * deux bords produirait une bande **en miroir** : posée sur le verset voisin,
 * mais de la bonne taille et de la bonne couleur. Sur une page où l'on ne sait
 * pas encore quel verset on regarde, une bande en miroir passe pour juste. Une
 * fonction pure se laisse éprouver ; un style écrit à la main, non.
 */
export function positionEnPourcent(zone: ZoneVerset): {
  top: `${number}%`;
  height: `${number}%`;
  left: `${number}%`;
  width: `${number}%`;
} {
  return {
    top: `${zone.haut * 100}%`,
    height: `${Math.max(0, zone.bas - zone.haut) * 100}%`,
    left: `${zone.gauche * 100}%`,
    width: `${Math.max(0, zone.droite - zone.gauche) * 100}%`,
  };
}

/**
 * Les versets d'une page, dans l'ordre de lecture.
 *
 * L'ordre est celui du moushaf : par ligne, et sur une même ligne de droite à
 * gauche — donc par abscisse **décroissante**, puisque l'arabe se lit ainsi.
 * C'est l'ordre dans lequel l'utilisateur voit les versets, et donc celui dans
 * lequel il les sélectionne.
 */
export function versetsDeLaPage(page: number): RefVerset[] {
  const brute = donnees.pages?.[String(page)];
  if (brute === undefined || !Array.isArray(brute.zones)) return [];

  // La première apparition de chaque verset décide de son rang.
  const premiers = new Map<string, { surah: number; ayah: number; ligne: number; droite: number }>();
  for (const zone of brute.zones) {
    if (!Array.isArray(zone) || zone.length < 5) continue;
    const [surah, ayah, ligne, , droite] = zone;
    const cle = `${surah}:${ayah}`;
    const connu = premiers.get(cle);
    if (connu === undefined || ligne < connu.ligne || (ligne === connu.ligne && droite > connu.droite)) {
      premiers.set(cle, { surah, ayah, ligne, droite });
    }
  }

  return [...premiers.values()]
    .sort((a, b) => (a.ligne !== b.ligne ? a.ligne - b.ligne : b.droite - a.droite))
    .map(({ surah, ayah }) => ({ surah, ayah }));
}

/** Vrai si la page est décrite par le fichier de zones. */
export function pageDecrite(page: number): boolean {
  const brute = donnees.pages?.[String(page)];
  return brute !== undefined && Array.isArray(brute.zones);
}

/**
 * Les versets d'une page entre deux versets désignés, inclus, dans l'ordre du
 * moushaf.
 *
 * POURQUOI DEUX REPÈRES SUFFISENT
 * -------------------------------
 * Une sélection se fait sur une page, en deux appuis : le premier pose une
 * borne, le second l'autre. C'est la sélection de texte que tout le monde
 * connaît, et elle évite d'avoir à faire glisser le doigt sur une page qu'on
 * veut justement lire.
 *
 * L'ORDRE EST CELUI DE LA PAGE, PAS CELUI DES APPUIS
 * --------------------------------------------------
 * Rien ne dit que l'utilisateur appuiera sur le verset du haut avant celui du
 * bas — et sur une page arabe, il lira souvent de droite à gauche, donc du
 * dernier verset vers le premier. La plage est donc rendue **dans l'ordre du
 * moushaf**, quelle que soit la façon dont les deux bornes ont été posées :
 * c'est l'ordre dans lequel la récitation doit avancer.
 *
 * Un verset qui n'est pas sur la page rend une plage vide : l'appelant a
 * désigné autre chose que ce qu'il regarde, et rien ne doit être sélectionné.
 */
export function plageEntre(page: number, a: RefVerset, b: RefVerset): RefVerset[] {
  const versets = versetsDeLaPage(page);
  const rang = (v: RefVerset) =>
    versets.findIndex((x) => x.surah === v.surah && x.ayah === v.ayah);

  const debut = rang(a);
  const fin = rang(b);
  if (debut < 0 || fin < 0) return [];

  const [bas, haut] = debut <= fin ? [debut, fin] : [fin, debut];
  return versets.slice(bas, haut + 1);
}

/**
 * Le verset touché par un doigt posé à (`x`, `y`), en fractions de la page.
 *
 * POURQUOI LE PLUS PROCHE, ET NON LE SEUL CONTENANT
 * -------------------------------------------------
 * Un doigt n'est pas un pixel. Entre la fin d'un verset et le début du suivant
 * il y a un blanc — un vrai, sur la page imprimée — et exiger que le doigt
 * tombe dans l'encre ferait qu'un appui sur ce blanc ne sélectionnerait **rien**.
 * L'utilisateur, lui, a désigné une ligne et un endroit de cette ligne : il
 * attend le verset qui est là.
 *
 * La recherche se fait donc sur la LIGNE : d'abord le verset dont la boîte
 * contient le doigt, et à défaut celui dont la boîte en est le plus proche **sur
 * cette ligne**. Un appui en dehors de toute bande de ligne ne désigne rien —
 * c'est le cas d'un appui dans la marge, et il vaut mieux ne rien faire que de
 * sélectionner un verset que l'utilisateur n'a pas visé.
 */
export function versetTouche(page: number, x: number, y: number): RefVerset | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  let meilleur: { verset: RefVerset; distance: number } | null = null;

  for (const verset of versetsDeLaPage(page)) {
    for (const zone of zonesDuVerset(page, verset.surah, verset.ayah)) {
      if (y < zone.haut || y > zone.bas) continue;
      if (x >= zone.gauche && x <= zone.droite) return verset;

      const distance = x < zone.gauche ? zone.gauche - x : x - zone.droite;
      if (meilleur === null || distance < meilleur.distance) {
        meilleur = { verset, distance };
      }
    }
  }

  return meilleur === null ? null : meilleur.verset;
}

/** La bande verticale d'une ligne, en fractions, ou `null` si elle est vide. */
export function bandeDeLigne(page: number, ligne: number): { haut: number; bas: number } | null {
  const brute = donnees.pages?.[String(page)];
  const bande = brute?.lignes?.[ligne - 1];
  if (bande === null || bande === undefined || !Array.isArray(bande)) return null;
  return { haut: bande[0] / HAUTEUR_MESUREE, bas: bande[1] / HAUTEUR_MESUREE };
}
