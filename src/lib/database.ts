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
import { createNewCard, getNextReviewDate, reviewCard } from './spacedRepetition';
import { effetRenforcement } from './renforcement';

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

/** Clé d'un passage : son étendue, qui est ce qui l'identifie en base. */
function clePassage(passage: { surah: number; startAyah: number; endAyah: number }): string {
  return `${passage.surah}:${passage.startAyah}-${passage.endAyah}`;
}

/**
 * Aligne les passages déclarés sur une nouvelle liste.
 *
 * `addMemorizedPassage` ajoute ou met à jour, mais ne retire jamais. Décocher
 * une sourate dans le questionnaire la laissait donc en base, où le recalcul la
 * comptait comme connue : la désélection était sans effet, et invisible, puisque
 * l'écran la montrait décochée et que la réouverture la recochait.
 *
 * Deux garde-fous, parce que la table mêle deux origines :
 *
 *   - seuls les passages **déclarés** sont retirés, c'est-à-dire ceux que le
 *     questionnaire avait posés ;
 *   - un passage de même étendue qu'une séance terminée est conservé. La
 *     progression acquise par le travail ne doit pas disparaître parce qu'un
 *     questionnaire a changé d'avis — et rien ne permet ensuite de la retrouver.
 *
 * Le tout dans une seule transaction : une interruption au milieu laisserait un
 * état où la moitié des déclarations est à jour et l'autre non.
 */
export async function synchroniserPassagesDeclares(
  anciens: MemorizedPassage[],
  nouveaux: MemorizedPassage[]
): Promise<{ poses: number; retires: number; conserves: number }> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const voulues = new Map(nouveaux.map((p) => [clePassage(p), p]));
  const aRetirer = anciens.filter((p) => !voulues.has(clePassage(p)));

  let retires = 0;
  let conserves = 0;

  await db.withTransactionAsync(async () => {
    for (const passage of nouveaux) {
      const miseAJour = await db.runAsync(
        `UPDATE memorized_passages SET level = ?, updated_at = ?
         WHERE surah = ? AND start_ayah = ? AND end_ayah = ?`,
        [passage.level, now, passage.surah, passage.startAyah, passage.endAyah]
      );
      if ((miseAJour.changes ?? 0) > 0) continue;

      await db.runAsync(
        `INSERT INTO memorized_passages (surah, start_ayah, end_ayah, level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [passage.surah, passage.startAyah, passage.endAyah, passage.level, now, now]
      );
    }

    for (const passage of aRetirer) {
      const seance = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM learning_sessions
          WHERE surah = ? AND start_ayah = ? AND end_ayah = ? AND status = 'completed'`,
        [passage.surah, passage.startAyah, passage.endAyah]
      );
      if ((seance?.n ?? 0) > 0) {
        conserves += 1;
        continue;
      }

      const resultat = await db.runAsync(
        `DELETE FROM memorized_passages WHERE surah = ? AND start_ayah = ? AND end_ayah = ?`,
        [passage.surah, passage.startAyah, passage.endAyah]
      );
      retires += resultat.changes ?? 0;
    }
  });

  return { poses: nouveaux.length, retires, conserves };
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

const INSERT_REVIEW = `INSERT OR REPLACE INTO review_items
   (id, surah, start_ayah, end_ayah, level, next_review_date, last_reviewed_at, review_count, interval_days, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function parametresReview(item: ReviewItem): (string | number | null)[] {
  return [
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
  ];
}

export async function saveReviewItem(item: ReviewItem): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(INSERT_REVIEW, parametresReview(item));
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

export async function getAllReviewItems(): Promise<ReviewItem[]> {
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
  }>(`SELECT * FROM review_items ORDER BY next_review_date ASC`);

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

/**
 * L'item de révision espacée d'un passage précis, s'il existe.
 *
 * La correspondance se fait sur l'étendue exacte : c'est ainsi que les items
 * sont créés — à partir de l'étendue d'une séance — et c'est donc la seule clé
 * qui les retrouve. Une correspondance approximative rapprocherait deux
 * passages voisins que l'apprenant distingue.
 */
export async function getReviewItemParPassage(
  surah: number,
  startAyah: number,
  endAyah: number
): Promise<ReviewItem | null> {
  const db = await getDatabase();
  const r = await db.getFirstAsync<{
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
    `SELECT * FROM review_items
      WHERE surah = ? AND start_ayah = ? AND end_ayah = ?
      ORDER BY created_at DESC LIMIT 1`,
    [surah, startAyah, endAyah]
  );

  if (!r) return null;

  return {
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
  };
}

/**
 * Enregistrer le verdict de l'apprenant sur un passage : renforcé, ou pas
 * encore.
 *
 * Deux écritures, indissociables :
 *
 *   - le **niveau de connaissance**, qui décide de la présence du passage dans
 *     « À renforcer ». « Pas encore » l'y laisse, « Renforcé » l'en retire ;
 *   - la **révision espacée**, qui décide de la date à laquelle il reviendra.
 *     Un passage renforcé repart à un jour puis s'espace ; un passage qu'on
 *     n'a pas su renforcer retombe au niveau 0 et revient demain.
 *
 * Les deux vivaient dans des écrans séparés, et ne se parlaient pas : un
 * passage pouvait être déclaré parfait et rester indéfiniment dans la liste des
 * révisions dues, faute de quoi que ce soit pour les rapprocher.
 *
 * Le tout dans une seule transaction : une interruption entre les deux
 * laisserait un passage marqué renforcé dont la révision n'aurait pas avancé —
 * il reviendrait demain sans raison apparente.
 */
export async function renforcerPassage(
  passage: { surah: number; startAyah: number; endAyah: number },
  renforce: boolean
): Promise<void> {
  const db = await getDatabase();
  const { niveau, note } = effetRenforcement(renforce);

  const existant = await getReviewItemParPassage(
    passage.surah,
    passage.startAyah,
    passage.endAyah
  );

  const base = existant
    ? {
        level: existant.level,
        reviewCount: existant.reviewCount,
        intervalDays: existant.intervalDays,
        easinessFactor: 2.5,
      }
    : createNewCard();

  const suite = reviewCard(base, note);

  const item: ReviewItem = {
    id: existant?.id ?? `review_${passage.surah}_${passage.startAyah}_${passage.endAyah}`,
    surah: passage.surah,
    startAyah: passage.startAyah,
    endAyah: passage.endAyah,
    level: suite.level,
    nextReviewDate: getNextReviewDate(suite.intervalDays),
    lastReviewedAt: new Date().toISOString(),
    reviewCount: suite.reviewCount,
    intervalDays: suite.intervalDays,
    createdAt: existant?.createdAt ?? new Date().toISOString(),
  };

  await db.withTransactionAsync(async () => {
    // `addMemorizedPassage` et non un `UPDATE` : le passage peut n'avoir encore
    // aucune ligne — un apprenant qui ouvre un passage depuis l'onglet Coran et
    // le marque « à retravailler » n'en a pas. Un `UPDATE` seul n'aurait rien
    // écrit, sans le dire, et le passage n'aurait jamais rejoint la liste.
    await addMemorizedPassage(passage.surah, passage.startAyah, passage.endAyah, niveau);

    await db.runAsync(INSERT_REVIEW, parametresReview(item));
  });
}

// === Sauvegarde et restauration ===

/**
 * Vrai si l'appareil ne porte encore aucune donnée personnelle.
 *
 * Sert de garde-fou à la restauration : écraser sans confirmation une
 * progression existante la détruirait définitivement.
 */
export async function estBaseVide(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT
       (SELECT COUNT(*) FROM user_config)
     + (SELECT COUNT(*) FROM memorized_passages)
     + (SELECT COUNT(*) FROM learning_sessions)
     + (SELECT COUNT(*) FROM review_items) AS total`
  );
  return (row?.total ?? 0) === 0;
}

export interface PartiesLocales {
  config: UserConfig | null;
  memorized: MemorizedPassage[];
  sessions: LearningSession[];
  reviews: ReviewItem[];
}

/** Tout l'état personnel, en une fois. */
export async function lireTout(): Promise<PartiesLocales> {
  const [config, memorized, sessions, reviews] = await Promise.all([
    getUserConfig(),
    getMemorizedPassages(),
    getAllSessions(),
    getAllReviewItems(),
  ]);
  return { config, memorized, sessions, reviews };
}

/**
 * Remplace intégralement l'état local.
 *
 * Une seule transaction : une interruption au milieu laisserait un appareil
 * dont la moitié des données vient d'une sauvegarde et l'autre moitié de
 * l'état précédent — un état qui n'a jamais existé, et impossible à démêler.
 */
export async function remplacerTout(parties: PartiesLocales): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM learning_sessions`);
    await db.runAsync(`DELETE FROM review_items`);
    await db.runAsync(`DELETE FROM memorized_passages`);
    await db.runAsync(`DELETE FROM user_config`);

    if (parties.config !== null) {
      await db.runAsync(
        `INSERT INTO user_config (id, config_json, updated_at) VALUES (1, ?, ?)`,
        [JSON.stringify(parties.config), now]
      );
    }

    for (const passage of parties.memorized) {
      await db.runAsync(
        `INSERT INTO memorized_passages (surah, start_ayah, end_ayah, level, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [passage.surah, passage.startAyah, passage.endAyah, passage.level, now, now]
      );
    }

    for (const session of parties.sessions) {
      await db.runAsync(INSERT_SESSION, parametresSession(session));
    }

    for (const review of parties.reviews) {
      await db.runAsync(INSERT_REVIEW, parametresReview(review));
    }
  });
}
