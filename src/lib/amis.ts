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
