// Les notifications : les appels à la base.
//
// Calqué sur `src/lib/sync/discussion.ts`, et pour les mêmes raisons. Mince par
// construction : chaque fonction appelle une fonction SQL de
// `supabase/notifications.sql` et rend le résultat tel quel. Aucune décision de
// forme ici — elles sont dans `notifications.ts`, où elles se testent sans
// réseau.
//
// CE MODULE NE PARLE PAS À EXPO. Enregistrer un jeton et écrire des
// préférences sont deux choses distinctes, et les séparer n'est pas un goût :
// c'est ce qui permet d'éprouver les écritures sans installer de module natif,
// et de comprendre, quand quelque chose ne marche pas, si le défaut est dans
// l'autorisation, dans le jeton, ou dans les réglages.
//
// CHAQUE appel est borné, comme partout ailleurs. Le client Supabase sérialise
// la lecture de session derrière un verrou de stockage, et un verrou jamais
// relâché laisse la promesse en attente pour toujours — ce que ce projet a déjà
// payé une fois.

import { utilisateurCourant } from '@/lib/auth';
import { getClientDonnees, type ClientSupabase } from '@/lib/supabase';

import {
  lirePreferences,
  type LignePreferencesBrute,
  type PreferencesNotifications,
} from '@/lib/notifications';

export type ResultatPreferences =
  | { statut: 'ok'; preferences: PreferencesNotifications }
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

export type ResultatCompte =
  | { statut: 'ok'; nombre: number }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

const DELAI_APPEL_MS = 10000;

const DELAI_DEPASSE = Symbol('delai-depasse');

const MESSAGE_DELAI =
  'Les réglages n’ont pas répondu à temps. Vérifie ta connexion, puis rouvre cette page.';

function borner<T>(promesse: PromiseLike<T>): Promise<T | typeof DELAI_DEPASSE> {
  return Promise.race([
    Promise.resolve(promesse),
    new Promise<typeof DELAI_DEPASSE>((resoudre) =>
      setTimeout(() => resoudre(DELAI_DEPASSE), DELAI_APPEL_MS)
    ),
  ]);
}

async function contexte(): Promise<
  | { client: ClientNotifications; userId: string }
  | { refus: 'indisponible' | 'non_authentifie' | 'delai' }
> {
  const client = getClientDonnees();
  if (client === null) return { refus: 'indisponible' };

  const utilisateur = await borner(utilisateurCourant());
  if (utilisateur === DELAI_DEPASSE) return { refus: 'delai' };
  if (utilisateur === null) return { refus: 'non_authentifie' };
  return { client: client as unknown as ClientNotifications, userId: utilisateur.id };
}

function refuser(
  refus: 'indisponible' | 'non_authentifie' | 'delai'
): { statut: 'indisponible' } | { statut: 'non_authentifie' } | { statut: 'erreur'; message: string } {
  if (refus === 'delai') return { statut: 'erreur', message: MESSAGE_DELAI };
  return { statut: refus === 'non_authentifie' ? 'non_authentifie' : 'indisponible' };
}

function refuserAppel(
  appel: { erreur: ErreurSupabase | string }
): { statut: 'refuse'; code: string | null; message: string } | { statut: 'erreur'; message: string } {
  if (typeof appel.erreur === 'string') return { statut: 'erreur', message: appel.erreur };
  const code = codeErreur(appel.erreur);
  const propre = (appel.erreur.message ?? '').trim();
  return {
    statut: 'refuse',
    code,
    message: propre.length > 0 ? propre : "Ce réglage n'a pas pu être enregistré.",
  };
}

/**
 * Mes préférences, avec les défauts posés pour une ligne absente.
 *
 * La fonction SQL rend TOUJOURS une ligne — elle comble elle-même ce qui
 * manque. Un tableau vide ne veut donc pas dire « tout est éteint » : il veut
 * dire que la base n'a pas répondu, et on retombe alors sur les défauts, quitte
 * à mentir un peu sur l'état réel. L'alternative — six interrupteurs éteints —
 * serait un mensonge plus grand, et décourageant.
 */
export async function mesPreferences(): Promise<ResultatPreferences> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'mes_preferences_notifications', { p_moi: ctx.userId });
  if ('erreur' in appel) return refuserAppel(appel);

  const lignes: LignePreferencesBrute[] = Array.isArray(appel.data)
    ? (appel.data as LignePreferencesBrute[])
    : [];
  return { statut: 'ok', preferences: lirePreferences(lignes[0] ?? null) };
}

/** Écrit les six préférences d'un coup. */
export async function enregistrerPreferences(
  preferences: PreferencesNotifications
): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'enregistrer_preferences_notifications', {
    p_moi: ctx.userId,
    p_messages: preferences.messages,
    p_demandes_amis: preferences.demandes_amis,
    p_progression_partagee: preferences.progression_partagee,
    p_rappels_apprentissage: preferences.rappels_apprentissage,
    p_rappels_revision: preferences.rappels_revision,
    p_masquer_contenu: preferences.masquer_contenu,
  });
  if ('erreur' in appel) return refuserAppel(appel);
  return { statut: 'ok', fait: appel.data === true };
}

/**
 * Enregistre l'appareil, et son jeton.
 *
 * Le geste passe par une fonction SQL et non par un `insert` direct : le jeton
 * est la clé primaire, donc un appareil qui change de compte doit RÉÉCRIRE une
 * ligne qui appartient encore à l'ancien — ce que la politique de mise à jour
 * interdit, et à raison. La fonction règle ce cas précis, et elle vérifie
 * `auth.uid() = p_moi` dans son corps.
 */
export async function enregistrerAppareil(
  jeton: string,
  plateforme: 'ios' | 'android'
): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'enregistrer_appareil', {
    p_moi: ctx.userId,
    p_jeton: jeton,
    p_plateforme: plateforme,
  });
  if ('erreur' in appel) return refuserAppel(appel);
  return { statut: 'ok', fait: appel.data === true };
}

/**
 * Retire l'appareil.
 *
 * Appelé à la déconnexion, et c'est important : sans cela, le compte quitté
 * continuerait de recevoir des notifications sur un téléphone qui n'est plus le
 * sien — et les lire, puisque rien ne les lui retire.
 */
export async function oublierAppareil(jeton: string): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'oublier_appareil', { p_jeton: jeton });
  if ('erreur' in appel) return refuserAppel(appel);
  return { statut: 'ok', fait: appel.data === true };
}

/**
 * Annonce une étape à ses amis.
 *
 * Rend le NOMBRE d'amis effectivement prévenus, et non un booléen : zéro est
 * une réponse utile — « personne n'a été prévenu » — et l'écran peut alors
 * l'expliquer, au lieu d'afficher un succès pour quelque chose qui n'est pas
 * parti.
 */
export async function annoncerEtape(texte: string): Promise<ResultatCompte> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const appel = await appelerRpc(ctx.client, 'annoncer_etape', {
    p_moi: ctx.userId,
    p_texte: texte,
  });
  if ('erreur' in appel) return refuserAppel(appel);

  const brut = typeof appel.data === 'number' ? appel.data : Number(appel.data ?? 0);
  return { statut: 'ok', nombre: Number.isFinite(brut) ? Math.max(0, Math.round(brut)) : 0 };
}

// === Le client élargi, local à ce module ===================================

interface ErreurSupabase {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

type AppelRpc = { data: unknown } | { erreur: ErreurSupabase | string };

async function appelerRpc(
  client: ClientNotifications,
  fonction: string,
  parametres: Record<string, unknown>
): Promise<AppelRpc> {
  const reponse = await borner(client.rpc(fonction, parametres));
  if (reponse === DELAI_DEPASSE) return { erreur: MESSAGE_DELAI };
  if (reponse.error !== null) return { erreur: reponse.error };
  return { data: reponse.data };
}

/**
 * Le code d'erreur, sous les deux noms possibles.
 *
 * Même lecture que pour la discussion : PostgREST rend le code SQL tantôt dans
 * `code`, tantôt dans `details` selon la version de la passerelle.
 */
export function codeErreur(erreur: ErreurSupabase): string | null {
  if (typeof erreur.code === 'string' && erreur.code.length > 0) return erreur.code;
  const dansDetails = erreur.details?.match(/^[0-9A-Z]{5}$/)?.[0];
  return dansDetails ?? null;
}

type ReponseRpc = { data: unknown; error: ErreurSupabase | null };

interface ClientNotifications {
  rpc(fonction: string, parametres: Record<string, unknown>): PromiseLike<ReponseRpc>;
}

// `ClientSupabase` est importé pour que le jour où ce module écrira directement
// dans une table, le type élargi soit déjà là et la forme attendue évidente.
export type { ClientSupabase };
