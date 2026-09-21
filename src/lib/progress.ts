// Calculs de progression et statistiques

import type { UserConfig, LearningSession, MemorizedPassage, ProgressStats, Objective } from '@/types';
import { getAllSurahs, getTotalAyahs, ayahRefToAyahId } from '@/data/quranData';
import { computeObjectiveRanges, estimateCompletionDate } from './programGenerator';

// Calculer le nombre total de versets dans le Coran
export function getTotalQuranVerses(): number {
  return getTotalAyahs(); // 6236
}

// Calculer le nombre de versets mémorisés
export function getMemorizedVerseCount(memorized: MemorizedPassage[]): number {
  let count = 0;
  for (const passage of memorized) {
    if (passage.level === 'unknown') continue;
    count += passage.endAyah - passage.startAyah + 1;
  }
  return count;
}

// Calculer le nombre de versets dans l'objectif
export function getObjectiveVerseCount(objective: Objective): number {
  const ranges = computeObjectiveRanges(objective);
  let count = 0;
  for (const range of ranges) {
    const surah = getAllSurahs().find((s) => s.number === range.surah);
    if (!surah) continue;
    // Si la plage couvre toute la sourate
    if (range.startAyah === 1 && range.endAyah >= surah.ayahCount) {
      count += surah.ayahCount;
    } else {
      // Plage partielle
      count += range.endAyah - range.startAyah + 1;
    }
  }
  return count;
}

// Calculer le nombre de versets mémorisés dans l'objectif
export function getMemorizedInObjective(
  objective: Objective,
  memorized: MemorizedPassage[]
): number {
  const objRanges = computeObjectiveRanges(objective);
  let count = 0;

  for (const objRange of objRanges) {
    for (const mem of memorized) {
      if (mem.level === 'unknown') continue;
      if (mem.surah !== objRange.surah) continue;

      // Chevauchement
      const overlapStart = Math.max(mem.startAyah, objRange.startAyah);
      const overlapEnd = Math.min(mem.endAyah, objRange.endAyah);
      if (overlapEnd >= overlapStart) {
        count += overlapEnd - overlapStart + 1;
      }
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
  const today = new Date().toISOString().split('T')[0];
  const todayVerses = sessions
    .filter((s) => s.date === today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Versets cette semaine (7 derniers jours)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekStr = weekAgo.toISOString().split('T')[0];
  const weekVerses = sessions
    .filter((s) => s.date >= weekStr && s.date <= today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Versets ce mois (30 derniers jours)
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const monthStr = monthAgo.toISOString().split('T')[0];
  const monthVerses = sessions
    .filter((s) => s.date >= monthStr && s.date <= today && s.status === 'completed')
    .reduce((sum, s) => sum + (s.endAyah - s.startAyah + 1), 0);

  // Hizb terminés (un hizb = ~104 versets, on compte les hizb entièrement mémorisés)
  let hizbCompleted = 0;
  for (let h = 1; h <= 60; h++) {
    // Vérifier si tout le hizb est mémorisé
    // Simplifié: on compte sur la base des versets mémorisés par hizb
    // TODO: implémenter précisément avec les données de hizb
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
  const date = new Date(dateStr);
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
