// Le cache des images de pages, sur le disque de l'appareil.
//
// LES PAGES SONT EMBARQUEES — CE MODULE SERT A LES RESOUDRE
// ---------------------------------------------------------
// Depuis que les 604 pages sont **dans** l'application (`actifsPagesMoushaf.ts`),
// il n'y a plus rien a telecharger : `Asset.downloadAsync()` rend, pour un actif
// embarque, un chemin `file://` local, disponible des l'installation et sans
// reseau. La page s'affiche donc immediatement, y compris la premiere fois.
//
// Ce module reste, et garde trois roles :
//
//   1. **resoudre** l'actif embarque en chemin affichable (`assurerPage`) ;
//   2. **retomber** sur la source distante si l'actif n'est pas joignable — cas
//      d'un binaire ou l'empaquetage aurait omis l'image. Une page qu'on peut
//      voir reste preferable a un ecran d'echec ;
//   3. **liberer** la place qu'un ancien telechargement avait prise dans le cache
//      (`viderCachePages`), puisque plus rien n'y est ecrit.
//
// L'ORDRE DES REPLIS, ET POURQUOI IL EST CELUI-LA
// -----------------------------------------------
//     actif embarque  ->  disque (ancien cache)  ->  adresse distante  ->  echec
//
// L'actif d'abord parce qu'il est local, immediat et sans reseau. Le disque
// ensuite, parce qu'une version precedente de l'application y a peut-etre laisse
// des pages — il ne faut pas les ignorer, mais elles ne sont qu'un secours. Le
// reseau en dernier : c'est le seul cas qui demande une connexion, et il ne
// devrait plus se produire.
//
// POURQUOI UN CACHE N'ETAIT NECESSAIRE AVANT
// ------------------------------------------
// Les pages etaient servies depuis le depot, et le composant `Image` de React
// Native ne garde son cache memoire que le temps d'une session. On voulait donc
// une copie **durable**, telechargee une fois. Ce besoin disparait avec
// l'embarquement : la page est deja sur l'appareil, dans le paquet.
//
// ATTENTION — `cacheDirectory` PEUT ETRE `null`, ET C'EST ARRIVE
// -------------------------------------------------------------
// `expo-file-system` resout son module natif ainsi :
//
//     requireOptionalNativeModule('ExponentFileSystem') ?? ExponentFileSystemShim
//
// ou `ExponentFileSystemShim` declare `cacheDirectory: null`. Autrement dit, sur
// un binaire ou la couche native n'est pas joignable, `cacheDirectory` vaut
// `null` **sans lever**. Un `?? ''` construit alors un chemin **relatif sans
// schema** (`pages-moushaf/page-1.png`), que `downloadAsync` refuse — et le
// `catch` du telechargement transformait ce refus en « verifie ta connexion ».
// C'est exactement le defaut signale sur appareil : le message accusait le
// reseau alors que la cause etait un chemin sans `file://`.
//
// On distingue donc trois cas, et `null` n'est plus confondu avec « pas de
// dossier » : soit le dossier existe, soit on sait pourquoi il n'existe pas.
//
// Ce piege ne mord plus sur l'affichage — l'actif embarque ne passe pas par le
// disque — mais il mord encore sur `viderCachePages`. Les gardes restent.

import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

import { actifDePage } from '@/lib/actifsPagesMoushaf';
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
 * Les chemins deja resolus, par page.
 *
 * Il faut retenir **le chemin** et pas seulement « cette page est prete » :
 * l'actif embarque et l'adresse distante ne se lisent pas pareil, et rendre le
 * mauvais apres avoir marque la page prete ferait afficher une page vide.
 */
const memoires = new Map<number, string>();

/** Marquer une page resolue, en retenant par quelle voie. */
function retenir(page: number, chemin: string): void {
  memoires.set(page, chemin);
  pretes.add(page);
}

/**
 * Le chemin local de l'ACTIF EMBARQUE d'une page, ou `null`.
 *
 * C'est la voie normale, et la seule qui n'ait besoin ni de reseau ni de disque
 * inscriptible : les 604 pages sont dans le paquet de l'application.
 *
 * `Asset.fromModule` peut lever sur un module qui n'est pas un actif — cela
 * n'arrive pas pour les 604 `require` engendres, mais la fonction est appelee
 * avec ce que lui rend `actifDePage`, qui ne rend `null` que hors bornes. On
 * attrape donc quand meme : un binaire mal empaquete doit degrader l'affichage,
 * pas faire tomber l'ecran.
 *
 * `downloadAsync` sur un actif **embarque** est une operation locale : elle
 * recopie l'actif depuis le paquet vers un fichier que `Image` sait lire, et
 * rend immediatement. C'est la raison pour laquelle on l'appelle ici plutot que
 * de lire `actif.localUri` directement — sur certaines versions, `localUri` est
 * `null` tant que l'actif n'a pas ete « telecharge ».
 */
async function cheminActifEmbarque(page: number): Promise<string | null> {
  const module = actifDePage(page);
  if (module === null) return null;
  try {
    const actif = Asset.fromModule(module);
    await actif.downloadAsync();
    return actif.localUri ?? actif.uri ?? null;
  } catch {
    return null;
  }
}

/**
 * Le chemin local de l'image d'une page, en la resolvant si besoin.
 *
 * Rend `null` si la page est hors bornes ou si AUCUNE voie n'a abouti. Deux
 * appels pour la meme page ne font qu'un seul travail.
 *
 * L'ordre des replis est decrit en tete de fichier : actif embarque, puis
 * disque, puis adresse distante. Le repli sur l'adresse distante est delibere :
 * une page qu'on ne peut pas obtenir autrement reste une page qu'on peut
 * **voir**, et le composant `Image` de React Native a son propre cache reseau.
 * Refuser l'affichage serait le pire des deux mondes.
 */
export async function assurerPage(page: number): Promise<string | null> {
  if (!pageValide(page)) return null;

  const url = getMushafPageImage(page);
  if (url === null) return null;

  if (pretes.has(page)) {
    // Deja resolue : on sait par quelle voie, elle est memorisee juste apres.
    return memoires.get(page) ?? (await cheminActifEmbarque(page)) ?? url;
  }

  const deja = enCours.get(page);
  if (deja !== undefined) return deja;

  const promesse = (async (): Promise<string | null> => {
    try {
      // 1. L'actif embarque. C'est la voie normale, et elle ne depend de rien.
      const embarque = await cheminActifEmbarque(page);
      if (embarque !== null) {
        retenir(page, embarque);
        return embarque;
      }

      // 2. Un telechargement d'une version precedente, s'il est encore la.
      //    On ne l'ecrit plus, mais on ne jette pas ce qui existe : c'est une
      //    page deja sur l'appareil, et la relire ne coute rien.
      if (DOSSIER !== null) {
        const local = cheminLocal(page);
        if (local !== null) {
          const info = await FileSystem.getInfoAsync(local, { size: true });
          if (info.exists && info.size > 0) {
            retenir(page, local);
            return local;
          }
        }
      }

      // 3. L'adresse distante, en dernier recours.
      retenir(page, url);
      return url;
    } catch {
      // Aucune voie n'a abouti proprement : on rend l'adresse distante pour que
      // la page s'affiche quand meme si le reseau repond.
      return url;
    } finally {
      enCours.delete(page);
    }
  })();

  enCours.set(page, promesse);
  return promesse;
}

/**
 * Vrai si l'image de cette page a **deja ete resolue** — actif embarque ou
 * disque, peu importe : ce qui compte est qu'un chemin soit connu.
 *
 * Sert a sauter le travail de resolution, et a savoir si la place doit etre
 * reservee par un indicateur d'attente. La question « par quelle voie ? » ne se
 * pose pas ici : `assurerPage` la tranche, et memorise la reponse.
 */
export function pageEnCache(page: number): boolean {
  return pretes.has(page);
}

/**
 * Supprimer les images qu'un ANCIEN telechargement avait laissees, pour liberer
 * de la place.
 *
 * Ne touche ni au paquet de l'application — les pages embarquees ne se
 * suppriment pas —, ni aux donnees de l'utilisateur. Sur une installation
 * recente, il n'y a rien a supprimer et la fonction rend `0`.
 *
 * Elle oublie aussi les chemins memorises : sans cela, une page resterait
 * marquee resolue en pointant vers un fichier qu'on vient d'effacer, et
 * s'afficherait vide jusqu'au prochain lancement.
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
    memoires.clear();
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
    // Une page deja resolue rend son chemin immediatement — c'est ce qui fait
    // qu'une page deja vue ne repasse pas par l'indicateur d'attente.
    chemin: pageEnCache(page) ? memoires.get(page) ?? null : null,
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
      setEtat({ chemin: memoires.get(page) ?? null, chargement: false, echec: false });
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
