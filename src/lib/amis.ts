// Le suivi entre amis : interroger les amis, et lire leur point.
//
// Même partage que partout ailleurs dans ce dépôt : les DÉCISIONS sont ici et
// se testent sans réseau, l'appel réseau est un détail. Ce qui se décide, c'est
// la forme d'une ligne rendue par le serveur, et ce qu'on en dit à l'écran.
//
// Deux choses ne sont pas de la décision et n'existent donc pas ici : le calcul
// de la semaine (il est en SQL, dans `supabase/amis.sql`, parce que c'est la
// base qui a les données) et les politiques d'accès (elles sont dans les
// politiques, parce que c'est là que l'autorisation vit dans ce projet).

export type PointAmi = {
  /** Identifiant du compte de l'ami. */
  userId: string;
  /** Nom affiché, ou un libellé neutre si le compte n'en a pas. */
  nom: string;
  /** Identifiant public choisi par l'ami, ou null s'il n'en a pas. */
  identifiantPublic: string | null;
  /** Teinte de son avatar — jamais absente : une teinte de repli est posée. */
  avatarCouleur: CouleurAvatar;
  /**
   * L'ami partage-t-il sa progression ?
   *
   * Ce drapeau n'est pas décoratif : sans lui, un ami qui ne partage pas
   * s'afficherait « n'a pas encore commencé », ce qui serait un mensonge. Les
   * zéros qui l'accompagnent ne veulent rien dire tout seuls.
   */
  partage: boolean;
  /** Versets mémorisés depuis lundi. */
  versetsCetteSemaine: number;
  /** Pages équivalentes depuis lundi — une demi-page compte 0,5. */
  pagesCetteSemaine: number;
  /** Date de sa dernière séance, ou null s'il n'a jamais rien fait. */
  derniereSeance: string | null;
  /** Numéro de la dernière sourate travaillée, ou null. */
  derniereSourate: number | null;
  /** Jours d'étude sur les sept derniers jours. */
  joursDEtude7j: number;
};

/** La forme brute rendue par `mes_amis(...)` en base. */
export type LigneAmiBrute = {
  user_id?: string | null;
  nom?: string | null;
  identifiant_public?: string | null;
  avatar_couleur?: string | null;
  partage?: boolean | null;
  versets_cette_semaine?: number | string | null;
  pages_cette_semaine?: number | string | null;
  derniere_seance?: string | null;
  derniere_sourate?: number | string | null;
  jours_d_etude_7j?: number | string | null;
};

/**
 * Convertit une ligne de la base en `PointAmi`.
 *
 * Les nombres reviennent parfois en chaîne : `NUMERIC` et `BIGINT` sont
 * sérialisés ainsi par PostgREST, et `SUM(...)::int` n'y change rien selon la
 * passerelle. Convertir ici, une fois, évite qu'un `"12"` se retrouve affiché
 * tel quel ou, pire, additionné comme du texte (« 1 » + « 2 » = « 12 »).
 */
export function lirePointAmi(ligne: LigneAmiBrute): PointAmi | null {
  if (typeof ligne.user_id !== 'string' || ligne.user_id.length === 0) return null;

  return {
    userId: ligne.user_id,
    nom: normaliserNom(ligne.nom),
    identifiantPublic: normaliserIdentifiantPublic(ligne.identifiant_public),
    avatarCouleur: couleurAvatar(ligne.avatar_couleur),
    // Le partage est VRAI par défaut, comme la colonne en base : un champ
    // absent — une passerelle plus ancienne, une colonne oubliée dans un
    // `select` — ne doit pas éteindre l'affichage par accident.
    partage: ligne.partage !== false,
    versetsCetteSemaine: entier(ligne.versets_cette_semaine),
    pagesCetteSemaine: nombre(ligne.pages_cette_semaine),
    derniereSeance: normaliserDate(ligne.derniere_seance),
    derniereSourate: ligne.derniere_sourate === null || ligne.derniere_sourate === undefined
      ? null
      : entier(ligne.derniere_sourate),
    joursDEtude7j: entier(ligne.jours_d_etude_7j),
  };
}

/**
 * Le nom affiché, ou un libellé neutre.
 *
 * Jamais de chaîne vide à l'écran : un ami sans nom affiché doit rester
 * identifiable, pas apparaître comme une ligne blanche.
 */
export function normaliserNom(nom: string | null | undefined): string {
  const propre = typeof nom === 'string' ? nom.trim() : '';
  return propre.length === 0 ? 'Un apprenant' : propre;
}

function entier(valeur: number | string | null | undefined): number {
  if (valeur === null || valeur === undefined) return 0;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n)) return 0;
  // Une valeur négative n'a pas de sens pour un compteur : on la ramène à 0
  // plutôt que de l'afficher, ce qui ferait douter de toute la ligne.
  return Math.max(0, Math.round(n));
}

function nombre(valeur: number | string | null | undefined): number {
  if (valeur === null || valeur === undefined) return 0;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 10) / 10);
}

function normaliserDate(valeur: string | null | undefined): string | null {
  if (typeof valeur !== 'string' || valeur.length < 10) return null;
  return valeur.slice(0, 10);
}

/**
 * Ce qu'on dit d'un ami dont on ne sait rien.
 *
 * Un ami qui vient d'être ajouté, ou qui n'a rien fait cette semaine, ne doit
 * pas être présenté comme en retard — la comparaison entre pairs est le
 * contraire de ce qu'on cherche. La phrase est donc neutre, et tournée vers
 * l'encouragement.
 */
export function resumeActivite(point: PointAmi): string {
  // Le partage passe AVANT le reste, et ce n'est pas un détail d'ordre : sans
  // cette ligne, un ami qui ne partage pas serait décrit par des zéros, et
  // l'écran écrirait « n'a pas encore commencé » — la seule phrase qu'il ne
  // faut pas écrire, parce qu'elle est fausse et qu'elle décourage.
  if (!point.partage) return 'Ne partage pas sa progression';
  if (point.versetsCetteSemaine === 0 && point.derniereSeance === null) {
    return "N'a pas encore commencé";
  }
  if (point.versetsCetteSemaine === 0) {
    return "Rien cette semaine pour l'instant";
  }
  const versets = `${point.versetsCetteSemaine} verset${point.versetsCetteSemaine > 1 ? 's' : ''}`;
  return `${versets} cette semaine`;
}

/**
 * Où en est l'ami, en une phrase courte.
 *
 * On ne dit jamais « il est en avance sur toi » ni l'inverse : c'est
 * exactement ce que la fonctionnalité ne doit pas devenir.
 */
export function ouEnEst(point: PointAmi): string {
  if (!point.partage) return 'Progression non partagée';
  if (point.derniereSourate === null) return 'Aucune séance enregistrée';
  const sourate = `sourate ${point.derniereSourate}`;
  if (point.derniereSeance === null) return `Travaille la ${sourate}`;
  return `Dernière séance le ${formaterDateCourte(point.derniereSeance)}, ${sourate}`;
}

/** `2026-09-22` → `22/09`. Une date sans année : on parle de la semaine. */
export function formaterDateCourte(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  if (!annee || !mois || !jour) return iso;
  return `${jour}/${mois}`;
}

/**
 * Le code d'invitation, mis en forme pour être lu à voix haute.
 *
 * On le groupe par cinq : dix caractères d'affilée se recopient mal, et un code
 * se dicte souvent au téléphone. C'est un affichage, la valeur en base reste
 * d'un seul tenant — d'où deux fonctions distinctes.
 */
export function formaterCodeAmi(code: string): string {
  const propre = code.trim().toUpperCase();
  if (propre.length !== 10) return propre;
  return `${propre.slice(0, 5)} ${propre.slice(5)}`;
}

/** Retire la mise en forme et normalise, avant de l'envoyer à la base. */
export function nettoyerCodeSaisi(saisie: string): string {
  return saisie.replace(/[\s-]/g, '').toUpperCase();
}

/** Un code saisi est-il plausible ? On ne consulte pas la base pour le dire. */
export function codePlausible(saisie: string): boolean {
  return /^[A-HJ-KM-NP-Z1-9]{10}$/.test(nettoyerCodeSaisi(saisie));
}

// === Le profil public ======================================================

/**
 * Les six teintes d'avatar, dans l'ordre où l'écran les propose.
 *
 * Cette liste est le miroir exact de la contrainte `profiles_avatar_couleur_valide`
 * de `supabase/amis.sql`. Elle est courte et fermée pour la même raison qu'en
 * base : une teinte libre produirait des couples illisibles, et l'écran ne
 * saurait plus quel texte poser dessus.
 */
export const COULEURS_AVATAR = ['vert', 'bleu', 'rose', 'or', 'ardoise', 'olive'] as const;

export type CouleurAvatar = (typeof COULEURS_AVATAR)[number];

/** Le nom français d'une teinte, pour l'écran de réglages. */
const NOMS_COULEURS: Record<CouleurAvatar, string> = {
  vert: 'Vert',
  bleu: 'Bleu',
  rose: 'Rose',
  or: 'Or',
  ardoise: 'Ardoise',
  olive: 'Olive',
};

export function nomCouleurAvatar(couleur: CouleurAvatar): string {
  return NOMS_COULEURS[couleur];
}

export function estCouleurAvatar(valeur: unknown): valeur is CouleurAvatar {
  return typeof valeur === 'string' && (COULEURS_AVATAR as readonly string[]).includes(valeur);
}

/**
 * La teinte d'un avatar, jamais absente.
 *
 * Une teinte inconnue — une valeur écrite à la main en base, une teinte retirée
 * plus tard — retombe sur la première au lieu de laisser un disque sans
 * couleur, qui se lirait comme un chargement qui n'a pas abouti.
 */
export function couleurAvatar(valeur: string | null | undefined): CouleurAvatar {
  return estCouleurAvatar(valeur) ? valeur : COULEURS_AVATAR[0];
}

/**
 * Les une ou deux initiales d'un pseudonyme, pour dessiner l'avatar.
 *
 * `Array.from` plutôt que l'indexation : un pseudonyme peut commencer par un
 * caractère hors du plan de base (un emoji, une lettre arabe ornée), qui
 * occupe deux unités UTF-16. `mot[0]` en rendrait alors la moitié — un
 * caractère de remplacement, ou rien.
 */
export function initiales(nom: string | null | undefined): string {
  const mots = (typeof nom === 'string' ? nom : '')
    .trim()
    .split(/\s+/)
    .filter((mot) => mot.length > 0);
  if (mots.length === 0) return '?';
  return mots
    .slice(0, 2)
    .map((mot) => Array.from(mot)[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * L'identifiant public, nettoyé avant d'être proposé ou envoyé.
 *
 * Trois nettoyages, et chacun répond à une saisie réelle : l'arobase que l'on
 * recopie machinalement, les espaces d'un pseudonyme que l'on tape comme on
 * l'écrit, et la casse — un identifiant public se dicte, donc il ne doit pas
 * dépendre d'une majuscule.
 */
export function nettoyerIdentifiantPublic(saisie: string): string {
  return saisie
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * Un identifiant public est-il plausible ?
 *
 * Miroir de la contrainte `profiles_public_id_format` : trois signes au
 * minimum, trente au plus, une lettre d'abord. On le dit à l'écran avant
 * d'envoyer, pour prévenir plutôt que de refuser.
 */
export function identifiantPlausible(saisie: string): boolean {
  return /^[a-z][a-z0-9_]{2,29}$/.test(nettoyerIdentifiantPublic(saisie));
}

/** `apprenant_a` → `@apprenant_a`, pour l'affichage. Vide s'il n'y en a pas. */
export function formaterIdentifiantPublic(valeur: string | null | undefined): string {
  const propre = normaliserIdentifiantPublic(valeur);
  return propre === null ? '' : `@${propre}`;
}

function normaliserIdentifiantPublic(valeur: string | null | undefined): string | null {
  if (typeof valeur !== 'string') return null;
  const propre = valeur.trim().toLowerCase();
  return propre.length === 0 ? null : propre;
}

// === Les demandes ==========================================================

/**
 * Une demande d'ami, dans un sens ou dans l'autre.
 *
 * `recue` dit de quel côté on est. C'est la base qui le calcule — elle seule
 * sait qui est `de` et qui est `vers` — et l'écran s'en sert pour ranger la
 * ligne dans « Reçues » ou dans « Envoyées » sans refaire la comparaison.
 */
export type DemandeAmi = {
  demandeur: string;
  destinataire: string;
  nom: string;
  identifiantPublic: string | null;
  avatarCouleur: CouleurAvatar;
  createdAt: string | null;
  recue: boolean;
};

export type LigneDemandeBrute = {
  demandeur?: string | null;
  destinataire?: string | null;
  nom?: string | null;
  identifiant_public?: string | null;
  avatar_couleur?: string | null;
  created_at?: string | null;
  recue?: boolean | null;
};

/**
 * L'identifiant de l'AUTRE, selon le côté où l'on est.
 *
 * Une seule fonction, appelée par les deux lectures : recalculer cette
 * bascule dans chaque écran est exactement la forme où l'un des deux finit
 * par se tromper de sens — et l'erreur serait invisible, puisqu'un
 * identifiant est un identifiant.
 */
export function autrePartie(demande: DemandeAmi): string {
  return demande.recue ? demande.demandeur : demande.destinataire;
}

export function lireDemande(ligne: LigneDemandeBrute): DemandeAmi | null {
  if (typeof ligne.demandeur !== 'string' || ligne.demandeur.length === 0) return null;
  if (typeof ligne.destinataire !== 'string' || ligne.destinataire.length === 0) return null;
  return {
    demandeur: ligne.demandeur,
    destinataire: ligne.destinataire,
    nom: normaliserNom(ligne.nom),
    identifiantPublic: normaliserIdentifiantPublic(ligne.identifiant_public),
    avatarCouleur: couleurAvatar(ligne.avatar_couleur),
    createdAt: normaliserDate(ligne.created_at),
    recue: ligne.recue === true,
  };
}

/** Sépare une liste de demandes en deux, sans la parcourir deux fois. */
export function repartirDemandes(demandes: DemandeAmi[]): {
  recues: DemandeAmi[];
  envoyees: DemandeAmi[];
} {
  const recues: DemandeAmi[] = [];
  const envoyees: DemandeAmi[] = [];
  for (const d of demandes) (d.recue ? recues : envoyees).push(d);
  return { recues, envoyees };
}

// === Les blocages ==========================================================

export type BlocageAmi = {
  bloque: string;
  nom: string;
  identifiantPublic: string | null;
  avatarCouleur: CouleurAvatar;
  createdAt: string | null;
};

export type LigneBlocageBrute = {
  bloque?: string | null;
  nom?: string | null;
  identifiant_public?: string | null;
  avatar_couleur?: string | null;
  created_at?: string | null;
};

export function lireBlocage(ligne: LigneBlocageBrute): BlocageAmi | null {
  if (typeof ligne.bloque !== 'string' || ligne.bloque.length === 0) return null;
  return {
    bloque: ligne.bloque,
    nom: normaliserNom(ligne.nom),
    identifiantPublic: normaliserIdentifiantPublic(ligne.identifiant_public),
    avatarCouleur: couleurAvatar(ligne.avatar_couleur),
    createdAt: normaliserDate(ligne.created_at),
  };
}

// === La recherche par identifiant public ===================================

export type ProfilTrouve = {
  userId: string;
  nom: string;
  identifiantPublic: string | null;
  avatarCouleur: CouleurAvatar;
  dejaAmi: boolean;
  demandeEnvoyee: boolean;
  demandeRecue: boolean;
};

export type LigneRechercheBrute = {
  user_id?: string | null;
  nom?: string | null;
  identifiant_public?: string | null;
  avatar_couleur?: string | null;
  deja_ami?: boolean | null;
  demande_envoyee?: boolean | null;
  demande_recue?: boolean | null;
};

export function lireProfilTrouve(ligne: LigneRechercheBrute): ProfilTrouve | null {
  if (typeof ligne.user_id !== 'string' || ligne.user_id.length === 0) return null;
  return {
    userId: ligne.user_id,
    nom: normaliserNom(ligne.nom),
    identifiantPublic: normaliserIdentifiantPublic(ligne.identifiant_public),
    avatarCouleur: couleurAvatar(ligne.avatar_couleur),
    dejaAmi: ligne.deja_ami === true,
    demandeEnvoyee: ligne.demande_envoyee === true,
    demandeRecue: ligne.demande_recue === true,
  };
}

/**
 * Ce qu'on peut faire d'un profil trouvé.
 *
 * L'ordre des cas n'est pas indifférent : « déjà ami » passe avant « demande
 * en cours », parce qu'une amitié et une demande ne coexistent jamais — et si
 * les deux étaient vrais par accident, c'est l'amitié qu'il faut montrer.
 */
export type SituationProfil = 'deja_ami' | 'demande_envoyee' | 'demande_recue' | 'libre';

export function situationProfil(profil: ProfilTrouve): SituationProfil {
  if (profil.dejaAmi) return 'deja_ami';
  if (profil.demandeEnvoyee) return 'demande_envoyee';
  if (profil.demandeRecue) return 'demande_recue';
  return 'libre';
}

/**
 * Le message à montrer quand l'ajout échoue.
 *
 * Les codes d'erreur viennent de `supabase/amis.sql`, où ils sont posés
 * explicitement (ERRCODE) plutôt que devinés depuis un texte : `P0002` pour un
 * code inconnu, `22023` pour une saisie invalide. Lire le code plutôt que le
 * message évite qu'une reformulation côté base casse l'affichage.
 */
export function messageErreurAmi(code: string | null, message: string | null): string {
  if (code === 'P0002') return "Aucun compte ne porte ce code. Vérifiez-le auprès de votre ami.";
  if (code === '22023') return 'Ce code n’est pas valide.';
  if (code === '42501') return 'Vous ne pouvez pas effectuer cette action.';
  if (code === '23505') return 'Vous êtes déjà amis.';
  const propre = (message ?? '').trim();
  return propre.length > 0 ? propre : "L'ajout n'a pas pu aboutir. Réessayez.";
}

/**
 * Le message d'un refus d'envoi de demande.
 *
 * Il se distingue de `messageErreurAmi` sur un point, et ce point compte :
 * `42501` y veut dire deux choses très différentes — « vous ne pouvez pas agir
 * au nom d'un autre » (un mensonge sur l'identité, que l'utilisateur ne
 * provoquera jamais) et « ce compte ne peut pas recevoir votre demande » (un
 * blocage, ou un compte qui n'accepte rien). C'est la seconde que l'écran doit
 * dire, et elle ne doit jamais laisser deviner un blocage : la personne bloquée
 * n'apprend pas qu'elle l'est.
 */
export function messageRefusDemande(code: string | null, message: string | null): string {
  if (code === '42501') return "Cette demande n'a pas pu être envoyée.";
  if (code === '23505') return 'Vous êtes déjà amis.';
  return messageErreurAmi(code, message);
}
