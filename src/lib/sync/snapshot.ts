// Instantané de sauvegarde.
//
// Un instantané est la photographie complète des données **personnelles** d'un
// utilisateur : sa configuration, ses passages mémorisés, ses séances et ses
// révisions. C'est l'unité de sauvegarde et de restauration, et c'est aussi ce
// qui permet de changer de téléphone sans rien reperdre.
//
// Ce module est volontairement pur : il ne connaît ni SQLite ni le réseau. La
// validation qu'il porte est le seul rempart entre la base locale et une charge
// distante abîmée — un instantané tronqué, une version inconnue ou une date
// impossible doivent être refusés **avant** d'écrire quoi que ce soit.

import type {
  LearningSession,
  LearningUnit,
  MemorizedPassage,
  ObjectiveType,
  ReviewItem,
  SessionStatus,
  UserConfig,
} from '@/types';
import { getSurahAyahCount, getTotalAyahs } from '@/data/quranData';
import { analyserDateLocale, versDateLocale } from '@/lib/dates';

/**
 * Version du format d'instantané.
 *
 * Sert de garde-fou : un client ancien qui recevrait un instantané d'un format
 * qu'il ne connaît pas doit refuser de l'écrire, plutôt que d'en interpréter
 * les champs à contresens.
 */
export const VERSION_INSTANTANE = 1;

export interface Snapshot {
  version: number;
  /** Instant de dernière modification, au format ISO complet. */
  updatedAt: string;
  config: UserConfig | null;
  memorized: MemorizedPassage[];
  sessions: LearningSession[];
  reviews: ReviewItem[];
}

/** Les quatre ensembles de données personnelles, avant horodatage. */
export interface PartiesSnapshot {
  config: UserConfig | null;
  memorized: MemorizedPassage[];
  sessions: LearningSession[];
  reviews: ReviewItem[];
}

export function construireSnapshot(
  parties: PartiesSnapshot,
  maintenant: Date = new Date()
): Snapshot {
  return {
    version: VERSION_INSTANTANE,
    updatedAt: maintenant.toISOString(),
    config: parties.config,
    memorized: parties.memorized,
    sessions: parties.sessions,
    reviews: parties.reviews,
  };
}

/**
 * Un instantané sans aucune donnée personnelle.
 *
 * Sert de garde-fou dans les deux sens : sauvegarder un instantané vide
 * effacerait une sauvegarde existante, et restaurer un instantané vide
 * effacerait l'appareil sans rien remettre à la place.
 */
export function estVide(snapshot: Snapshot): boolean {
  return (
    snapshot.config === null &&
    snapshot.memorized.length === 0 &&
    snapshot.sessions.length === 0 &&
    snapshot.reviews.length === 0
  );
}

/** Nombre d'éléments, pour l'affichage avant confirmation. */
export function compter(snapshot: Snapshot): {
  passages: number;
  seances: number;
  revisions: number;
} {
  return {
    passages: snapshot.memorized.length,
    seances: snapshot.sessions.length,
    revisions: snapshot.reviews.length,
  };
}

// === Validation ===

export interface ValidationReussie {
  ok: true;
  snapshot: Snapshot;
}

export interface ValidationEchouee {
  ok: false;
  problemes: string[];
}

export type ResultatValidation = ValidationReussie | ValidationEchouee;

// Plafonds de sécurité : une charge distante ne doit pas pouvoir faire gonfler
// la base locale sans limite. Les valeurs sont très au-dessus d'un usage réel
// (le Coran entier compte 6 236 versets, soit environ 2 100 séances à trois
// versets par jour).
const MAX_SEANCES = 20_000;
const MAX_PASSAGES = 5_000;
const MAX_REVISIONS = 20_000;

const OBJECTIFS: ObjectiveType[] = [
  'short_surahs',
  'juz_amma',
  'up_to_yassin',
  'half_quran',
  'full_quran',
  'hizb_sabbih',
  'specific_juz',
  'specific_hizb',
  'custom',
];

const STATUTS: SessionStatus[] = ['todo', 'completed', 'postponed'];
const NIVEAUX_CONNUS = ['perfect', 'needs_review', 'unknown'];

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

function estEntier(valeur: unknown, min: number, max: number): valeur is number {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= min && valeur <= max;
}

function estChaineNonVide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.trim() !== '';
}

function estInstant(valeur: unknown): boolean {
  return typeof valeur === 'string' && Number.isFinite(Date.parse(valeur));
}

/**
 * Une date « AAAA-MM-JJ » qui existe réellement.
 *
 * Le contrôle par expression régulière ne suffit pas : « 2026-02-31 » a la
 * bonne forme et n'est pas une date. On vérifie donc l'aller-retour par le
 * calendrier.
 */
function estDateCalendaire(valeur: unknown): boolean {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false;
  return versDateLocale(analyserDateLocale(valeur)) === valeur;
}

function verifierPortee(
  prefixe: string,
  surah: unknown,
  startAyah: unknown,
  endAyah: unknown,
  problemes: string[]
): void {
  if (!estEntier(surah, 1, 114)) {
    problemes.push(`${prefixe} : numéro de sourate invalide (${String(surah)})`);
    return;
  }
  const total = getSurahAyahCount(surah);
  if (!estEntier(startAyah, 1, total)) {
    problemes.push(`${prefixe} : verset de début invalide (${String(startAyah)} pour la sourate ${surah})`);
    return;
  }
  if (!estEntier(endAyah, 1, total)) {
    problemes.push(`${prefixe} : verset de fin invalide (${String(endAyah)} pour la sourate ${surah})`);
    return;
  }
  if (endAyah < startAyah) {
    problemes.push(`${prefixe} : fin (${endAyah}) avant le début (${startAyah})`);
  }
}

function verifierUnite(valeur: unknown, prefixe: string, problemes: string[]): void {
  if (!estObjet(valeur) || typeof valeur.type !== 'string') {
    problemes.push(`${prefixe} : unité d'apprentissage absente ou illisible`);
    return;
  }
  const types = ['verses', 'half_page', 'page', 'thumn', 'rub', 'nisf', 'hizb'];
  if (!types.includes(valeur.type)) {
    problemes.push(`${prefixe} : unité inconnue « ${valeur.type} »`);
  }
}

function verifierIdentifiantsUniques(
  identifiants: string[],
  prefixe: string,
  problemes: string[]
): void {
  const vus = new Set<string>();
  for (const id of identifiants) {
    if (vus.has(id)) {
      problemes.push(`${prefixe} : identifiant « ${id} » présent deux fois`);
      return;
    }
    vus.add(id);
  }
}

function verifierConfig(valeur: unknown, problemes: string[]): void {
  if (valeur === null || valeur === undefined) return;
  if (!estObjet(valeur)) {
    problemes.push('config : objet attendu');
    return;
  }
  if (typeof valeur.onboardingCompleted !== 'boolean') {
    problemes.push('config : « onboardingCompleted » doit être un booléen');
  }
  const objectif = valeur.objective;
  if (!estObjet(objectif) || typeof objectif.type !== 'string') {
    problemes.push('config : objectif absent ou illisible');
  } else if (!OBJECTIFS.includes(objectif.type as ObjectiveType)) {
    problemes.push(`config : type d'objectif inconnu « ${objectif.type} »`);
  }
  const planning = valeur.schedule;
  if (!estObjet(planning)) {
    problemes.push('config : planning absent');
  } else {
    verifierUnite(planning.unit, 'config', problemes);
    const jours = planning.days;
    if (!Array.isArray(jours) || jours.some((j) => !estEntier(j, 0, 6))) {
      problemes.push('config : les jours d’apprentissage doivent être des entiers de 0 à 6');
    }
  }
}

function verifierPassages(valeur: unknown, problemes: string[]): void {
  if (!Array.isArray(valeur)) {
    problemes.push('memorized : tableau attendu');
    return;
  }
  if (valeur.length > MAX_PASSAGES) {
    problemes.push(`memorized : ${valeur.length} passages, au-delà du plafond de ${MAX_PASSAGES}`);
    return;
  }
  valeur.forEach((entree, i) => {
    const prefixe = `memorized[${i}]`;
    if (!estObjet(entree)) {
      problemes.push(`${prefixe} : objet attendu`);
      return;
    }
    verifierPortee(prefixe, entree.surah, entree.startAyah, entree.endAyah, problemes);
    if (!NIVEAUX_CONNUS.includes(String(entree.level))) {
      problemes.push(`${prefixe} : niveau inconnu « ${String(entree.level)} »`);
    }
  });
}

function verifierSeances(valeur: unknown, problemes: string[]): void {
  if (!Array.isArray(valeur)) {
    problemes.push('sessions : tableau attendu');
    return;
  }
  if (valeur.length > MAX_SEANCES) {
    problemes.push(`sessions : ${valeur.length} séances, au-delà du plafond de ${MAX_SEANCES}`);
    return;
  }
  valeur.forEach((entree, i) => {
    const prefixe = `sessions[${i}]`;
    if (!estObjet(entree)) {
      problemes.push(`${prefixe} : objet attendu`);
      return;
    }
    if (!estChaineNonVide(entree.id)) {
      problemes.push(`${prefixe} : identifiant manquant`);
    }
    if (!estDateCalendaire(entree.date)) {
      problemes.push(`${prefixe} : date invalide « ${String(entree.date)} »`);
    }
    verifierPortee(prefixe, entree.surah, entree.startAyah, entree.endAyah, problemes);
    verifierUnite(entree.unit, prefixe, problemes);
    if (!STATUTS.includes(entree.status as SessionStatus)) {
      problemes.push(`${prefixe} : statut inconnu « ${String(entree.status)} »`);
    }
    if (!estInstant(entree.createdAt)) {
      problemes.push(`${prefixe} : « createdAt » n'est pas un instant lisible`);
    }
    if (entree.completedAt !== undefined && entree.completedAt !== null) {
      if (!estInstant(entree.completedAt)) {
        problemes.push(`${prefixe} : « completedAt » n'est pas un instant lisible`);
      }
    }
  });
  if (valeur.every((e) => estObjet(e) && estChaineNonVide(e.id))) {
    verifierIdentifiantsUniques(
      valeur.map((e) => (e as { id: string }).id),
      'sessions',
      problemes
    );
  }
}

function verifierRevisions(valeur: unknown, problemes: string[]): void {
  if (!Array.isArray(valeur)) {
    problemes.push('reviews : tableau attendu');
    return;
  }
  if (valeur.length > MAX_REVISIONS) {
    problemes.push(`reviews : ${valeur.length} éléments, au-delà du plafond de ${MAX_REVISIONS}`);
    return;
  }
  valeur.forEach((entree, i) => {
    const prefixe = `reviews[${i}]`;
    if (!estObjet(entree)) {
      problemes.push(`${prefixe} : objet attendu`);
      return;
    }
    if (!estChaineNonVide(entree.id)) {
      problemes.push(`${prefixe} : identifiant manquant`);
    }
    verifierPortee(prefixe, entree.surah, entree.startAyah, entree.endAyah, problemes);
    if (!estEntier(entree.level, 0, 100)) {
      problemes.push(`${prefixe} : niveau invalide (${String(entree.level)})`);
    }
    if (!estDateCalendaire(entree.nextReviewDate)) {
      problemes.push(`${prefixe} : prochaine révision invalide « ${String(entree.nextReviewDate)} »`);
    }
    if (!estEntier(entree.reviewCount, 0, 1_000_000)) {
      problemes.push(`${prefixe} : nombre de révisions invalide`);
    }
    if (!estEntier(entree.intervalDays, 0, 100_000)) {
      problemes.push(`${prefixe} : intervalle invalide`);
    }
    if (!estInstant(entree.createdAt)) {
      problemes.push(`${prefixe} : « createdAt » n'est pas un instant lisible`);
    }
  });
  if (valeur.every((e) => estObjet(e) && estChaineNonVide(e.id))) {
    verifierIdentifiantsUniques(
      valeur.map((e) => (e as { id: string }).id),
      'reviews',
      problemes
    );
  }
}

/**
 * Vérifie la forme d'une charge reçue du réseau.
 *
 * On refuse en bloc plutôt que de réparer au mieux : un instantané à moitié
 * valide écrirait un état à moitié faux, et l'utilisateur ne saurait pas ce qui
 * a été perdu. Tous les problèmes sont accumulés, pour que le message affiché
 * soit exploitable.
 */
export function validerSnapshot(valeur: unknown): ResultatValidation {
  const problemes: string[] = [];

  if (!estObjet(valeur)) {
    return { ok: false, problemes: ['instantané : objet attendu'] };
  }
  if (valeur.version !== VERSION_INSTANTANE) {
    return {
      ok: false,
      problemes: [
        `instantané : version ${String(valeur.version)} reçue, version ${VERSION_INSTANTANE} attendue`,
      ],
    };
  }
  if (!estInstant(valeur.updatedAt)) {
    problemes.push('instantané : « updatedAt » n’est pas un instant lisible');
  }

  verifierConfig(valeur.config, problemes);
  verifierPassages(valeur.memorized, problemes);
  verifierSeances(valeur.sessions, problemes);
  verifierRevisions(valeur.reviews, problemes);

  if (problemes.length > 0) return { ok: false, problemes };

  return { ok: true, snapshot: valeur as unknown as Snapshot };
}

/** Le nombre total de versets du Coran, exposé pour les écrans de sauvegarde. */
export const TOTAL_VERSETS = getTotalAyahs();

/** Ré-export pratique : le type d'unité, utile aux adaptateurs. */
export type { LearningUnit };
