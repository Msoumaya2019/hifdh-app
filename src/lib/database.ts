// Base de données SQLite locale pour le stockage hors ligne
// Utilise expo-sqlite

import * as SQLite from 'expo-sqlite';
import type {
  UserConfig,
  LearningSession,
  ReviewItem,
  MemorizedPassage,
} from '@/types';
import { aujourdHui } from './dates';

const DB_NAME = 'hifdh.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);

  await dbInstance.execAsync(`
    -- Configuration utilisateur (une seule ligne)
    CREATE TABLE IF NOT EXISTS user_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      config_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Passages mémorisés
    CREATE TABLE IF NOT EXISTS memorized_passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      surah INTEGER NOT NULL,
      start_ayah INTEGER NOT NULL,
      end_ayah INTEGER NOT NULL,
      level TEXT NOT NULL DEFAULT 'perfect',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Séances d'apprentissage
    CREATE TABLE IF NOT EXISTS learning_sessions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      surah INTEGER NOT NULL,
      start_ayah INTEGER NOT NULL,
      end_ayah INTEGER NOT NULL,
      unit_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      completed_at TEXT,
      created_at TEXT NOT NULL
    );

    -- Items de révision (spaced repetition)
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY,
      surah INTEGER NOT NULL,
      start_ayah INTEGER NOT NULL,
      end_ayah INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      next_review_date TEXT NOT NULL,
      last_reviewed_at TEXT,
      review_count INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Index pour les requêtes fréquentes
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON learning_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON learning_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_review_next ON review_items(next_review_date);
    CREATE INDEX IF NOT EXISTS idx_memorized_surah ON memorized_passages(surah);
  `);

  return dbInstance;
}

// === Configuration utilisateur ===

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO user_config (id, config_json, updated_at) VALUES (1, ?, ?)`,
    [JSON.stringify(config), now]
  );
}

export async function getUserConfig(): Promise<UserConfig | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ config_json: string }>(
    `SELECT config_json FROM user_config WHERE id = 1`
  );
  if (!row) return null;
  return JSON.parse(row.config_json) as UserConfig;
}

// === Passages mémorisés ===

/**
 * Ajoute un passage mémorisé, ou met à jour son niveau s'il existe déjà.
 *
 * L'insertion était inconditionnelle : refaire le questionnaire depuis le profil
 * ajoutait une seconde fois les mêmes passages. Le niveau est celui de la
 * dernière déclaration — un passage d'abord marqué « unknown » puis « perfect »
 * doit être compté.
 */
export async function addMemorizedPassage(
  surah: number,
  startAyah: number,
  endAyah: number,
  level: 'perfect' | 'needs_review' | 'unknown' = 'perfect'
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const miseAJour = await db.runAsync(
    `UPDATE memorized_passages SET level = ?, updated_at = ?
     WHERE surah = ? AND start_ayah = ? AND end_ayah = ?`,
    [level, now, surah, startAyah, endAyah]
  );

  if ((miseAJour.changes ?? 0) > 0) return;

  await db.runAsync(
    `INSERT INTO memorized_passages (surah, start_ayah, end_ayah, level, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [surah, startAyah, endAyah, level, now, now]
  );
}

export async function getMemorizedPassages(): Promise<MemorizedPassage[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    surah: number;
    start_ayah: number;
    end_ayah: number;
    level: string;
  }>(`SELECT surah, start_ayah, end_ayah, level FROM memorized_passages ORDER BY surah, start_ayah`);

  return rows.map((r) => ({
    surah: r.surah,
    startAyah: r.start_ayah,
    endAyah: r.end_ayah,
    level: r.level as MemorizedPassage['level'],
  }));
}

export async function removeMemorizedPassage(
  surah: number,
  startAyah: number,
  endAyah: number
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM memorized_passages WHERE surah = ? AND start_ayah = ? AND end_ayah = ?`,
    [surah, startAyah, endAyah]
  );
}

// === Séances d'apprentissage ===

const INSERT_SESSION = `INSERT OR REPLACE INTO learning_sessions
   (id, date, surah, start_ayah, end_ayah, unit_json, status, completed_at, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function parametresSession(session: LearningSession): (string | number | null)[] {
  return [
    session.id,
    session.date,
    session.surah,
    session.startAyah,
    session.endAyah,
    JSON.stringify(session.unit),
    session.status,
    session.completedAt ?? null,
    session.createdAt,
  ];
}

export async function saveSession(session: LearningSession): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(INSERT_SESSION, parametresSession(session));
}

/**
 * Applique un recalcul : efface l'avenir encore à faire, écrit le nouveau.
 *
 * Les deux étapes sont menées dans une seule transaction : une interruption
 * entre l'effacement et l'écriture laisserait l'utilisateur sans programme.
 */
export async function appliquerRecalcul(plan: {
  aSupprimer: string[];
  aCreer: LearningSession[];
}): Promise<void> {
  const db = await getDatabase();

  await db.withTransactionAsync(async () => {
    for (const id of plan.aSupprimer) {
      await db.runAsync(`DELETE FROM learning_sessions WHERE id = ?`, [id]);
    }
    for (const session of plan.aCreer) {
      await db.runAsync(INSERT_SESSION, parametresSession(session));
    }
  });
}

/**
 * Toutes les séances, quel que soit leur statut.
 *
 * Nécessaire au recalcul : il faut connaître l'existant pour ne remplacer que
 * l'avenir, et pour que refaire le questionnaire ne double pas le programme.
 */
export async function getAllSessions(): Promise<LearningSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    surah: number;
    start_ayah: number;
    end_ayah: number;
    unit_json: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>(`SELECT * FROM learning_sessions ORDER BY date ASC`);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    surah: r.surah,
    startAyah: r.start_ayah,
    endAyah: r.end_ayah,
    unit: JSON.parse(r.unit_json),
    status: r.status as LearningSession['status'],
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getSessionsByDateRange(
  startDate: string,
  endDate: string
): Promise<LearningSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    surah: number;
    start_ayah: number;
    end_ayah: number;
    unit_json: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>(
    `SELECT * FROM learning_sessions WHERE date >= ? AND date <= ? ORDER BY date ASC`,
    [startDate, endDate]
  );

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    surah: r.surah,
    startAyah: r.start_ayah,
    endAyah: r.end_ayah,
    unit: JSON.parse(r.unit_json),
    status: r.status as LearningSession['status'],
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getTodaySessions(): Promise<LearningSession[]> {
  const today = aujourdHui();
  return getSessionsByDateRange(today, today);
}

/**
 * Toutes les séances restant à faire, quelle que soit leur date.
 *
 * Indispensable : une séance non terminée dont la date est passée n'apparaît
 * dans aucune plage « à venir », et disparaîtrait de l'écran sans jamais avoir
 * été faite. C'est le cas d'une séance reportée ou simplement manquée.
 */
export async function getSessionsATraiter(): Promise<LearningSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    date: string;
    surah: number;
    start_ayah: number;
    end_ayah: number;
    unit_json: string;
    status: string;
    completed_at: string | null;
    created_at: string;
  }>(
    `SELECT * FROM learning_sessions WHERE status = 'todo' ORDER BY date ASC`
  );

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    surah: r.surah,
    startAyah: r.start_ayah,
    endAyah: r.end_ayah,
    unit: JSON.parse(r.unit_json),
    status: r.status as LearningSession['status'],
    completedAt: r.completed_at ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function getSessionCount(
  status?: LearningSession['status']
): Promise<number> {
  const db = await getDatabase();
  if (status) {
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM learning_sessions WHERE status = ?`,
      [status]
    );
    return row?.count ?? 0;
  }
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM learning_sessions`
  );
  return row?.count ?? 0;
}

export async function updateSessionStatus(
  sessionId: string,
  status: LearningSession['status']
): Promise<void> {
  const db = await getDatabase();
  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  await db.runAsync(
    `UPDATE learning_sessions SET status = ?, completed_at = ? WHERE id = ?`,
    [status, completedAt, sessionId]
  );
}

/**
 * Reporte une séance à une nouvelle date.
 *
 * Le statut repasse à « todo » : une séance reportée est une séance à faire, à
 * une autre date. La laisser en « postponed » la rendrait inerte, l'écran
 * n'affichant les boutons d'action que pour les séances « todo ».
 */
export async function reporterSession(sessionId: string, nouvelleDate: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE learning_sessions SET date = ?, status = 'todo', completed_at = NULL WHERE id = ?`,
    [nouvelleDate, sessionId]
  );
}

/**
 * Supprime les séances à venir encore à faire.
 *
 * Sert au recalcul : l'historique (séances passées ou terminées) est conservé,
 * seul l'avenir non commencé est remplacé.
 */
export async function supprimerSeancesFuturesATraiter(aPartirDe: string): Promise<number> {
  const db = await getDatabase();
  const resultat = await db.runAsync(
    `DELETE FROM learning_sessions WHERE date >= ? AND status = 'todo'`,
    [aPartirDe]
  );
  return resultat.changes ?? 0;
}

// === Items de révision ===

export async function saveReviewItem(item: ReviewItem): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO review_items
     (id, surah, start_ayah, end_ayah, level, next_review_date, last_reviewed_at, review_count, interval_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.surah,
      item.startAyah,
      item.endAyah,
      item.level,
      item.nextReviewDate,
      item.lastReviewedAt ?? null,
      item.reviewCount,
      item.intervalDays,
      item.createdAt,
    ]
  );
}

export async function getReviewItemsDue(today: string): Promise<ReviewItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    surah: number;
    start_ayah: number;
    end_ayah: number;
    level: number;
    next_review_date: string;
    last_reviewed_at: string | null;
    review_count: number;
    interval_days: number;
    created_at: string;
  }>(
    `SELECT * FROM review_items WHERE next_review_date <= ? ORDER BY next_review_date ASC`,
    [today]
  );

  return rows.map((r) => ({
    id: r.id,
    surah: r.surah,
    startAyah: r.start_ayah,
    endAyah: r.end_ayah,
    level: r.level,
    nextReviewDate: r.next_review_date,
    lastReviewedAt: r.last_reviewed_at ?? undefined,
    reviewCount: r.review_count,
    intervalDays: r.interval_days,
    createdAt: r.created_at,
  }));
}

export async function getReviewItemCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM review_items`
  );
  return row?.count ?? 0;
}
