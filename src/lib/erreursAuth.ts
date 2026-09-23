// Les phrases montrées à l'utilisateur quand l'authentification échoue.
//
// POURQUOI CE MODULE EST SÉPARÉ DE `auth.ts`
// ------------------------------------------
// Cette traduction vivait dans `auth.ts`, et elle n'était éprouvée par RIEN.
// La raison est mécanique : `auth.ts` importe `./supabase`, qui importe
// `expo-constants` et `react-native`. Un test qui l'importerait exigerait tout
// l'environnement d'une application — c'est pourquoi aucun ne le faisait.
//
// Or c'est ici que se décident les phrases que l'utilisateur lira au moment
// précis où il est bloqué. « Ce lien a expiré » ou « La connexion a échoué »
// n'appellent pas la même action : la première dit de redemander un lien, la
// seconde de réessayer. Une régression qui confond les deux ne lève rien, ne
// casse aucun test de comportement, et laisse l'utilisateur tourner en rond.
//
// Ce module n'importe donc RIEN. C'est ce qui le rend éprouvable, et c'est la
// même séparation que `src/lib/discussion.ts` et `src/lib/lienAuth.ts`.
//
// La règle de lecture : on s'appuie sur le CODE quand il est fourni, et sur le
// texte sinon — tous les chemins de Supabase ne remplissent pas `code`. Le texte
// est comparé en minuscules, et par extrait : Supabase le reformule sans
// prévenir.

/**
 * Longueur minimale acceptée par Supabase pour un mot de passe.
 *
 * Déclarée ici, et ré-exportée par `auth.ts`, pour que la phrase qui l'annonce
 * et le contrôle qui l'applique ne puissent pas diverger.
 */
export const LONGUEUR_MOT_DE_PASSE = 6;

/** Ce qu'une erreur de Supabase porte d'exploitable. */
export interface ErreurSupabase {
  message?: string;
  code?: string;
}

/**
 * Traduit une erreur d'authentification en message utilisable.
 *
 * Ne rend jamais une chaîne vide : il n'existe pas de chemin où l'utilisateur
 * reste sans explication. La dernière ligne est le filet, et elle dit au moins
 * quoi faire.
 */
export function traduireErreur(erreur: ErreurSupabase | null): string {
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
  // Le lien de courriel a expiré, ou a déjà servi. Supabase emploie le même
  // code pour les deux, et la phrase utile est la même : en redemander un.
  if (
    code === 'otp_expired' ||
    code === 'token_expired' ||
    texte.includes('token has expired') ||
    texte.includes('invalid or has expired')
  ) {
    return (
      'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau : ' +
      'un lien ne peut servir qu’une fois.'
    );
  }
  // Le nouveau mot de passe est celui d'avant. Le dire évite de chercher une
  // panne là où il n'y a qu'un mot de passe identique.
  if (code === 'same_password' || texte.includes('should be different from the old password')) {
    return 'Ce mot de passe est le même que l’ancien. Choisissez-en un autre.';
  }
  // La session a expiré entre l'ouverture de l'écran et l'envoi.
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    texte.includes('session from session_id claim in jwt does not exist')
  ) {
    return 'Votre session a expiré. Rouvrez le lien reçu par courriel, ou reconnectez-vous.';
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

/**
 * Le contrôle d'une adresse, seul.
 *
 * Volontairement permissif : on ne vérifie que la présence d'un `@`. Une
 * validation plus stricte refuserait des adresses valides — il en existe de
 * légitimes que les expressions régulières courantes rejettent — et le vrai
 * juge est Supabase, qui répondra.
 */
export function verifierEmail(email: string): string | null {
  if (email.trim() === '' || !email.includes('@')) {
    return 'Saisissez une adresse électronique valide.';
  }
  return null;
}

/** Le contrôle d'un nouveau mot de passe, seul — sans adresse à valider. */
export function verifierNouveauMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE) {
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;
  }
  return null;
}
