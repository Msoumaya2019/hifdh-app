// Couche d'accès aux données coraniques
// Charge le texte et les métadonnées depuis les fichiers JSON

import surahsData from '@data/quran/surahs.json';
import divisionsData from '@data/quran/divisions.json';
import thumnData from '@data/quran/thumn_hafs.json';
import quranTextData from '@data/quran/quran_text_uthmani.json';
import moushafLayoutData from '@data/quran/moushaf_layout.json';
import largeursPagesData from '@data/quran/largeurs_pages.json';
import type { Surah, Juz, Hizb, Rub, Thumn, Ayah, AyahRef } from '@/types';

// Cache du texte coranique
const quranTextCache: Ayah[] = quranTextData as unknown as Ayah[];

export async function loadQuranText(): Promise<Ayah[]> {
  return quranTextCache;
}

// === Sourates ===

export function getAllSurahs(): Surah[] {
  return surahsData as unknown as Surah[];
}

export function getSurah(number: number): Surah | undefined {
  return (surahsData as unknown as Surah[]).find((s) => s.number === number);
}

export function getSurahAyahCount(surahNumber: number): number {
  const surah = getSurah(surahNumber);
  return surah?.ayahCount ?? 0;
}

// === Divisions ===

const divisions = divisionsData as unknown as {
  juz: Juz[];
  hizb: Hizb[];
  rub: Rub[];
};

export function getAllJuz(): Juz[] {
  return divisions.juz;
}

export function getJuz(juzNumber: number): Juz | undefined {
  return divisions.juz.find((j) => j.juzNumber === juzNumber);
}

export function getAllHizb(): Hizb[] {
  return divisions.hizb;
}

export function getHizb(hizbNumber: number): Hizb | undefined {
  return divisions.hizb.find((h) => h.hizbNumber === hizbNumber);
}

export function getAllRub(): Rub[] {
  return divisions.rub;
}

export function getRub(rubNumber: number): Rub | undefined {
  return divisions.rub.find((r) => r.rubNumber === rubNumber);
}

// === Thumn (toumoun) ===

const thumn = (thumnData as unknown as { thumn: Thumn[] }).thumn;

export function getAllThumn(): Thumn[] {
  return thumn;
}

export function getThumn(thumnNumber: number): Thumn | undefined {
  return thumn.find((t) => t.thumnNumber === thumnNumber);
}

export function getThumnCount(): number {
  return thumn.length;
}

/**
 * Combien de limites de toumoun ne sont pas relevees, sur combien au total.
 *
 * Le compte se lit dans les donnees, et n'est jamais ecrit en dur. Une limite
 * relue quitte `estimated_offset` pour `relue` : un ecran qui annoncerait
 * « 151 » continuerait de le dire apres la relecture, et mentirait sur le
 * travail restant — dans le sens qui rassure, c'est-a-dire le plus difficile a
 * remarquer. Le meme piege existait dans le rapport des divisions, ou la
 * colonne annoncait la fin du toumoun au lieu de sa limite.
 */
export function getCompteLimitesEstimees(): { estimees: number; total: number } {
  return {
    estimees: thumn.filter((t) => t.verificationStatus === 'estimated_offset').length,
    total: thumn.length,
  };
}

// === Helpers de conversion ===

export function ayahRefToAyahId(ref: AyahRef): number {
  const surah = getSurah(ref.surah);
  if (!surah) throw new Error(`Sourate ${ref.surah} introuvable`);
  return surah.startAyahId + ref.ayah - 1;
}

export function ayahIdToAyahRef(ayahId: number): AyahRef {
  const surahs = getAllSurahs();
  for (let i = 0; i < surahs.length; i++) {
    const s = surahs[i];
    if (ayahId >= s.startAyahId && ayahId < s.startAyahId + s.ayahCount) {
      return { surah: s.number, ayah: ayahId - s.startAyahId + 1 };
    }
  }
  throw new Error(`Ayah ID ${ayahId} hors limites`);
}

export function getTotalAyahs(): number {
  return 6236;
}

export function getTotalVersesInRange(start: AyahRef, end: AyahRef): number {
  const startId = ayahRefToAyahId(start);
  const endId = ayahRefToAyahId(end);
  return endId - startId + 1;
}

// Vérifier si un passage est mémorisé
export function isPassageMemorized(
  surah: number,
  startAyah: number,
  endAyah: number,
  memorized: { surah: number; startAyah: number; endAyah: number }[]
): boolean {
  return memorized.some(
    (m) =>
      m.surah === surah &&
      m.startAyah <= startAyah &&
      m.endAyah >= endAyah
  );
}

// Récupérer le texte d'un verset
//
// Le rang est vérifié **avant** la lecture, et il doit l'être. Le cache est un
// tableau plat indexé par l'identifiant global du verset : sans contrôle, un
// rang hors de la sourate ne échoue pas, il lit plus loin. La sourate 29 compte
// 69 versets ; demander le 999e rendait 2:46, demander le 70e rendait 30:1 avec
// sa basmala, et demander le 0e rendait 28:88. Un verset faux ne se signale pas :
// il s'affiche. Le contrôle est donc ici, et pas chez les appelants — ils sont
// plusieurs, et l'oubli de l'un ne se verrait qu'à l'écran.
export function getAyahText(surah: number, ayah: number): string | null {
  const surahData = getSurah(surah);
  if (!surahData) return null;
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > surahData.ayahCount) return null;
  const ayahId = surahData.startAyahId + ayah - 1;
  return quranTextCache[ayahId - 1]?.text ?? null;
}

// Récupérer le texte d'une plage de versets
export function getAyahRangeText(
  surah: number,
  startAyah: number,
  endAyah: number
): { ayah: number; text: string }[] {
  if (!quranTextCache.length) return [];
  const result: { ayah: number; text: string }[] = [];
  for (let a = startAyah; a <= endAyah; a++) {
    const text = getAyahText(surah, a);
    if (text) result.push({ ayah: a, text });
  }
  return result;
}

// === Pages du moushaf ===
//
// Le découpage en 604 pages est celui du moushaf de Médine, porté par le champ
// `page` de chaque verset. Il est vérifié par `data/quran/verifier_pages.py` :
// 604 pages numérotées de 1 à 604, sans trou ni recul, page 1 = 1:1-7,
// page 604 = 112:1-114:6, et accord avec les juz' et rub' de `divisions.json`.
// Il coïncide également avec celui de l'API quran.com sur les 6 236 versets.
//
// Les **coupures de ligne** ne sont pas ici : elles vivent dans
// `moushaf_layout.json`, et se lisent par `getLignesDuMoushaf`.

export const TOTAL_PAGES_MOUSHAF = 604;

const indexPages = (() => {
  const versets = quranTextData as unknown as { page?: number; juz?: number }[];
  const pageParAyahId: number[] = new Array(versets.length).fill(0);
  const versetsParPage: number[] = new Array(TOTAL_PAGES_MOUSHAF).fill(0);
  const bornes: ({ startAyahId: number; endAyahId: number } | null)[] =
    new Array(TOTAL_PAGES_MOUSHAF).fill(null);

  for (let i = 0; i < versets.length; i++) {
    const page = versets[i].page ?? 0;
    pageParAyahId[i] = page;
    if (page >= 1 && page <= TOTAL_PAGES_MOUSHAF) {
      versetsParPage[page - 1] += 1;
      if (bornes[page - 1] === null) {
        bornes[page - 1] = { startAyahId: i + 1, endAyahId: i + 1 };
      } else {
        bornes[page - 1]!.endAyahId = i + 1;
      }
    }
  }

  return { pageParAyahId, versetsParPage, bornes };
})();

export function getPageCount(): number {
  return TOTAL_PAGES_MOUSHAF;
}

/** Le numéro de page du verset d'identifiant global donné (1..6236). */
export function getPageOfAyahId(ayahId: number): number | null {
  const page = indexPages.pageParAyahId[ayahId - 1];
  return page && page >= 1 ? page : null;
}

/** Le numéro de page d'un verset nommé par sa sourate et son rang. */
export function getPageOfAyah(surah: number, ayah: number): number | null {
  try {
    return getPageOfAyahId(ayahRefToAyahId({ surah, ayah }));
  } catch {
    return null;
  }
}

/** Le nombre de versets que porte une page. */
export function getVersesOnPage(page: number): number {
  if (page < 1 || page > TOTAL_PAGES_MOUSHAF) return 0;
  return indexPages.versetsParPage[page - 1];
}

/** Premier et dernier verset d'une page, dans l'ordre du moushaf. */
export function getPageBounds(page: number): { start: AyahRef; end: AyahRef } | null {
  if (page < 1 || page > TOTAL_PAGES_MOUSHAF) return null;
  const borne = indexPages.bornes[page - 1];
  if (borne === null) return null;
  return {
    start: ayahIdToAyahRef(borne.startAyahId),
    end: ayahIdToAyahRef(borne.endAyahId),
  };
}

/** Le numéro de juz' d'un verset, tel que le porte la donnée. */
export function getJuzOfAyah(surah: number, ayah: number): number | null {
  const verset = (quranTextData as unknown as { surah: number; ayah: number; juz?: number }[]).find(
    (v) => v.surah === surah && v.ayah === ayah
  );
  return verset?.juz ?? null;
}

/**
 * Les pages touchées par une plage de versets, dans l'ordre.
 *
 * Une plage peut traverser une ou plusieurs pages : un nisf al-hizb en couvre
 * couramment deux, un hizb une dizaine. Les pages sont rendues sans doublon.
 */
export function getPagesOfRange(surah: number, startAyah: number, endAyah: number): number[] {
  const pages: number[] = [];
  const premier = getPageOfAyah(surah, startAyah);
  const dernier = getPageOfAyah(surah, endAyah);
  if (premier === null || dernier === null) return pages;
  for (let p = premier; p <= dernier; p++) pages.push(p);
  return pages;
}

/**
 * Le texte des versets d'une page, dans l'ordre.
 *
 * Une page commence et finit au milieu d'une sourate, sauf la première page
 * d'une sourate : le rendu doit donc porter la sourate de chaque verset, et non
 * une sourate unique pour toute la page.
 */
export function getPageVerses(page: number): { surah: number; ayah: number; text: string }[] {
  const bornes = getPageBounds(page);
  if (bornes === null) return [];

  const versets: { surah: number; ayah: number; text: string }[] = [];
  let curseur: AyahRef = { ...bornes.start };

  while (true) {
    const texte = getAyahText(curseur.surah, curseur.ayah);
    if (texte === null) break;
    versets.push({ surah: curseur.surah, ayah: curseur.ayah, text: texte });

    if (curseur.surah === bornes.end.surah && curseur.ayah === bornes.end.ayah) break;

    const nombreDeVersets = getSurahAyahCount(curseur.surah);
    curseur =
      curseur.ayah >= nombreDeVersets
        ? { surah: curseur.surah + 1, ayah: 1 }
        : { surah: curseur.surah, ayah: curseur.ayah + 1 };
  }

  return versets;
}

// === La mise en page du moushaf ===
//
// Les bornes de page disent **quels** versets une page porte. La mise en page
// dit **où** chaque mot tombe, ligne par ligne. Elle vient de
// `data/quran/moushaf_layout.json`, engendré par
// `data/quran/generer_layout_moushaf.py` : quinze lignes par page, chaque
// élément désignant un intervalle de jetons du texte de Tanzil.
//
// Ce fichier ne contient aucune lettre coranique, et c'est délibéré. Le texte
// affiché reste celui de Tanzil, une seule fois dans l'application : deux
// copies d'un même verset finiraient par diverger, et rien ne le signalerait.
//
// Les numéros de ligne viennent de l'API quran.com (`mushaf=1`). Ils ont été
// recoupés sur cinq pages du moushaf imprimé — 1, 2, 77, 128 et 401 : les mots
// y tombent sur les mêmes lignes, un par un. La pagination, elle, n'est pas
// celle de quran.com, dont le `page_number` change selon les champs demandés.

/** Un élément posé sur une ligne de la page. */
export type ElementMoushaf =
  | { type: 'verset'; surah: number; ayah: number; premier: number; dernier: number }
  | { type: 'medaillon'; surah: number; ayah: number }
  | { type: 'basmala'; surah: number }
  | { type: 'entete'; surah: number };

const miseEnPage = moushafLayoutData as unknown as {
  metadata?: { lignesParPage?: number };
  entetesEnMarge?: Record<string, number>;
  pages?: Record<string, unknown>;
};

const LIGNES_PAR_PAGE_MOUSHAF = miseEnPage.metadata?.lignesParPage ?? 15;

/** Le nombre de lignes d'une page du moushaf. */
export function getLignesParPageMoushaf(): number {
  return LIGNES_PAR_PAGE_MOUSHAF;
}

/**
 * La sourate dont le nom s'imprime dans la bande de marge de la page, ou null.
 *
 * Quand une sourate ouvre une page, le moushaf imprime son nom au-dessus des
 * quinze lignes et la basmala occupe la ligne 1 : la page ne porte alors qu'un
 * seul élément d'ouverture. C'est le cas de 21 pages sur 604.
 */
export function getEnteteEnMarge(page: number): number | null {
  return miseEnPage.entetesEnMarge?.[String(page)] ?? null;
}

/**
 * Les quinze lignes d'une page, ou `null` si la page n'est pas décrite.
 *
 * `null` plutôt qu'une page partiellement lue : un élément illisible ferait
 * disparaître des mots de la page, et une page à laquelle il manque des mots
 * est pire qu'une page qu'on refuse d'afficher.
 */
export function getLignesDuMoushaf(page: number): ElementMoushaf[][] | null {
  const brute = miseEnPage.pages?.[String(page)];
  if (!Array.isArray(brute)) return null;

  const lignes: ElementMoushaf[][] = [];
  for (const ligneBrute of brute) {
    if (!Array.isArray(ligneBrute)) return null;
    const ligne: ElementMoushaf[] = [];
    for (const elementBrut of ligneBrute) {
      const element = lireElementMoushaf(elementBrut);
      if (element === null) return null;
      ligne.push(element);
    }
    lignes.push(ligne);
  }
  return lignes;
}

function lireElementMoushaf(brut: unknown): ElementMoushaf | null {
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const code = brut[0];
  const surah = brut[1];
  if (typeof surah !== 'number') return null;

  switch (code) {
    case 'v': {
      const [, , ayah, premier, dernier] = brut;
      if (typeof ayah !== 'number' || typeof premier !== 'number' || typeof dernier !== 'number') {
        return null;
      }
      return { type: 'verset', surah, ayah, premier, dernier };
    }
    case 'm': {
      const ayah = brut[2];
      if (typeof ayah !== 'number') return null;
      return { type: 'medaillon', surah, ayah };
    }
    case 'b':
      return { type: 'basmala', surah };
    case 'e':
      return { type: 'entete', surah };
    default:
      return null;
  }
}

/**
 * Les jetons d'un verset, découpés comme la mise en page les compte.
 *
 * La découpe doit être identique à celle du script qui a engendré les
 * intervalles — `str.split()` de Python, qui coupe sur toute suite d'espaces et
 * ignore celles de tête et de queue. Un `split(' ')` laisserait un jeton vide
 * sur deux espaces consécutifs, et tous les indices suivants glisseraient.
 */
export function getJetonsAyah(surah: number, ayah: number): string[] | null {
  const texte = getAyahText(surah, ayah);
  if (texte === null) return null;
  return texte.split(/\s+/).filter((jeton) => jeton.length > 0);
}

/**
 * Le texte d'un verset réduit à une plage de jetons.
 *
 * Rend `null` si la plage sort du verset : mieux vaut ne rien afficher que
 * d'afficher un mot qui n'est pas à sa place.
 */
export function getTexteJetons(
  surah: number,
  ayah: number,
  premier: number,
  dernier: number
): string | null {
  const jetons = getJetonsAyah(surah, ayah);
  if (jetons === null) return null;
  if (premier < 0 || dernier < premier || dernier >= jetons.length) return null;
  return jetons.slice(premier, dernier + 1).join(' ');
}

// === Les codes de police, et la géométrie de la page ===
//
// Une police de page ne compose pas des lettres : elle dessine des **mots**.
// Chaque mot du moushaf y est un seul point de code, et le tracé est celui du
// calligraphe. Rendre la page, c'est donc écrire ces points de code avec la
// police de la page — pas composer du texte.
//
// Ce qui rend la page fidèle tient en deux nombres, mesurés sur les polices et
// recoupés sur les pages imprimées, et rangés dans `largeurs_pages.json` :
//
//   - **une seule taille pour toute la page**, celle qui fait tenir la largeur
//     de référence. Les avances de la police sont celles de l'imprimeur à
//     1 % près, si bien que les quinze lignes tombent d'elles-mêmes au bord,
//     sans justification à faire ;
//   - **la hauteur du bloc des quinze lignes**, rapportée à sa largeur : elle
//     fixe le pas des lignes.
//
// La page ne se met donc ni à l'échelle ni en forme : elle se dessine.

/** La page dont la police est la seule à dessiner la basmala. */
export const PAGE_DE_LA_BASMALA = 1;

/** Un élément d'une ligne, avec les mots que sa police dessine. */
export type ElementCodes =
  | { type: 'entete'; surah: number }
  | { type: 'basmala'; surah: number; mots: string[] }
  | { type: 'verset'; surah: number; ayah: number; mots: string[] }
  | { type: 'medaillon'; surah: number; ayah: number; mot: string };

const codesDuMoushaf = miseEnPage as unknown as { glyphes?: Record<string, unknown> };

/** Les largeurs mesurées, et les constantes de la géométrie de la page. */
const geometrie = largeursPagesData as unknown as {
  unitesParEm?: number;
  partDeLaBasmala?: number;
  hauteurDuBloc?: number;
  hauteurDeLaBasmala?: number;
  unitesDeLaBasmala?: number;
  pages?: Record<string, { lignes?: (number | null)[]; reference?: number; justifiee?: boolean }>;
};

export interface GeometrieMoushaf {
  /** Unités de police par cadratin : 2048 pour les 604 polices. */
  unitesParEm: number;
  /** Part d'une ligne pleine qu'occupe la basmala : 0,572. */
  partDeLaBasmala: number;
  /** Hauteur du bloc des quinze lignes, rapportée à sa largeur : 1,664. */
  hauteurDuBloc: number;
  /** Hauteur de l'encre de la basmala, rapportée à une ligne pleine. */
  hauteurDeLaBasmala: number;
  /** Largeur de la basmala dans la police de la page 1, en unités. */
  unitesDeLaBasmala: number;
}

/**
 * La géométrie de la page du moushaf, telle qu'elle a été mesurée.
 *
 * Rend `null` si le fichier de mesure n'est pas celui attendu : mieux vaut
 * refuser la page que la dessiner à des proportions inventées.
 */
export function getGeometrieMoushaf(): GeometrieMoushaf | null {
  const {
    unitesParEm,
    partDeLaBasmala,
    hauteurDuBloc,
    hauteurDeLaBasmala,
    unitesDeLaBasmala,
  } = geometrie;
  if (
    typeof unitesParEm !== 'number' ||
    typeof partDeLaBasmala !== 'number' ||
    typeof hauteurDuBloc !== 'number' ||
    typeof hauteurDeLaBasmala !== 'number' ||
    typeof unitesDeLaBasmala !== 'number'
  ) {
    return null;
  }
  return {
    unitesParEm,
    partDeLaBasmala,
    hauteurDuBloc,
    hauteurDeLaBasmala,
    unitesDeLaBasmala,
  };
}

/**
 * La largeur naturelle des quinze lignes d'une page, et sa largeur de référence.
 *
 * `lignes[i]` vaut `null` pour une ligne d'en-tête de sourate : le bandeau qui
 * porte le nom de la sourate n'est pas dessiné par la police de page, il est
 * composé en police de texte.
 */
export function getLargeursPage(
  page: number
): { lignes: (number | null)[]; reference: number; justifiee: boolean } | null {
  const brute = geometrie.pages?.[String(page)];
  if (brute === undefined) return null;
  if (!Array.isArray(brute.lignes) || typeof brute.reference !== 'number') return null;
  return {
    lignes: brute.lignes,
    reference: brute.reference,
    justifiee: brute.justifiee === true,
  };
}

/**
 * Les quinze lignes d'une page, avec les mots que la police dessine.
 *
 * Même exigence que `getLignesDuMoushaf` : un élément illisible fait rendre
 * `null` pour toute la page. Un mot qui manque ne se voit pas sur un écran ; il
 * se voit sur le moushaf, à côté.
 */
export function getCodesDuMoushaf(page: number): ElementCodes[][] | null {
  const brute = codesDuMoushaf.glyphes?.[String(page)];
  if (!Array.isArray(brute)) return null;

  const lignes: ElementCodes[][] = [];
  for (const ligneBrute of brute) {
    if (!Array.isArray(ligneBrute)) return null;
    const ligne: ElementCodes[] = [];
    for (const elementBrut of ligneBrute) {
      const element = lireElementCodes(elementBrut);
      if (element === null) return null;
      ligne.push(element);
    }
    lignes.push(ligne);
  }
  return lignes;
}

function lireElementCodes(brut: unknown): ElementCodes | null {
  if (!Array.isArray(brut) || brut.length < 2) return null;
  const genre = brut[0];
  const surah = brut[1];
  if (typeof surah !== 'number') return null;

  switch (genre) {
    case 'e':
      return { type: 'entete', surah };
    case 'b': {
      const mots = motsDeCodes(brut[3]);
      return mots === null ? null : { type: 'basmala', surah, mots };
    }
    case 'v': {
      const ayah = brut[2];
      const mots = motsDeCodes(brut[3]);
      if (typeof ayah !== 'number' || mots === null) return null;
      return { type: 'verset', surah, ayah, mots };
    }
    case 'm': {
      const ayah = brut[2];
      const mot = brut[3];
      if (typeof ayah !== 'number' || typeof mot !== 'string') return null;
      return { type: 'medaillon', surah, ayah, mot };
    }
    default:
      return null;
  }
}

function motsDeCodes(brut: unknown): string[] | null {
  if (!Array.isArray(brut)) return null;
  for (const mot of brut) {
    if (typeof mot !== 'string' || mot.length === 0) return null;
  }
  return brut as string[];
}

/**
 * Les mots d'une ligne, dans l'ordre de lecture — de droite à gauche.
 *
 * **À coller sans aucun séparateur.** Le calligraphe a dessiné chaque mot de
 * sorte que son avance comprenne son blanc de fin : les blancs de 5 à 7 px
 * entre les mots apparaissent d'eux-mêmes. Mesuré sur la page 177, au corps
 * que donne sa référence (45,08 px) : les neuf mots de la ligne 2, collés,
 * donnent 638 px d'encre — l'imprimé en donne 638 à 642 ; les mêmes mots
 * joints par une espace donnent 654 px, soit 2 % de trop.
 *
 * Ni espace, donc, ni `letterSpacing`, ni marge : la largeur d'une ligne est
 * la somme des seules avances, et c'est elle qui a été mesurée.
 */
export function getMotsDeLigne(ligne: ElementCodes[]): string[] {
  const mots: string[] = [];
  for (const element of ligne) {
    if (element.type === 'basmala' || element.type === 'verset') mots.push(...element.mots);
    else if (element.type === 'medaillon') mots.push(element.mot);
  }
  return mots;
}
