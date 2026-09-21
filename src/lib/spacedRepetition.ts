// Système de révision espacée (Spaced Repetition System - SRS)
//
// Algorithme simplifié basé sur SM-2 (SuperMemo 2)
// Adapté pour la mémorisation du Coran.
//
// Niveaux de maîtrise: 0 (nouveau) à 5 (maîtrise parfaite)
// Le niveau détermine l'intervalle avant la prochaine révision.

import type { ReviewRating } from '@/types';

// Intervalles par niveau (en jours)
const INTERVALS = [1, 1, 2, 4, 7, 14, 30, 60, 90];

// Facteur de facilité (easiness factor) initial
const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;

export interface SRSCard {
  level: number;
  reviewCount: number;
  intervalDays: number;
  easinessFactor: number;
}

export function createNewCard(): SRSCard {
  return {
    level: 0,
    reviewCount: 0,
    intervalDays: 1,
    easinessFactor: DEFAULT_EF,
  };
}

export function reviewCard(card: SRSCard, rating: ReviewRating): SRSCard {
  const { level, reviewCount, intervalDays, easinessFactor } = card;

  // Mapper la réponse à un score de qualité (0-5)
  const qualityMap: Record<ReviewRating, number> = {
    perfect: 5,
    hesitant: 3,
    errors: 1,
    relearn: 0,
  };
  const quality = qualityMap[rating];

  // Calculer le nouveau facteur de facilité
  let newEF = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEF = Math.max(MIN_EF, newEF);

  // Calculer le nouveau niveau et l'intervalle
  let newLevel: number;
  let newInterval: number;

  if (quality < 3) {
    // Échec: recommencer depuis le début
    newLevel = 0;
    newInterval = 1; // Réviser demain
  } else {
    // Succès: monter d'un niveau (max 8)
    newLevel = Math.min(level + 1, 8);
    // Intervalle basé sur le niveau
    newInterval = INTERVALS[newLevel] ?? Math.round(intervalDays * newEF);
  }

  // Pour les premiers niveaux, utiliser les intervalles fixes
  if (newLevel < INTERVALS.length) {
    newInterval = INTERVALS[newLevel];
  } else {
    // Pour les niveaux élevés, multiplier par le facteur de facilité
    newInterval = Math.round(intervalDays * newEF);
  }

  return {
    level: newLevel,
    reviewCount: reviewCount + 1,
    intervalDays: newInterval,
    easinessFactor: newEF,
  };
}

export function getNextReviewDate(intervalDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + intervalDays);
  return date.toISOString().split('T')[0];
}

// Calculer le pourcentage de rétention d'un item
export function getRetentionPercentage(level: number): number {
  // Niveau 0 = 0%, Niveau 8 = 100%
  return Math.min(100, (level / 8) * 100);
}
