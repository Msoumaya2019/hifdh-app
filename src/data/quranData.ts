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
