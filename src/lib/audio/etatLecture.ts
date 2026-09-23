// L'état du lecteur : ce qui se passe sur chaque geste.
//
// POURQUOI UNE MACHINE À ÉTATS, ET POURQUOI ELLE EST PURE
// -------------------------------------------------------
// « Que se passe-t-il quand on appuie sur suivant pendant une pause ? », « et si
// le fichier se termine pendant qu'on change de récitateur ? » — ce sont des
// décisions, et elles sont nombreuses. Écrites dans le composant, elles
// finiraient en une cascade de `useState` dont personne ne saurait dire l'état
// possible, et le moindre cas oublié se manifesterait par deux voix en même
// temps ou par un écran figé.
//
// Ici, tout est dans une fonction pure : un état et une action entrent, un état
// sort. Chaque transition se lit, et se teste sans appareil.
//
// LES SIX ÉTATS, ET CE QU'ILS VEULENT DIRE
// -----------------------------------------
//   - `arret`     : rien ne joue, et rien n'est chargé. C'est l'état de repos ;
//   - `chargement`: le fichier de l'étape courante est en train d'arriver ;
//   - `lecture`   : il joue ;
//   - `pause`     : il est suspendu, à la position où l'utilisateur l'a laissé ;
//   - `attente`   : la pause entre deux répétitions court. C'est un état À PART,
//     et non une pause ordinaire : l'utilisateur n'a rien demandé, et appuyer
//     sur « lecture » doit reprendre tout de suite plutôt que de subir la fin de
//     l'attente ;
//   - `erreur`    : le fichier de l'étape n'a pas pu être joué. L'étape est
//     conservée, pour qu'on puisse réessayer sans avoir perdu sa place.
//
// LE CHANGEMENT DE RÉCITATEUR NE MÉLANGE PAS
// ------------------------------------------
// La spécification interdit de mélanger deux récitations dans une même écoute.
// Changer de récitateur en cours de lecture **arrête le fichier en cours** et
// rejoue l'étape courante avec le nouveau — le plan et la position sont
// conservés. Ouvrir une séance neuve ferait perdre sa place à l'utilisateur pour
// un réglage qu'il vient de changer.
//
// LA FIN D'UNE PISTE N'EST PAS TOUJOURS LA FIN DE LA SÉANCE
// ----------------------------------------------------------
// Trois cas, et un seul est un arrêt :
//   - il reste une étape, et une pause est réglée → `attente` ;
//   - il reste une étape, et aucune pause n'est réglée → l'étape suivante ;
//   - il ne reste rien → `arret`. C'est l'auto-stop de la spécification.

import {
  type Plan,
  type RefVerset,
  type Etape,
  aUnePauseApres,
  construirePlan,
  etapeA,
  indexDuVerset,
  indexPrecedent,
  indexSuivant,
  planAncreSur,
} from './plan';
import type { Repetition } from './repetitions';

/** Les vitesses offertes. Le ralenti sert à suivre un maître difficile. */
export const VITESSES = [0.75, 1, 1.25] as const;

/** La vitesse par défaut, et la seule à laquelle une récitation est intacte. */
export const VITESSE_PAR_DEFAUT = 1;

/**
 * Vrai si la valeur est une des vitesses offertes.
 *
 * Ce prédicat existe séparément de `vitesseBornee` parce que les deux usages ne
 * veulent pas la même chose : **lire un réglage** enregistré peut légitimement
 * retomber sur 1×, mais **refuser un geste** ne doit rien changer du tout.
 * Confondus, une vitesse refusée ramenait la lecture à 1× — c'est-à-dire
 * l'accélérait sans que l'utilisateur ait rien demandé.
 */
export function estVitesse(valeur: unknown): valeur is number {
  if (typeof valeur !== 'number') return false;
  return (VITESSES as readonly number[]).includes(valeur);
}

/** Ramène une vitesse dans la liste offerte. Une valeur inconnue vaut 1. */
export function vitesseBornee(valeur: unknown): number {
  return estVitesse(valeur) ? valeur : VITESSE_PAR_DEFAUT;
}

/** Le libellé français d'une vitesse. */
export function libelleVitesse(vitesse: number): string {
  return `${vitesse}×`;
}

export type StatutLecture =
  | 'arret'
  | 'chargement'
  | 'lecture'
  | 'pause'
  | 'attente'
  | 'erreur';

export interface EtatLecture {
  statut: StatutLecture;
  /** Le plan en cours, ou `null` quand rien n'est ouvert. */
  plan: Plan | null;
  /** Le rang de l'étape courante dans le plan. */
  index: number;
  /** L'identifiant du récitateur choisi pour la séance. */
  recitateurId: string;
  vitesse: number;
  /** Vrai si la page du moushaf suit le verset récité. */
  suiviAuto: boolean;
  /** Le message d'erreur de la dernière étape qui a échoué, ou `null`. */
  erreur: string | null;
}

export type ActionLecture =
  | { type: 'ouvrir'; versets: RefVerset[]; repetition: Repetition }
  | { type: 'pretAJouer' }
  | { type: 'pause' }
  | { type: 'reprendre' }
  | { type: 'arreter' }
  | { type: 'suivante' }
  | { type: 'precedente' }
  | { type: 'recommencer' }
  | { type: 'finDePiste' }
  | { type: 'finDAttente' }
  | { type: 'changerRecitateur'; id: string }
  | { type: 'changerRepetition'; repetition: Repetition }
  | { type: 'changerVitesse'; vitesse: number }
  | { type: 'basculerSuivi' }
  | { type: 'rejoindre'; surah: number; ayah: number }
  | { type: 'echec'; message: string };

export function etatInitialLecture(recitateurId: string): EtatLecture {
  return {
    statut: 'arret',
    plan: null,
    index: 0,
    recitateurId,
    vitesse: VITESSE_PAR_DEFAUT,
    suiviAuto: true,
    erreur: null,
  };
}

/** L'étape en cours, ou `null` si rien n'est ouvert ou si le plan est achevé. */
export function etapeCourante(etat: EtatLecture): Etape | null {
  if (etat.plan === null) return null;
  return etapeA(etat.plan, etat.index);
}

/**
 * Le verset qu'on est en train de réciter, ou `null` quand rien ne joue.
 *
 * C'est la SEULE source du surlignage sur la page du moushaf, et c'est ce qui
 * fait la différence entre un suivi véritable et un minuteur : le verset est
 * celui de l'étape courante, donc celui du fichier audio qui joue, et non un
 * verset estimé d'après une durée écoulée.
 *
 * Le verset est rendu dans quatre des cinq états :
 *   - `arret` : `null`. Rien ne joue, et rien ne doit être surligné ;
 *   - `chargement` : rendu. C'est le verset qui arrive, et le montrer pendant
 *     le chargement évite que la bande saute d'un verset à l'autre ;
 *   - `lecture`, `pause`, `attente` : rendu, inchangé. C'est ce qui fait que la
 *     bande ne bouge pas quand on met en pause ;
 *   - `erreur` : rendu. L'étape est conservée pour qu'on puisse réessayer — le
 *     surlignage doit l'être aussi, sans quoi l'écran dirait qu'on a perdu sa
 *     place alors que le bouton « réessayer » la rejoue.
 */
export function versetActif(etat: EtatLecture): RefVerset | null {
  if (etat.statut === 'arret') return null;
  const etape = etapeCourante(etat);
  if (etape === null) return null;
  return { surah: etape.surah, ayah: etape.ayah };
}

/**
 * L'état qui consiste à aller à l'étape `index`.
 *
 * Rend l'état d'arrêt quand l'index n'existe pas : c'est l'auto-stop, et il n'a
 * qu'un seul chemin — celui-ci. Le laisser à chaque appelant ferait écrire trois
 * fois la même condition, et l'un des trois l'oublierait.
 */
function allerA(etat: EtatLecture, index: number): EtatLecture {
  if (etat.plan === null) return { ...etat, statut: 'arret', index: 0 };
  if (etapeA(etat.plan, index) === null) {
    return { ...etat, statut: 'arret', index: 0, erreur: null };
  }
  return { ...etat, statut: 'chargement', index, erreur: null };
}

/**
 * « Suivant » : l'étape d'après, ou l'arrêt.
 *
 * À l'infini en mode « verset », le verset ne change pas d'étape — il se répète
 * sans fin : c'est l'ANCRE qu'il faut déplacer. Sans ce cas, « suivant » ne
 * ferait rien du tout, et l'utilisateur resterait bloqué sur un verset.
 */
function avancer(etat: EtatLecture): EtatLecture {
  if (etat.plan === null) return etat;

  const { plan } = etat;
  if (plan.repetition.mode === 'verset' && plan.repetition.nombre === null) {
    const deplace = planAncreSur(plan, plan.ancre + 1);
    if (deplace === null) return { ...etat, statut: 'arret', index: 0, erreur: null };
    return { ...etat, plan: deplace, statut: 'chargement', index: 0, erreur: null };
  }

  const suivant = indexSuivant(plan, etat.index);
  if (suivant === null) return { ...etat, statut: 'arret', index: 0, erreur: null };
  return allerA(etat, suivant);
}

/** « Précédent » : l'étape d'avant, ou la reprise de la première. */
function reculer(etat: EtatLecture): EtatLecture {
  if (etat.plan === null) return etat;

  const { plan } = etat;
  if (plan.repetition.mode === 'verset' && plan.repetition.nombre === null) {
    const deplace = planAncreSur(plan, plan.ancre - 1);
    if (deplace === null) return { ...etat, statut: 'chargement', index: 0 };
    return { ...etat, plan: deplace, statut: 'chargement', index: 0, erreur: null };
  }

  return allerA(etat, indexPrecedent(plan, etat.index));
}

export function reducerLecture(etat: EtatLecture, action: ActionLecture): EtatLecture {
  switch (action.type) {
    case 'ouvrir': {
      const plan = construirePlan(action.versets, action.repetition, 0);
      if (plan.versets.length === 0) {
        return { ...etat, plan: null, index: 0, statut: 'arret', erreur: null };
      }
      return { ...etat, plan, index: 0, statut: 'chargement', erreur: null };
    }

    case 'pretAJouer':
      // Une réponse de chargement arrivée après un arrêt ne doit pas relancer
      // la lecture : c'est le verrou de séance, côté état.
      if (etat.plan === null) return etat;
      if (etat.statut !== 'chargement') return etat;
      return { ...etat, statut: 'lecture', erreur: null };

    case 'pause':
      // Une pause pendant l'attente n'a pas de sens : il n'y a rien à suspendre.
      if (etat.statut !== 'lecture' && etat.statut !== 'chargement') return etat;
      return { ...etat, statut: 'pause' };

    case 'reprendre':
      if (etat.statut !== 'pause' && etat.statut !== 'attente') return etat;
      return { ...etat, statut: 'chargement' };

    case 'arreter':
      return { ...etat, statut: 'arret', plan: null, index: 0, erreur: null };

    case 'suivante':
      return avancer(etat);

    case 'precedente':
      return reculer(etat);

    case 'recommencer':
      // Rejouer l'étape courante depuis son début. L'index ne bouge pas.
      if (etat.plan === null) return etat;
      return { ...etat, statut: 'chargement', erreur: null };

    case 'finDePiste': {
      if (etat.plan === null) return etat;

      // À l'infini en mode « verset », la piste qui se termine est une
      // répétition du verset ancré : il n'y a pas d'étape suivante, et la
      // séquence se poursuit — sauf si une pause est réglée, auquel cas elle
      // court avant la reprise.
      const infiniParVerset =
        etat.plan.repetition.mode === 'verset' && etat.plan.repetition.nombre === null;
      if (infiniParVerset) {
        return etat.plan.repetition.pauseSecondes > 0
          ? { ...etat, statut: 'attente' }
          : { ...etat, statut: 'chargement' };
      }

      const suivant = indexSuivant(etat.plan, etat.index);
      if (suivant === null) {
        // Fin du plan : c'est l'auto-stop.
        return { ...etat, statut: 'arret', index: 0, erreur: null };
      }
      if (aUnePauseApres(etat.plan, etat.index)) {
        return { ...etat, statut: 'attente' };
      }
      return allerA(etat, suivant);
    }

    case 'finDAttente': {
      if (etat.statut !== 'attente' || etat.plan === null) return etat;

      const infiniParVerset =
        etat.plan.repetition.mode === 'verset' && etat.plan.repetition.nombre === null;
      if (infiniParVerset) return { ...etat, statut: 'chargement' };

      const suivant = indexSuivant(etat.plan, etat.index);
      if (suivant === null) return { ...etat, statut: 'arret', index: 0, erreur: null };
      return allerA(etat, suivant);
    }

    case 'changerRecitateur': {
      if (etat.recitateurId === action.id) return etat;
      const change = { ...etat, recitateurId: action.id, erreur: null };
      // Rien n'est ouvert : le choix est enregistré, et rien de plus.
      if (etat.plan === null || etat.statut === 'arret') return change;
      // Une séance est en cours : le fichier en cours est arrêté, et l'étape
      // courante rejouée avec le nouveau récitateur. La position est gardée.
      return { ...change, statut: 'chargement' };
    }

    case 'changerRepetition': {
      if (etat.plan === null) return { ...etat, plan: null };
      const courante = etapeCourante(etat);
      const plan = construirePlan(etat.plan.versets, action.repetition, etat.plan.ancre);
      // On garde le verset, et non le rang de l'étape : changer de mode
      // réordonne la séquence, donc le même rang désignerait un autre verset.
      const index =
        courante === null ? 0 : (indexDuVerset(plan, courante.surah, courante.ayah) ?? 0);
      if (etapeA(plan, index) === null) return { ...etat, plan, index: 0, statut: 'arret' };
      return { ...etat, plan, index, statut: 'chargement', erreur: null };
    }

    case 'changerVitesse':
      // Une vitesse refusée ne touche à rien : passer par `vitesseBornee` ici
      // ramènerait la lecture à 1×, et l'utilisateur verrait sa vitesse changer
      // alors qu'il a demandé une valeur que l'application n'offre pas.
      if (!estVitesse(action.vitesse)) return etat;
      return { ...etat, vitesse: action.vitesse };

    case 'basculerSuivi':
      return { ...etat, suiviAuto: !etat.suiviAuto };

    case 'rejoindre': {
      if (etat.plan === null) return etat;
      const index = indexDuVerset(etat.plan, action.surah, action.ayah);
      if (index === null) return etat;
      return allerA(etat, index);
    }

    case 'echec':
      // L'étape est CONSERVÉE : sans cela, une panne de réseau ferait perdre sa
      // place à l'utilisateur, et il ne pourrait plus réessayer.
      return { ...etat, statut: 'erreur', erreur: action.message };

    default:
      return etat;
  }
}
