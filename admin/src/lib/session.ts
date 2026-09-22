// ============================================================================
// Qui est devant l'ecran, et le sait-on ?
//
// Six etats, et la distinction qui compte est entre les deux derniers :
//
//   « sans_droit »             — la base a repondu : ce compte n'est pas
//                                administrateur ;
//   « verification_impossible » — la base n'a pas repondu, ou pas lisiblement.
//
// Les confondre serait la faute la plus couteuse de cet ecran. Un
// administrateur dont la connexion hoquette verrait « vous n'avez pas les
// droits » et irait chercher un probleme de compte la ou il y a un probleme de
// reseau. Le doute doit porter sur l'outil, pas sur la personne.
//
// `getUser()` merite une note : sans session, il ne leve pas d'exception, il
// rend `{ data: { user: null }, error: AuthSessionMissingError }`. C'est le cas
// NORMAL d'un visiteur qui arrive sur la page — pas une panne. Le predicat
// `isAuthSessionMissingError` existe pour cela ; le tester par message d'erreur
// serait fragile, et le confondre avec une panne rendrait le tableau de bord
// inutilisable pour quiconque n'est pas encore connecte.
// ============================================================================

import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { clientSupabase, lireConfiguration } from './supabase.ts';

export type Role = 'apprenant' | 'administrateur';

export type EtatSession =
  | { etat: 'chargement' }
  | { etat: 'sans_configuration' }
  | { etat: 'anonyme' }
  | { etat: 'connecte'; userId: string; email: string | null; role: Role }
  | { etat: 'sans_droit'; userId: string; email: string | null; role: Role }
  | { etat: 'verification_impossible'; message: string };

/** Vrai quand l'ecran peut afficher les donnees de tout le monde. */
export function estAdministrateur(
  etat: EtatSession
): etat is Extract<EtatSession, { etat: 'connecte' }> {
  return etat.etat === 'connecte';
}

/** Un message d'erreur lisible, sans jamais rendre « [object Object] ». */
function messageDe(erreur: unknown): string {
  if (erreur instanceof Error) return erreur.message;
  if (typeof erreur === 'string') return erreur;
  if (erreur && typeof erreur === 'object' && 'message' in erreur) {
    const message = (erreur as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return 'Erreur inconnue.';
}

/**
 * L'etat de la session, tel qu'il peut etre etabli maintenant.
 *
 * Ne leve jamais : toute panne devient un etat `verification_impossible` porteur
 * de son message. Un ecran qui ne peut pas dire pourquoi il ne sait pas est un
 * ecran qu'on ne peut pas reparer.
 */
export async function chargerSession(): Promise<EtatSession> {
  if (!lireConfiguration()) {
    return { etat: 'sans_configuration' };
  }

  const client = clientSupabase();
  if (!client) {
    return {
      etat: 'verification_impossible',
      message: 'Le client Supabase n\'a pas pu etre construit malgre une configuration presente.',
    };
  }

  let utilisateur: { id: string; email?: string | null } | null = null;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) {
      // Cas normal d'un visiteur : ce n'est pas une panne.
      if (isAuthSessionMissingError(error)) return { etat: 'anonyme' };
      return { etat: 'verification_impossible', message: messageDe(error) };
    }
    utilisateur = data.user ?? null;
  } catch (erreur) {
    if (isAuthSessionMissingError(erreur)) return { etat: 'anonyme' };
    return { etat: 'verification_impossible', message: messageDe(erreur) };
  }

  if (!utilisateur) return { etat: 'anonyme' };

  const email = utilisateur.email ?? null;

  // `maybeSingle` et non `single` : `single` considere zero ligne comme une
  // erreur, ce qui melerait « la ligne n'est pas lisible » et « la requete a
  // echoue ». Ici les deux cas restent distincts.
  let role: string | null = null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select('role')
      .eq('id', utilisateur.id)
      .maybeSingle();

    if (error) {
      return {
        etat: 'verification_impossible',
        message:
          `Le role de ce compte n'a pas pu etre lu : ${messageDe(error)}. ` +
          'La table `profiles` porte-t-elle la colonne `role` ? ' +
          'Le fichier supabase/administration.sql a-t-il ete execute ?',
      };
    }
    if (!data) {
      return {
        etat: 'verification_impossible',
        message:
          'Aucune ligne de profil n\'est lisible pour ce compte. ' +
          'Le compte existe pourtant : la ligne a-t-elle ete creee, et la ' +
          'politique de lecture du proprietaire est-elle en place ?',
      };
    }
    role = (data as { role?: string | null }).role ?? null;
  } catch (erreur) {
    return { etat: 'verification_impossible', message: messageDe(erreur) };
  }

  const roleConnu: Role = role === 'administrateur' ? 'administrateur' : 'apprenant';

  if (roleConnu !== 'administrateur') {
    return { etat: 'sans_droit', userId: utilisateur.id, email, role: roleConnu };
  }

  return { etat: 'connecte', userId: utilisateur.id, email, role: 'administrateur' };
}

/** Se connecter par adresse et mot de passe. Rend `null` si tout va bien. */
export async function seConnecter(email: string, motDePasse: string): Promise<string | null> {
  const client = clientSupabase();
  if (!client) return 'Configuration Supabase absente.';

  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password: motDePasse,
  });

  if (!error) return null;

  // Le message brut de Supabase est en anglais et parle de « credentials ».
  // Le traduire ici, une fois, plutot que dans chaque ecran.
  if (error.message.toLowerCase().includes('invalid login credentials')) {
    return 'Adresse ou mot de passe incorrect.';
  }
  if (error.message.toLowerCase().includes('email not confirmed')) {
    return 'Cette adresse n\'a pas encore ete confirmee. Ouvrez le lien recu par courriel.';
  }
  return messageDe(error);
}

export async function seDeconnecter(): Promise<void> {
  await clientSupabase()?.auth.signOut();
}
