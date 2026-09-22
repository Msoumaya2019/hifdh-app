// Charger, page par page, la police du moushaf de Madine.
//
// POURQUOI PAGE PAR PAGE
// ----------------------
// Les 604 polices pèsent 92 Mo. Les déclarer toutes ne coûte rien au
// démarrage — ce ne sont que des chemins, et Metro les recopie telles quelles
// dans l'application — mais les *charger* toutes tiendrait 92 Mo en mémoire
// pour afficher quinze lignes. On ne charge donc que la page qu'on regarde, et
// l'application reste utilisable pendant que la police arrive : le lecteur
// affiche le texte de Tanzil en Amiri tant qu'elle n'est pas là.
//
// CE QU'UNE POLICE DE PAGE DESSINE
// --------------------------------
// Pas des lettres : des **mots**. Chaque mot du moushaf y est un seul point de
// code, dans une zone privée, et le tracé est celui du calligraphe. C'est ce
// qui permet à la page de l'application d'être la page imprimée, et non une
// composition approchante.

import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';

import { POLICES_DES_PAGES } from '@/data/policesPages';

/** Le nom sous lequel la police d'une page est enregistrée. */
export function nomDeFamille(page: number): string {
  return `moushaf-page-${page}`;
}

const chargees = new Set<number>();
const enCours = new Map<number, Promise<string | null>>();

/**
 * Charger la police d'une page, et rendre le nom de sa famille.
 *
 * Rend `null` si la page n'a pas de police ou si le chargement échoue : le
 * lecteur s'en sert pour retomber sur le texte de Tanzil plutôt que d'afficher
 * une page vide.
 *
 * Deux appels pour la même page ne téléchargent qu'une fois : le second attend
 * la promesse du premier.
 */
export async function chargerPoliceDePage(page: number): Promise<string | null> {
  const moduleId = POLICES_DES_PAGES[page];
  if (moduleId === undefined) return null;
  if (chargees.has(page)) return nomDeFamille(page);

  const deja = enCours.get(page);
  if (deja !== undefined) return deja;

  const promesse = (async (): Promise<string | null> => {
    try {
      const actif = Asset.fromModule(moduleId);
      if (!actif.downloaded) await actif.downloadAsync();
      const uri = actif.localUri ?? actif.uri;
      if (!uri) return null;
      await Font.loadAsync({ [nomDeFamille(page)]: { uri } });
      chargees.add(page);
      return nomDeFamille(page);
    } catch {
      // Une police absente ne doit pas faire disparaître la page : l'appelant
      // retombe sur le texte.
      return null;
    } finally {
      enCours.delete(page);
    }
  })();

  enCours.set(page, promesse);
  return promesse;
}

/** Vrai si la police de cette page est déjà chargée. */
export function policeChargee(page: number): boolean {
  return chargees.has(page);
}

export interface EtatPolices {
  /** Le nom de famille de chaque page demandée, dès qu'elle est chargée. */
  familles: Record<number, string | null>;
  /** Vrai tant qu'au moins une police demandée n'est ni chargée ni en échec. */
  chargement: boolean;
  /** Vrai si au moins une police n'a pas pu être chargée. */
  echec: boolean;
}

/**
 * Charger les polices de plusieurs pages, et suivre leur arrivée.
 *
 * Deux pages à la fois au plus : celle qu'on regarde, et la page 1 quand la
 * page regardée porte une basmala — la basmala n'est dessinée que par la police
 * de la page 1, quelle que soit la page où elle s'imprime.
 *
 * Le changement de page est le cas courant : on ne rapporte jamais l'état d'une
 * page sur une autre. Tant qu'une police n'est pas là, sa famille vaut `null`,
 * et le lecteur garde l'affichage qu'il avait — jamais de page vide.
 */
export function usePolicesDePage(pages: number[]): EtatPolices {
  // Les pages arrivent dans un tableau neuf à chaque rendu : c'est leur contenu
  // qui commande le chargement, pas l'identité du tableau.
  const cle = pages.join(',');

  const [etat, setEtat] = useState<EtatPolices>(() => etatInitial(pages));

  useEffect(() => {
    let vivant = true;
    const demandees = cle
      .split(',')
      .filter((valeur) => valeur.length > 0)
      .map(Number);

    setEtat(etatInitial(demandees));
    void (async () => {
      const resultats = await Promise.all(
        demandees.map(async (page) => [page, await chargerPoliceDePage(page)] as const)
      );
      if (!vivant) return;
      const familles: Record<number, string | null> = {};
      let echec = false;
      for (const [page, famille] of resultats) {
        familles[page] = famille;
        if (famille === null) echec = true;
      }
      setEtat({ familles, chargement: false, echec });
    })();

    return () => {
      vivant = false;
    };
  }, [cle]);

  return etat;
}

function etatInitial(pages: number[]): EtatPolices {
  const familles: Record<number, string | null> = {};
  let chargement = false;
  for (const page of pages) {
    if (policeChargee(page)) familles[page] = nomDeFamille(page);
    else {
      familles[page] = null;
      chargement = true;
    }
  }
  return { familles, chargement, echec: false };
}
