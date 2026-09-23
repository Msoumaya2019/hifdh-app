// Les réglages du lecteur audio, conservés avec le reste de la configuration.
//
// POURQUOI DANS `UserConfig`, ET NON DANS UN STOCKAGE À PART
// ---------------------------------------------------------
// Le récitateur, la vitesse et le nombre de répétitions voyagent avec la
// sauvegarde : les retrouver à chaque ouverture serait un réglage qu'on refait
// sans cesse. Et surtout, ils se **réinitialisent** avec le reste — une remise à
// zéro qui laisserait le récitateur choisi serait une remise à zéro incomplète.
//
// CE QUI EST ÉCRIT N'EST PAS CE QUI EST LU
// ----------------------------------------
// L'écriture prend un réglage déjà propre ; la lecture, elle, reçoit ce que le
// disque a bien voulu rendre et le ramène dans ses bornes. Les deux chemins
// passent par `recitateurParId`, `lireRepetition` et `vitesseBornee`, qui ne
// rendent jamais `undefined` : l'écran n'a donc aucun cas « réglage absent » à
// traiter, et un réglage corrompu ne peut pas laisser le lecteur sans voix.

import { getUserConfig, saveUserConfig } from '@/lib/database';
import type { UserConfig } from '@/types';
import { recitateurParId, type Recitateur } from './recitateurs';
import { lireRepetition, REPETITION_PAR_DEFAUT, type Repetition } from './repetitions';
import { vitesseBornee, VITESSE_PAR_DEFAUT } from './etatLecture';

export interface ReglagesLus {
  recitateur: Recitateur;
  vitesse: number;
  repetition: Repetition;
}

/**
 * Les réglages du disque, toujours utilisables.
 *
 * Ne lève jamais : sans configuration enregistrée — c'est le cas d'une
 * installation neuve —, les trois valeurs par défaut sont rendues.
 */
export async function lireReglagesAudio(): Promise<ReglagesLus> {
  let config: UserConfig | null = null;
  try {
    config = await getUserConfig();
  } catch {
    // Une base illisible ne doit pas empêcher d'écouter : on rend les défauts.
    config = null;
  }
  const audio = config?.audio;
  return {
    recitateur: recitateurParId(audio?.recitateurId),
    vitesse: vitesseBornee(audio?.vitesse),
    repetition: lireRepetition(audio?.repetition),
  };
}

/**
 * Enregistre un réglage, sans toucher aux autres champs de la configuration.
 *
 * La relecture est faite juste avant l'écriture, et c'est délibéré :
 * `saveUserConfig` remplace la ligne entière. Écrire un objet partiel effacerait
 * l'objectif, l'agenda et les passages mémorisés — un réglage de volume qui
 * efface la progression de l'utilisateur.
 */
export async function enregistrerReglagesAudio(
  partiel: Partial<{ recitateurId: string; vitesse: number; repetition: Repetition }>
): Promise<void> {
  const existante = await getUserConfig();
  const base: UserConfig = existante ?? {
    memorizedPassages: [],
    objective: { type: 'juz_amma' },
    schedule: { unit: { type: 'verses', count: 3 }, days: [1, 2, 3, 4, 5, 6, 0] },
    onboardingCompleted: false,
  };
  const audio = { ...(base.audio ?? {}) };
  if (partiel.recitateurId !== undefined) audio.recitateurId = partiel.recitateurId;
  if (partiel.vitesse !== undefined) audio.vitesse = vitesseBornee(partiel.vitesse);
  if (partiel.repetition !== undefined) {
    audio.repetition = {
      mode: partiel.repetition.mode,
      nombre: partiel.repetition.nombre,
      pauseSecondes: partiel.repetition.pauseSecondes,
    };
  }
  await saveUserConfig({ ...base, audio });
}

/** Les réglages par défaut, pour l'écran qui n'en a pas encore. */
export const REGLAGES_PAR_DEFAUT: ReglagesLus = {
  recitateur: recitateurParId(undefined),
  vitesse: VITESSE_PAR_DEFAUT,
  repetition: REPETITION_PAR_DEFAUT,
};
