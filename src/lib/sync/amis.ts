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
import {
  lireBlocage,
  lireDemande,
  lirePointAmi,
  lireProfilTrouve,
  type BlocageAmi,
  type CouleurAvatar,
  type DemandeAmi,
  type LigneAmiBrute,
  type LigneBlocageBrute,
  type LigneDemandeBrute,
  type LigneRechercheBrute,
  type PointAmi,
  type ProfilTrouve,
} from '@/lib/amis';

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

export type ResultatDemandes =
  | { statut: 'ok'; demandes: DemandeAmi[] }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

export type ResultatBlocages =
  | { statut: 'ok'; blocages: BlocageAmi[] }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

export type ResultatRecherche =
  | { statut: 'ok'; profils: ProfilTrouve[] }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

/**
 * L'envoi d'une demande. Le nom dit ce qui se passe : on ne devient pas ami,
 * on demande à le devenir.
 */
export type ResultatDemande =
  | { statut: 'ok'; cibleId: string }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'refuse'; code: string | null; message: string }
  | { statut: 'erreur'; message: string };

/** Un geste sans valeur de retour : accepter, refuser, bloquer, débloquer. */
export type ResultatGeste =
  | { statut: 'ok'; fait: boolean }
  | { statut: 'indisponible' }
  | { statut: 'non_authentifie' }
  | { statut: 'erreur'; message: string };

/** Le profil public du compte connecté, tel qu'il se règle. */
export type ProfilPublic = {
  /** Le pseudonyme montré aux amis, ou null si aucun n'a été choisi. */
  nomAffiche: string | null;
  identifiantPublic: string | null;
  avatarCouleur: CouleurAvatar | null;
  partageProgression: boolean;
  partageObjectif: boolean;
};

export type ResultatProfilPublic =
  | { statut: 'ok'; profil: ProfilPublic }
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

/**
 * Le résultat d'un appel RPC, ou la raison pour laquelle il n'a pas abouti.
 *
 * Le CODE SQL est conservé à côté du message, et c'est un ajout qui compte :
 * sans lui, l'écran ne pouvait lire que le texte, que la base peut reformuler
 * sans prévenir — et « ce code n'existe pas » se serait mis à ressembler à
 * « la base est en panne ». Le code est lu par `messageErreurAmi` et par
 * `messageRefusDemande`.
 */
type AppelRpc = { data: unknown } | { erreur: string; code: string | null };

/** Un appel RPC borné, dont l'échec est rendu au lieu d'être attendu. */
async function appelerRpc(
  client: ClientAmis,
  fonction: string,
  parametres: Record<string, unknown>
): Promise<AppelRpc> {
  const reponse = await borner(client.rpc(fonction, parametres));
  if (reponse === DELAI_DEPASSE) return { erreur: MESSAGE_DELAI, code: null };
  if (reponse.error !== null) {
    return { erreur: reponse.error.message, code: codeErreur(reponse.error) };
  }
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

/**
 * Envoie une demande d'ami par le code d'invitation.
 *
 * Le nom a changé avec le modèle : la fonction SQL ne s'appelle plus
 * `ajouter_ami_par_code` mais `demander_ami_par_code`, parce qu'elle n'ajoute
 * plus personne — elle demande. Garder l'ancien nom ici aurait laissé croire à
 * l'écran que l'amitié est faite.
 */
export async function demanderAmiParCode(codeSaisi: string): Promise<ResultatDemande> {
  return envoyerDemande('demander_ami_par_code', { p_code: codeSaisi });
}

/** Envoie une demande d'ami par l'identifiant public, sans arobase. */
export async function demanderAmiParIdentifiant(identifiant: string): Promise<ResultatDemande> {
  return envoyerDemande('demander_ami_par_identifiant', { p_identifiant: identifiant });
}

async function envoyerDemande(
  fonction: string,
  parametres: Record<string, unknown>
): Promise<ResultatDemande> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, fonction, { p_moi: ctx.userId, ...parametres });

  if ('erreur' in appel) {
    // Le délai dépassé n'a pas de code SQL : c'est une panne, pas un refus, et
    // le confondre avec un refus ferait dire à l'écran « ce compte ne peut pas
    // recevoir votre demande » alors que la base n'a simplement pas répondu.
    if (appel.erreur === MESSAGE_DELAI) return { statut: 'erreur', message: appel.erreur };
    return { statut: 'refuse', code: appel.code, message: appel.erreur };
  }
  return { statut: 'ok', cibleId: String(appel.data) };
}

/**
 * Répond à une demande reçue : accepter, ou refuser.
 *
 * `accepter` est un booléen et non deux fonctions, parce que c'est le même
 * geste vu des deux côtés — et parce qu'accepter écrit l'amitié ET efface la
 * demande, ce que la base fait en une seule transaction.
 */
export async function repondreDemande(demandeur: string, accepter: boolean): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'repondre_demande_ami', {
    p_moi: ctx.userId,
    p_de: demandeur,
    p_accepter: accepter,
  });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };
  return { statut: 'ok', fait: appel.data === true };
}

/** Annule une demande qu'on a envoyée. */
export async function annulerDemande(destinataire: string): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'annuler_demande_ami', {
    p_moi: ctx.userId,
    p_vers: destinataire,
  });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };
  return { statut: 'ok', fait: appel.data === true };
}

/**
 * Bloque quelqu'un.
 *
 * Le geste rompt l'amitié et efface les demandes en attente : la base s'en
 * charge en une transaction, et l'écran n'a donc rien à enchaîner lui-même.
 * Un écran qui ferait « rompre puis bloquer » laisserait, en cas
 * d'interruption, une rupture sans blocage — ou l'inverse.
 */
export async function bloquerUtilisateur(cible: string): Promise<ResultatGeste> {
  return gesteSimple('bloquer_utilisateur', { p_cible: cible });
}

export async function debloquerUtilisateur(cible: string): Promise<ResultatGeste> {
  return gesteSimple('debloquer_utilisateur', { p_cible: cible });
}

async function gesteSimple(
  fonction: string,
  parametres: Record<string, unknown>
): Promise<ResultatGeste> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, fonction, { p_moi: ctx.userId, ...parametres });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };
  return { statut: 'ok', fait: appel.data === true };
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

/** Les demandes, reçues et envoyées, en une seule lecture. */
export async function mesDemandes(): Promise<ResultatDemandes> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'mes_demandes', { p_moi: ctx.userId });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };

  const lignes: LigneDemandeBrute[] = Array.isArray(appel.data)
    ? (appel.data as LigneDemandeBrute[])
    : [];
  const demandes = lignes.map(lireDemande).filter((d): d is DemandeAmi => d !== null);
  return { statut: 'ok', demandes };
}

/** Ceux que j'ai bloqués, pour pouvoir les débloquer. */
export async function mesBlocages(): Promise<ResultatBlocages> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'mes_blocages', { p_moi: ctx.userId });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };

  const lignes: LigneBlocageBrute[] = Array.isArray(appel.data)
    ? (appel.data as LigneBlocageBrute[])
    : [];
  const blocages = lignes.map(lireBlocage).filter((b): b is BlocageAmi => b !== null);
  return { statut: 'ok', blocages };
}

/**
 * Cherche quelqu'un par son identifiant public.
 *
 * Le résultat peut être vide sans que ce soit une erreur : c'est le cas normal
 * d'un identifiant qui n'existe pas, ou de quelqu'un qui nous a bloqués. La
 * fonction SQL ne distingue pas les deux, et c'est voulu — un message
 * d'erreur différent apprendrait à l'un qu'il est bloqué.
 */
export async function rechercherParIdentifiant(identifiant: string): Promise<ResultatRecherche> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const appel = await appelerRpc(client, 'rechercher_par_identifiant', {
    p_identifiant: identifiant,
  });
  if ('erreur' in appel) return { statut: 'erreur', message: appel.erreur };

  const lignes: LigneRechercheBrute[] = Array.isArray(appel.data)
    ? (appel.data as LigneRechercheBrute[])
    : [];
  const profils = lignes.map(lireProfilTrouve).filter((p): p is ProfilTrouve => p !== null);
  return { statut: 'ok', profils };
}

/** Mon profil public, tel qu'il se règle. */
export async function monProfilPublic(): Promise<ResultatProfilPublic> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;
  const reponse = await borner(
    client
      .from('profiles')
      .select('display_name, public_id, avatar_couleur, partage_progression, partage_objectif')
      .eq('id', ctx.userId)
  );
  if (reponse === DELAI_DEPASSE) return { statut: 'erreur', message: MESSAGE_DELAI };
  if (reponse.error !== null) return { statut: 'erreur', message: reponse.error.message };

  const ligne = Array.isArray(reponse.data)
    ? (reponse.data[0] as Record<string, unknown> | undefined)
    : undefined;
  if (ligne === undefined) {
    // Zéro ligne n'est pas une erreur de réseau : le profil n'existe pas
    // encore, et l'écran doit pouvoir le dire au lieu de rester vide.
    return { statut: 'erreur', message: "Le profil n'a pas pu être lu." };
  }

  return {
    statut: 'ok',
    profil: {
      // Un pseudonyme vide vaut ABSENT, et non « une chaîne vide » : la base
      // accepte les deux, et l'écran, lui, doit distinguer « je n'ai rien
      // choisi » de « j'ai choisi du blanc ». Le second cas afficherait un nom
      // invisible à côté de l'avatar d'un ami.
      nomAffiche:
        typeof ligne.display_name === 'string' && ligne.display_name.trim().length > 0
          ? ligne.display_name
          : null,
      identifiantPublic: typeof ligne.public_id === 'string' ? ligne.public_id : null,
      avatarCouleur:
        typeof ligne.avatar_couleur === 'string'
          ? (ligne.avatar_couleur as ProfilPublic['avatarCouleur'])
          : null,
      partageProgression: ligne.partage_progression !== false,
      partageObjectif: ligne.partage_objectif === true,
    },
  };
}

/**
 * Enregistre une partie du profil public.
 *
 * Un seul geste pour les quatre colonnes, et non quatre appels : l'écran de
 * réglages en modifie souvent deux d'un coup — l'identifiant et la couleur à
 * l'inscription — et quatre allers-retours laisseraient, en cas
 * d'interruption, un profil à moitié réglé.
 *
 * Les colonnes absentes du paramètre ne sont PAS touchées : c'est ce qui
 * permet de n'envoyer que ce qui change.
 */
export async function enregistrerProfilPublic(
  champs: Partial<{
    nomAffiche: string | null;
    identifiantPublic: string | null;
    avatarCouleur: CouleurAvatar | null;
    partageProgression: boolean;
    partageObjectif: boolean;
  }>
): Promise<ResultatProfilPublic> {
  const ctx = await contexte();
  if ('refus' in ctx) return refuser(ctx.refus);

  const client = ctx.client as unknown as ClientAmis;

  // Le nom des colonnes est écrit ici, une fois : une faute de frappe dans un
  // écran enverrait un champ inconnu, que PostgREST refuse en bloc — et
  // l'erreur parlerait de colonne, pas de ce qu'on voulait régler.
  const charge: Record<string, unknown> = {};
  if ('nomAffiche' in champs) {
    // Un pseudonyme fait de blancs n'est pas un pseudonyme : on l'enregistre
    // comme absent, plutôt que de laisser une chaîne que l'écran des amis
    // afficherait comme un trou.
    const propre = typeof champs.nomAffiche === 'string' ? champs.nomAffiche.trim() : '';
    charge.display_name = propre.length > 0 ? propre : null;
  }
  if ('identifiantPublic' in champs) charge.public_id = champs.identifiantPublic;
  if ('avatarCouleur' in champs) charge.avatar_couleur = champs.avatarCouleur;
  if ('partageProgression' in champs) charge.partage_progression = champs.partageProgression;
  if ('partageObjectif' in champs) charge.partage_objectif = champs.partageObjectif;

  if (Object.keys(charge).length === 0) {
    return { statut: 'erreur', message: 'Aucun réglage à enregistrer.' };
  }

  const reponse = await borner(
    client.from('profiles').update(charge).eq('id', ctx.userId).select('id')
  );
  if (reponse === DELAI_DEPASSE) return { statut: 'erreur', message: MESSAGE_DELAI };
  if (reponse.error !== null) {
    // Un identifiant déjà pris, ou mal formé : ce sont les deux refus réels, et
    // ils ne se disent pas de la même façon à l'écran.
    return {
      statut: 'refuse',
      code: codeErreur(reponse.error),
      message: reponse.error.message,
    };
  }
  return monProfilPublic();
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
export function codeErreur(erreur: ErreurSupabase): string | null {
  if (typeof erreur.code === 'string' && erreur.code.length > 0) return erreur.code;
  const dansDetails = erreur.details?.match(/^[0-9A-Z]{5}$/)?.[0];
  return dansDetails ?? null;
}

type ReponseRpc = { data: unknown; error: ErreurSupabase | null };
type ReponseTable = { data: unknown; error: ErreurSupabase | null };

interface RequeteSelect extends PromiseLike<ReponseTable> {
  eq(colonne: string, valeur: string): PromiseLike<ReponseTable>;
}

/**
 * Le maillon après un `update(...).eq(...)`.
 *
 * Il porte un `select`, et c'est lui qui compte : sans `select`, PostgREST
 * répond 204 sans corps, et l'on ne peut pas distinguer « la ligne a été
 * écrite » de « la politique a refusé, donc zéro ligne touchée ». Le second cas
 * est exactement celui d'une écriture sur le profil de quelqu'un d'autre — un
 * refus silencieux, qui se lirait comme un succès.
 */
interface RequeteModif extends PromiseLike<ReponseTable> {
  select(colonnes: string): PromiseLike<ReponseTable>;
}

interface RequeteUpdate extends PromiseLike<ReponseTable> {
  eq(colonne: string, valeur: string): RequeteModif;
}

interface ClientAmis {
  rpc(fonction: string, parametres: Record<string, unknown>): PromiseLike<ReponseRpc>;
  from(table: string): {
    select(colonnes: string): RequeteSelect;
    update(charge: Record<string, unknown>): RequeteUpdate;
    delete(): {
      eq(colonne: string, valeur: string): {
        eq(colonne: string, valeur: string): PromiseLike<ReponseTable>;
      };
    };
  };
}
