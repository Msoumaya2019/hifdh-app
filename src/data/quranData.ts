// Couche d'accès aux données coraniques
// Charge le texte et les métadonnées depuis les fichiers JSON

import surahsData from '@data/quran/surahs.json';
import divisionsData from '@data/quran/divisions.json';
import thumnData from '@data/quran/thumn_hafs.json';
import quranTextData from '@data/quran/quran_text_uthmani.json';
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
export function getAyahText(surah: number, ayah: number): string | null {
  const surahData = getSurah(surah);
  if (!surahData) return null;
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
// Ce qui est exact ici : les **bornes** de page, c'est-à-dire la liste des
// versets que porte chaque page. Ce qui ne l'est pas : les coupures de ligne à
// l'intérieur d'une page, qui dépendent de la fonte et de la largeur de
// l'écran, et non de la page imprimée. L'interface le dit à l'utilisateur.

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
