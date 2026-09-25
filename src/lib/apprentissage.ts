// Les réglages d'apprentissage, tels qu'ils s'enregistrent.
//
// POURQUOI CE MODULE EXISTE, ET PAS UNE ÉCRITURE DANS L'ÉCRAN
// ----------------------------------------------------------
// `saveUserConfig` remplace la ligne ENTIÈRE. Écrire depuis un écran un objet
// partiel effacerait l'objectif, l'agenda et les passages mémorisés — un
// interrupteur de révision qui efface la progression. Le module relit donc la
// configuration juste avant d'écrire, comme `enregistrerReglagesAudio` le fait
// pour l'audio, et pour la même raison.
//
// ABSENT VAUT ACTIF, ET C'EST LA RÈGLE LA PLUS FACILE À PERDRE
// -----------------------------------------------------------
// La configuration déjà enregistrée chez ceux qui utilisent l'application n'a
// pas ce champ. La lire comme « désactivé » éteindrait la révision de tout le
// monde à la mise à jour, et l'apprenant croirait avoir perdu ses passages.
// C'est donc `!== false` qu'il faut lire, et `revisionsActives` est le SEUL
// endroit où cette règle s'écrit : recopiée dans un écran, elle y serait
// inversée un jour sans que rien ne le dise.

import { getUserConfig, saveUserConfig } from '@/lib/database';
import type { UserConfig } from '@/types';

/**
 * La révision espacée est-elle active ?
 *
 * `null` — pas de configuration lue — vaut actif : une configuration absente
 * n'est pas un refus, c'est une absence, et les deux ne se traitent pas pareil.
 */
export function revisionsActives(config: UserConfig | null): boolean {
  return config?.apprentissage?.revisions !== false;
}

/**
 * Enregistre le réglage de révision, sans toucher au reste de la configuration.
 *
 * Sans configuration enregistrée, il n'y a rien à régler : la personne n'a pas
 * encore passé le questionnaire, et écrire ici une configuration par défaut
 * déciderait à sa place d'un objectif et d'un rythme.
 *
 * ELLE REND CE QU'ELLE A FAIT, ET C'EST VOULU. Ne rien écrire en silence ferait
 * revenir l'interrupteur tout seul au prochain rendu — l'écran croirait le
 * réglage enregistré et le remettrait sur la valeur stockée, sans un mot. Un
 * `false` permet à l'écran de le DIRE. L'appelant qui l'ignore ne casse rien :
 * il retrouve le comportement d'avant.
 */
export async function enregistrerRevisions(actif: boolean): Promise<boolean> {
  const existante = await getUserConfig();
  if (existante === null) return false;

  await saveUserConfig({
    ...existante,
    apprentissage: { ...existante.apprentissage, revisions: actif },
  });
  return true;
}
