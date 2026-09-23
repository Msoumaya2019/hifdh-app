// Les répétitions : combien de fois, comment, et avec quelle pause.
//
// POURQUOI CE MODULE N'IMPORTE RIEN
// ---------------------------------
// « Combien de fois, et dans quel ordre » est une décision, et une décision se
// teste sans appareil. Ce module ne connaît donc ni Expo, ni React, ni la base :
// il reçoit ce qui vient du disque et rend une valeur sûre.
//
// DEUX MODES, ET LA DIFFÉRENCE EST DANS L'ORDRE
// --------------------------------------------
//   - **passage** : on récite le passage entier, puis on le reprend. C'est
//     l'écoute suivie, celle qui donne le fil ;
//   - **verset**  : on récite un verset plusieurs fois avant de passer au
//     suivant. C'est l'exercice de mémorisation, et c'est le mode par défaut.
//
// La différence n'est pas cosmétique : elle change l'ordre des étapes, donc ce
// que le compteur annonce et l'endroit où tombe la pause. Les deux ordres sont
// engendrés par `plan.ts`, et éprouvés un par un.
//
// L'INFINI N'EST PAS UN NOMBRE
// ----------------------------
// « Infini » vaut `null`, et non un grand nombre : un grand nombre aurait une
// fin, et le compteur annoncerait un total qui n'existe pas. Tout ce qui lit
// `nombre` doit donc traiter `null` — et le seul endroit qui le fait est
// `plan.ts`.
//
// LE NOMBRE VENU DU DISQUE N'EST PAS TYPÉ
// ---------------------------------------
// Ce qui revient du stockage peut être n'importe quoi : une version antérieure,
// une écriture interrompue, une main étrangère. Un `nombre` à `undefined`
// donnerait une séquence vide, et l'écran afficherait « 0 sur undefined ». Les
// trois champs sont donc relus et ramenés dans leurs bornes ici, et nulle part
// ailleurs.

/** Dans quel ordre les répétitions s'enchaînent. */
export type ModeRepetition = 'verset' | 'passage';

export interface Repetition {
  mode: ModeRepetition;
  /** Le nombre de répétitions, ou `null` pour l'infini. */
  nombre: number | null;
  /** La pause entre deux répétitions, en secondes. */
  pauseSecondes: number;
}

/** Les nombres offerts dans les réglages, avant « Personnalisé » et « Infini ». */
export const NOMBRES_REPETITION = [1, 2, 3, 5, 10] as const;

/** Les pauses offertes, en secondes. Zéro veut dire « enchaîner ». */
export const PAUSES_SECONDES = [0, 2, 5, 10] as const;

/**
 * Le plus grand nombre de répétitions accepté en saisie libre.
 *
 * Une borne, et non une règle de goût : sans elle, « 999999999 » ferait
 * engendrer une séquence dont le seul calcul figerait l'écran.
 */
export const REPETITION_MAX = 100;

/**
 * Le réglage par défaut.
 *
 * Mode « verset », trois fois, deux secondes : c'est l'exercice de mémorisation
 * courant, et c'est ce qu'un apprenant attend en ouvrant le lecteur pour la
 * première fois. Le mode « passage » reste à un appui.
 */
export const REPETITION_PAR_DEFAUT: Repetition = {
  mode: 'verset',
  nombre: 3,
  pauseSecondes: 2,
};

/** Vrai si la valeur désigne un mode connu. */
export function estModeRepetition(valeur: unknown): valeur is ModeRepetition {
  return valeur === 'verset' || valeur === 'passage';
}

/**
 * Vrai si la valeur peut être un nombre de répétitions : un nombre fini, ou
 * `null` pour l'infini.
 *
 * CETTE FONCTION EXISTE À CAUSE D'UN DÉFAUT MESURÉ. La première écriture de
 * `lireRepetition` passait la valeur du disque directement à `nombreBorne`, qui
 * rend `null` sur tout ce qui n'est pas un nombre. Un réglage corrompu — la
 * chaîne « trois », un objet, un `undefined` — devenait donc **l'infini**, et la
 * récitation ne s'arrêtait plus. Un réglage illisible doit retomber sur le
 * défaut, pas sur la valeur la plus extrême.
 */
export function estNombreDeRepetitions(valeur: unknown): valeur is number | null {
  if (valeur === null) return true;
  return typeof valeur === 'number' && Number.isFinite(valeur);
}

/**
 * Ramène un nombre de répétitions dans ses bornes.
 *
 * `null` est conservé : c'est l'infini, et non une valeur manquante. Une valeur
 * non finie est ramenée à la borne **haute** et non à l'infini — l'infini est un
 * réglage que l'utilisateur pose, jamais un accident de lecture.
 */
export function nombreBorne(valeur: number | null): number | null {
  if (valeur === null) return null;
  if (!Number.isFinite(valeur)) return REPETITION_MAX;
  const entier = Math.round(valeur);
  if (entier < 1) return 1;
  if (entier > REPETITION_MAX) return REPETITION_MAX;
  return entier;
}

/** Ramène une pause dans la liste offerte. Une valeur inconnue vaut le défaut. */
export function pauseBornee(valeur: unknown): number {
  if (typeof valeur === 'number' && PAUSES_SECONDES.includes(valeur as never)) {
    return valeur;
  }
  return REPETITION_PAR_DEFAUT.pauseSecondes;
}

/**
 * Le réglage relu du disque, toujours utilisable.
 *
 * Chaque champ est vérifié séparément : un mode valide avec un nombre cassé doit
 * garder son mode, et non retomber entièrement sur le défaut — sans quoi un
 * réglage à moitié lisible serait entièrement perdu, et l'utilisateur ne
 * comprendrait pas pourquoi.
 */
export function lireRepetition(brut: unknown): Repetition {
  const source = (brut ?? {}) as Partial<Repetition>;
  return {
    mode: estModeRepetition(source.mode) ? source.mode : REPETITION_PAR_DEFAUT.mode,
    // L'infini se garde, un réglage illisible retombe sur le défaut. Les deux
    // sont distingués par `estNombreDeRepetitions` : confondre « null » et
    // « illisible » transformerait un réglage cassé en récitation sans fin.
    nombre: estNombreDeRepetitions(source.nombre)
      ? nombreBorne(source.nombre)
      : REPETITION_PAR_DEFAUT.nombre,
    pauseSecondes: pauseBornee(source.pauseSecondes),
  };
}

/** Le libellé français d'un nombre de répétitions. */
export function libelleNombre(nombre: number | null): string {
  if (nombre === null) return 'Infini';
  return nombre === 1 ? '1 fois' : `${nombre} fois`;
}

/** Le libellé français d'une pause. */
export function libellePause(secondes: number): string {
  return secondes === 0 ? 'Sans pause' : `${secondes} s`;
}

/** Le libellé français d'un mode. */
export function libelleMode(mode: ModeRepetition): string {
  return mode === 'verset' ? 'Répéter chaque verset' : 'Répéter tout le passage';
}

/**
 * Ce qu'annonce le compteur pendant la récitation.
 *
 * En mode « verset », le total est celui des répétitions DU VERSET en cours ; en
 * mode « passage », celui des répétitions DU PASSAGE. Dans les deux cas, la
 * phrase est la même — « Répétition 2 sur 5 » —, et c'est voulu : l'utilisateur
 * n'a pas à savoir laquelle des deux il regarde, il voit où il en est.
 *
 * À l'infini, le total disparaît : « Répétition 3 ». Annoncer « 3 sur ∞ » serait
 * une phrase que personne ne lit comme un nombre.
 */
export function libelleCompteur(numero: number, total: number | null): string {
  return total === null
    ? `Répétition ${numero}`
    : `Répétition ${numero} sur ${total}`;
}
