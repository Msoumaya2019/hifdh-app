// Sauvegarde et restauration.
//
// Deux sens, deux gestes distincts :
//   - **sauvegarder** envoie l'état local vers le cloud ;
//   - **restaurer** remplace l'état local par celui du cloud.
//
// Le second est destructeur. Il est donc protégé par des refus explicites
// plutôt que par une confiance dans l'appelant : sans compte, on ne sauvegarde
// pas ; avec un local déjà rempli, on ne restaure pas sans confirmation ; avec
// une charge illisible, on n'écrit rien du tout.
//
// Ce module ne connaît ni SQLite ni Supabase : il ne parle qu'à deux
// interfaces. C'est ce qui permet de le mettre à l'épreuve avec des dépôts en
// mémoire, et de prouver les refus au lieu de les supposer.

import type { PartiesSnapshot, Snapshot } from './snapshot';
import { compter, construireSnapshot, estVide, validerSnapshot } from './snapshot';

/** Ce que la sauvegarde lit et écrit sur l'appareil. */
export interface DepotLocal {
  /** Vrai si l'appareil ne porte encore aucune donnée personnelle. */
  estVide(): Promise<boolean>;
  lire(): Promise<PartiesSnapshot>;
  /** Remplace intégralement l'état local par l'instantané fourni. */
  ecrire(snapshot: Snapshot): Promise<void>;
}

/**
 * Ce que la sauvegarde lit et écrit à distance.
 *
 * `lire` rend `unknown`, et non un `Snapshot` : la charge vient du réseau, donc
 * elle n'est pas fiable. Le type le dit, et la validation le vérifie. La
 * déclarer `Snapshot` laisserait croire qu'elle est déjà conforme.
 */
export interface DepotDistant {
  lire(): Promise<unknown | null>;
  ecrire(snapshot: Snapshot): Promise<void>;
}

export type RaisonRefus =
  | 'non_authentifie'
  | 'local_vide'
  | 'distant_vide'
  | 'ecrasement_non_confirme'
  | 'instantane_invalide';

export interface Comptes {
  passages: number;
  seances: number;
  revisions: number;
}

export type ResultatSauvegarde =
  | { statut: 'reussi'; message: string; comptes: Comptes; updatedAt: string }
  | { statut: 'refuse'; raison: RaisonRefus; message: string; problemes?: string[] };

export interface OptionsSauvegarde {
  local: DepotLocal;
  distant: DepotDistant;
  /** Identifiant du compte connecté, ou `null` si personne ne l'est. */
  utilisateurId: string | null;
  /** Injectable pour rendre l'horodatage déterministe dans les tests. */
  maintenant?: Date;
}

export interface OptionsRestauration extends OptionsSauvegarde {
  /**
   * Autorise le remplacement de données locales déjà présentes.
   *
   * Doit venir d'une confirmation de l'utilisateur, jamais d'un défaut.
   */
  confirmerEcrasement?: boolean;
}

function refus(raison: RaisonRefus, message: string, problemes?: string[]): ResultatSauvegarde {
  return problemes === undefined
    ? { statut: 'refuse', raison, message }
    : { statut: 'refuse', raison, message, problemes };
}

/**
 * Envoie l'état local vers le cloud.
 *
 * Refuse quand l'appareil est vide : ce n'est pas « rien à faire », c'est le
 * geste qui effacerait une sauvegarde existante si on l'acceptait.
 */
export async function sauvegarder(options: OptionsSauvegarde): Promise<ResultatSauvegarde> {
  const { local, distant, utilisateurId, maintenant } = options;

  if (utilisateurId === null || utilisateurId.trim() === '') {
    return refus(
      'non_authentifie',
      'Connectez-vous pour sauvegarder votre progression dans le cloud.'
    );
  }

  const snapshot = construireSnapshot(await local.lire(), maintenant);

  if (estVide(snapshot)) {
    return refus(
      'local_vide',
      "Cet appareil ne contient encore aucune donnée à sauvegarder. Terminez d'abord votre questionnaire."
    );
  }

  await distant.ecrire(snapshot);

  return {
    statut: 'reussi',
    message: 'Progression sauvegardée.',
    comptes: compter(snapshot),
    updatedAt: snapshot.updatedAt,
  };
}

/**
 * Remplace l'état local par la sauvegarde du cloud.
 *
 * C'est l'opération qui permet de retrouver programme et statistiques sur un
 * nouveau téléphone.
 */
export async function restaurer(options: OptionsRestauration): Promise<ResultatSauvegarde> {
  const { local, distant, utilisateurId, confirmerEcrasement = false } = options;

  if (utilisateurId === null || utilisateurId.trim() === '') {
    return refus(
      'non_authentifie',
      'Connectez-vous pour restaurer votre progression depuis le cloud.'
    );
  }

  const brut = await distant.lire();

  if (brut === null || brut === undefined) {
    return refus(
      'distant_vide',
      'Aucune sauvegarde trouvée pour ce compte. Sauvegardez depuis un appareil qui contient déjà votre progression.'
    );
  }

  // Validation avant toute écriture : une charge abîmée ne doit pas atteindre
  // la base locale.
  const validation = validerSnapshot(brut);
  if (!validation.ok) {
    return refus(
      'instantane_invalide',
      'La sauvegarde trouvée est illisible et n’a pas été appliquée.',
      validation.problemes
    );
  }

  if (estVide(validation.snapshot)) {
    return refus(
      'distant_vide',
      'La sauvegarde trouvée est vide. Rien n’a été modifié sur cet appareil.'
    );
  }

  if (!confirmerEcrasement && !(await local.estVide())) {
    return refus(
      'ecrasement_non_confirme',
      'Cet appareil contient déjà une progression. Restaurer la remplacerait définitivement.'
    );
  }

  await local.ecrire(validation.snapshot);

  return {
    statut: 'reussi',
    message: 'Progression restaurée depuis le cloud.',
    comptes: compter(validation.snapshot),
    updatedAt: validation.snapshot.updatedAt,
  };
}
