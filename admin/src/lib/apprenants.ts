// ============================================================================
// Ce que le tableau de bord affiche du suivi des apprenants.
//
// Le travail de lecture est fait par la fonction `resume_apprenants` de la base,
// qui rend une ligne par compte. Ici, on traduit — et on ne traduit que ce que
// l'on connait.
// ============================================================================

/**
 * Les six objectifs de l'application, tels que `src/types/index.ts` les definit.
 *
 * Cette liste est recopiee, faute de pouvoir importer le code de l'application
 * depuis le tableau de bord — deux projets npm distincts. Une recopie qui
 * derive se verrait : un objectif inconnu ne serait pas traduit, et l'ecran le
 * dirait au lieu de l'inventer.
 */
export type TypeObjectif =
  | 'full_quran'
  | 'juz_amma'
  | 'hizb_sabbih'
  | 'specific_juz'
  | 'specific_hizb'
  | 'custom';

const LIBELLES: Record<TypeObjectif, string> = {
  full_quran: 'Coran entier',
  juz_amma: "Juz' 'Amma",
  hizb_sabbih: 'Hizb Sabbih (hizb 60)',
  specific_juz: "Juz' choisi",
  specific_hizb: 'Hizb(s) choisi(s)',
  custom: 'Passages choisis',
};

export interface ObjectifLisible {
  texte: string;
  /** Faux quand le code vient de l'application mais n'est pas connu d'ici. */
  traduit: boolean;
}

/**
 * L'objectif, en francais quand on le connait.
 *
 * Un code inconnu n'est pas masque et n'est pas invente : il est rendu tel
 * quel, avec `traduit: false`. L'ecran peut alors le signaler comme tel. Le
 * remplacer par « objectif inconnu » ferait perdre l'information ; le traduire
 * au jugé serait pire.
 */
export function objectifLisible(objectif: string | null | undefined): ObjectifLisible | null {
  if (objectif === null || objectif === undefined || objectif === '') return null;
  const libelle = LIBELLES[objectif as TypeObjectif];
  if (libelle) return { texte: libelle, traduit: true };
  return { texte: objectif, traduit: false };
}

/**
 * Un compteur entier venu de la base.
 *
 * PostgREST rend les `BIGINT` tantot en nombre, tantot en chaine selon la
 * taille : les deux formes sont acceptees.
 *
 * Le resultat doit etre un ENTIER. Toutes les colonnes lues ici sont des
 * comptages — `COUNT(*)`, `SUM(...)` — et un 2,5 voudrait dire que la colonne
 * n'est pas celle qu'on croit. L'afficher tel quel ferait lire « 2,5 versets
 * memorises ». Le refus vaut mieux que l'affichage d'un nombre impossible.
 *
 * `Number('')` vaut 0 et `Number(null)` vaut 0 : une valeur absente ne doit pas
 * se lire « zero element », elle doit se lire « on ne sait pas ». D'ou le
 * `null`, distinct de `0`.
 */
export function nombre(valeur: unknown): number | null {
  if (typeof valeur === 'number') {
    return Number.isSafeInteger(valeur) ? valeur : null;
  }
  if (typeof valeur === 'string') {
    const nettoye = valeur.trim();
    if (!/^-?\d+$/.test(nettoye)) return null;
    const converti = Number(nettoye);
    return Number.isSafeInteger(converti) ? converti : null;
  }
  return null;
}

/** Un compteur rendu, ou un tiret quand il n'y en a pas. */
export function afficherNombre(valeur: unknown): string {
  const converti = nombre(valeur);
  return converti === null ? '—' : String(converti);
}

/**
 * Combien de jours separent deux dates calendaires.
 *
 * Les deux dates sont construites en heure locale : les comparer en UTC
 * decalerait le resultat d'un jour selon l'heure de la journee. Le fuseau
 * d'ete ne pose pas de probleme non plus, l'ecart etant arrondi — deux
 * instants separes de 23 ou 25 heures restent « un jour ».
 *
 * Rend `null` si l'une des deux dates n'est pas au format `AAAA-MM-JJ`.
 */
export function ecartEnJours(depuis: string | null | undefined, jusqua: string): number | null {
  const debut = versDateLocale(depuis);
  const fin = versDateLocale(jusqua);
  if (!debut || !fin) return null;
  return Math.round((fin.getTime() - debut.getTime()) / 86_400_000);
}

function versDateLocale(valeur: string | null | undefined): Date | null {
  if (!valeur) return null;
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
  if (!correspondance) return null;
  const [, annee, mois, jour] = correspondance;
  return new Date(Number(annee), Number(mois) - 1, Number(jour));
}

/**
 * Le retard d'un apprenant, dit en clair.
 *
 * `null` quand la date manque : un apprenant qui n'a jamais termine de seance
 * n'est pas « en retard de 0 jour », il n'a pas encore commence. Confondre les
 * deux ferait passer un compte neuf pour un compte actif.
 */
export function direDerniereSeance(
  derniere: string | null | undefined,
  aujourdHui: string
): string | null {
  const ecart = ecartEnJours(derniere, aujourdHui);
  if (ecart === null) return null;
  if (ecart <= 0) return "aujourd'hui";
  if (ecart === 1) return 'hier';
  return `il y a ${ecart} jours`;
}

/** Une ligne de `public.resume_apprenants`, telle que la base la rend. */
export interface ResumeApprenant {
  user_id: string;
  nom: string | null;
  role: string | null;
  inscrit_le: string | null;
  versets_memorises: number | string | null;
  passages_memorises: number | string | null;
  seances_total: number | string | null;
  seances_terminees: number | string | null;
  seances_retard: number | string | null;
  revisions_dues: number | string | null;
  derniere_seance: string | null;
  objectif: string | null;
}

export interface SyntheseApprenants {
  comptes: number;
  administrateurs: number;
  avecRetard: number;
  avecRevisionsDues: number;
  sansSeance: number;
}

export function synthetiser(apprenants: readonly ResumeApprenant[]): SyntheseApprenants {
  let administrateurs = 0;
  let avecRetard = 0;
  let avecRevisionsDues = 0;
  let sansSeance = 0;

  for (const apprenant of apprenants) {
    if (apprenant.role === 'administrateur') administrateurs += 1;
    if ((nombre(apprenant.seances_retard) ?? 0) > 0) avecRetard += 1;
    if ((nombre(apprenant.revisions_dues) ?? 0) > 0) avecRevisionsDues += 1;
    if (apprenant.derniere_seance === null) sansSeance += 1;
  }

  return {
    comptes: apprenants.length,
    administrateurs,
    avecRetard,
    avecRevisionsDues,
    sansSeance,
  };
}
