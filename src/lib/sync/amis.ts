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
  { client: ClientSupabase; userId: string } | { refus: 'indisponible' | 'non_authentifie' }
> {
  const client = getClientDonnees();
  if (client === null) return { refus: 'indisponible' };
  const utilisateur = await utilisateurCourant();
  if (utilisateur === null) return { refus: 'non_authentifie' };
  return { client, userId: utilisateur.id };
}

/** Le code d'invitation du compte connecté, créé s'il n'existe pas encore. */
export async function monCodeAmi(): Promise<ResultatCode> {
  const ctx = await contexte();
  if ('refus' in ctx) return { statut: ctx.refus };

  // Le client étroit de `supabase.ts` ne déclare que les deux appels de la
  // sauvegarde. Les amis ont besoin d'un `rpc` qui rende des données, et d'un
  // `from().select()` sans `eq`. On élargit donc localement, à cet endroit
  // précis, plutôt que de gonfler l'interface partagée.
  const client = ctx.client as unknown as ClientAmis;

  const { data, error } = await client.rpc('obtenir_code_ami', { p_user_id: ctx.userId });
  if (error !== null) return { statut: 'erreur', message: error.message };

  // La fonction rend `null` quand elle n'a rien pu écrire — cas d'un appel sur
  // le profil d'un autre. Le dire clairement vaut mieux qu'un code vide.
  if (typeof data !== 'string' || data.length === 0) {
    return { statut: 'erreur', message: "Le code n'a pas pu être créé." };
  }
  return { statut: 'ok', code: data };
}

/** Un nouveau code, qui invalide l'ancien. */
export async function regenererMonCodeAmi(): Promise<ResultatCode> {
  const ctx = await contexte();
  if ('refus' in ctx) return { statut: ctx.refus };

  const client = ctx.client as unknown as ClientAmis;
  const { data, error } = await client.rpc('regenerer_code_ami', { p_user_id: ctx.userId });
  if (error !== null) return { statut: 'erreur', message: error.message };
  if (typeof data !== 'string' || data.length === 0) {
    return { statut: 'erreur', message: "Le code n'a pas pu être régénéré." };
  }
  return { statut: 'ok', code: data };
}

/** Ajoute un ami par son code. Le suivi est immédiat, sans acceptation. */
export async function ajouterAmiParCode(codeSaisi: string): Promise<ResultatAjout> {
  const ctx = await contexte();
  if ('refus' in ctx) return { statut: ctx.refus };

  const client = ctx.client as unknown as ClientAmis;
  const { data, error } = await client.rpc('ajouter_ami_par_code', {
    p_user_id: ctx.userId,
    p_code: codeSaisi,
  });

  if (error !== null) {
    // L'erreur porte un code SQL, et c'est lui qu'on lit — pas le texte, qui
    // peut être reformulé côté base sans prévenir.
    return { statut: 'refuse', code: codeErreur(error), message: error.message };
  }
  return { statut: 'ok', amiId: String(data) };
}

/** Retire un ami. La relation disparaît des deux côtés : il n'y a qu'une ligne. */
export async function retirerAmi(amiId: string): Promise<ResultatAmis> {
  const ctx = await contexte();
  if ('refus' in ctx) return { statut: ctx.refus };

  const client = ctx.client as unknown as ClientAmis;
  // On supprime la ligne dont on fait partie, dans l'ordre canonique imposé par
  // la table. On ne peut pas « supprimer un ami » directement : on supprime la
  // relation, et elle est la même dans les deux sens.
  const [a, b] = [ctx.userId, amiId].sort();
  const { error } = await client.from('amis').delete().eq('user_a', a).eq('user_b', b);
  if (error !== null) return { statut: 'erreur', message: error.message };
  return mesAmis();
}

/** La liste des amis, avec leur point. */
export async function mesAmis(): Promise<ResultatAmis> {
  const ctx = await contexte();
  if ('refus' in ctx) return { statut: ctx.refus };

  const client = ctx.client as unknown as ClientAmis;
  const { data, error } = await client.rpc('mes_amis', {
    p_moi: ctx.userId,
    p_aujourdhui: aujourdhuiLocal(),
  });
  if (error !== null) return { statut: 'erreur', message: error.message };

  const lignes: LigneAmiBrute[] = Array.isArray(data) ? (data as LigneAmiBrute[]) : [];
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
 */
function codeErreur(erreur: ErreurSupabase): string | null {
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
