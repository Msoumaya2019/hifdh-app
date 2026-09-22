// Les libellés français de la configuration.
//
// POURQUOI CE MODULE EXISTE
// -------------------------
// `getObjectiveLabel` a longtemps existé en deux copies, une sur l'accueil et
// une sur le profil. Les deux se terminaient par un `default:` qui rendait
// « Objectif ». Un objectif dont le `case` manquait n'était donc signalé nulle
// part : l'écran affichait un mot vague, et rien ne distinguait une valeur
// nouvelle d'une valeur inconnue.
//
// L'ajout des objectifs « petites sourates », « jusqu'à Yassine » et « la
// moitié du Coran » a transformé ce défaut latent en défaut réel : sans le
// `case` correspondant, choisir « la moitié du Coran » aurait affiché
// « Objectif » sur l'accueil. Deux copies à corriger, c'était deux occasions
// d'en oublier une.
//
// D'où ce module : une seule table, un `switch` sans `default` silencieux, et un
// test qui énumère les types **depuis les données** pour qu'un type ajouté sans
// libellé se voie tout de suite.

import type { LearningUnit, Objective, ObjectiveType } from '@/types';

/**
 * Ce qu'on lit à l'apprenant pour chaque objectif, à la troisième personne.
 *
 * Le questionnaire s'adresse à lui (« je souhaite apprendre… ») ; l'accueil et
 * le profil résument à son sujet. Ce sont deux textes, et c'est voulu : les
 * confondre donnerait un écran de configuration qui parle de quelqu'un d'autre.
 */
export function libelleObjectif(objective: Objective): string {
  switch (objective.type) {
    case 'short_surahs':
      return 'Les dix sourates les plus courtes';
    case 'juz_amma':
      return "Juz' 'Amma";
    case 'up_to_yassin':
      return 'Jusqu’à la sourate Yassine';
    case 'half_quran':
      return 'La moitié du Coran';
    case 'full_quran':
      return 'Tout le Coran';
    case 'hizb_sabbih':
      return 'Hizb Sabbih';
    case 'specific_juz':
      return `Juz' ${objective.juzNumber ?? '?'}`;
    case 'specific_hizb': {
      const numeros = objective.hizbNumbers ?? [];
      return numeros.length === 0 ? 'Hizb à choisir' : `Hizb ${numeros.join(', ')}`;
    }
    case 'custom':
      return 'Objectif personnalisé';
  }
}

/** Le rythme, dit en français. */
export function libelleRythme(unit: LearningUnit): string {
  switch (unit.type) {
    case 'verses':
      return `${unit.count} verset${unit.count > 1 ? 's' : ''}/jour`;
    case 'half_page':
      return 'Une demi-page/jour';
    case 'page':
      return `${unit.count} page${unit.count > 1 ? 's' : ''}/jour`;
    case 'thumn':
      return `${unit.count} toumoun/jour`;
    case 'rub':
      return `${unit.count} rub'/jour`;
    case 'nisf':
      return `${unit.count} nisf/jour`;
    case 'hizb':
      return `${unit.count} hizb/jour`;
  }
}

/**
 * Les libellés du questionnaire, ceux qui s'adressent à l'apprenant.
 *
 * Table séparée de `libelleObjectif` parce que le texte diffère, pas parce que
 * la liste diffère — et c'est justement la liste qui doit ne pas diverger.
 */
export const LIBELLES_QUESTIONNAIRE: Record<ObjectiveType, string> = {
  short_surahs: 'Je souhaite apprendre les petites sourates',  juz_amma: "Je souhaite apprendre le Juz' 'Amma",
  up_to_yassin: 'Je souhaite apprendre jusqu’à la sourate Yassine',
  half_quran: 'Je souhaite apprendre la moitié du Coran',
  full_quran: 'Je souhaite apprendre tout le Coran',
  hizb_sabbih: 'Je souhaite apprendre le Hizb Sabbih',
  specific_juz: "Je souhaite apprendre un juz' précis",
  specific_hizb: 'Je souhaite apprendre un ou plusieurs hizb',
  custom: 'Je souhaite un objectif personnalisé',
};

/**
 * L'ordre du questionnaire, du plus facile au plus difficile.
 *
 * Il est tenu par un test, et il est **mesuré** plutôt que supposé :
 *
 *   petites sourates (les dix plus courtes)   43 versets    5 pages
 *   Hizb Sabbih (hizb 60, sourates 87-114)   288 versets   14 pages
 *   Juzz 'Amma (sourates 78-114)             564 versets   23 pages
 *   jusqu'à la sourate Yassine              3788 versets  445 pages
 *   la moitié du Coran                      3118 versets  375 pages
 *   tout le Coran                           6236 versets  604 pages
 *
 * Deux remarques sur ce tableau, parce qu'elles sont des décisions et non des
 * évidences :
 *
 *   - « jusqu'à Yassine » vient **avant** « la moitié du Coran » tout en
 *     couvrant davantage. Yassin commence à 60 % du moushaf, donc aller jusqu'à
 *     Yassin inclut forcément la moitié. L'utilisateur a choisi de garder cet
 *     ordre en connaissance de cause ; il est donc figé tel quel, et un test
 *     vérifie même que le rapport de taille ne s'est pas inversé sans qu'on le
 *     sache.
 *   - « Hizb Sabbih » a été placé entre les petites sourates et Juzz 'Amma
 *     parce que sa taille l'y met : 288 versets. Le placer ailleurs rendrait
 *     l'ordre incohérent avec ce qu'il annonce.
 *
 * Exporté ici pour que le test puisse l'énumérer, et pour qu'il n'existe pas
 * deux ordres — celui de l'écran et celui qu'on croit avoir écrit.
 */
export const ORDRE_OBJECTIFS: ObjectiveType[] = [
  'short_surahs',
  'hizb_sabbih',
  'juz_amma',
  'up_to_yassin',
  'half_quran',
  'full_quran',
  'specific_juz',
  'specific_hizb',
  'custom',
];
