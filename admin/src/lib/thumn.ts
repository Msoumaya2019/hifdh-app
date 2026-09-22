// ============================================================================
// Les 480 toumoun (huitiemes de hizb), tels que les porte
// `data/quran/thumn_hafs.json` de l'application.
//
// Ces types decrivent le fichier, ils ne le completent pas. Le tableau de bord
// ne fabrique aucune division : il lit celles qui existent et enregistre ce
// qu'un relecteur humain en dit.
// ============================================================================

/**
 * Les statuts portes par le fichier de l'application.
 *
 * `relue` vient de `data/quran/appliquer_corrections.py` : un relecteur a lu la
 * borne sur un moushaf Hafs imprime. Ce n'est pas `verified`, qui dit une
 * propriete du calcul. Le statut doit figurer ici, sans quoi un fichier ou une
 * seule borne aurait ete relue serait refuse **en entier** par ce lecteur.
 */
export type StatutVerification =
  | 'verified_hafs'
  | 'verified'
  | 'estimated_offset'
  | 'relue';

/** Une borne : un verset, designe par sa sourate et son numero dans la sourate. */
export interface Borne {
  surah: number;
  ayah: number;
}

/** Les bornes d'un toumoun, avec leur index global dans le Coran (1 a 6236). */
export interface BornesToumoun {
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  startAyahId: number;
  endAyahId: number;
}

export interface Thumn {
  thumnNumber: number;
  hizbNumber: number;
  rubNumber: number;
  isRubStart: boolean;
  hafs: BornesToumoun;
  qalounReference: BornesToumoun;
  source: string;
  verificationStatus: StatutVerification;
}

export interface MetadataThumn {
  title: string;
  description: string;
  recitation: string;
  totalThumn: number;
  totalHizb: number;
  totalRub: number;
  sources: Record<string, string>;
  license: string;
  methodology?: string;
}

export interface FichierThumn {
  metadata: MetadataThumn;
  thumn: Thumn[];
}

export interface Sourate {
  number: number;
  name: string;
  nameFr: string;
  ayahCount: number;
  startAyahId: number;
}

/**
 * Ce que chaque statut veut dire, en clair.
 *
 * La formulation est deliberement prudente : « estimee » n'est pas une nuance
 * de « verifiee », c'est une autre nature. Un ecran qui les presenterait avec
 * la meme autorite ferait exactement ce que la specification interdit.
 */
export const LIBELLE_STATUT: Record<StatutVerification, string> = {
  verified_hafs: 'Verifiee — donnees Hafs (KFGQPC)',
  verified: 'Verifiee — mappage direct depuis Qaloun',
  estimated_offset: 'Estimee — report par decalage depuis Qaloun',
  // « relue » n'est pas « verifiee » : `verified` dit une propriete du calcul —
  // la sourate a le meme nombre de versets dans les deux lectures, donc le
  // report est exact. Une borne relue dit autre chose : quelqu'un a ouvert un
  // moushaf imprime et l'a lue. Les confondre ferait disparaitre la distinction
  // sans le dire, et c'est pourquoi le libelle la nomme.
  relue: 'Relue — borne lue sur un moushaf Hafs imprime',
};

/**
 * Vrai pour un statut qui autorise a presenter la borne comme authentifiee.
 *
 * L'ecriture est explicite plutot qu'une negation de `estimated_offset` : un
 * cinquieme statut ajoute plus tard ne doit pas se retrouver « authentifie »
 * par omission. Une borne relue a ete lue sur un moushaf imprime : elle est
 * authentifiee, et c'est meme le seul statut ou une lecture humaine est
 * intervenue.
 */
export function estVerifiee(statut: StatutVerification): boolean {
  return statut === 'verified_hafs' || statut === 'verified' || statut === 'relue';
}

const STATUTS_CONNUS: readonly string[] = [
  'verified_hafs',
  'verified',
  'estimated_offset',
  'relue',
];

export type Lecture<T> = { ok: true; valeur: T } | { ok: false; message: string };

/**
 * Le fichier de toumoun a-t-il la forme attendue ?
 *
 * La copie locale est deja verifiee par empreinte SHA-256 contre la source :
 * ce controle ne repete pas ce travail, il repond a une autre question — « la
 * source elle-meme a-t-elle la forme que ce code sait lire ? ». Sans lui, un
 * fichier valide mais d'une autre forme produirait un plantage au milieu du
 * rendu, et l'ecran blanc ne dirait pas pourquoi.
 *
 * Le nombre de toumoun est verifie exactement : 480, ni plus ni moins. Un
 * fichier qui en porterait 479 ne doit pas s'afficher partiellement — il doit
 * le dire.
 */
export function lireDonneesThumn(valeur: unknown): Lecture<FichierThumn> {
  if (typeof valeur !== 'object' || valeur === null) {
    return { ok: false, message: 'Le fichier de toumoun n\'est pas un objet JSON.' };
  }

  const thumn = (valeur as { thumn?: unknown }).thumn;
  if (!Array.isArray(thumn)) {
    return { ok: false, message: 'Le fichier de toumoun ne porte pas de liste « thumn ».' };
  }
  if (thumn.length !== 480) {
    return {
      ok: false,
      message: `Le fichier porte ${thumn.length} toumoun au lieu de 480.`,
    };
  }

  for (const entree of thumn) {
    const numero = (entree as { thumnNumber?: unknown })?.thumnNumber;
    if (!Number.isInteger(numero)) {
      return { ok: false, message: 'Un toumoun ne porte pas de numero entier.' };
    }
    const statut = (entree as { verificationStatus?: unknown })?.verificationStatus;
    if (typeof statut !== 'string' || !STATUTS_CONNUS.includes(statut)) {
      return {
        ok: false,
        message:
          `Le toumoun ${numero} porte un statut inconnu : ${JSON.stringify(statut)}. ` +
          `Les statuts connus sont ${STATUTS_CONNUS.join(', ')}.`,
      };
    }
    const hafs = (entree as { hafs?: { endAyahId?: unknown } })?.hafs;
    if (!Number.isInteger(hafs?.endAyahId)) {
      return { ok: false, message: `Le toumoun ${numero} n'a pas de fin situable.` };
    }
  }

  return { ok: true, valeur: valeur as FichierThumn };
}

/** Le fichier de sourates a-t-il la forme attendue ? 114, avec leurs versets. */
export function lireSourates(valeur: unknown): Lecture<Sourate[]> {
  if (!Array.isArray(valeur)) {
    return { ok: false, message: 'Le fichier de sourates n\'est pas une liste.' };
  }
  if (valeur.length !== 114) {
    return {
      ok: false,
      message: `Le fichier porte ${valeur.length} sourates au lieu de 114.`,
    };
  }
  for (const entree of valeur) {
    const sourate = entree as Partial<Sourate>;
    if (
      !Number.isInteger(sourate.number) ||
      !Number.isInteger(sourate.ayahCount) ||
      !Number.isInteger(sourate.startAyahId) ||
      typeof sourate.nameFr !== 'string'
    ) {
      return {
        ok: false,
        message: `La sourate ${String(sourate.number)} est incomplete : ` +
          'il faut son numero, son nombre de versets, son premier verset global et son nom.',
      };
    }
  }
  return { ok: true, valeur: valeur as Sourate[] };
}
