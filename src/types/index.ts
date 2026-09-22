// Types TypeScript de l'application

// === Données coraniques ===

export interface Surah {
  number: number;
  name: string;
  nameFr: string;
  ayahCount: number;
  startAyahId: number;
  surahOrder: number;
  rukuCount: number;
  isMeccan: boolean;
}

export interface AyahRef {
  surah: number;
  ayah: number;
}

export interface DivisionBoundary {
  surah: number;
  ayah: number;
  ayahId: number;
}

export interface Juz {
  juzNumber: number;
  start: DivisionBoundary;
  end: DivisionBoundary;
}

export interface Hizb {
  hizbNumber: number;
  start: DivisionBoundary;
  end: DivisionBoundary;
}

export interface Rub {
  rubNumber: number;
  hizbNumber: number;
  juzNumber: number;
  start: DivisionBoundary;
  end: DivisionBoundary;
}

export interface Thumn {
  thumnNumber: number;
  hizbNumber: number;
  rubNumber: number;
  isRubStart: boolean;
  hafs: {
    startSurah: number;
    startAyah: number;
    endSurah: number;
    endAyah: number;
    startAyahId: number;
    endAyahId: number;
  };
  /**
   * D'ou vient la borne, et ce qu'on en sait.
   *
   * `verified_hafs` et `verified` disent une **propriete du calcul** : la borne
   * vient des donnees Hafs, ou d'un report exact depuis Qaloun parce que la
   * sourate a le meme nombre de versets dans les deux lectures. `relue` dit
   * autre chose : un relecteur a ouvert un moushaf Hafs imprime et a lu la
   * borne. Les confondre ferait disparaitre la distinction sans le dire.
   */
  verificationStatus: 'verified_hafs' | 'verified' | 'estimated_offset' | 'relue';
}

export interface Ayah {
  surah: number;
  ayah: number;
  text: string;
  juz?: number;
  page?: number;
  hizbQuarter?: number;
}

// === Configuration utilisateur ===

export type KnowledgeLevel = 'perfect' | 'needs_review' | 'unknown';

export interface MemorizedPassage {
  surah: number;
  startAyah: number;
  endAyah: number;
  level: KnowledgeLevel;
}

export type ObjectiveType =
  | 'full_quran'
  | 'juz_amma'
  | 'hizb_sabbih'
  | 'specific_juz'
  | 'specific_hizb'
  | 'custom';

export interface Objective {
  type: ObjectiveType;
  // Pour specific_juz: le numéro du juz
  juzNumber?: number;
  // Pour specific_hizb: les numéros de hizb
  hizbNumbers?: number[];
  // Pour custom: passages définis
  passages?: { surah: number; startAyah: number; endAyah: number }[];
}

export type LearningUnit =
  | { type: 'verses'; count: number }
  | { type: 'half_page' }
  | { type: 'page'; count: number }
  | { type: 'thumn'; count: number }
  | { type: 'rub'; count: number }
  | { type: 'nisf'; count: number }
  | { type: 'hizb'; count: number };

export interface LearningSchedule {
  unit: LearningUnit;
  days: number[]; // 0=Dim, 1=Lun, ..., 6=Sam
}

/**
 * Comment le texte coranique s'affiche.
 *
 *   - `versets` : un verset par bloc, avec son numéro ;
 *   - `page`    : la page du moushaf, texte continu et médaillons.
 *
 * Le choix est conservé dans la configuration, et voyage donc avec la
 * sauvegarde : le retrouver à chaque ouverture serait un réglage qu'on refait
 * sans cesse.
 */
export type ModeAffichage = 'versets' | 'page';

export interface UserConfig {
  memorizedPassages: MemorizedPassage[];
  objective: Objective;
  schedule: LearningSchedule;
  onboardingCompleted: boolean;
  affichage?: { mode: ModeAffichage };
}

// === Programme d'apprentissage ===

export type SessionStatus = 'todo' | 'completed' | 'postponed';

export interface LearningSession {
  id: string;
  date: string; // ISO date
  surah: number;
  startAyah: number;
  endAyah: number;
  unit: LearningUnit;
  status: SessionStatus;
  completedAt?: string;
  createdAt: string;
}

// === Révisions espacées ===

export type ReviewRating = 'perfect' | 'hesitant' | 'errors' | 'relearn';

export interface ReviewItem {
  id: string;
  surah: number;
  startAyah: number;
  endAyah: number;
  level: number; // 0-5, niveau de maîtrise SRS
  nextReviewDate: string; // ISO date
  lastReviewedAt?: string;
  reviewCount: number;
  intervalDays: number;
  createdAt: string;
}

// === Statistiques ===

export interface ProgressStats {
  quranPercentage: number;
  objectivePercentage: number;
  todayVerses: number;
  weekVerses: number;
  monthVerses: number;
  /** Pages équivalentes : voir `pagesEquivalentes` dans `progress.ts`. */
  todayPages: number;
  weekPages: number;
  monthPages: number;
  hizbCompleted: number;
  totalLearningDays: number;
  totalReviews: number;
  estimatedCompletionDate?: string;
}

/** Une semaine d'activité, du lundi au dimanche. */
export interface SemaineActivite {
  /** Lundi, « AAAA-MM-JJ ». */
  debut: string;
  /** Dimanche, « AAAA-MM-JJ ». */
  fin: string;
  /** Pages équivalentes mémorisées pendant la semaine. */
  pages: number;
  /** Versets distincts mémorisés pendant la semaine. */
  versets: number;
  /** Séances terminées pendant la semaine. */
  seances: number;
  /** Vrai pour la semaine en cours, qui n'est pas terminée. */
  enCours: boolean;
}
