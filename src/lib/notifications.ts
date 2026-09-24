// Les notifications : ce qui se décide sans réseau, et sans Expo.
//
// CE MODULE N'IMPORTE RIEN, et c'est la règle du dépôt : `src/lib/auth.ts`
// importe Expo, donc tout ce qui l'importe devient inéprouvable. Les décisions
// vivent ici — préférences, libellés, et surtout LA CIBLE D'UN APPUI — et le
// seul fichier qui parle à Expo (`src/lib/push.ts`) se contente d'appeler.
//
// LA DÉCISION QUI COMPTE VRAIMENT est `cibleNotification`. Le cahier des
// charges demande qu'un appui ouvre LA BONNE conversation, et une notification
// est le seul endroit du projet où des données arrivent d'un service extérieur
// sans passer par une politique de base de données : ce qui vient de l'envoi
// est donc traité comme NON FIABLE. Un identifiant absent, vide, ou d'un type
// inattendu ne doit pas produire une route à moitié construite — il doit
// produire l'accueil, qui est un endroit où l'on ne se perd pas.

/** Les six interrupteurs de l'écran, dans l'ordre où ils s'affichent. */
export type PreferenceNotification =
  | 'messages'
  | 'demandes_amis'
  | 'progression_partagee'
  | 'rappels_apprentissage'
  | 'rappels_revision'
  | 'masquer_contenu';

export type PreferencesNotifications = Record<PreferenceNotification, boolean>;

/**
 * Ce que valent les préférences quand rien n'a jamais été réglé.
 *
 * Le défaut est « tout activé sauf le masquage », et il est le même que celui
 * de `mes_preferences_notifications` en base. Deux endroits portent ce défaut,
 * et c'est assumé : le premier sert quand la base répond, le second quand elle
 * ne répond pas — et dans ce cas on veut tout de même afficher un écran
 * cohérent plutôt que six interrupteurs éteints qui ne veulent rien dire.
 */
export const PREFERENCES_PAR_DEFAUT: PreferencesNotifications = {
  messages: true,
  demandes_amis: true,
  progression_partagee: true,
  rappels_apprentissage: true,
  rappels_revision: true,
  masquer_contenu: false,
};

/**
 * Le libellé et l'explication de chaque interrupteur.
 *
 * `bientot` marque un réglage qui est RANGÉ mais qui n'envoie encore rien.
 * C'est une distinction de vérité, pas de style : les deux rappels sont stockés
 * et seront respectés le jour où l'application saura les poser, mais
 * aujourd'hui aucun rappel ne part. Un interrupteur qui laisserait croire le
 * contraire serait un mensonge que la personne ne découvrirait qu'en attendant
 * une notification qui n'arrive pas — et elle chercherait la panne du mauvais
 * côté. L'écran affiche donc « Bientôt » sur ces deux lignes, et le résumé ne
 * les compte pas.
 */
export const LIBELLES_PREFERENCES: Array<{
  cle: PreferenceNotification;
  titre: string;
  aide: string;
  bientot: boolean;
}> = [
  {
    cle: 'messages',
    titre: 'Nouveaux messages',
    aide: 'Quand un ami t’écrit.',
    bientot: false,
  },
  {
    cle: 'demandes_amis',
    titre: 'Demandes d’amis',
    aide: 'Quand on te demande en ami, ou quand ta demande est acceptée.',
    bientot: false,
  },
  {
    cle: 'progression_partagee',
    titre: 'Étapes partagées',
    aide: 'Quand un ami annonce volontairement une étape de sa mémorisation.',
    bientot: false,
  },
  {
    cle: 'rappels_apprentissage',
    titre: 'Rappels d’apprentissage',
    aide: 'Bientôt : aucun rappel n’est encore posé, mais ton choix est gardé.',
    bientot: true,
  },
  {
    cle: 'rappels_revision',
    titre: 'Rappels de révision',
    aide: 'Bientôt : aucun rappel n’est encore posé, mais ton choix est gardé.',
    bientot: true,
  },
  {
    cle: 'masquer_contenu',
    titre: 'Masquer le contenu des messages',
    aide: 'N’affiche que « Vous avez reçu un nouveau message », jamais le texte reçu.',
    bientot: false,
  },
];

export type LignePreferencesBrute = {
  messages?: boolean | null;
  demandes_amis?: boolean | null;
  progression_partagee?: boolean | null;
  rappels_apprentissage?: boolean | null;
  rappels_revision?: boolean | null;
  masquer_contenu?: boolean | null;
};

/**
 * Lit une ligne de préférences, en comblant ce qui manque par le défaut.
 *
 * Chaque champ est lu SÉPARÉMENT, et non par un `??` sur la ligne entière :
 * une colonne ajoutée plus tard et absente de la réponse ne doit pas faire
 * basculer les cinq autres. Un `valeur === true` pour les cinq premiers, et
 * `=== true` aussi pour le masquage : un `masquer_contenu` absent vaut FAUX,
 * parce que masquer le contenu par accident ferait disparaître le texte que la
 * personne attend.
 */
export function lirePreferences(ligne: LignePreferencesBrute | null | undefined): PreferencesNotifications {
  if (ligne === null || ligne === undefined) return { ...PREFERENCES_PAR_DEFAUT };
  return {
    messages: ligne.messages !== false,
    demandes_amis: ligne.demandes_amis !== false,
    progression_partagee: ligne.progression_partagee !== false,
    rappels_apprentissage: ligne.rappels_apprentissage !== false,
    rappels_revision: ligne.rappels_revision !== false,
    masquer_contenu: ligne.masquer_contenu === true,
  };
}

/** Bascule un interrupteur, sans toucher aux autres. */
export function basculer(
  preferences: PreferencesNotifications,
  cle: PreferenceNotification
): PreferencesNotifications {
  return { ...preferences, [cle]: !preferences[cle] };
}

/**
 * Ce que les réglages disent, en une phrase.
 *
 * Elle existe pour un cas précis : quand TOUT est coupé, l'écran doit le dire
 * plutôt que de laisser croire à une panne. « Je ne reçois rien » et « j'ai
 * tout coupé » se ressemblent beaucoup, et c'est la phrase qui les distingue.
 *
 * Elle ne compte QUE les réglages qui envoient quelque chose aujourd'hui, et le
 * dénominateur est calculé et non écrit : « 3 sur 3 » le jour où les rappels
 * arriveront deviendrait faux sans que personne ne le voie, alors qu'un
 * dénominateur dérivé de la même liste ne peut pas diverger d'elle.
 */
export function resumeNotifications(preferences: PreferencesNotifications): string {
  const envoient = LIBELLES_PREFERENCES.filter(
    (entree) => !entree.bientot && entree.cle !== 'masquer_contenu'
  );
  const actifs = envoient.filter((entree) => preferences[entree.cle]).length;

  if (actifs === 0) return 'Aucune notification ne sera envoyée.';
  if (actifs === envoient.length) {
    return preferences.masquer_contenu
      ? 'Toutes les notifications sont activées, contenu masqué.'
      : 'Toutes les notifications sont activées.';
  }
  return `${actifs} type${actifs > 1 ? 's' : ''} de notification sur ${envoient.length}.`;
}

// === Ce qu'un appui doit ouvrir ============================================

export type CibleNotification =
  | { type: 'discussion'; amiId: string }
  | { type: 'amis' }
  | { type: 'accueil' };

/** Les genres connus. Un genre inconnu n'ouvre rien de particulier. */
const GENRES = ['message', 'demande_ami', 'demande_acceptee', 'progression'] as const;

function identifiantPlausible(valeur: unknown): valeur is string {
  // Un `UUID` fait 36 signes. On ne valide pas la forme exacte — la base le
  // fera, et une conversation inexistante rend un fil vide, pas une erreur. On
  // écarte seulement ce qui ne peut pas en être un : absent, vide, ou d'un
  // autre type, ce qui arrive dès qu'un envoi est fabriqué autrement.
  return typeof valeur === 'string' && valeur.trim().length >= 8;
}

/**
 * La cible d'un appui sur une notification.
 *
 * On lit `genre` d'abord : c'est lui qui dit de quoi il s'agit. `message` et
 * `demande_acceptee` ouvrent une conversation — la première parce qu'on veut
 * lire, la seconde parce qu'on veut répondre à qui vient d'accepter.
 * `demande_ami` et `progression` ouvrent l'écran des amis, où il y a quelque
 * chose à faire.
 *
 * Et quand la conversation est demandée mais que l'identifiant manque, on
 * retombe sur l'écran des amis — jamais sur une route à moitié construite. Un
 * `amiId` vide mènerait à un fil sans participant, et l'écran afficherait une
 * erreur de base pour une donnée qui n'est jamais arrivée.
 */
export function cibleNotification(donnees: unknown): CibleNotification {
  if (donnees === null || typeof donnees !== 'object') return { type: 'accueil' };

  const charge = donnees as Record<string, unknown>;
  const genre = typeof charge.genre === 'string' ? charge.genre : '';
  if (!(GENRES as readonly string[]).includes(genre)) return { type: 'accueil' };

  const conversation = charge.conversationAvec ?? charge.acteur;

  if (genre === 'message' || genre === 'demande_acceptee') {
    if (identifiantPlausible(conversation)) {
      return { type: 'discussion', amiId: conversation.trim() };
    }
    return { type: 'amis' };
  }

  return { type: 'amis' };
}
