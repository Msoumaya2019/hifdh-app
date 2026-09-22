// Calculs de progression et statistiques

import type { UserConfig, LearningSession, MemorizedPassage, ProgressStats, Objective } from '@/types';
import { getAllSurahs, getAllHizb, getSurah, getTotalAyahs, ayahRefToAyahId } from '@/data/quranData';
import { computeObjectiveRanges, estimateCompletionDate } from './programGenerator';
import { aujourdHui, ilYAjours, analyserDateLocale } from './dates';

// Calculer le nombre total de versets dans le Coran
export function getTotalQuranVerses(): number {
  return getTotalAyahs(); // 6236
}

/**
 * Identifiants globaux (1..6236) des versets marqués comme mémorisés.
 *
 * On passe par un ensemble plutôt que d'additionner la longueur de chaque
 * passage : deux passages qui se chevauchent — 2:1-10 puis 2:5-15 — comptaient
 * 21 versets au lieu de 15, et gonflaient le pourcentage affiché sur l'accueil.
 * Un passage « unknown » n'est jamais compté.
 */
function identifiantsMemorises(memorized: MemorizedPassage[]): Set<number> {
  const ids = new Set<number>();

  for (const passage of memorized) {
    if (passage.level === 'unknown') continue;
    const surah = getSurah(passage.surah);
    if (!surah) continue;
    for (let a = passage.startAyah; a <= passage.endAyah; a++) {
      ids.add(surah.startAyahId + a - 1);
    }
  }

  return ids;
}

// Calculer le nombre de versets mémorisés (versets distincts)
export function getMemorizedVerseCount(memorized: MemorizedPassage[]): number {
  return identifiantsMemorises(memorized).size;
}

// Calculer le nombre de versets dans l'objectif
export function getObjectiveVerseCount(objective: Objective): number {
  let count = 0;
  for (const range of computeObjectiveRanges(objective)) {
    count += range.endAyah - range.startAyah + 1;
  }
  return count;
}

// Calculer le nombre de versets mémorisés dans l'objectif (versets distincts)
export function getMemorizedInObjective(
  objective: Objective,
  memorized: MemorizedPassage[]
): number {
  const ids = identifiantsMemorises(memorized);
  let count = 0;

  for (const range of computeObjectiveRanges(objective)) {
    const surah = getSurah(range.surah);
    if (!surah) continue;
    for (let a = range.startAyah; a <= range.endAyah; a++) {
      if (ids.has(surah.startAyahId + a - 1)) count++;
    }
  }

  return count;
}

// Calculer toutes les statistiques de progression
export function computeProgressStats(
  config: UserConfig,
  sessions: LearningSession[],
  memorized: MemorizedPassage[],
  reviewCount: number
): ProgressStats {
  const totalQuran = getTotalQuranVerses();
  const memorizedCount = getMemorizedVerseCount(memorized);
  const quranPercentage = (memorizedCount / totalQuran) * 100;

  const objectiveTotal = getObjectiveVerseCount(config.objective);
  const memorizedInObj = getMemorizedInObjective(config.objective, memorized);
  const objectivePercentage = objectiveTotal > 0 ? (memorizedInObj / objectiveTotal) * 100 : 0;

  // Versets aujourd'hui
  const today = aujourdHui();
  const todayVerses = sessions
    .filter((s) => s.date === today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Versets cette semaine (7 derniers jours)
  const weekStr = ilYAjours(7);
  const weekVerses = sessions
    .filter((s) => s.date >= weekStr && s.date <= today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Versets ce mois (30 derniers jours)
  const monthStr = ilYAjours(30);
  const monthVerses = sessions
    .filter((s) => s.date >= monthStr && s.date <= today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Hizb terminés : un hizb est compté lorsque tous ses versets sont mémorisés.
  const idsMemorises = identifiantsMemorises(memorized);
  let hizbCompleted = 0;
  for (const hizb of getAllHizb()) {
    let complet = true;
    for (let id = hizb.start.ayahId; id <= hizb.end.ayahId; id++) {
      if (!idsMemorises.has(id)) {
        complet = false;
        break;
      }
    }
    if (complet) hizbCompleted++;
  }

  // Jours d'apprentissage (jours uniques avec au moins une séance terminée)
  const learningDays = new Set(
    sessions.filter((s) => s.status === 'completed').map((s) => s.date)
  );

  const estimatedDate = estimateCompletionDate(
    config,
    memorizedInObj,
    objectiveTotal
  );

  return {
    quranPercentage: Math.round(quranPercentage * 10) / 10,
    objectivePercentage: Math.round(objectivePercentage * 10) / 10,
    todayVerses,
    weekVerses,
    monthVerses,
    hizbCompleted,
    totalLearningDays: learningDays.size,
    totalReviews: reviewCount,
    estimatedCompletionDate: estimatedDate,
  };
}

// Formater une date pour l'affichage
export function formatDate(dateStr: string): string {
  // Une date nue « AAAA-MM-JJ » doit être lue comme une date locale : `new
  // Date('2026-09-21')` la lit comme minuit UTC, ce qui affiche la veille pour
  // tout utilisateur à l'ouest de Greenwich. Les horodatages complets, eux,
  // désignent un instant et restent analysés tels quels.
  const date = dateStr.length === 10 && dateStr.includes('-')
    ? analyserDateLocale(dateStr)
    : new Date(dateStr);
  const months = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  return `${dayName} ${dayNum} ${monthName}`;
}

// Obtenir le jour de la semaine en français
export function getDayName(dayNum: number): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[dayNum] ?? '';
}
