// Ce qu'un lien de retour de Supabase contient.
//
// POURQUOI CE MODULE EXISTE
// -------------------------
// Quand l'utilisateur suit le lien reçu par courriel — confirmation d'adresse
// ou réinitialisation de mot de passe —, Supabase le renvoie vers
// l'application avec une adresse qui porte les jetons. Trois choses peuvent
// arriver, et elles ne se lisent pas au même endroit :
//
//   1. le lien est valide : les jetons sont dans le FRAGMENT (`#access_token=…`),
//      et non dans la requête — c'est le flux « implicite », celui des
//      applications mobiles ;
//   2. le lien a expiré ou a déjà servi : Supabase renvoie `error_code=otp_expired`
//      avec une phrase en anglais, et **aucun jeton** ;
//   3. le lien porte un `?code=` (flux PKCE) au lieu de jetons : il faudra
//      l'échanger, ce qui est un appel réseau et ne se décide donc pas ici.
//
// `new URL(url).searchParams` ne voit PAS le fragment : c'est l'erreur qui
// coûte le plus cher ici, parce qu'elle est silencieuse. On lit donc le
// fragment à la main.
//
// Ce module ne fait que LIRE. Il ne parle pas au réseau, ne lève jamais, et ne
// connaît ni Expo ni React : c'est ce qui permet de l'éprouver sur des adresses
// réelles, y compris celles que Supabase produit vraiment.

/** Ce que le lien demande de faire. */
export type TypeLienAuth = 'reinitialisation' | 'confirmation' | 'inconnu';

export interface LienAuth {
  /** L'action visée, telle que Supabase l'annonce. */
  type: TypeLienAuth;
  /** Le jeton d'accès, ou `null`. Présent seulement si le lien est valide. */
  accessToken: string | null;
  /** Le jeton de rafraîchissement, ou `null`. */
  refreshToken: string | null;
  /** Le code PKCE à échanger, ou `null`. */
  code: string | null;
  /**
   * Le message d'erreur, déjà en français et affichable.
   *
   * `null` quand le lien est exploitable. Jamais vide : une erreur sans phrase
   * laisserait l'utilisateur devant un écran qui ne dit rien.
   */
  erreur: string | null;
}

/** Un lien sans rien d'exploitable. */
function lienVide(): LienAuth {
  return {
    type: 'inconnu',
    accessToken: null,
    refreshToken: null,
    code: null,
    erreur: null,
  };
}

/**
 * Traduit le `error_code` de Supabase en phrase utile.
 *
 * On lit le CODE, et non `error_description` : ce dernier est en anglais et
 * Supabase le reformule sans prévenir. Le code, lui, est stable et documenté.
 */
function traduireErreurLien(code: string, description: string): string {
  if (code === 'otp_expired') {
    return (
      'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau : ' +
      'un lien ne peut servir qu’une fois.'
    );
  }
  if (code === 'access_denied' || code === 'unauthorized') {
    return 'Ce lien n’est plus valable. Demandez-en un nouveau.';
  }
  // Un code inconnu : on ne devine pas. On dit ce qui s'est passé, sans
  // inventer une cause, et on donne la seule action utile.
  return description.trim() !== ''
    ? `Le lien n’a pas pu être utilisé (${code || 'raison inconnue'}). Demandez-en un nouveau.`
    : 'Le lien n’a pas pu être utilisé. Demandez-en un nouveau.';
}

/**
 * Lit une adresse de retour et en extrait ce qui est exploitable.
 *
 * Ne lève jamais : une adresse illisible rend un lien vide, que l'appelant
 * traite comme « rien à faire » — ce qui est le bon comportement, puisque
 * l'application doit rester utilisable même si un lien est abîmé.
 */
export function lireLienAuth(url: string | null | undefined): LienAuth {
  if (typeof url !== 'string' || url.trim() === '') return lienVide();

  const texte = url.trim();

  // Le fragment est séparé AVANT toute autre lecture : `new URL()` le conserve
  // dans `hash` mais `searchParams` l'ignore, et c'est précisément là que
  // Supabase dépose les jetons.
  const sansFragment = texte.split('#')[0];
  const fragment = texte.includes('#') ? texte.slice(texte.indexOf('#') + 1) : '';
  const requete = sansFragment.includes('?') ? sansFragment.slice(sansFragment.indexOf('?') + 1) : '';

  // Les deux sources sont lues, et le fragment l'emporte : quand un lien porte
  // les deux (redirection en cascade), les jetons sont dans le fragment.
  const champs = new Map<string, string>();
  for (const bloc of [requete, fragment]) {
    if (bloc === '') continue;
    for (const morceau of bloc.split('&')) {
      if (morceau === '') continue;
      const separateur = morceau.indexOf('=');
      const cle = separateur === -1 ? morceau : morceau.slice(0, separateur);
      const valeur = separateur === -1 ? '' : morceau.slice(separateur + 1);
      let decodee = valeur;
      try {
        // `+` est un espace dans une chaîne de requête : Supabase encode
        // « Email link is invalid » avec des `+`, et les laisser tels quels
        // afficherait « Email+link+is+invalid ».
        decodee = decodeURIComponent(valeur.replace(/\+/g, ' '));
      } catch {
        // Un pourcentage mal formé (`%ZZ`) fait lever `decodeURIComponent`.
        // On garde la valeur brute plutôt que de perdre le champ.
        decodee = valeur;
      }
      champs.set(cle, decodee);
    }
  }

  const brut = champs.get('type') ?? '';
  const type: TypeLienAuth =
    brut === 'recovery' || brut === 'reinitialisation'
      ? 'reinitialisation'
      : brut === 'signup' || brut === 'email_change' || brut === 'confirmation'
        ? 'confirmation'
        : 'inconnu';

  const codeErreur = champs.get('error_code') ?? champs.get('error') ?? '';
  if (codeErreur !== '') {
    return {
      type,
      accessToken: null,
      refreshToken: null,
      code: null,
      erreur: traduireErreurLien(codeErreur, champs.get('error_description') ?? ''),
    };
  }

  const accessToken = champs.get('access_token') ?? null;
  const refreshToken = champs.get('refresh_token') ?? null;
  const code = champs.get('code') ?? null;

  // Rien du tout : un lien qui n'annonce ni action, ni jeton, ni erreur n'est
  // pas un lien d'authentification. On le dit, plutôt que de laisser croire à
  // un succès silencieux.
  if (type === 'inconnu' && accessToken === null && code === null) {
    return lienVide();
  }

  return { type, accessToken, refreshToken, code, erreur: null };
}

/** Vrai si le lien permet d'ouvrir une session sans autre appel réseau. */
export function lienPorteDesJetons(lien: LienAuth): boolean {
  return lien.erreur === null && lien.accessToken !== null && lien.accessToken !== '';
}

/** Vrai si le lien demande une réinitialisation de mot de passe. */
export function lienDemandeUnNouveauMotDePasse(lien: LienAuth): boolean {
  return lien.erreur === null && lien.type === 'reinitialisation';
}

/**
 * Le libellé à montrer pour un lien, ou `null` s'il n'y a rien à dire.
 *
 * Sert au cas le plus fréquent : l'utilisateur suit un lien expiré et
 * l'application doit expliquer quoi faire, pas rester muette.
 */
export function messageDuLien(lien: LienAuth): string | null {
  if (lien.erreur !== null) return lien.erreur;
  if (lien.type === 'confirmation') {
    return 'Votre adresse est confirmée. Vous pouvez vous connecter.';
  }
  if (lien.type === 'reinitialisation') {
    return 'Choisissez un nouveau mot de passe.';
  }
  return null;
}
