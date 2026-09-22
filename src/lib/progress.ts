// Calculs de progression et statistiques

import type {
  UserConfig,
  LearningSession,
  MemorizedPassage,
  ProgressStats,
  Objective,
  SemaineActivite,
} from '@/types';
import {
  getAllSurahs,
  getAllHizb,
  getSurah,
  getTotalAyahs,
  ayahRefToAyahId,
  getPageOfAyahId,
  getVersesOnPage,
} from '@/data/quranData';
import { computeObjectiveRanges, estimateCompletionDate } from './programGenerator';
import { aujourdHui, ilYAjours, analyserDateLocale, versDateLocale } from './dates';

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

  // Les versets d'une période se comptent en versets **distincts**, et non en
  // additionnant les longueurs de séances. Deux séances qui se recouvrent —
  // une séance reportée puis refaite, un passage repris — comptaient sinon deux
  // fois, et l'activité affichée dépassait le travail réel.
  const today = aujourdHui();
  const idsAujourdHui = identifiantsDesSeances(
    sessions.filter((s) => s.date === today)
  );

  const weekStr = ilYAjours(7);
  const idsSemaine = identifiantsDesSeances(
    sessions.filter((s) => s.date >= weekStr && s.date <= today)
  );

  const monthStr = ilYAjours(30);
  const idsMois = identifiantsDesSeances(
    sessions.filter((s) => s.date >= monthStr && s.date <= today)
  );

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
    todayVerses: idsAujourdHui.size,
    weekVerses: idsSemaine.size,
    monthVerses: idsMois.size,
    todayPages: pagesEquivalentes(idsAujourdHui),
    weekPages: pagesEquivalentes(idsSemaine),
    monthPages: pagesEquivalentes(idsMois),
    hizbCompleted,
    totalLearningDays: learningDays.size,
    totalReviews: reviewCount,
    estimatedCompletionDate: estimatedDate,
  };
}

// === La page comme unité de mesure ===

/**
 * Les identifiants globaux des versets couverts par des séances terminées.
 *
 * Même raison que pour les passages déclarés : un ensemble, et non une somme de
 * longueurs.
 */
function identifiantsDesSeances(sessions: LearningSession[]): Set<number> {
  const ids = new Set<number>();

  for (const session of sessions) {
    if (session.status !== 'completed') continue;
    const surah = getSurah(session.surah);
    if (!surah) continue;
    for (let a = session.startAyah; a <= session.endAyah; a++) {
      ids.add(surah.startAyahId + a - 1);
    }
  }

  return ids;
}

/**
 * Le nombre de pages du moushaf que représentent ces versets.
 *
 * Une page entièrement mémorisée compte pour 1. Une page dont on connaît la
 * moitié compte pour 0,5. La mesure est donc exacte et additive, ce qu'un simple
 * « nombre de pages touchées » ne serait pas : toucher un verset d'une page
 * compterait autant que la connaître entièrement, et l'activité affichée
 * gonflerait sans rapport avec le travail fourni.
 *
 * Le mot « équivalentes » est là pour cela : ce sont des pages au sens de la
 * quantité de texte, pas des pages achevées.
 */
export function pagesEquivalentes(ids: Set<number>): number {
  const versetsParPage = new Map<number, number>();

  for (const id of ids) {
    const page = getPageOfAyahId(id);
    if (page === null) continue;
    versetsParPage.set(page, (versetsParPage.get(page) ?? 0) + 1);
  }

  let total = 0;
  for (const [page, compte] of versetsParPage) {
    const surLaPage = getVersesOnPage(page);
    if (surLaPage === 0) continue;
    total += Math.min(compte, surLaPage) / surLaPage;
  }

  return Math.round(total * 10) / 10;
}

/** Le lundi de la semaine qui contient `date`, en date locale. */
function lundiDeLaSemaine(date: Date): Date {
  const jour = date.getDay(); // 0 = dimanche
  const decalage = jour === 0 ? -6 : 1 - jour;
  const lundi = new Date(date);
  lundi.setDate(date.getDate() + decalage);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

/**
 * L'activité des `nombreSemaines` dernières semaines, du lundi au dimanche.
 *
 * La dernière entrée est la semaine en cours : elle est marquée `enCours`,
 * parce qu'une semaine à peine commencée a naturellement une barre plus courte
 * que les autres, et que cela se lirait sinon comme un ralentissement.
 *
 * `depuis` est injectable : une aide adossée à l'horloge réelle ne s'éprouve
 * pas de façon déterministe.
 */
export function computeActiviteHebdomadaire(
  sessions: LearningSession[],
  nombreSemaines: number,
  depuis: Date = new Date()
): SemaineActivite[] {
  const lundiCourant = lundiDeLaSemaine(depuis);
  const semaines: SemaineActivite[] = [];

  for (let recul = nombreSemaines - 1; recul >= 0; recul--) {
    const debutDate = new Date(lundiCourant);
    debutDate.setDate(lundiCourant.getDate() - recul * 7);

    const finDate = new Date(debutDate);
    finDate.setDate(debutDate.getDate() + 6);

    const debut = versDateLocale(debutDate);
    const fin = versDateLocale(finDate);

    const deLaSemaine = sessions.filter((s) => s.date >= debut && s.date <= fin);
    const ids = identifiantsDesSeances(deLaSemaine);

    semaines.push({
      debut,
      fin,
      pages: pagesEquivalentes(ids),
      versets: ids.size,
      seances: deLaSemaine.filter((s) => s.status === 'completed').length,
      enCours: recul === 0,
    });
  }

  return semaines;
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
