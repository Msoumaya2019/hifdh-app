// Conversion entre l'instantané et les lignes de la base distante.
//
// C'est le seul endroit où le vocabulaire de l'application (camelCase) rencontre
// celui de Postgres (snake_case). Une colonne mal nommée ne provoque aucune
// erreur : elle rend simplement `undefined`, et la sauvegarde se corrompt en
// silence. D'où ce module séparé, pur, et éprouvé par un aller-retour.
//
// Les dates « AAAA-MM-JJ » sont des colonnes DATE côté Postgres : elles
// reviennent sous forme de chaîne. Le `slice(0, 10)` couvre le cas où le
// serveur les sérialiserait en horodatage complet — on ne fabrique rien, on
// tronque une partie de temps qui n'existe pas dans la colonne.

import type { LearningSession, MemorizedPassage, ReviewItem, UserConfig } from '@/types';
import type { Snapshot } from './snapshot';
import { VERSION_INSTANTANE } from './snapshot';

/** Les quatre ensembles, tels qu'ils sortent de la base distante. */
export interface LignesDistant {
  config: UserConfig | null;
  memorized: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
}

/** Les quatre ensembles, tels qu'ils partent vers la base distante. */
export interface LignesAEnvoyer {
  config: UserConfig | null;
  memorized: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
}

function jour(valeur: unknown): string {
  return String(valeur ?? '').slice(0, 10);
}

function instantOuNull(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  return String(valeur);
}

export function versLignes(snapshot: Snapshot): LignesAEnvoyer {
  return {
    config: snapshot.config,
    memorized: snapshot.memorized.map((passage) => ({
      surah: passage.surah,
      start_ayah: passage.startAyah,
      end_ayah: passage.endAyah,
      level: passage.level,
    })),
    sessions: snapshot.sessions.map((seance) => ({
      id: seance.id,
      date: seance.date,
      surah: seance.surah,
      start_ayah: seance.startAyah,
      end_ayah: seance.endAyah,
      unit_json: seance.unit,
      status: seance.status,
      completed_at: seance.completedAt ?? null,
      created_at: seance.createdAt,
    })),
    reviews: snapshot.reviews.map((item) => ({
      id: item.id,
      surah: item.surah,
      start_ayah: item.startAyah,
      end_ayah: item.endAyah,
      level: item.level,
      next_review_date: item.nextReviewDate,
      last_reviewed_at: item.lastReviewedAt ?? null,
      review_count: item.reviewCount,
      interval_days: item.intervalDays,
      created_at: item.createdAt,
    })),
  };
}

export function depuisLignes(lignes: LignesDistant, maintenant: Date = new Date()): Snapshot {
  const memorized: MemorizedPassage[] = lignes.memorized.map((l) => ({
    surah: Number(l.surah),
    startAyah: Number(l.start_ayah),
    endAyah: Number(l.end_ayah),
    level: String(l.level) as MemorizedPassage['level'],
  }));

  const sessions: LearningSession[] = lignes.sessions.map((l) => ({
    id: String(l.id),
    date: jour(l.date),
    surah: Number(l.surah),
    startAyah: Number(l.start_ayah),
    endAyah: Number(l.end_ayah),
    unit: l.unit_json as LearningSession['unit'],
    status: String(l.status) as LearningSession['status'],
    // La clé n'est posée que si la valeur existe : `completedAt: undefined`
    // n'est pas équivalent à une clé absente, et la comparaison d'un
    // aller-retour le verrait.
    ...(l.completed_at === null || l.completed_at === undefined
      ? {}
      : { completedAt: String(l.completed_at) }),
    createdAt: String(l.created_at),
  }));

  const reviews: ReviewItem[] = lignes.reviews.map((l) => ({
    id: String(l.id),
    surah: Number(l.surah),
    startAyah: Number(l.start_ayah),
    endAyah: Number(l.end_ayah),
    level: Number(l.level),
    nextReviewDate: jour(l.next_review_date),
    ...(l.last_reviewed_at === null || l.last_reviewed_at === undefined
      ? {}
      : { lastReviewedAt: String(l.last_reviewed_at) }),
    reviewCount: Number(l.review_count),
    intervalDays: Number(l.interval_days),
    createdAt: String(l.created_at),
  }));

  return {
    version: VERSION_INSTANTANE,
    updatedAt: maintenant.toISOString(),
    config: lignes.config ?? null,
    memorized,
    sessions,
    reviews,
  };
}

/** Utilitaire d'export, pour que les tests n'aient pas à recopier la forme. */
export type { Snapshot };
export { instantOuNull };
