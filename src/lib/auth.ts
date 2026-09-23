// Comptes utilisateurs.
//
// Un compte sert à deux choses, et à deux seulement : retrouver sa progression
// en changeant de téléphone, et la conserver si l'appareil est perdu. Rien dans
// l'application n'exige de compte : elle fonctionne entièrement hors ligne.
//
// Les messages rendus sont en français et exploitables. Les erreurs de
// Supabase sont techniques et en anglais (« Invalid login credentials ») :
// les afficher telles quelles ne dirait rien à l'utilisateur.

import * as Linking from 'expo-linking';

import { getSupabase, isSupabaseConfigured } from './supabase';
import { traduireErreur, verifierEmail, verifierNouveauMotDePasse } from './erreursAuth';

export interface ResultatAuth {
  ok: boolean;
  message: string;
}

/**
 * Le chemin de retour, et pourquoi il est nommé ici.
 *
 * Supabase renvoie l'utilisateur vers l'application après un lien de courriel.
 * L'adresse exacte dépend de l'empaquetage — `hifdh://lien` dans une
 * application installée, `exp://…/--/lien` dans Expo Go — et c'est
 * `Linking.createURL` qui la construit correctement. Écrire `hifdh://` en dur
 * marcherait sur l'IPA et échouerait pendant le développement, ce qui est la
 * pire des combinaisons : un défaut qu'on ne voit qu'en production.
 *
 * UN SEUL chemin pour les deux liens — confirmation d'adresse et
 * réinitialisation. Deux chemins exigeraient deux écrans, qui feraient la même
 * chose à une ligne près ; ici, c'est `lireLienAuth` qui dit de quel lien il
 * s'agit, et l'écran décide ensuite. Une seule adresse à déclarer dans le
 * tableau de bord, donc, et un seul endroit où se tromper.
 *
 * Cette adresse doit figurer dans les « Redirect URLs » du projet Supabase,
 * sinon Supabase refuse de rediriger et l'utilisateur reste sur une page
 * blanche. C'est une action du propriétaire du compte, pas du code.
 */
export const CHEMIN_RETOUR = 'lien';

/** L'adresse de retour vers l'application, pour un chemin donné. */
export function adresseDeRetour(chemin: string): string {
  return Linking.createURL(chemin);
}

export interface Utilisateur {
  id: string;
  email: string;
}

/** Ce qu'on répond quand le projet Supabase n'est pas configuré. */
function indisponible(): ResultatAuth {
  return {
    ok: false,
    message:
      "La sauvegarde en ligne n'est pas configurée sur cette version de l'application. " +
      'Votre progression reste enregistrée sur cet appareil.',
  };
}

/**
 * Les phrases d'erreur et les contrôles de saisie vivent dans
 * `src/lib/erreursAuth.ts`, qui n'importe RIEN.
 *
 * Ce n'est pas un rangement : c'est ce qui les rend éprouvables. Ce fichier-ci
 * importe `./supabase`, donc `expo-constants` et `react-native` ; un test qui
 * l'importerait exigerait tout l'environnement d'une application, et aucun ne le
 * faisait. La traduction des erreurs n'était donc couverte par rien — mesuré, et
 * deux mutations du falsificateur l'ont montré en restant vertes.
 *
 * On ré-exporte pour que les appelants n'aient pas à connaître ce découpage.
 */
export {
  LONGUEUR_MOT_DE_PASSE,
  traduireErreur,
  verifierEmail,
  verifierNouveauMotDePasse,
} from './erreursAuth';

/** Le contrôle d'une adresse ET d'un mot de passe, pour les deux gestes. */
function verifierSaisie(email: string, motDePasse: string): string | null {
  const problemeEmail = verifierEmail(email);
  if (problemeEmail !== null) return problemeEmail;
  return verifierNouveauMotDePasse(motDePasse);
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

/**
 * Demander un lien de réinitialisation.
 *
 * Le message de succès est le MÊME que l'adresse existe ou non, et c'est
 * délibéré : répondre « cette adresse est inconnue » laisserait n'importe qui
 * vérifier qui possède un compte. On dit donc toujours d'aller regarder sa
 * boîte, ce qui est aussi la seule action utile.
 */
export async function reinitialiserMotDePasse(email: string): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  const probleme = verifierEmail(email);
  if (probleme !== null) return { ok: false, message: probleme };

  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: adresseDeRetour(CHEMIN_RETOUR),
  });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  return {
    ok: true,
    message:
      'Si un compte existe avec cette adresse, un lien vient d’être envoyé. ' +
      'Regardez aussi vos courriers indésirables.',
  };
}

/**
 * Renvoyer le courriel de confirmation d'adresse.
 *
 * C'est la réponse au cas le plus fréquent : le compte est créé, mais le
 * courriel n'est jamais arrivé — ou a été supprimé. Sans ce bouton,
 * l'utilisateur n'a aucun recours, et son compte reste inutilisable pour
 * toujours.
 */
export async function renvoyerConfirmation(email: string): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  const probleme = verifierEmail(email);
  if (probleme !== null) return { ok: false, message: probleme };

  const { error } = await client.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: adresseDeRetour(CHEMIN_RETOUR) },
  });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  return {
    ok: true,
    message:
      'Un nouveau courriel de confirmation a été envoyé. Regardez aussi vos courriers indésirables.',
  };
}

/**
 * Choisir un nouveau mot de passe.
 *
 * Suppose une session ouverte — c'est le cas après avoir suivi un lien de
 * réinitialisation, que `ouvrirSessionDepuisLien` a échangé. Sans session,
 * Supabase refuse, et le message le dit plutôt que d'annoncer un succès.
 */
export async function changerMotDePasse(nouveauMotDePasse: string): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  const probleme = verifierNouveauMotDePasse(nouveauMotDePasse);
  if (probleme !== null) return { ok: false, message: probleme };

  const { error } = await client.auth.updateUser({ password: nouveauMotDePasse });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  return { ok: true, message: 'Mot de passe modifié. Vous êtes connecté.' };
}

/**
 * Ouvrir une session à partir des jetons d'un lien de courriel.
 *
 * Le lien de réinitialisation arrive avec `access_token` et `refresh_token`
 * dans le fragment. Tant qu'ils ne sont pas posés, `updateUser` échoue : la
 * session n'existe pas encore côté client.
 *
 * On ne passe PAS par `verifyOtp` : ce chemin exige de connaître le type exact
 * du jeton, et se trompe en silence. `setSession` accepte les deux jetons tels
 * qu'ils sont arrivés, et c'est la forme que Supabase documente pour ce cas.
 */
export async function ouvrirSessionDepuisLien(
  accessToken: string,
  refreshToken: string
): Promise<ResultatAuth> {
  const client = getSupabase();
  if (client === null) return indisponible();

  if (accessToken === '' || refreshToken === '') {
    return {
      ok: false,
      message: 'Ce lien est incomplet. Demandez-en un nouveau depuis l’application.',
    };
  }

  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error !== null) return { ok: false, message: traduireErreur(error) };

  return { ok: true, message: 'Lien accepté. Choisissez un nouveau mot de passe.' };
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
