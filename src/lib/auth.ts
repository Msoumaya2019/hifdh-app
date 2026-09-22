// Comptes utilisateurs.
//
// Un compte sert à deux choses, et à deux seulement : retrouver sa progression
// en changeant de téléphone, et la conserver si l'appareil est perdu. Rien dans
// l'application n'exige de compte : elle fonctionne entièrement hors ligne.
//
// Les messages rendus sont en français et exploitables. Les erreurs de
// Supabase sont techniques et en anglais (« Invalid login credentials ») :
// les afficher telles quelles ne dirait rien à l'utilisateur.

import { getSupabase, isSupabaseConfigured } from './supabase';

export interface ResultatAuth {
  ok: boolean;
  message: string;
}

export interface Utilisateur {
  id: string;
  email: string;
}

/** Longueur minimale acceptée par Supabase pour un mot de passe. */
export const LONGUEUR_MOT_DE_PASSE = 6;

function indisponible(): ResultatAuth {
  return {
    ok: false,
    message:
      "La sauvegarde en ligne n'est pas configurée sur cette version de l'application. " +
      'Votre progression reste enregistrée sur cet appareil.',
  };
}

/**
 * Traduit une erreur d'authentification en message utilisable.
 *
 * On s'appuie sur le code quand il est fourni, et sur le texte sinon : tous les
 * chemins de Supabase ne remplissent pas `code`.
 */
function traduireErreur(erreur: { message?: string; code?: string } | null): string {
  const code = erreur?.code ?? '';
  const texte = (erreur?.message ?? '').toLowerCase();

  if (code === 'invalid_credentials' || texte.includes('invalid login credentials')) {
    return 'Adresse ou mot de passe incorrect.';
  }
  if (code === 'email_not_confirmed' || texte.includes('email not confirmed')) {
    return 'Cette adresse doit d’abord être confirmée. Vérifiez vos courriels.';
  }
  if (code === 'user_already_exists' || texte.includes('already registered')) {
    return 'Un compte existe déjà avec cette adresse.';
  }
  if (code === 'weak_password' || texte.includes('password should be at least')) {
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  }
  if (texte.includes('rate limit') || code === 'over_email_send_rate_limit') {
    return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
  }
  if (texte.includes('unable to validate email') || texte.includes('invalid email')) {
    return 'Cette adresse électronique n’est pas valide.';
  }
  if (texte.includes('network') || texte.includes('fetch')) {
    return 'Pas de connexion. Vérifiez votre réseau et réessayez.';
  }
  return 'La connexion a échoué. Réessayez dans un instant.';
}

function verifierSaisie(email: string, motDePasse: string): string | null {
  if (email.trim() === '' || !email.includes('@')) {
    return 'Saisissez une adresse électronique valide.';
  }
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  }
  return null;
}

export async function creerCompte(email: string, motDePasse: string): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  const probleme = verifierSaisie(email, motDePasse);
  if (probleme !== null) return { ok: false, message: probleme };

  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password: motDePasse,
  });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  // Selon la configuration du projet, Supabase confirme l'adresse par courriel
  // ou ouvre la session immédiatement. On ne peut pas le savoir d'avance : le
  // message le dit, plutôt que d'annoncer une connexion qui n'a pas eu lieu.
  if (data.session === null) {
    return {
      ok: true,
      message:
        'Compte créé. Confirmez votre adresse en suivant le lien reçu par courriel, puis connectez-vous.',
    };
  }

  return { ok: true, message: 'Compte créé. Vous êtes connecté.' };
}

export async function seConnecter(email: string, motDePasse: string): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  const probleme = verifierSaisie(email, motDePasse);
  if (probleme !== null) return { ok: false, message: probleme };

  const { error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password: motDePasse,
  });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  return { ok: true, message: 'Connexion réussie.' };
}

export async function seDeconnecter(): Promise<void> {
  const client = getSupabase();
  if (client === null) return;
  await client.auth.signOut();
}

/** L'utilisateur connecté, ou `null`. */
export async function utilisateurCourant(): Promise<Utilisateur | null> {
  const client = getSupabase();
  if (client === null) return null;

  const { data } = await client.auth.getSession();
  const utilisateur = data.session?.user;
  if (utilisateur === undefined || utilisateur === null) return null;

  return { id: utilisateur.id, email: utilisateur.email ?? '' };
}

/**
 * Prévenir l'interface des changements de session.
 *
 * Rend la fonction de désabonnement : sans elle, un écran démonté continuerait
 * d'être rappelé, et React signalerait une mise à jour sur un composant absent.
 */
export function ecouterSession(callback: (utilisateur: Utilisateur | null) => void): () => void {
  const client = getSupabase();
  if (client === null) return () => {};

  const { data } = client.auth.onAuthStateChange((_evenement, session) => {
    const utilisateur = session?.user;
    callback(
      utilisateur === undefined || utilisateur === null
        ? null
        : { id: utilisateur.id, email: utilisateur.email ?? '' }
    );
  });

  return () => data.subscription.unsubscribe();
}

export { isSupabaseConfigured };
