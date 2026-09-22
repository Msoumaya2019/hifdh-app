// Sauvegarde en ligne : le point d'entrée utilisé par les écrans.
//
// Ce module relie les trois pièces : le compte connecté, l'appareil, le cloud.
// Il ne prend aucune décision de fond — celles-ci vivent dans
// `synchronisation.ts`, où elles sont éprouvées sans réseau.

import { utilisateurCourant } from '@/lib/auth';
import { getClientDonnees } from '@/lib/supabase';

import { creerDepotDistant, creerDepotLocal } from './adaptateurs';
import type { ResultatSauvegarde } from './synchronisation';
import { restaurer, sauvegarder } from './synchronisation';

export type ResultatService =
  | ResultatSauvegarde
  | { statut: 'indisponible'; message: string };

const MESSAGE_INDISPONIBLE =
  "La sauvegarde en ligne n'est pas configurée sur cette version de l'application. " +
  'Votre progression reste enregistrée sur cet appareil.';

/** Envoie la progression de cet appareil vers le compte connecté. */
export async function sauvegarderMaintenant(): Promise<ResultatService> {
  const client = getClientDonnees();
  if (client === null) return { statut: 'indisponible', message: MESSAGE_INDISPONIBLE };

  const utilisateur = await utilisateurCourant();
  if (utilisateur === null) {
    return {
      statut: 'refuse',
      raison: 'non_authentifie',
      message: 'Connectez-vous pour sauvegarder votre progression.',
    };
  }

  return sauvegarder({
    local: creerDepotLocal(),
    distant: creerDepotDistant(client, utilisateur.id),
    utilisateurId: utilisateur.id,
  });
}

/**
 * Remplace la progression de cet appareil par celle du compte.
 *
 * `confirmerEcrasement` doit venir d'une confirmation explicite : sans elle, la
 * progression locale n'est jamais remplacée.
 */
export async function restaurerDepuisCloud(
  confirmerEcrasement = false
): Promise<ResultatService> {
  const client = getClientDonnees();
  if (client === null) return { statut: 'indisponible', message: MESSAGE_INDISPONIBLE };

  const utilisateur = await utilisateurCourant();
  if (utilisateur === null) {
    return {
      statut: 'refuse',
      raison: 'non_authentifie',
      message: 'Connectez-vous pour restaurer votre progression.',
    };
  }

  return restaurer({
    local: creerDepotLocal(),
    distant: creerDepotDistant(client, utilisateur.id),
    utilisateurId: utilisateur.id,
    confirmerEcrasement,
  });
}
