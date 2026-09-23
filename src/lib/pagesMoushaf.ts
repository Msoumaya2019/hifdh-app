// La source des images des pages du moushaf.
//
// POURQUOI DES IMAGES, ET NON UNE COMPOSITION
// -------------------------------------------
// Le mode « page » dessinait la page avec la police de page du complexe KFGQPC,
// un mot par point de code. C'était fidèle au caractère près, mais fragile : la
// moindre erreur de mesure déplaçait un mot, une ligne pouvait déborder, et le
// résultat n'était pas *exactement* la page imprimée. Une image de la page
// imprimée, elle, ne peut pas se tromper : c'est la page.
//
// La composition par police a été retirée du lecteur. Elle n'est plus
// atteignable : le module qui la portait a été supprimé, et les 604 polices de
// page ne sont plus dans le dépôt — aucune version publiée ne les embarquait,
// mesuré dans l'APK. Elles ne sont donc plus une voie de repli ; elles se
// rétablissent à la demande par `scripts/recuperer_polices_pages.py`.
//
// D'OÙ VIENNENT LES IMAGES
// ------------------------
// Du moushaf que l'utilisateur a fourni lui-même, et dont il détient les droits.
// Les 604 pages en ont été extraites **à l'octet**, sans réencodage ni
// redimensionnement : elles sont rangées dans `pages-moushaf/`, à la racine du
// dépôt, et servies depuis ce dépôt par jsDelivr. La provenance complète, et
// l'empreinte de l'ensemble, sont dans `NOTICE.md`.
//
// CE QUI A ÉTÉ MESURÉ SUR CES PAGES
// ---------------------------------
//   - les 604 fichiers font **1920 × 3106**, sans exception : le rapport
//     hauteur/largeur vaut donc 1,61771 pour toutes les pages, y compris les
//     pages d'ouverture ornées ;
//   - elles sont en **palette** (599 en 4 bits, 5 en 8 bits), de 9 à 13
//     couleurs. C'est ce qui les rend légères : 112,7 Mo pour les 604 ;
//   - réduire la résolution les **alourdit** — 1440 px donne 256 Ko par page
//     contre 148 Ko à 1920 px —, parce que l'anti-aliasing ajoute des couleurs
//     et détruit les aplats que le filtre PNG compresse. Les originaux sont
//     donc aussi le plus petit choix fidèle, et il n'y a rien à gagner à les
//     retoucher.
//
// CE QUI A ÉTÉ CONFRONTÉ
// ----------------------
// La mise en page calculée de l'application (`data/quran/moushaf_layout.json`,
// qui vient de l'API quran.com) a été confrontée mot par mot à la table
// `glyphs` de la source des pages, qui donne pour chaque mot sa page et sa
// ligne. Sur 81 990 mots comparés, **81 989 tombent sur la même page et la même
// ligne** : les bandes de surlignage tombent donc sur les bonnes lignes des
// images affichées. Le seul écart est mesuré et nommé dans
// `docs/divisions-estimees.md`.
//
// CHANGER DE SOURCE PLUS TARD
// ---------------------------
// Tout passe par `getMushafPageImage`. Changer de fournisseur se fait en
// modifiant `SOURCE_PAGES` — sa `base` et son `dossier` : rien d'autre dans
// l'application ne connaît l'URL.

/**
 * La source des images. Un seul endroit à modifier pour en changer.
 *
 * `base` et `dossier` composent l'adresse : le dépôt qui porte les pages, et le
 * dossier où elles sont rangées. Le nom du fichier vient de
 * `nomDeFichierPage`, qui est aussi ce que le contrôle `verifier:pages-moushaf`
 * compare aux fichiers réellement présents sur le disque — un renommage d'un
 * côté seulement ne passerait donc pas.
 */
export const SOURCE_PAGES = {
  nom: 'Moushaf de Madine — 604 pages, Hafs \u2018an Asim',
  /** Le dépôt qui porte les pages, servi par jsDelivr. */
  base: 'https://cdn.jsdelivr.net/gh/Msoumaya2019/hifdh-app@main',
  /** Le dossier des pages, à la racine du dépôt. */
  dossier: 'pages-moushaf',
  /** Nombre de pages du moushaf imprimé. Un entier fixe : le moushaf en a 604. */
  nombreDePages: 604,
} as const;

/**
 * Le nom du fichier d'une page, tel qu'il est rangé dans `pages-moushaf/`.
 *
 * Le numéro est complété à trois chiffres (`page007.png`) pour que le dossier
 * se lise dans l'ordre du moushaf : sans cela, `page10.png` se rangerait entre
 * `page1.png` et `page2.png`.
 */
export function nomDeFichierPage(page: number): string {
  return `page${String(page).padStart(3, '0')}.png`;
}

/** Les dimensions des pages. Relevées sur les 604 fichiers : toutes identiques. */
export const LARGEUR_PAGE = 1920;
export const HAUTEUR_PAGE = 3106;

/**
 * Le rapport hauteur/largeur d'une page.
 *
 * C'est une **constante**, et c'est un fait mesuré, non une approximation : les
 * 604 pages du moushaf ont exactement le même format. Le contrôle
 * `verifier:pages-moushaf` relit l'en-tête des fichiers sur le disque et
 * compare, donc une page d'un autre format ferait rougir le contrôle au lieu de
 * laisser des bandes à l'écran.
 *
 * Cette valeur ne sert qu'à **réserver la place** avant l'arrivée de l'image :
 * sans elle, la page sauterait quand l'image arrive, et les boutons se
 * déplaceraient sous le doigt.
 */
export const RATIO_PAGE_PAR_DEFAUT = HAUTEUR_PAGE / LARGEUR_PAGE;

/**
 * Le rapport hauteur/largeur à réserver pour une page.
 *
 * La page est acceptée en paramètre bien que le rapport ne dépende pas d'elle :
 * c'est le point unique où le rapport est décidé, et un jour où une source
 * porterait des formats différents, c'est ici — et nulle part ailleurs — qu'il
 * faudrait regarder la page.
 */
export function getRatioPage(page: number): number {
  void page;
  return RATIO_PAGE_PAR_DEFAUT;
}

/**
 * L'URL de l'image d'une page du moushaf.
 *
 * Fonction centralisée, comme demandé : c'est le **seul** point de contact de
 * l'application avec la source des images. Rend `null` pour une page hors
 * bornes, plutôt que de fabriquer une URL qui répondrait 404.
 */
export function getMushafPageImage(page: number): string | null {
  if (!Number.isInteger(page)) return null;
  if (page < 1 || page > SOURCE_PAGES.nombreDePages) return null;
  return `${SOURCE_PAGES.base}/${SOURCE_PAGES.dossier}/${nomDeFichierPage(page)}`;
}

/** Vrai si le numéro de page désigne une page du moushaf. */
export function pageValide(page: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= SOURCE_PAGES.nombreDePages;
}

/** Ramener un numéro quelconque dans les bornes du moushaf. */
export function pageBornee(page: number): number {
  if (!Number.isFinite(page)) return 1;
  const entiere = Math.round(page);
  if (entiere < 1) return 1;
  if (entiere > SOURCE_PAGES.nombreDePages) return SOURCE_PAGES.nombreDePages;
  return entiere;
}
