// Le suivi entre amis : les appels à la base.
//
// Mince par construction : chaque fonction se contente d'appeler une fonction
// SQL de `supabase/amis.sql` et de rendre le résultat tel quel. Aucune décision
// ici — elles sont dans `amis.ts`, où elles se testent sans réseau.
//
// Ce module ne décide donc pas non plus qui a le droit : les politiques RLS le
// font, et c'est là que l'autorisation doit rester. Un identifiant n'est jamais
// « vérifié » ici avant l'appel ; il est passé, et la base tranche.

import { utilisateurCourant } from '@/lib/auth';
import { getClientDonnees, type ClientSupabase } from '@/lib/supabase';

// `@/lib/amis` et non `./amis` : le second désignerait ce fichier-ci, qui
// porte le même nom — une importation circulaire que TypeScript signale et
// que le regroupement résoudrait en `undefined`.
import { lirePointAmi, type LigneAmiBrute, type PointAmi } from '@/lib/amis';

export type ResultatAmis =
  | { statut: 'ok'; amis: PointAmi[] }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

export type ResultatCode =
  | { statut: 'ok'; code: string }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

export type ResultatAjout =
  | { statut: 'ok'; amiId: string }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

/**
 * Le délai au-delà duquel un appel aux amis est déclaré perdu.
 *
 * CHAQUE appel de ce module est borné, et ce n'est pas une précaution de
 * confort. Le client Supabase sérialise la lecture de session derrière un
 * verrou de stockage ; un verrou jamais relâché — une écriture de session
 * interrompue, un redémarrage au mauvais moment — laisse la promesse en attente
 * pour toujours. Sur l'écran, « en attente pour toujours » et « planté » se
 * ressemblent exactement : le rond tourne, et il n'y a rien à lire.
 *
 * Dix secondes : un appel RPC qui n'a pas répondu en dix secondes ne répondra
 * plus, et mieux vaut le dire que d'attendre.
 */
const DELAI_APPEL_MS = 10000;

/** Marqueur d'un délai dépassé. Jamais `null`, qui veut dire « pas d'erreur ». */
const DELAI_DEPASSE = Symbol('delai-depasse');

/** Le message rendu quand le délai est dépassé — en français, et agissable. */
const MESSAGE_DELAI =
  'La base n’a pas répondu à temps. Vérifie ta connexion, puis rouvre cette page.';

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

/** Le résultat d'un appel RPC, ou la raison pour laquelle il n'a pas abouti. */
type AppelRpc = { data: unknown } | { erreur: string };

/** Un appel RPC borné, dont l'échec est rendu au lieu d'être attendu. */
async function appelerRpc(
  client: ClientAmis,
  fonction: string,
  parametres: Record<string, unknown>
): Promise<AppelRpc> {
  const reponse = await borner(client.rpc(fonction, parametres));
  if (reponse === DELAI_DEPASSE) return { erreur: MESSAGE_DELAI };
  if (reponse.error !== null) return { erreur: reponse.error.message };
  return { data: reponse.data };
}

/**
 * La date du jour, au format `AAAA-MM-JJ`.
 *
 * Elle est passée à la base au lieu d'être lue par `NOW()`. Deux raisons : le
 * calcul de la semaine devient éprouvable (le banc le déplace), et la semaine
 * est celle de l'apprenant, pas celle du serveur — un décalage de fuseau
 * changerait le lundi en dimanche.
 *
 * Construite à la main plutôt que par `toISOString()` : celui-ci convertit en
 * UTC et ferait basculer la date d'un jour en soirée, ce que ce projet a déjà
 * payé une fois. Voir `src/lib/dates.ts`.
 */
function aujourdhuiLocal(): string {
  const d = new Date();
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/** Le client et l'utilisateur, ou la raison de ne pas continuer. */
async function contexte(): Promise<
  | { client: ClientSupabase; userId: string }
  | { refus: 'indisponible' | 'non_authentifie' | 'delai' }
> {
  const client = getClientDonnees();
  if (client === null) return { refus: 'indisponible' };

  // Borné, lui aussi : c'est justement cette lecture de session qui se sérialise
  // derrière le verrou de stockage, et c'est donc le premier endroit où l'on
  // peut attendre indéfiniment. Un délai ici rend un refus explicite plutôt
  // qu'un rond qui tourne — l'appelant n'a pas à savoir *pourquoi* la session
  // n'a pas répondu.
  const utilisateur = await borner(utilisateurCourant());
  if (utilisateur === DELAI_DEPASSE) return { refus: 'delai' };
  if (utilisateur === null) return { refus: 'non_authentifie' };
  return { client, userId: utilisateur.id };
}

/**
 * Traduit un refus de contexte en résultat pour l'appelant.
 *
 * `indisponible` et `non_authentifie` sont deux états que l'écran sait déjà
 * montrer. Le délai, lui, est une panne : on le dit, sinon l'écran resterait
 * silencieux alors que l'utilisateur vient de demander quelque chose.
 */
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

/** Le code d'invitation du compte connecté, créé s'il n'existe pas encore. */
export async function monCodeAmi(): Promise<ResultatCode> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  // Le client étroit de `supabase.ts` ne déclare que les deux appels de la
  // sauvegarde. Les amis ont besoin d'un `rpc` qui rende des données, et d'un
  // `from().select()` sans `eq`. On élargit donc localement, à cet endroit
  // précis, plutôt que de gonfler l'interface partagée.
  const client = ctx.client as unknown as ClientAmis;

  const appel = await appelerRpc(client, 'obtenir_code_ami', { p_user_id: ctx.userId });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };

  // La fonction rend `null` quand elle n'a rien pu écrire — cas d'un appel sur
  // le profil d'un autre. Le dire clairement vaut mieux qu'un code vide.
  if (typeof appel.data !== 'string' || appel.data.length === 0) {
    return { statut: 'erreur', message: "Le code n'a pas pu être créé." };
  }
  return { statut: 'ok', code: appel.data };
}

/** Un nouveau code, qui invalide l'ancien. */
export async function regenererMonCodeAmi(): Promise<ResultatCode> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'regenerer_code_ami', { p_user_id: ctx.userId });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };
  if (typeof appel.data !== 'string' || appel.data.length === 0) {
    return { statut: 'erreur', message: "Le code n'a pas pu être régénéré." };
  }
  return { statut: 'ok', code: appel.data };
}

/** Ajoute un ami par son code. Le suivi est immédiat, sans acceptation. */
export async function ajouterAmiParCode(codeSaisi: string): Promise<ResultatAjout> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'ajouter_ami_par_code', {
    p_user_id: ctx.userId,
    p_code: codeSaisi,
  });

  if ('erreur' in appel) {
    // L'erreur porte un code SQL, et c'est lui qu'on lit — pas le texte, qui
    // peut être reformulé côté base sans prévenir. Le délai dépassé, lui, n'a
    // pas de code : il est rendu comme une panne, pas comme un refus.
    if (appel.erreur === MESSAGE_DELAI) return { statut: 'erreur', message: appel.erreur };
    return { statut: 'refuse', code: null, message: appel.erreur };
  }
  return { statut: 'ok', amiId: String(appel.data) };
}

/** Retire un ami. La relation disparaît des deux côtés : il n'y a qu'une ligne. */
export async function retirerAmi(amiId: string): Promise<ResultatAmis> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  // On supprime la ligne dont on fait partie, dans l'ordre canonique imposé par
  // la table. On ne peut pas « supprimer un ami » directement : on supprime la
  // relation, et elle est la même dans les deux sens.
  const [a, b] = [ctx.userId, amiId].sort();
  const reponse = await borner(client.from('amis').delete().eq('user_a', a).eq('user_b', b));
  if (reponse === DELAI_DEPASSE) return { statut: 'erreur', message: MESSAGE_DELAI };
  if (reponse.error !== null) return { statut: 'erreur', message: reponse.error.message };
  return mesAmis();
}

/** La liste des amis, avec leur point. */
export async function mesAmis(): Promise<ResultatAmis> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'mes_amis', {
    p_moi: ctx.userId,
    p_aujourdhui: aujourdhuiLocal(),
  });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };

  const lignes: LigneAmiBrute[] = Array.isArray(appel.data)
    ? (appel.data as LigneAmiBrute[])
    : [];
  const amis = lignes.map(lirePointAmi).filter((p): p is PointAmi => p !== null);
  return { statut: 'ok', amis };
}

// === Le client élargi, local à ce module ===================================
interface ErreurSupabase {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Le code d'erreur, sous les deux noms possibles.
 *
 * PostgREST rend le code SQL tantôt dans `code`, tantôt dans `details` selon la
 * version de la passerelle. On regarde les deux : un seul des deux lirait le
 * vide et l'on retomberait sur le message générique, qui ne distingue pas
 * « code inconnu » de « panne ».
 *
 * Conservé même si l'appel borné ne s'en sert plus pour l'instant : c'est lui
 * qui alimente `messageErreurAmi`, et le refus d'ajout doit continuer de parler
 * du code SQL, pas de la panne réseau.
 */
export function codeErreur(erreur: ErreurSupabase): string | null {
  if (typeof erreur.code === 'string' && erreur.code.length > 0) return erreur.code;
  const dansDetails = erreur.details?.match(/^[0-9A-Z]{5}$/)?.[0];
  return dansDetails ?? null;
}

type ReponseRpc = { data: unknown; error: ErreurSupabase | null };

interface ClientAmis {
  rpc(fonction: string, parametres: Record<string, unknown>): PromiseLike<ReponseRpc>;
  from(table: string): {
    select(colonnes: string): PromiseLike<{ data: unknown; error: ErreurSupabase | null }>;
    delete(): {
      eq(colonne: string, valeur: string): {
        eq(colonne: string, valeur: string): PromiseLike<{ data: unknown; error: ErreurSupabase | null }>;
      };
    };
  };
}
