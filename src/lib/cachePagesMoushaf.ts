// Le cache des images de pages, sur le disque de l'appareil.
//
// POURQUOI UN CACHE NOUS-MÊMES
// ----------------------------
// Le composant `Image` de React Native garde bien un cache mémoire, mais il ne
// survit pas à la fermeture de l'application, et sa politique de rétention n'est
// pas garantie. Les pages du moushaf sont consultées en boucle — on revient cent
// fois sur les mêmes pages pendant qu'on mémorise — donc on veut une copie
// **durable** : téléchargée une fois, gardée sur le disque, réutilisée sans
// réseau.
//
// C'est aussi ce qui rend l'application utilisable hors connexion après une
// première visite, ce qu'un cache mémoire ne permet pas.
//
// MÊME FORME QUE LE CHARGEMENT DES POLICES
// ----------------------------------------
// Comme `policesMoushaf` : une table des téléchargements en cours, pour que deux
// demandes de la même page ne téléchargent qu'une fois, et un `Set` des pages
// déjà prêtes. Un échec rend `null` — jamais une exception : une page qu'on ne
// peut pas montrer ne doit pas faire tomber le lecteur.

import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';

import { getMushafPageImage, pageValide } from '@/lib/pagesMoushaf';

/**
 * Le dossier des pages, dans le cache de l'application.
 *
 * `cacheDirectory` plutôt que `documentDirectory` : le système peut faire de la
 * place en supprimant ce dossier, et c'est le comportement voulu — les images se
 * retéléchargent, elles ne sont pas des données de l'utilisateur. Ce qui compte
 * (la progression, les séances) vit ailleurs, dans SQLite et dans Supabase.
 */
const DOSSIER = `${FileSystem.cacheDirectory ?? ''}pages-moushaf/`;

const dossierPret = { fait: false };

/** Créer le dossier des pages s'il n'existe pas. Idempotent. */
async function preparerDossier(): Promise<void> {
  if (dossierPret.fait) return;
  try {
    await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
  } catch {
    // Le dossier existe déjà : `makeDirectoryAsync` lève dans ce cas, et ce
    // n'est pas une erreur. On ne peut pas le distinguer proprement d'un vrai
    // échec, donc on continue : l'écriture signalera un problème réel.
  }
  dossierPret.fait = true;
}

/** Le chemin local d'une page. */
function cheminLocal(page: number): string {
  return `${DOSSIER}page-${page}.jpg`;
}

const pretes = new Set<number>();
const enCours = new Map<number, Promise<string | null>>();

/**
 * Le chemin local de l'image d'une page, en la téléchargeant si besoin.
 *
 * Rend `null` si la page est hors bornes ou si le téléchargement échoue.
 * Deux appels pour la même page ne téléchargent qu'une fois.
 */
export async function assurerPage(page: number): Promise<string | null> {
  if (!pageValide(page)) return null;
  if (pretes.has(page)) return cheminLocal(page);

  const deja = enCours.get(page);
  if (deja !== undefined) return deja;

  const promesse = (async (): Promise<string | null> => {
    const local = cheminLocal(page);
    try {
      await preparerDossier();

      // Déjà sur le disque ? On ne retélécharge pas. `getInfoAsync` avec
      // `size` est nécessaire : sans option, la réponse ne porte pas la taille
      // et un fichier vide passerait pour un fichier valide. Le type `FileInfo`
      // est une union discriminée par `exists`, et `size` n'existe que du côté
      // « existe » — d'où le test, qui est aussi la garde contre le fichier vide.
      const info = await FileSystem.getInfoAsync(local, { size: true });
      if (info.exists && info.size > 0) {
        pretes.add(page);
        return local;
      }

      const url = getMushafPageImage(page);
      if (url === null) return null;

      await FileSystem.downloadAsync(url, local);

      // Un téléchargement interrompu laisse un fichier vide ou tronqué : on le
      // vérifie avant de le déclarer prêt, sinon la page resterait blanche pour
      // toujours, sans nouvelle tentative.
      const apres = await FileSystem.getInfoAsync(local, { size: true });
      if (!apres.exists || apres.size === 0) return null;

      pretes.add(page);
      return local;
    } catch {
      // Panne réseau ou disque plein : l'appelant montre un message et propose
      // de réessayer. On ne marque pas la page comme prête.
      return null;
    } finally {
      enCours.delete(page);
    }
  })();

  enCours.set(page, promesse);
  return promesse;
}

/** Vrai si l'image de cette page est déjà sur le disque. */
export function pageEnCache(page: number): boolean {
  return pretes.has(page);
}

/**
 * Supprimer les images mises en cache, pour libérer de la place.
 *
 * Rend le nombre d'octets récupérés, ou `0` si le calcul échoue. Ne touche
 * qu'au dossier des pages : aucune donnée de l'utilisateur n'est concernée.
 */
export async function viderCachePages(): Promise<number> {
  try {
    const contenu = await FileSystem.readDirectoryAsync(DOSSIER);
    let octets = 0;
    for (const nom of contenu) {
      const chemin = `${DOSSIER}${nom}`;
      try {
        const info = await FileSystem.getInfoAsync(chemin, { size: true });
        if (info.exists) octets += info.size;
      } catch {
        // Un fichier illisible ne bloque pas le nettoyage des autres.
      }
    }
    await FileSystem.deleteAsync(DOSSIER, { idempotent: true });
    pretes.clear();
    dossierPret.fait = false;
    return octets;
  } catch {
    return 0;
  }
}

export interface EtatPage {
  /** Le chemin local de l'image, dès qu'elle est prête. */
  chemin: string | null;
  /** Vrai tant que la page n'est ni prête ni en échec. */
  chargement: boolean;
  /** Vrai si la page n'a pas pu être obtenue. */
  echec: boolean;
}

/**
 * Suivre l'arrivée de l'image d'une page.
 *
 * Vaut pour une seule page à la fois : c'est le cas d'usage du mode « page »,
 * où l'on regarde une page et où l'on passe à la suivante. L'état d'une page
 * n'est jamais rapporté sur une autre — sinon une page afficherait brièvement
 * l'image de la précédente.
 */
export function usePageMoushaf(page: number, tentative = 0): EtatPage {
  const [etat, setEtat] = useState<EtatPage>(() => ({
    chemin: pageEnCache(page) ? cheminLocal(page) : null,
    chargement: !pageEnCache(page),
    echec: false,
  }));

  // `tentative` sert au bouton « Réessayer » : il relance l'effet.
  useEffect(() => {
    let vivant = true;
    if (!pageValide(page)) {
      setEtat({ chemin: null, chargement: false, echec: true });
      return;
    }

    if (pageEnCache(page)) {
      setEtat({ chemin: cheminLocal(page), chargement: false, echec: false });
      return;
    }

    setEtat({ chemin: null, chargement: true, echec: false });

    void (async () => {
      const chemin = await assurerPage(page);
      if (!vivant) return;
      setEtat({
        chemin,
        chargement: false,
        echec: chemin === null,
      });
    })();

    return () => {
      vivant = false;
    };
  }, [page, tentative]);

  return etat;
}
