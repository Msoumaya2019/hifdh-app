// Algorithme de génération du programme d'apprentissage
//
// À partir des connaissances de l'utilisateur, de son objectif et de son rythme,
// génère automatiquement un programme d'apprentissage jour par jour.

import type {
  Objective,
  LearningUnit,
  MemorizedPassage,
  LearningSession,
  UserConfig,
} from '@/types';
import {
  getJuz,
  getHizb,
  getRub,
  getThumn,
  getAllSurahs,
  getAllRub,
  getAllThumn,
  getTotalAyahs,
} from '@/data/quranData';
import { versDateLocale } from './dates';

// === Types internes ===

interface VerseRange {
  surah: number;
  startAyah: number;
  endAyah: number;
}

// === Étape 1: Calculer l'objectif comme une liste de plages ===

/**
 * Découpe un intervalle de versets, exprimé en identifiants globaux (1..6236),
 * en une plage par sourate traversée.
 *
 * C'est indispensable pour les divisions : le Juz 1 va de 1:1 à 2:141. Le
 * réduire à une seule plage `{ surah: 1, endAyah: 141 }` ferait générer des
 * séances portant sur 1:8 à 1:141, alors que la sourate 1 ne compte que
 * 7 versets. Chaque division qui traverse une frontière de sourate — donc
 * presque toutes — était concernée.
 */
function rangesDepuisIds(startAyahId: number, endAyahId: number): VerseRange[] {
  const ranges: VerseRange[] = [];

  for (const surah of getAllSurahs()) {
    const premierDeLaSourate = surah.startAyahId;
    const dernierDeLaSourate = surah.startAyahId + surah.ayahCount - 1;

    if (dernierDeLaSourate < startAyahId || premierDeLaSourate > endAyahId) continue;

    ranges.push({
      surah: surah.number,
      startAyah: Math.max(startAyahId, premierDeLaSourate) - premierDeLaSourate + 1,
      endAyah: Math.min(endAyahId, dernierDeLaSourate) - premierDeLaSourate + 1,
    });
  }

  return ranges;
}

export function computeObjectiveRanges(objective: Objective): VerseRange[] {
  switch (objective.type) {
    case 'full_quran': {
      // Tout le Coran : une plage par sourate
      return rangesDepuisIds(1, getTotalAyahs());
    }

    case 'juz_amma': {
      // Juz 'Amma = Juz 30 (sourates 78 à 114)
      const juz = getJuz(30);
      if (!juz) return [];
      return rangesDepuisIds(juz.start.ayahId, juz.end.ayahId);
    }

    case 'hizb_sabbih': {
      // Hizb Sabbih = le hizb qui commence par « سَبِّحِ ٱسْمَ رَبِّكَ ٱلْأَعْلَى »
      // (sourate 87), soit le hizb 60.
      const hizb = getHizb(60);
      if (!hizb) return [];
      return rangesDepuisIds(hizb.start.ayahId, hizb.end.ayahId);
    }

    case 'specific_juz': {
      const juz = getJuz(objective.juzNumber ?? 1);
      if (!juz) return [];
      return rangesDepuisIds(juz.start.ayahId, juz.end.ayahId);
    }

    case 'specific_hizb': {
      const ranges: VerseRange[] = [];
      for (const hNum of objective.hizbNumbers ?? []) {
        const h = getHizb(hNum);
        if (h) ranges.push(...rangesDepuisIds(h.start.ayahId, h.end.ayahId));
      }
      return ranges;
    }

    case 'custom': {
      return (objective.passages ?? []).map((p) => ({
        surah: p.surah,
        startAyah: p.startAyah,
        endAyah: p.endAyah,
      }));
    }

    default:
      return [];
  }
}

// === Étape 2: Soustraire les passages mémorisés ===

export function subtractMemorized(
  objectiveRanges: VerseRange[],
  memorized: MemorizedPassage[]
): VerseRange[] {
  let remaining = [...objectiveRanges];

  for (const mem of memorized) {
    if (mem.level === 'unknown') continue; // Ne pas compter les passages inconnus

    const newRemaining: VerseRange[] = [];
    for (const range of remaining) {
      // Si le passage mémorisé est dans une autre sourate, pas d'impact
      if (range.surah !== mem.surah) {
        newRemaining.push(range);
        continue;
      }

      // Sinon, soustraire le passage mémorisé de la plage
      if (mem.endAyah < range.startAyah || mem.startAyah > range.endAyah) {
        // Pas de chevauchement
        newRemaining.push(range);
        continue;
      }

      // Chevauchement: diviser la plage
      // Partie avant le passage mémorisé
      if (mem.startAyah > range.startAyah) {
        newRemaining.push({
          surah: range.surah,
          startAyah: range.startAyah,
          endAyah: mem.startAyah - 1,
        });
      }
      // Partie après le passage mémorisé
      if (mem.endAyah < range.endAyah) {
        newRemaining.push({
          surah: range.surah,
          startAyah: mem.endAyah + 1,
          endAyah: range.endAyah,
        });
      }
    }
    remaining = newRemaining;
  }

  return remaining;
}

// === Étape 3: Découper en séances selon l'unité ===

export function splitIntoSessions(
  ranges: VerseRange[],
  unit: LearningUnit
): VerseRange[] {
  const sessions: VerseRange[] = [];

  for (const range of ranges) {
    switch (unit.type) {
      case 'verses': {
        // N versets par séance
        let current = range.startAyah;
        while (current <= range.endAyah) {
          const end = Math.min(current + unit.count - 1, range.endAyah);
          sessions.push({ surah: range.surah, startAyah: current, endAyah: end });
          current = end + 1;
        }
        break;
      }

      case 'half_page': {
        // ~7-8 versets par demi-page
        const halfPageVerses = 8;
        let current = range.startAyah;
        while (current <= range.endAyah) {
          const end = Math.min(current + halfPageVerses - 1, range.endAyah);
          sessions.push({ surah: range.surah, startAyah: current, endAyah: end });
          current = end + 1;
        }
        break;
      }

      case 'page': {
        // ~15 versets par page
        const pageVerses = 15;
        let current = range.startAyah;
        while (current <= range.endAyah) {
          const end = Math.min(current + pageVerses - 1, range.endAyah);
          sessions.push({ surah: range.surah, startAyah: current, endAyah: end });
          current = end + 1;
        }
        break;
      }

      case 'thumn':
      case 'rub':
      case 'nisf':
      case 'hizb': {
        // Utiliser les divisions existantes
        const divisionRanges = getDivisionRangesForRange(range, unit);
        sessions.push(...divisionRanges);
        break;
      }
    }
  }

  return sessions;
}

function getDivisionRangesForRange(
  range: VerseRange,
  unit: LearningUnit
): VerseRange[] {
  const result: VerseRange[] = [];

  if (unit.type === 'thumn') {
    // Trouver les thumn qui chevauchent cette plage
    const allThumn = getAllThumn();
    for (const thumn of allThumn) {
      const ts = thumn.hafs.startSurah;
      const ta = thumn.hafs.startAyah;
      const es = thumn.hafs.endSurah;
      const ea = thumn.hafs.endAyah;

      // Vérifier le chevauchement avec la plage
      // La plage est dans une seule sourate (range.surah)
      if (ts > range.surah || es < range.surah) continue;
      if (ts === range.surah && ta > range.endAyah) continue;
      if (es === range.surah && ea < range.startAyah) continue;

      // Limiter aux bornes de la plage
      const startAyah = ts === range.surah ? Math.max(ta, range.startAyah) : range.startAyah;
      const endAyah = es === range.surah ? Math.min(ea, range.endAyah) : range.endAyah;
      result.push({ surah: range.surah, startAyah, endAyah });
    }
  }

  if (unit.type === 'rub') {
    const allRub = getAllRub();
    for (const rub of allRub) {
      if (rub.start.surah > range.surah || rub.end.surah < range.surah) continue;
      if (rub.start.surah === range.surah && rub.start.ayah > range.endAyah) continue;
      if (rub.end.surah === range.surah && rub.end.ayah < range.startAyah) continue;

      const startAyah = rub.start.surah === range.surah
        ? Math.max(rub.start.ayah, range.startAyah)
        : range.startAyah;
      const endAyah = rub.end.surah === range.surah
        ? Math.min(rub.end.ayah, range.endAyah)
        : range.endAyah;
      result.push({ surah: range.surah, startAyah, endAyah });
    }
  }

  if (unit.type === 'nisf') {
    // Nisf = demi-hizb = 2 rub'
    const allRub = getAllRub();
    for (let i = 0; i < allRub.length; i += 2) {
      const r1 = allRub[i];
      const r2 = allRub[Math.min(i + 1, allRub.length - 1)];
      const startSurah = r1.start.surah;
      const startAyah = r1.start.ayah;
      const endSurah = r2.end.surah;
      const endAyah = r2.end.ayah;

      if (startSurah > range.surah || endSurah < range.surah) continue;
      if (startSurah === range.surah && startAyah > range.endAyah) continue;
      if (endSurah === range.surah && endAyah < range.startAyah) continue;

      const sAyah = startSurah === range.surah ? Math.max(startAyah, range.startAyah) : range.startAyah;
      const eAyah = endSurah === range.surah ? Math.min(endAyah, range.endAyah) : range.endAyah;
      result.push({ surah: range.surah, startAyah: sAyah, endAyah: eAyah });
    }
  }

  if (unit.type === 'hizb') {
    // Hizb = 4 rub'
    const allRub = getAllRub();
    for (let i = 0; i < allRub.length; i += 4) {
      const r1 = allRub[i];
      const r2 = allRub[Math.min(i + 3, allRub.length - 1)];
      const startSurah = r1.start.surah;
      const startAyah = r1.start.ayah;
      const endSurah = r2.end.surah;
      const endAyah = r2.end.ayah;

      if (startSurah > range.surah || endSurah < range.surah) continue;
      if (startSurah === range.surah && startAyah > range.endAyah) continue;
      if (endSurah === range.surah && endAyah < range.startAyah) continue;

      const sAyah = startSurah === range.surah ? Math.max(startAyah, range.startAyah) : range.startAyah;
      const eAyah = endSurah === range.surah ? Math.min(endAyah, range.endAyah) : range.endAyah;
      result.push({ surah: range.surah, startAyah: sAyah, endAyah: eAyah });
    }
  }

  // Si aucun résultat, garder la plage entière
  if (result.length === 0) {
    result.push(range);
  }

  return result;
}

// === Étape 4: Assigner les séances aux dates ===

/**
 * Génère le programme d'apprentissage.
 *
 * `maintenant` est injectable : sans cela, la fonction lit l'horloge en interne
 * et aucune vérification ne peut être déterministe. Un banc qui s'appuie sur
 * l'heure courante ne détecte un défaut de date que pendant une partie de la
 * journée — mesuré : une mutation de la date n'était attrapée qu'après 10 h UTC.
 */
export function generateProgram(
  config: UserConfig,
  existingSessions: LearningSession[] = [],
  maintenant: Date = new Date()
): LearningSession[] {
  // 1. Calculer les plages de l'objectif
  const objectiveRanges = computeObjectiveRanges(config.objective);

  // 2. Soustraire les passages mémorisés
  const remaining = subtractMemorized(objectiveRanges, config.memorizedPassages);

  // 3. Découper en séances
  const sessionRanges = splitIntoSessions(remaining, config.schedule.unit);

  // 4. Assigner aux dates
  // Copie avant tri : `sort()` modifie le tableau en place, et l'appelant
  // retrouverait sa configuration réordonnée.
  const learningDays = [...config.schedule.days].sort((a, b) => a - b);
  const sessions: LearningSession[] = [];
  const now = maintenant;
  let sessionIndex = 0;

  // Générer les dates à partir d'aujourd'hui
  let date = new Date(now);
  // Avancer au prochain jour d'apprentissage
  while (!learningDays.includes(date.getDay())) {
    date.setDate(date.getDate() + 1);
  }

  for (const range of sessionRanges) {
    // Trouver le prochain jour d'apprentissage
    while (!learningDays.includes(date.getDay())) {
      date.setDate(date.getDate() + 1);
    }

    const session: LearningSession = {
      id: `session_${date.getTime()}_${sessionIndex}`,
      date: versDateLocale(date),
      surah: range.surah,
      startAyah: range.startAyah,
      endAyah: range.endAyah,
      unit: config.schedule.unit,
      status: 'todo',
      createdAt: now.toISOString(),
    };

    // Vérifier si une séance existe déjà à cette date
    const existing = existingSessions.find(
      (s) => s.date === session.date && s.surah === session.surah
    );
    if (!existing) {
      sessions.push(session);
    }

    sessionIndex++;
    // Avancer au jour suivant
    date.setDate(date.getDate() + 1);
  }

  return sessions;
}

// === Helpers ===

export function estimateCompletionDate(
  config: UserConfig,
  memorizedCount: number,
  objectiveTotal: number,
  depuis: Date = new Date()
): string | undefined {
  const remaining = objectiveTotal - memorizedCount;
  if (remaining <= 0) return undefined;

  // Versets par séance
  let versesPerSession = 5; // défaut
  switch (config.schedule.unit.type) {
    case 'verses': versesPerSession = config.schedule.unit.count; break;
    case 'half_page': versesPerSession = 8; break;
    case 'page': versesPerSession = 15; break;
    case 'thumn': versesPerSession = 13; break; // moyenne
    case 'rub': versesPerSession = 26; break;
    case 'nisf': versesPerSession = 52; break;
    case 'hizb': versesPerSession = 104; break;
  }

  const sessionsNeeded = Math.ceil(remaining / versesPerSession);
  const daysPerWeek = config.schedule.days.length;
  if (daysPerWeek === 0) return undefined;

  const weeksNeeded = Math.ceil(sessionsNeeded / daysPerWeek);
  const daysNeeded = Math.ceil(weeksNeeded * 7);

  const completion = new Date(depuis);
  completion.setDate(completion.getDate() + daysNeeded);
  return versDateLocale(completion);
}
