// La fonction serveur qui vide la boîte d'envoi et fait sonner les téléphones.
//
// POURQUOI ELLE EXISTE, ET POURQUOI ELLE N'EST PAS DANS L'APPLICATION
// -------------------------------------------------------------------
// Deux raisons, et la seconde est la plus importante.
//
//  1. La clé de service ne peut pas être dans une application distribuée. Une
//     clé qu'on peut lire dans un binaire est une clé publique : elle ouvrirait
//     toute la base à quiconque décompresse l'APK. Cette fonction est le seul
//     endroit où la clé vit, et c'est un endroit qu'on ne distribue pas.
//
//  2. Une notification doit partir MÊME SI l'expéditeur ferme l'application
//     aussitôt après avoir appuyé sur « envoyer ». Un envoi déclenché par son
//     téléphone n'aurait alors jamais lieu. C'est pour cela que la ligne est
//     écrite dans `envois_notification` par un DÉCLENCHEUR côté base
//     (`supabase/notifications.sql`), et que cette fonction se contente de
//     vider la boîte — sans savoir qui a écrit, ni depuis quel appareil.
//
// CE QU'ELLE NE FAIT PAS
// ----------------------
// Elle ne décide PAS qui a le droit de recevoir : les préférences ont déjà été
// appliquées au moment où la ligne a été écrite. Une ligne présente dans la
// boîte est une ligne qui doit partir. Refiltrer ici créerait un second endroit
// où la règle s'écrit, et donc deux occasions de diverger.
//
// ELLE NE LIT AUCUN MESSAGE. Le corps à envoyer est dans la ligne, déjà
// remplacé par un texte neutre si la personne a demandé à masquer le contenu.
// Cette fonction ne peut donc pas faire fuiter ce que la base a retenu.
//
// COMMENT ELLE EST APPELÉE
// ------------------------
// Par un ordonnanceur, avec un secret partagé dans l'en-tête
// `x-notifications-secret`. Le flux fourni (`.github/workflows/notifications.yml`)
// s'en charge toutes les cinq minutes. Sans secret configuré, la fonction
// REFUSE de s'exécuter — un envoi ouvert laisserait n'importe qui faire sonner
// les téléphones de tous les utilisateurs.

import { createClient } from 'npm:@supabase/supabase-js@2';

/** Le point d'entrée du service de notification d'Expo. */
const URL_EXPO = 'https://exp.host/--/api/v2/push/send';

/**
 * Le nombre de messages par requête.
 *
 * Cent, et c'est la limite documentée du service : au-delà, il tronque sans le
 * dire. Une troncature silencieuse ferait perdre des notifications sans
 * qu'aucune erreur n'apparaisse nulle part.
 */
const MAX_PAR_REQUETE = 100;

/** Le nombre de lignes réclamées par passage. */
const MAX_PAR_PASSAGE = 200;

type Genre = 'message' | 'demande_ami' | 'demande_acceptee' | 'progression';

type Envoi = {
  id: number;
  destinataire: string;
  genre: Genre;
  acteur: string | null;
  conversation_avec: string | null;
  corps: string | null;
};

type MessageExpo = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Le canal Android. Doit exister côté application, sinon rien ne s'affiche. */
  channelId?: string;
};

function repondre(corps: Record<string, unknown>, code = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: code,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Le nom à montrer, ou un libellé neutre. Jamais « null ». */
function nomDe(profils: Map<string, string>, id: string | null): string {
  if (id === null) return 'Un ami';
  const nom = profils.get(id);
  return nom !== undefined && nom.trim().length > 0 ? nom.trim() : 'Un ami';
}

/**
 * Le titre et le corps, par genre.
 *
 * Écrits ici, et non dans l'application : une notification est fabriquée au
 * moment de l'envoi, souvent longtemps après le geste. Si le texte venait du
 * client, il faudrait le ranger dans la boîte d'envoi — donc faire transiter
 * des phrases par la base, pour rien.
 *
 * Le corps d'un message EST le message. Quand `corps` est nul, c'est que la
 * personne a demandé à masquer le contenu : le texte générique n'est donc pas
 * un repli, c'est la seule phrase qui existe dans ce cas.
 */
function composer(envoi: Envoi, nom: string): { title: string; body: string; data: Record<string, unknown> } {
  switch (envoi.genre) {
    case 'message':
      return {
        title: `${nom} t’a envoyé un message`,
        body: envoi.corps ?? 'Vous avez reçu un nouveau message',
        // `conversationAvec` est ce qui fait qu'un appui ouvre LE BON fil.
        data: { genre: envoi.genre, conversationAvec: envoi.conversation_avec },
      };
    case 'demande_ami':
      return {
        title: `${nom} veut être ton ami`,
        body: 'Ouvre l’application pour accepter ou refuser.',
        data: { genre: envoi.genre, acteur: envoi.acteur },
      };
    case 'demande_acceptee':
      return {
        title: `${nom} a accepté ta demande`,
        body: 'Vous êtes maintenant amis. Écris-lui un mot d’encouragement.',
        data: { genre: envoi.genre, conversationAvec: envoi.acteur },
      };
    case 'progression':
      return {
        title: `${nom} a partagé une étape`,
        body: envoi.corps ?? 'Une étape de mémorisation vient d’être partagée.',
        data: { genre: envoi.genre, acteur: envoi.acteur },
      };
  }
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return repondre({ erreur: 'methode' }, 405);
  }

  // --- La porte --------------------------------------------------------------
  //
  // Un secret non configuré fait REFUSER la fonction, il ne la laisse pas
  // ouverte. C'est le sens du refus : une fonction qui accepte n'importe quel
  // appelant laisserait n'importe qui faire sonner les téléphones de tous les
  // utilisateurs, et rien dans les journaux ne le dirait.
  const secret = Deno.env.get('NOTIFICATIONS_SECRET') ?? '';
  if (secret.length < 16) {
    return repondre({ erreur: 'secret_non_configure' }, 503);
  }
  if (requete.headers.get('x-notifications-secret') !== secret) {
    return repondre({ erreur: 'refuse' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleService) {
    return repondre({ erreur: 'environnement_incomplet' }, 503);
  }

  const base = createClient(url, cleService, { auth: { persistSession: false } });

  // --- La prise --------------------------------------------------------------
  //
  // `reclamer_envois` marque les lignes comme traitées ET les rend, dans la
  // même instruction. Deux passages simultanés ne peuvent donc pas prendre la
  // même ligne : c'est la base qui garantit l'unicité, pas la discipline de
  // cette fonction.
  const { data: prises, error: erreurPrise } = await base.rpc('reclamer_envois', {
    p_limite: MAX_PAR_PASSAGE,
  });
  if (erreurPrise !== null) {
    return repondre({ erreur: 'prise_impossible', detail: erreurPrise.message }, 500);
  }

  const envois = (prises ?? []) as Envoi[];
  if (envois.length === 0) {
    return repondre({ reclames: 0, envoyes: 0, jetons_retires: 0 });
  }

  // --- Les appareils ---------------------------------------------------------
  //
  // On lit les jetons de TOUS les destinataires en une requête, et les noms des
  // acteurs en une autre. Deux requêtes au lieu de deux par ligne : à deux
  // cents lignes, la différence est entre quatre requêtes et quatre cents.
  const destinataires = [...new Set(envois.map((e) => e.destinataire))];
  const acteurs = [...new Set(envois.map((e) => e.acteur).filter((a): a is string => a !== null))];

  const { data: appareils, error: erreurAppareils } = await base
    .from('appareils')
    .select('jeton, user_id')
    .in('user_id', destinataires);
  if (erreurAppareils !== null) {
    return repondre({ erreur: 'appareils_illisibles', detail: erreurAppareils.message }, 500);
  }

  const parCompte = new Map<string, string[]>();
  for (const ligne of appareils ?? []) {
    const compte = ligne.user_id as string;
    const liste = parCompte.get(compte) ?? [];
    liste.push(ligne.jeton as string);
    parCompte.set(compte, liste);
  }

  const profils = new Map<string, string>();
  if (acteurs.length > 0) {
    const { data: noms } = await base.from('profiles').select('id, display_name').in('id', acteurs);
    for (const ligne of noms ?? []) {
      profils.set(ligne.id as string, (ligne.display_name as string) ?? '');
    }
  }

  // --- Les messages ----------------------------------------------------------
  //
  // Une ligne peut viser un compte sans appareil — application désinstallée,
  // ou compte jamais ouvert ailleurs. Elle n'est alors pas une erreur : il n'y
  // a rien à envoyer, et c'est tout.
  const aEnvoyer: MessageExpo[] = [];
  const sansAppareil: number[] = [];

  for (const envoi of envois) {
    const jetons = parCompte.get(envoi.destinataire) ?? [];
    if (jetons.length === 0) {
      sansAppareil.push(envoi.id);
      continue;
    }

    const { title, body, data } = composer(envoi, nomDe(profils, envoi.acteur));
    for (const jeton of jetons) {
      aEnvoyer.push({
        to: jeton,
        sound: 'default',
        title,
        body,
        data,
        channelId: 'messages',
      });
    }
  }

  if (sansAppareil.length > 0) {
    await base
      .from('envois_notification')
      .update({ erreur: 'aucun appareil enregistre' })
      .in('id', sansAppareil);
  }

  // --- L'envoi ---------------------------------------------------------------
  let envoyes = 0;
  const jetonsMorts: string[] = [];
  const erreurs: string[] = [];

  for (let debut = 0; debut < aEnvoyer.length; debut += MAX_PAR_REQUETE) {
    const lot = aEnvoyer.slice(debut, debut + MAX_PAR_REQUETE);

    let reponse: Response;
    try {
      reponse = await fetch(URL_EXPO, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lot),
      });
    } catch (erreur) {
      // Une panne réseau ne doit pas faire perdre le lot suivant : on note et
      // on continue. Les lignes sont déjà marquées traitées — c'est le choix
      // assumé de la prise, qui préfère perdre un envoi plutôt que le doubler.
      erreurs.push(`reseau : ${String(erreur)}`);
      continue;
    }

    if (!reponse.ok) {
      erreurs.push(`expo ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`);
      continue;
    }

    const corps = (await reponse.json()) as { data?: Array<Record<string, unknown>> };
    const tickets = corps.data ?? [];

    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      const jeton = lot[i]?.to ?? '';
      if (ticket.status === 'ok') {
        envoyes += 1;
        continue;
      }

      const details = ticket.details as Record<string, unknown> | undefined;
      const code = typeof details?.error === 'string' ? (details.error as string) : 'inconnu';

      // `DeviceNotRegistered` est le seul signal qui autorise à SUPPRIMER un
      // jeton : l'application n'existe plus sur cet appareil. On ne devine
      // jamais à partir d'un compteur d'échecs — Expo dit explicitement quand
      // un jeton est mort, et c'est cette parole-là qu'on suit.
      if (code === 'DeviceNotRegistered') {
        jetonsMorts.push(jeton);
      } else {
        erreurs.push(`${code} : ${typeof ticket.message === 'string' ? ticket.message : ''}`);
      }
    }
  }

  if (jetonsMorts.length > 0) {
    await base.from('appareils').delete().in('jeton', [...new Set(jetonsMorts)]);
  }

  if (erreurs.length > 0) {
    const ids = envois.map((e) => e.id);
    await base
      .from('envois_notification')
      .update({ erreur: erreurs.join(' | ').slice(0, 500) })
      .in('id', ids);
  }

  return repondre({
    reclames: envois.length,
    messages: aEnvoyer.length,
    envoyes,
    jetons_retires: [...new Set(jetonsMorts)].length,
    erreurs: erreurs.slice(0, 5),
  });
});
