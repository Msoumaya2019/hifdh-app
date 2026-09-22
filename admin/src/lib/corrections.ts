// ============================================================================
// Ce qu'un relecteur dit d'une borne, et ce qui en sort.
//
// Deux statuts, et deux seulement, comme la table `division_verifications` :
//
//   « confirmee » — la borne estimee etait juste ; aucune borne n'est portee,
//                   puisque c'est justement le cas ou celle des donnees vaut ;
//   « corrigee »  — elle ne l'etait pas ; la bonne borne est portee.
//
// Le tableau de bord n'ecrit jamais dans `thumn_hafs.json`. Il produit un
// fichier de corrections, que le script `data/quran/appliquer_corrections.py`
// de l'application applique — et ce script recalcule les champs derives (le
// debut du toumoun suivant, les index globaux) depuis les donnees de versets,
// puis rejoue les controles existants. Une division ne se corrige pas a la
// main dans un formulaire : elle se corrige par un script qui verifie.
// ============================================================================

import {
  indexGlobal,
  verifierCoherence,
  type BorneEstimee,
  type LimiteToumoun,
} from './bornes.ts';
import type { Sourate } from './thumn.ts';

export type Statut = 'confirmee' | 'corrigee';

/** Une ligne de `public.division_verifications`, telle que lue depuis la base. */
export interface LigneVerification {
  thumnNumber: number;
  statut: Statut;
  limiteSurah: number | null;
  limiteAyah: number | null;
  note: string | null;
  verifieLe?: string | null;
}

/**
 * Le resultat d'une validation de saisie.
 *
 * Union discriminee, et non objet a champs facultatifs : quand `ok` est vrai, la
 * borne est forcement la, et quand il est faux, le motif est forcement la. Des
 * champs facultatifs auraient oblige l'appelant a re-verifier ce que le
 * validateur vient de verifier, et une borne manquante serait passee jusqu'a
 * l'ecriture.
 */
export type ResultatSaisie =
  | { ok: true; surah: number; ayah: number }
  | { ok: false; message: string };

/**
 * Un entier strictement positif, ou `null`.
 *
 * `Number('')` vaut 0, `Number('  ')` vaut 0, `Number('2.5')` vaut 2.5 : aucune
 * de ces trois entrees ne doit passer pour un numero de verset. On teste donc
 * la forme avant de convertir.
 */
export function analyserEntier(texte: string): number | null {
  const nettoye = texte.trim();
  if (!/^\d+$/.test(nettoye)) return null;
  const valeur = Number(nettoye);
  return Number.isSafeInteger(valeur) ? valeur : null;
}

/**
 * Une saisie de correction est-elle acceptable ?
 *
 * Les refus sont ordonnes du plus evident au plus fin, et chacun dit quoi
 * faire : « la sourate n'existe pas » n'aide pas, « le Coran en compte 114 »
 * aide.
 */
export function validerSaisie(
  limites: readonly LimiteToumoun[],
  sourates: readonly Sourate[],
  thumnNumber: number,
  texteSurah: string,
  texteAyah: string
): ResultatSaisie {
  const surah = analyserEntier(texteSurah);
  const ayah = analyserEntier(texteAyah);

  if (surah === null || ayah === null) {
    return {
      ok: false,
      message:
        'La borne se saisit en deux nombres entiers : la sourate, puis le verset. ' +
        'Exemple : 2 et 25 pour 2:25.',
    };
  }

  const coherence = verifierCoherence(limites, sourates, thumnNumber, { surah, ayah });
  if (coherence !== null) {
    return { ok: false, message: coherence };
  }

  // Une « correction » identique a l'estimation n'est pas une correction.
  // L'enregistrer sous ce statut ferait croire a un travail de relecture qui
  // n'a pas eu lieu, et le fichier exporte porterait une correction sans effet.
  const courant = limites.find((l) => l.thumnNumber === thumnNumber);
  if (courant && courant.debut.surah === surah && courant.debut.ayah === ayah) {
    return {
      ok: false,
      message:
        `Cette limite est deja celle des donnees (${surah}:${ayah}). ` +
        'Si elle est juste, le bouton « Confirmer » est le bon : il enregistre ' +
        'que vous l\'avez relue, sans la modifier.',
    };
  }

  return { ok: true, surah, ayah };
}

/** Combien de bornes sont relues, combien restent. */
export interface ResumeVerifications {
  total: number;
  confirmees: number;
  corrigees: number;
  restantes: number;
}

export function resumerVerifications(
  bornes: readonly BorneEstimee[],
  lignes: readonly LigneVerification[]
): ResumeVerifications {
  const connues = new Set(bornes.map((b) => b.thumnNumber));
  const retenues = lignes.filter((l) => connues.has(l.thumnNumber));

  const confirmees = retenues.filter((l) => l.statut === 'confirmee').length;
  const corrigees = retenues.filter((l) => l.statut === 'corrigee').length;

  return {
    total: bornes.length,
    confirmees,
    corrigees,
    restantes: bornes.length - confirmees - corrigees,
  };
}

// ---------------------------------------------------------------------------
// Le fichier exporte
// ---------------------------------------------------------------------------

export interface FichierCorrections {
  version: number;
  genereLe: string;
  sourceEmpreinte: string;
  total: number;
  corrections: {
    thumnNumber: number;
    statut: Statut;
    limiteSurah: number | null;
    limiteAyah: number | null;
    note: string | null;
  }[];
}

/**
 * Le contenu du fichier a remettre a l'application.
 *
 * Cette fonction refuse d'ecrire une ligne incoherente plutot que de la
 * corriger en silence. La table porte les memes contraintes
 * (`division_verifications_correction_complete`) ; les verifier de nouveau ici
 * n'est pas une redondance : c'est ce qui permet d'exporter sans avoir a faire
 * confiance a la base.
 */
export function construireFichierCorrections(
  lignes: readonly LigneVerification[],
  meta: { genereLe: string; sourceEmpreinte: string }
): FichierCorrections {
  const vus = new Set<number>();
  const corrections: FichierCorrections['corrections'] = [];

  for (const ligne of [...lignes].sort((a, b) => a.thumnNumber - b.thumnNumber)) {
    if (!Number.isInteger(ligne.thumnNumber) || ligne.thumnNumber < 1 || ligne.thumnNumber > 480) {
      throw new Error(
        `Numero de toumoun hors bornes : ${ligne.thumnNumber}. Les toumoun vont de 1 a 480.`
      );
    }
    if (vus.has(ligne.thumnNumber)) {
      throw new Error(
        `Le toumoun ${ligne.thumnNumber} apparait deux fois : une borne ne se corrige qu'une fois.`
      );
    }
    vus.add(ligne.thumnNumber);

    if (ligne.statut === 'confirmee' && (ligne.limiteSurah !== null || ligne.limiteAyah !== null)) {
      throw new Error(
        `Le toumoun ${ligne.thumnNumber} est confirme et porte pourtant une borne. ` +
          'Une confirmation ne porte pas de borne : c\'est le cas ou celle des donnees vaut.'
      );
    }
    if (
      ligne.statut === 'corrigee' &&
      (!Number.isInteger(ligne.limiteSurah) || !Number.isInteger(ligne.limiteAyah))
    ) {
      throw new Error(
        `Le toumoun ${ligne.thumnNumber} est corrige sans borne complete. ` +
          'Une correction sans borne n\'est pas une correction.'
      );
    }

    corrections.push({
      thumnNumber: ligne.thumnNumber,
      statut: ligne.statut,
      limiteSurah: ligne.limiteSurah,
      limiteAyah: ligne.limiteAyah,
      note: ligne.note,
    });
  }

  return {
    version: 1,
    genereLe: meta.genereLe,
    sourceEmpreinte: meta.sourceEmpreinte,
    total: corrections.length,
    corrections,
  };
}

/** Le texte du fichier, pret a etre telecharge. */
export function texteFichierCorrections(fichier: FichierCorrections): string {
  return JSON.stringify(fichier, null, 2) + '\n';
}

/**
 * La borne d'un toumoun, quelle que soit son origine.
 *
 * Sert a afficher, pour une borne corrigee, ce que le relecteur a retenu — et a
 * rendre visible que la base et les donnees de l'application ne disent plus la
 * meme chose tant que la correction n'a pas ete reportee.
 */
export function borneRetenue(
  borne: BorneEstimee,
  ligne: LigneVerification | undefined
): { surah: number; ayah: number } {
  if (ligne?.statut === 'corrigee' && ligne.limiteSurah !== null && ligne.limiteAyah !== null) {
    return { surah: ligne.limiteSurah, ayah: ligne.limiteAyah };
  }
  return borne.limiteEstimee;
}

/** La position globale d'une borne estimee, pour comparer deux bornes entre elles. */
export function position(
  sourates: readonly Sourate[],
  borne: { surah: number; ayah: number }
): number | null {
  return indexGlobal(sourates, borne);
}
