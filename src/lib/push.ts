// Le seul fichier du projet qui parle à Expo Notifications.
//
// POURQUOI IL EST À PART, ET POURQUOI IL EST MINCE
// ------------------------------------------------
// Importer Expo rend un module inéprouvable : `node --test` ne sait pas charger
// un module natif. Tout ce qui décide — les préférences, la cible d'un appui —
// vit donc dans `src/lib/notifications.ts`, qui n'importe rien. Ici il ne reste
// que des appels, et les seules décisions sont des traductions d'états.
//
// POURQUOI LA PERMISSION N'EST PAS DEMANDÉE À L'OUVERTURE
// ------------------------------------------------------
// Le cahier des charges l'exige, et la raison est plus forte qu'une préférence
// d'ergonomie : une demande de permission qui arrive avant que la personne
// sache à quoi elle sert est refusée. Or un refus sur iOS est DÉFINITIF — le
// système ne repose plus jamais la question, et l'application ne peut plus rien
// proposer. La demande part donc du geste : c'est en activant un interrupteur
// de notification que l'on demande, parce qu'à cet instant la personne a dit
// ce qu'elle voulait.
//
// L'ÉTAT « INDISPONIBLE » EST UN ÉTAT À PART ENTIÈRE
// --------------------------------------------------
// Ni accordé, ni refusé : le module n'est pas là, ou l'appareil est un
// simulateur, ou le projet Expo n'est pas relié. Les confondre avec un refus
// ferait afficher « tu as refusé » à quelqu'un qui n'a rien refusé, et qui
// chercherait dans les réglages du téléphone une autorisation qu'il n'a jamais
// retirée.

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { cibleNotification, type CibleNotification } from '@/lib/notifications';

/** L'identifiant du canal Android. Il doit correspondre à celui du serveur. */
export const CANAL_ANDROID = 'messages';

export type EtatPermission = 'accordee' | 'refusee' | 'non_demandee' | 'indisponible';

export type ResultatJeton =
  | { statut: 'ok'; jeton: string; plateforme: 'ios' | 'android' }
  | { statut: 'refusee' }
  | { statut: 'projet_absent' }
  | { statut: 'indisponible'; message: string };

/**
 * Ce qu'il faut poser UNE fois, au démarrage.
 *
 * Sans ce réglage, une notification reçue pendant que l'application est ouverte
 * n'est pas montrée du tout — elle est remise au gestionnaire, qui n'en fait
 * rien. C'est le défaut le plus déroutant de cette fonctionnalité : « je ne
 * reçois rien » alors que tout arrive.
 */
export function configurerAffichage(): void {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // `shouldShowAlert` — et NON le couple de clés du SDK suivant.
        //
        // Ces deux clés-là n'existent nulle part dans le paquet installé : le
        // projet est en SDK 52 (`expo-notifications` 0.29), où l'interface
        // `NotificationBehavior` ne déclare que `shouldShowAlert`,
        // `shouldPlaySound`, `shouldSetBadge` et `priority`. Vérifié dans
        // `node_modules`, pas supposé.
        //
        // Les employer laisserait la clé que le module natif LIT indéfinie : la
        // notification reçue pendant que l'application est ouverte ne
        // s'afficherait pas — sans erreur, sans trace, et c'est exactement le
        // défaut que ce réglage existe pour éviter. Le contrôle de types l'a dit
        // avant l'appareil : « Property 'shouldShowAlert' is missing … but
        // required in type 'NotificationBehavior' ».
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Un module natif absent ne doit pas empêcher l'application de démarrer :
    // les notifications sont un confort, la mémorisation ne l'est pas.
  }
}

/** Le canal Android, à créer avant toute demande de jeton. */
async function preparerLeCanal(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Messages et amis',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1E6B4C',
  });
}

/** L'état de l'autorisation, sans jamais la demander. */
export async function etatPermission(): Promise<EtatPermission> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return traduire(status);
  } catch {
    return 'indisponible';
  }
}

/**
 * Demande l'autorisation.
 *
 * Appelée UNIQUEMENT quand quelqu'un active un interrupteur de notification —
 * jamais à l'ouverture. Voir l'en-tête de ce fichier.
 */
export async function demanderPermission(): Promise<EtatPermission> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return traduire(status);
  } catch {
    return 'indisponible';
  }
}

function traduire(statut: string): EtatPermission {
  if (statut === 'granted') return 'accordee';
  if (statut === 'denied') return 'refusee';
  return 'non_demandee';
}

/**
 * L'identifiant du projet Expo, ou `null`.
 *
 * La même expression que la documentation d'Expo : `expoConfig` couvre le cas
 * d'un `app.json`, `easConfig` celui d'un binaire construit par EAS. Les deux
 * sont lus parce qu'on ne choisit pas comment l'exemplaire a été produit.
 */
function lireProjectId(): string | null {
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? null;
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

/**
 * Le jeton de cet appareil, SANS RIEN DEMANDER.
 *
 * C'est le geste de la DÉCONNEXION. À ce moment-là, la personne n'active rien :
 * une demande d'autorisation surgirait sans rapport avec ce qu'elle vient de
 * faire, et sur iOS un refus est définitif. On lit donc l'état existant, et
 * l'absence de jeton n'est pas une erreur — c'est le cas normal de qui n'a
 * jamais activé les notifications.
 */
export async function jetonSansDemander(): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  const projectId = lireProjectId();
  if (projectId === null) return null;

  try {
    if ((await etatPermission()) !== 'accordee') return null;
    const jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    return typeof jeton === 'string' && jeton.length > 0 ? jeton : null;
  } catch {
    // Un simulateur, un module natif absent, un service injoignable : aucun de
    // ces cas ne doit empêcher une déconnexion d'aboutir.
    return null;
  }
}

/**
 * Le jeton de cet appareil, après s'être assuré de l'autorisation.
 *
 * `projectId` est indispensable, et son absence est un état que l'on DIT :
 * `getExpoPushTokenAsync` sans lui lève, et le message d'Expo parle de
 * « projectId » sans dire où le prendre. On préfère une phrase qui nomme
 * l'étape manquante.
 */
export async function obtenirJeton(): Promise<ResultatJeton> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { statut: 'indisponible', message: 'Les notifications ne concernent que les téléphones.' };
  }

  let permission: EtatPermission;
  try {
    permission = await etatPermission();
    if (permission === 'non_demandee') permission = await demanderPermission();
  } catch {
    return { statut: 'indisponible', message: "L'autorisation n'a pas pu être demandée." };
  }

  if (permission === 'indisponible') {
    return {
      statut: 'indisponible',
      message: 'Les notifications ne sont pas disponibles sur cet appareil.',
    };
  }
  if (permission === 'refusee') return { statut: 'refusee' };

  try {
    await preparerLeCanal();
  } catch {
    // Le canal est une commodité Android : son échec ne doit pas empêcher
    // l'obtention d'un jeton, qui reste valable.
  }

  const projectId = lireProjectId();
  if (projectId === null) return { statut: 'projet_absent' };

  try {
    const jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (typeof jeton !== 'string' || jeton.length === 0) {
      return { statut: 'indisponible', message: "Le jeton n'a pas pu être obtenu." };
    }
    return { statut: 'ok', jeton, plateforme: Platform.OS === 'ios' ? 'ios' : 'android' };
  } catch (erreur) {
    // Le message d'Expo est technique mais il nomme souvent la cause exacte
    // (simulateur, google-services.json absent, APNs non configuré). On le
    // garde donc, au lieu de le remplacer par une phrase qui n'apprendrait rien.
    const texte = erreur instanceof Error ? erreur.message : String(erreur);
    return { statut: 'indisponible', message: texte.slice(0, 300) };
  }
}

// === Ce qu'un appui ouvre ==================================================

/**
 * L'écoute des appuis sur une notification.
 *
 * Rend de quoi se désabonner, et toujours une fonction — jamais `undefined` :
 * un `useEffect` attend une fonction de nettoyage, et lui rendre autre chose
 * ferait échouer le démontage.
 *
 * La DÉCISION de la cible n'est pas ici : elle est dans `cibleNotification`,
 * qui n'importe rien et s'éprouve sans téléphone. Ce module se contente de
 * transmettre ce qu'Expo a reçu.
 */
export function ecouterLesAppuis(surCible: (cible: CibleNotification) => void): () => void {
  try {
    const abonnement = Notifications.addNotificationResponseReceivedListener((reponse) => {
      const donnees = reponse?.notification?.request?.content?.data;
      surCible(cibleNotification(donnees));
    });
    return () => {
      try {
        abonnement.remove();
      } catch {
        // Rien à faire : l'abonnement est déjà retiré, et lever ici ferait
        // échouer un démontage pour une raison qui n'existe pas.
      }
    };
  } catch {
    return () => {};
  }
}

/**
 * La notification qui a LANCÉ l'application, s'il y en a une.
 *
 * C'est le cas d'une application fermée : au moment de l'appui, aucun écouteur
 * n'existait encore, et l'événement est donc perdu si on ne le demande pas.
 * Sans cela, ouvrir une notification depuis une application fermée amènerait
 * l'accueil — c'est-à-dire nulle part.
 */
export async function cibleDuLancement(): Promise<CibleNotification | null> {
  try {
    const reponse = await Notifications.getLastNotificationResponseAsync();
    if (reponse === null || reponse === undefined) return null;
    return cibleNotification(reponse?.notification?.request?.content?.data);
  } catch {
    return null;
  }
}
