// L'ordre dans lequel les versets sont récités : la séquence de lecture.
//
// CE QUE CE MODULE DÉCIDE, ET RIEN D'AUTRE
// ----------------------------------------
// Il ne joue rien, ne dessine rien et ne connaît ni Expo ni React : il répond à
// une seule question — « à l'étape n, quel verset, et quelle répétition ? ».
// C'est la décision la plus facile à écrire faux, et la seule de cette
// fonctionnalité qui se prouve sans appareil : une séquence erronée ne se voit
// pas à l'écran, elle s'entend, une fois, trop tard.
//
// LA SÉQUENCE N'EST PAS ENGENDRÉE, ELLE SE CALCULE
// ------------------------------------------------
// La liste des étapes n'est jamais matérialisée. Deux raisons :
//
//   - à l'infini, elle n'aurait pas de fin — et une fonction qui rend un tableau
//     ne peut pas rendre un tableau infini ;
//   - même finie, elle peut compter des milliers d'entrées : 286 versets de la
//     sourate 2 répétés dix fois font 2 860 étapes, et il n'y a aucune raison de
//     les écrire toutes pour n'en jouer qu'une à la fois.
//
// `etapeA(plan, n)` calcule donc l'étape n sans connaître les précédentes. C'est
// ce qui rend l'infini traitable par le même code que le fini.
//
// LES DEUX MODES NE DIFFÈRENT QUE PAR L'ORDRE
// -------------------------------------------
// À nombre de répétitions égal, les deux modes comptent **le même nombre
// d'étapes** : seuls le rang du verset et le rang de la répétition s'échangent.
//
//   mode « verset », passage de 3 versets, 2 répétitions :
//     v1 r1 · v1 r2 · v2 r1 · v2 r2 · v3 r1 · v3 r2
//   mode « passage », même passage, mêmes répétitions :
//     v1 r1 · v2 r1 · v3 r1 · v1 r2 · v2 r2 · v3 r2
//
// C'est exactement la distinction que la spécification demande, et elle tient
// dans une seule ligne de calcul — voir `etapeA`.
//
// OÙ TOMBE LA PAUSE
// -----------------
// « Pause entre les répétitions » ne veut pas dire la même chose selon le mode,
// et la différence se mesure :
//
//   - mode « verset »  : chaque étape EST une répétition, donc la pause suit
//     chaque étape ;
//   - mode « passage » : la répétition est le passage entier, donc la pause ne
//     tombe qu'après son dernier verset — mettre une pause entre deux versets
//     d'un même passage le hacherait, et le fil serait perdu.
//
// À l'infini, la règle tient sans changement : en mode « verset », le verset
// ancré se répète indéfiniment et chaque reprise est séparée ; en mode
// « passage », chaque tour complet est séparé.

import type { AyahRef } from '@/types';
import { getSurahAyahCount } from '@/data/quranData';
import type { Repetition } from './repetitions';

/**
 * Un verset, nommé comme dans le reste de l'application.
 *
 * C'est un **alias**, et non une seconde déclaration : le couple
 * `{ surah, ayah }` est déjà `AyahRef`, et en écrire une copie ici — comme le
 * faisait ce module, et comme le faisait aussi `zonesMoushaf.ts` — laissait
 * trois formes à faire tenir d'accord sans que rien ne les compare. Le nom
 * `RefVerset` reste celui qu'emploie le lecteur audio.
 */
export type RefVerset = AyahRef;

export interface Plan {
  /** Les versets du passage, dans l'ordre du moushaf. */
  versets: RefVerset[];
  repetition: Repetition;
  /**
   * L'index du verset sur lequel l'infini s'ancre, en mode « verset ».
   *
   * À l'infini, un verset se répète sans fin : il faut donc savoir lequel. En
   * mode « passage », l'ancre ne sert pas — le tour complet suffit à lui seul.
   */
  ancre: number;
}

/** Une étape : un verset, joué une fois. */
export interface Etape {
  /** Le rang de l'étape dans le plan, à partir de 0. */
  index: number;
  surah: number;
  ayah: number;
  /** Le rang du verset dans le passage, à partir de 0. */
  indexVerset: number;
  /** Le numéro de la répétition en cours, à partir de 1. */
  repetition: number;
  /** Le total des répétitions de l'unité, ou `null` à l'infini. */
  totalRepetitions: number | null;
}

/**
 * Les versets d'une plage, dans l'ordre du moushaf.
 *
 * Les bornes sont **corrigées** plutôt que refusées : une plage lue dans une
 * adresse d'écran peut arriver inversée (« de 5 à 2 ») ou au-delà du dernier
 * verset de la sourate. Lever obligerait chaque appelant à traiter un cas qui
 * n'a qu'une réponse sensée — écouter ce qui existe — et l'oublier laisserait
 * un écran de sélection qui ne joue rien, sans rien dire.
 *
 * Une plage vide rend un tableau vide : c'est ce que `construirePlan` attend
 * pour rendre un plan vide, et l'écran s'arrête alors proprement.
 */
export function versetsDeLaPlage(
  surah: number,
  startAyah: number,
  endAyah: number
): RefVerset[] {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return [];
  const dernier = getSurahAyahCount(surah);
  if (dernier <= 0) return [];

  const premier = Math.max(1, Math.min(Math.round(startAyah), dernier));
  const fin = Math.max(1, Math.min(Math.round(endAyah), dernier));

  // Une plage inversée est **remise dans l'ordre**, et non refusée : celui qui
  // écrit « de 5 à 2 » désigne les versets 2 à 5, et lui rendre une plage vide
  // parce qu'il a inversé deux nombres serait une leçon de syntaxe là où il
  // attendait une récitation.
  const [bas, haut] = premier <= fin ? [premier, fin] : [fin, premier];

  const versets: RefVerset[] = [];
  for (let ayah = bas; ayah <= haut; ayah += 1) versets.push({ surah, ayah });
  return versets;
}

/**
 * Bâtit un plan. Ne lève jamais, même sur un passage vide.
 *
 * Les versets sont recopiés tels quels : ce module ne les trie pas et ne les
 * dédoublonne pas. L'ordre du passage est celui du moushaf, et c'est à
 * l'appelant de le donner — un tri ici corrigerait en silence une plage
 * construite à l'envers, et personne ne saurait qu'elle l'était.
 */
export function construirePlan(
  versets: RefVerset[],
  repetition: Repetition,
  ancre = 0
): Plan {
  const propres = versets.filter(
    (v) =>
      Number.isInteger(v.surah) &&
      Number.isInteger(v.ayah) &&
      v.surah >= 1 &&
      v.surah <= 114 &&
      v.ayah >= 1
  );
  const borne = propres.length === 0 ? 0 : Math.min(Math.max(0, Math.round(ancre)), propres.length - 1);
  return { versets: propres, repetition, ancre: borne };
}

/**
 * Le nombre d'étapes du plan, ou `null` s'il n'en finit pas.
 *
 * Les deux modes comptent le même nombre d'étapes — c'est l'ordre qui change,
 * pas la quantité. Le calcul est donc le même, et c'est voulu : deux formules
 * pour une même quantité finiraient par diverger.
 */
export function nombreDEtapes(plan: Plan): number | null {
  const { versets, repetition } = plan;
  if (versets.length === 0) return 0;
  if (repetition.nombre === null) return null;
  return versets.length * repetition.nombre;
}

/**
 * L'étape de rang `index`, ou `null` si le plan est achevé.
 *
 * Rend `null` pour un index négatif, et pour un index au-delà de la fin d'un
 * plan fini. À l'infini, il n'y a pas de fin : un index quelconque, si grand
 * soit-il, rend une étape.
 */
export function etapeA(plan: Plan, index: number): Etape | null {
  const { versets, repetition, ancre } = plan;
  if (versets.length === 0) return null;
  if (!Number.isInteger(index) || index < 0) return null;

  const infini = repetition.nombre === null;
  const nombre = repetition.nombre ?? 0;

  if (!infini && index >= versets.length * nombre) return null;

  let indexVerset: number;
  let numero: number;

  if (repetition.mode === 'verset') {
    if (infini) {
      // À l'infini, le verset ancré ne change pas : c'est l'utilisateur qui le
      // fait avancer, par « suivant ».
      indexVerset = ancre;
      numero = index + 1;
    } else {
      indexVerset = Math.floor(index / nombre);
      numero = (index % nombre) + 1;
    }
  } else if (infini) {
    indexVerset = index % versets.length;
    numero = Math.floor(index / versets.length) + 1;
  } else {
    indexVerset = index % versets.length;
    numero = Math.floor(index / versets.length) + 1;
  }

  const verset = versets[indexVerset];
  return {
    index,
    surah: verset.surah,
    ayah: verset.ayah,
    indexVerset,
    repetition: numero,
    totalRepetitions: infini ? null : nombre,
  };
}

/** Vrai s'il reste une étape après celle-ci. */
export function resteUneEtapeApres(plan: Plan, index: number): boolean {
  return etapeA(plan, index + 1) !== null;
}

/**
 * Vrai si une pause doit suivre l'étape de rang `index`.
 *
 * Trois conditions, et il faut les trois : une pause réglée, une étape qui
 * existe, et une étape après elle. La pause qui suivrait la dernière étape
 * n'aurait rien à séparer — c'est l'auto-stop, et une attente avant un arrêt se
 * lit comme un blocage.
 */
export function aUnePauseApres(plan: Plan, index: number): boolean {
  if (plan.repetition.pauseSecondes <= 0) return false;
  const etape = etapeA(plan, index);
  if (etape === null) return false;
  const suivante = etapeA(plan, index + 1);
  if (suivante === null) return false;

  if (plan.repetition.mode === 'verset') return true;

  // Mode « passage » : la pause sépare deux tours, et non deux versets.
  return suivante.repetition !== etape.repetition;
}

/** L'index de l'étape suivante, ou `null` si le plan est achevé. */
export function indexSuivant(plan: Plan, index: number): number | null {
  return etapeA(plan, index + 1) === null ? null : index + 1;
}

/**
 * L'index de l'étape précédente.
 *
 * Au tout début, il n'y a pas d'étape précédente : on rend 0, ce qui **rejoue**
 * la première. Rendre `null` obligerait chaque appelant à traiter un cas qui
 * n'a qu'une issue raisonnable.
 */
export function indexPrecedent(plan: Plan, index: number): number {
  return Math.max(0, index - 1);
}

/**
 * L'index de la première étape d'un verset, ou `null` s'il n'est pas au plan.
 *
 * Sert à rejoindre un verset depuis la page du moushaf — appuyer sur un verset
 * pour l'écouter. En mode « verset », c'est la première de ses répétitions ; en
 * mode « passage », c'est son rang dans le premier tour.
 */
export function indexDuVerset(plan: Plan, surah: number, ayah: number): number | null {
  const rang = plan.versets.findIndex((v) => v.surah === surah && v.ayah === ayah);
  if (rang < 0) return null;

  const nombre = plan.repetition.nombre;
  if (plan.repetition.mode === 'verset' && nombre !== null) return rang * nombre;
  return rang;
}

/**
 * Le plan ancré sur un autre verset, toutes choses égales.
 *
 * Sert au « suivant » et au « précédent » à l'infini en mode « verset » : là,
 * changer de verset ne consiste pas à changer d'étape — le verset se répète sans
 * fin — mais à **déplacer l'ancre**. Rendre `null` quand il n'y a plus de verset
 * dans cette direction laisse l'appelant décider s'il arrête ou s'il boucle.
 */
export function planAncreSur(plan: Plan, indexVerset: number): Plan | null {
  if (indexVerset < 0 || indexVerset >= plan.versets.length) return null;
  return { ...plan, ancre: indexVerset };
}
