// L'espace de discussion : les appels à la base.
//
// Calqué sur `src/lib/sync/amis.ts`, et pour les mêmes raisons. Mince par
// construction : chaque fonction appelle une fonction SQL de
// `supabase/discussions.sql` et rend le résultat tel quel. Aucune décision de
// forme ici — elles sont dans `discussion.ts`, où elles se testent sans réseau.
//
// Ce module ne décide donc pas non plus qui a le droit : les politiques RLS le
// font, et c'est là que l'autorisation doit rester. Un identifiant n'est jamais
// « vérifié » ici avant l'appel ; il est passé, et la base tranche.
//
// CHAQUE appel est borné. Ce n'est pas une précaution de confort : le client
// Supabase sérialise la lecture de session derrière un verrou de stockage, et
// un verrou jamais relâché laisse la promesse en attente pour toujours. Sur
// l'écran, « en attente pour toujours » et « planté » se ressemblent
// exactement. C'est ce qui a été payé une fois sur ce projet.

import { utilisateurCourant } from '@/lib/auth';
import { getClientDonnees, type ClientSupabase } from '@/lib/supabase';

import {
  lireMessage,
  messageErreurDiscussion,
  preparerEnvoi,
  type LigneMessageBrute,
  type MessageDiscussion,
} from '@/lib/discussion';

export type ResultatFil =
  | { statut: 'ok'; messages: MessageDiscussion[] }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

export type ResultatEnvoi =
  | { statut: 'ok'; message: MessageDiscussion }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

export type ResultatGeste =
  | { statut: 'ok'; fait: boolean }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

/**
 * Le délai au-delà duquel un appel à la discussion est déclaré perdu.
 *
 * Dix secondes, la même valeur que pour les amis : un appel qui n'a pas
 * répondu en dix secondes ne répondra plus, et mieux vaut le dire que
 * d'attendre.
 */
const DELAI_APPEL_MS = 10000;

/** Marqueur d'un délai dépassé. Jamais `null`, qui veut dire « pas de résultat ». */
const DELAI_DEPASSE = Symbol('delai-depasse');

/** Le message rendu quand le délai est dépassé — en français, et agissable. */
const MESSAGE_DELAI =
  'La discussion n’a pas répondu à temps. Vérifie ta connexion, puis rouvre cette page.';

/**
 * Borne une promesse.
 *
 * L'appel parti n'est pas annulé — on ne peut pas interrompre une requête déjà
 * transmise — mais on cesse de l'attendre, et l'écran reprend la main.
 */
function borner<T>(promesse: PromiseLike<T>): Promise<T | typeof DELAI_DEPASSE> {
  return Promise.race([
    Promise.resolve(promesse),
    new Promise<typeof DELAI_DEPASSE>((resoudre) =>
      setTimeout(() => resoudre(DELAI_DEPASSE), DELAI_APPEL_MS)
    ),
  ]);
}

/** Le client et l'utilisateur, ou la raison de ne pas continuer. */
async function contexte(): Promise<
  | { client: ClientDiscussion; userId: string }
  | { refus: 'indisponible' | 'non_authentifie' | 'delai' }
> {
  const client = getClientDonnees();
  if (client === null) return { refus: 'indisponible' };

  // Borné, lui aussi : c'est cette lecture de session qui se sérialise derrière
  // le verrou de stockage, donc le premier endroit où l'on peut attendre
  // indéfiniment. Un délai ici rend un refus explicite plutôt qu'un rond qui
  // tourne.
  const utilisateur = await borner(utilisateurCourant());
  if (utilisateur === DELAI_DEPASSE) return { refus: 'delai' };
  if (utilisateur === null) return { refus: 'non_authentifie' };
  return { client: client as unknown as ClientDiscussion, userId: utilisateur.id };
}

/** Traduit un refus de contexte en résultat pour l'appelant. */
function refuser(
  refus: 'indisponible' | 'non_authentifie' | 'delai',
  repli: 'indisponible' | 'non_authentifie' = 'indisponible'
):
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string } {
  if (refus === 'delai') return { statut: 'erreur', message: MESSAGE_DELAI };
  return { statut: refus === 'non_authentifie' ? 'non_authentifie' : repli };
}

/**
 * L'ordre canonique d'une paire.
 *
 * Le même que la contrainte de la table : `user_a < user_b`. Le refaire ici
 * n'est pas une duplication inutile — c'est ce qui évite d'envoyer une paire
 * que la base refusera, et donc un aller-retour pour rien. La base reste
 * l'arbitre : ceci est une courtoisie, pas une garde.
 */
export function paireCanonique(moi: string, ami: string): [string, string] {
  return moi < ami ? [moi, ami] : [ami, moi];
}

/** Les messages d'un fil, du plus ancien au plus récent. */
export async function lireFil(amiId: string): Promise<ResultatFil> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'lire_fil', {
    p_moi: ctx.userId,
    p_ami: amiId,
  });
  if ('erreur' in appel) return refuserAppel(appel);

  const lignes: LigneMessageBrute[] = Array.isArray(appel.data)
    ? (appel.data as LigneMessageBrute[])
    : [];
  const messages = lignes.map(lireMessage).filter((m): m is MessageDiscussion => m !== null);
  return { statut: 'ok', messages };
}

/**
 * Envoie un message.
 *
 * Le texte est préparé ici — détouré, sans ses caractères de contrôle — pour
 * que la base ne reçoive jamais autre chose que ce que l'écran a montré. La
 * borne de longueur, elle, n'est PAS revérifiée ici : `refusEnvoi` est la
 * décision, et elle appartient à l'appelant. Un second contrôle ferait deux
 * endroits où la règle s'écrit, et donc deux occasions de diverger.
 */
export async function envoyerMessage(amiId: string, saisie: string): Promise<ResultatEnvoi> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const [a, b] = paireCanonique(ctx.userId, amiId);
  const reponse = await borner(
    ctx.client.from('discussion_messages').insert({
      user_a: a,
      user_b: b,
      auteur: ctx.userId,
      corps: preparerEnvoi(saisie),
    })
  );

  if (reponse === DELAI_DEPASSE) return { statut: 'erreur', message: MESSAGE_DELAI };
  if (reponse.error !== null) return refuserAppel({ erreur: reponse.error });

  // `insert` sans `select` ne rend pas la ligne écrite : on relit le fil, ce
  // qui garantit que ce qu'on affiche est bien ce que la base contient — un
  // message que la politique aurait refusé en silence ne serait pas dans le
  // fil, et on ne l'aurait pas inventé.
  const apres = await lireFil(amiId);
  if (apres.statut !== 'ok') return apres as ResultatEnvoi;

  const dernier = apres.messages.length > 0 ? apres.messages[apres.messages.length - 1] : null;
  if (dernier === null) {
    return { statut: 'erreur', message: "Le message parti n'apparaît pas dans la discussion." };
  }
  return { statut: 'ok', message: dernier };
}

/**
 * Retire un message du fil.
 *
 * L'auteur peut retirer le sien ; un modérateur peut retirer n'importe lequel.
 * La règle est en base — la fonction `retirer_message` s'appuie sur la
 * politique d'UPDATE — et elle rend `false` quand elle n'a pas pris. Un
 * `false` n'est donc pas une erreur : c'est le cas normal de quelqu'un qui
 * n'avait pas le droit.
 */
export async function retirerMessage(messageId: number): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'retirer_message', { p_message: messageId });
  if ('erreur' in appel) return refuserAppel(appel);
  return { statut: 'ok', fait: appel.data === true };
}

/** Masque un message. Réservé au modérateur — la base refuse les autres. */
export async function masquerMessage(messageId: number): Promise<ResultatGeste> {
  return gesteDeModeration('masquer_message', messageId);
}

/** Défait un masquage. Réversible, et c'est ce qui en fait le geste par défaut. */
export async function demasquerMessage(messageId: number): Promise<ResultatGeste> {
  return gesteDeModeration('demasquer_message', messageId);
}

async function gesteDeModeration(fonction: string, messageId: number): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, fonction, { p_message: messageId });
  if ('erreur' in appel) return refuserAppel(appel);
  return { statut: 'ok', fait: appel.data === true };
}

// === Le client élargi, local à ce module ===================================

interface ErreurSupabase {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** Le résultat d'un appel RPC, ou la raison pour laquelle il n'a pas abouti. */
type AppelRpc = { data: unknown } | { erreur: ErreurSupabase | string };

/**
 * Un appel RPC borné, dont l'échec est rendu au lieu d'être attendu.
 *
 * `erreur` porte soit l'objet d'erreur de Supabase, soit le message du délai
 * dépassé. Les deux se distinguent au moment de traduire, et c'est voulu : un
 * délai dépassé n'a pas de code SQL, et ne doit donc jamais être présenté comme
 * un refus métier.
 */
async function appelerRpc(
  client: ClientDiscussion,
  fonction: string,
  parametres: Record<string, unknown>
): Promise<AppelRpc> {
  const reponse = await borner(client.rpc(fonction, parametres));
  if (reponse === DELAI_DEPASSE) return { erreur: MESSAGE_DELAI };
  if (reponse.error !== null) return { erreur: reponse.error };
  return { data: reponse.data };
}

/**
 * Traduit l'échec d'un appel en résultat.
 *
 * Le délai dépassé est une panne : on le dit, sinon l'écran resterait
 * silencieux alors que quelqu'un vient d'envoyer un message. Le refus, lui,
 * porte un code SQL, et c'est `messageErreurDiscussion` qui le traduit — mais
 * le code est aussi rendu, pour que l'écran puisse décider d'un geste
 * particulier (proposer de rouvrir la page, par exemple).
 */
function refuserAppel(
  appel: { erreur: ErreurSupabase | string }
):
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string } {
  if (typeof appel.erreur === 'string') {
    return { statut: 'erreur', message: appel.erreur };
  }
  return {
    statut: 'refuse',
    code: codeErreur(appel.erreur),
    message: messageErreurDiscussion(codeErreur(appel.erreur), appel.erreur.message),
  };
}

/**
 * Le code d'erreur, sous les deux noms possibles.
 *
 * PostgREST rend le code SQL tantôt dans `code`, tantôt dans `details` selon la
 * version de la passerelle. On regarde les deux : un seul des deux lirait le
 * vide, et l'on retomberait sur le message générique, qui ne distingue pas
 * « pas le droit » de « panne ».
 */
export function codeErreur(erreur: ErreurSupabase): string | null {
  if (typeof erreur.code === 'string' && erreur.code.length > 0) return erreur.code;
  const dansDetails = erreur.details?.match(/^[0-9A-Z]{5}$/)?.[0];
  return dansDetails ?? null;
}

type ReponseRpc = { data: unknown; error: ErreurSupabase | null };

interface ClientDiscussion {
  rpc(fonction: string, parametres: Record<string, unknown>): PromiseLike<ReponseRpc>;
  from(table: string): {
    insert(ligne: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: ErreurSupabase | null;
    }>;
  };
}
