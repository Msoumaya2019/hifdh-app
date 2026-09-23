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
// LA FORME DU CHARGEMENT
// ----------------------
// Une table des téléchargements en cours, pour que deux demandes de la même
// page ne téléchargent qu'une fois, et un `Set` des pages déjà prêtes. Un échec
// rend `null` — jamais une exception : une page qu'on ne peut pas montrer ne
// doit pas faire tomber le lecteur.

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
 *
 * ATTENTION — `cacheDirectory` PEUT ÊTRE `null`, ET C'EST ARRIVÉ
 * -------------------------------------------------------------
 * `expo-file-system` résout son module natif ainsi :
 *
 *     requireOptionalNativeModule('ExponentFileSystem') ?? ExponentFileSystemShim
 *
 * où `ExponentFileSystemShim` déclare `cacheDirectory: null`. Autrement dit, sur
 * un binaire où la couche native n'est pas joignable, `cacheDirectory` vaut
 * `null` **sans lever**. Un `?? ''` construit alors un chemin **relatif sans
 * schéma** (`pages-moushaf/page-1.png`), que `downloadAsync` refuse — et le
 * `catch` du téléchargement transformait ce refus en « vérifie ta connexion ».
 * C'est exactement le défaut signalé sur appareil : le message accusait le
 * réseau alors que la cause était un chemin sans `file://`.
 *
 * On distingue donc trois cas, et `null` n'est plus confondu avec « pas de
 * dossier » : soit le dossier existe, soit on sait pourquoi il n'existe pas.
 */
const DOSSIER: string | null = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}pages-moushaf/`
  : null;

/**
 * La raison pour laquelle le cache disque est indisponible, ou `null` s'il l'est.
 *
 * Sert au diagnostic : sans elle, toutes les pannes se ressemblent, et l'on
 * finit par accuser le réseau pour un chemin refusé par le système de fichiers.
 */
export const raisonCacheIndisponible: string | null = DOSSIER
  ? null
  : 'le cache de l’application n’est pas accessible sur cet appareil';

const dossierPret = { fait: false };

/** Créer le dossier des pages s'il n'existe pas. Idempotent. */
async function preparerDossier(): Promise<void> {
  if (dossierPret.fait || DOSSIER === null) return;
  try {
    await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
  } catch {
    // Le dossier existe déjà : `makeDirectoryAsync` lève dans ce cas, et ce
    // n'est pas une erreur. On ne peut pas le distinguer proprement d'un vrai
    // échec, donc on continue : l'écriture signalera un problème réel.
  }
  dossierPret.fait = true;
}

/**
 * Le chemin local d'une page, ou `null` si le cache disque est indisponible.
 *
 * L'extension est `.png` parce que les pages servies sont des PNG. Le nom du
 * fichier local n'a pas à suivre celui du dépôt — c'est une copie, pas une
 * référence —, mais une copie qui mentirait sur son format se paierait un jour
 * au diagnostic.
 */
function cheminLocal(page: number): string | null {
  return DOSSIER === null ? null : `${DOSSIER}page-${page}.png`;
}

const pretes = new Set<number>();
const enCours = new Map<number, Promise<string | null>>();

/**
 * Le chemin local de l'image d'une page, en la téléchargeant si besoin.
 *
 * Rend `null` si la page est hors bornes ou si le téléchargement échoue.
 * Deux appels pour la même page ne téléchargent qu'une fois.
 *
 * NB : le repli sur l'URL distante est délibéré. Une page qu'on ne peut pas
 * mettre en cache reste une page qu'on peut **voir** : le composant `Image` de
 * React Native a son propre cache réseau et n'a pas besoin du système de
 * fichiers. Refuser l'affichage faute de cache serait le pire des deux mondes —
 * l'utilisateur perd la page alors que le réseau répondait.
 */
export async function assurerPage(page: number): Promise<string | null> {
  if (!pageValide(page)) return null;

  const url = getMushafPageImage(page);
  if (url === null) return null;

  // Pas de cache disque disponible : on rend l'URL distante. `Image` l'affiche
  // et la garde dans son propre cache. Ce n'est pas durable entre deux
  // lancements, mais c'est infiniment mieux qu'un écran d'échec.
  if (DOSSIER === null) return url;

  const local = cheminLocal(page);
  if (local === null) return url;
  if (pretes.has(page)) return local;

  const deja = enCours.get(page);
  if (deja !== undefined) return deja;

  const promesse = (async (): Promise<string | null> => {
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

      await FileSystem.downloadAsync(url, local);

      // Un téléchargement interrompu laisse un fichier vide ou tronqué : on le
      // vérifie avant de le déclarer prêt, sinon la page resterait blanche pour
      // toujours, sans nouvelle tentative.
      const apres = await FileSystem.getInfoAsync(local, { size: true });
      if (!apres.exists || apres.size === 0) return url;

      pretes.add(page);
      return local;
    } catch {
      // Panne réseau, disque plein, ou chemin refusé : on ne marque pas la page
      // comme prête, mais on rend l'URL pour que la page s'affiche quand même.
      return url;
    } finally {
      enCours.delete(page);
    }
  })();

  enCours.set(page, promesse);
  return promesse;
}

/**
 * Vrai si l'image de cette page est déjà **sur le disque**.
 *
 * Faux quand le cache disque est indisponible : il n'y a alors rien sur le
 * disque, et `cheminLocal` rend `null`. Cette condition est écrite ici plutôt
 * que laissée implicite, parce que le succès de la page ne dépend pas d'elle :
 * une page sans cache disque s'affiche par son URL, et confondre « pas en
 * cache » avec « pas affichable » ramènerait exactement le défaut corrigé.
 */
export function pageEnCache(page: number): boolean {
  return DOSSIER !== null && pretes.has(page);
}

/**
 * Supprimer les images mises en cache, pour libérer de la place.
 *
 * Rend le nombre d'octets récupérés, ou `0` si le calcul échoue. Ne touche
 * qu'au dossier des pages : aucune donnée de l'utilisateur n'est concernée.
 */
export async function viderCachePages(): Promise<number> {
  if (DOSSIER === null) return 0;
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
