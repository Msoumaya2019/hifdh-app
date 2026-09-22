// ============================================================================
// Les limites de toumoun estimees, et les controles qui les entourent.
//
// L'unite relue est une LIMITE, et une limite est le **premier verset** d'un
// toumoun : c'est la valeur que `generate_thumn.py` range dans
// `hafs_eighth_list[N]`, et celle que porte le statut `estimated_offset`. Le
// toumoun precedent finit au verset juste avant.
//
// Ce n'est pas la **fin** du toumoun, et la distinction n'est pas cosmetique.
// La fin d'un toumoun pair est une fin de rub' al-hizb, prise des donnees Hafs
// de KFGQPC : elle est verifiee. Afficher la fin comme « estimee » envoyait le
// relecteur verifier un verset qui n'a jamais ete en doute, et laissait la
// limite reellement estimee sans relecture. Mesure faite sur les 151 limites
// estimees d'alors : les 151 fins sont des fins de rub', aucune des 151 limites
// n'est un debut de rub'.
//
// Le tableau de bord reprend les colonnes du document engendre
// `docs/divisions-estimees.md` telles quelles — un relecteur qui a le document
// sous les yeux doit retrouver la meme ligne au meme endroit.
//
// Aucune fonction de ce fichier ne modifie une donnee : elles lisent, filtrent
// et confrontent. L'ecriture se limite a la table `division_verifications`.
// ============================================================================

import type { Borne, Sourate, Thumn } from './thumn.ts';

/** Une limite estimee, telle qu'elle sera presentee a la relecture. */
export interface BorneEstimee {
  thumnNumber: number;
  hizbNumber: number;
  rubNumber: number;
  /** La limite telle qu'elle figure dans les donnees Hafs de l'application. */
  limiteEstimee: Borne;
  /** La valeur Qaloun dont l'estimation a ete tiree. */
  limiteQaloun: Borne;
  /**
   * Vrai quand les deux different : c'est alors le decalage cumulatif qui a
   * joue, et c'est le cas ou l'estimation est la plus suspecte.
   */
  ecart: boolean;
}

export interface GroupeSourate {
  surah: number;
  /** `null` quand la sourate n'est pas dans `surahs.json` : on ne l'invente pas. */
  nomFr: string | null;
  bornes: BorneEstimee[];
}

/** `« 2:25 »` — la forme exacte employee par le document engendre. */
export function formaterBorne(borne: Borne): string {
  return `${borne.surah}:${borne.ayah}`;
}

/**
 * L'ordre du Coran : par numero de toumoun.
 *
 * Nomme plutot qu'ecrit en ligne a chaque appel : c'est ce qui garantit que
 * les deux tris du fichier — celui de la liste et celui du controle de
 * continuite — restent le meme ordre. Deux comparateurs ecrits separement
 * finiraient par diverger, et le controle de continuite ne verifierait plus
 * la meme chose que ce qui est affiche.
 */
function parNumeroDeToumoun(a: { thumnNumber: number }, b: { thumnNumber: number }): number {
  return a.thumnNumber - b.thumnNumber;
}

/**
 * Les bornes qui ne sont pas verifiees, dans l'ordre du Coran.
 *
 * Le filtre porte sur `estimated_offset` seul. Les 240 toumoun impairs sont
 * `verified_hafs`, 89 toumoun pairs sont `verified` : ni les uns ni les autres
 * n'ont besoin d'etre relus, et les melanger noierait celles qui restent. Une
 * limite relue quitte `estimated_offset` pour `relue`, et sort donc d'elle-meme
 * de cette liste — c'est ce qui fait baisser le travail restant sans qu'on ait
 * a tenir un compte a part.
 */
export function bornesEstimees(thumn: readonly Thumn[]): BorneEstimee[] {
  return thumn
    .filter((t) => t.verificationStatus === 'estimated_offset')
    .map((t) => {
      const limiteEstimee: Borne = { surah: t.hafs.startSurah, ayah: t.hafs.startAyah };
      const limiteQaloun: Borne = {
        surah: t.qalounReference.startSurah,
        ayah: t.qalounReference.startAyah,
      };
      return {
        thumnNumber: t.thumnNumber,
        hizbNumber: t.hizbNumber,
        rubNumber: t.rubNumber,
        limiteEstimee,
        limiteQaloun,
        ecart:
          limiteEstimee.surah !== limiteQaloun.surah ||
          limiteEstimee.ayah !== limiteQaloun.ayah,
      };
    })
    .sort(parNumeroDeToumoun);
}

/**
 * Les limites regroupees par sourate ou elles tombent, pour la lecture.
 *
 * Le regroupement suit la sourate de la **limite estimee** : c'est la que le
 * relecteur doit ouvrir son moushaf. Regrouper par la fin du toumoun l'aurait
 * envoye a la sourate suivante des que la limite et la fin ne sont pas dans la
 * meme sourate.
 */
export function grouperParSourate(
  bornes: readonly BorneEstimee[],
  sourates: readonly Sourate[]
): GroupeSourate[] {
  const parNumero = new Map<number, Sourate>();
  for (const sourate of sourates) parNumero.set(sourate.number, sourate);

  const groupes = new Map<number, BorneEstimee[]>();
  for (const borne of bornes) {
    const cle = borne.limiteEstimee.surah;
    const liste = groupes.get(cle);
    if (liste) liste.push(borne);
    else groupes.set(cle, [borne]);
  }

  return [...groupes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([surah, liste]) => ({
      surah,
      nomFr: parNumero.get(surah)?.nameFr ?? null,
      bornes: liste,
    }));
}

/**
 * L'index global d'un verset dans le Coran (1 a 6236).
 *
 * `null` quand la sourate est inconnue ou le verset hors de la sourate. Le
 * `null` remonte tel quel : une borne qu'on ne sait pas situer ne doit pas
 * recevoir une position par defaut, qui la ferait passer pour coherente.
 */
export function indexGlobal(sourates: readonly Sourate[], borne: Borne): number | null {
  const sourate = sourates.find((s) => s.number === borne.surah);
  if (!sourate) return null;
  if (!Number.isInteger(borne.ayah) || borne.ayah < 1 || borne.ayah > sourate.ayahCount) {
    return null;
  }
  return sourate.startAyahId + borne.ayah - 1;
}

/**
 * La chaine des toumoun est-elle continue ?
 *
 * Chaque toumoun doit commencer au verset qui suit la fin du precedent. Un trou
 * ou un recouvrement rendrait toute correction locale douteuse : la borne
 * corrigee serait coherente avec des voisines fausses.
 *
 * Rend la liste des ruptures, vide si la chaine est saine.
 */
export function verifierContinuite(thumn: readonly Thumn[]): string[] {
  const ruptures: string[] = [];
  const tries = [...thumn].sort(parNumeroDeToumoun);

  for (let i = 1; i < tries.length; i += 1) {
    const precedent = tries[i - 1];
    const courant = tries[i];
    const attendu = precedent.hafs.endAyahId + 1;
    if (courant.hafs.startAyahId !== attendu) {
      ruptures.push(
        `toumoun ${courant.thumnNumber} commence au verset ${courant.hafs.startAyahId}, ` +
          `alors que le toumoun ${precedent.thumnNumber} finit au verset ` +
          `${precedent.hafs.endAyahId} (attendu : ${attendu}).`
      );
    }
  }

  return ruptures;
}

/**
 * Le debut d'un toumoun, reduit a ce qu'il faut pour controler ses voisines.
 *
 * Le controle de coherence n'a pas besoin des 480 enregistrements complets :
 * il lui faut, pour chaque toumoun, sa limite et sa position. Reduire ici permet
 * de n'envoyer que cela a l'ecran, et evite qu'un changement de forme des
 * donnees oblige a retoucher la fonction de controle.
 */
export interface LimiteToumoun {
  thumnNumber: number;
  debut: Borne;
  /** Index global du debut, pour comparer deux limites entre elles. */
  index: number;
}

/** Les limites des 480 toumoun, dans l'ordre du Coran. */
export function limitesDesToumoun(thumn: readonly Thumn[]): LimiteToumoun[] {
  return thumn
    .map((t) => ({
      thumnNumber: t.thumnNumber,
      debut: { surah: t.hafs.startSurah, ayah: t.hafs.startAyah },
      index: t.hafs.startAyahId,
    }))
    .sort(parNumeroDeToumoun);
}

/**
 * Une limite corrigee tient-elle entre ses deux voisines ?
 *
 * La chaine etant continue, la limite du toumoun N est le premier verset de ce
 * toumoun, et donc la fin du toumoun N-1. Elle doit tomber strictement apres la
 * limite du toumoun N-1 et strictement avant celle du toumoun N+1 : en deca, le
 * toumoun N-1 serait vide ; au-dela, le toumoun N le serait.
 *
 * Ce controle ne dit pas que la limite est juste — seul un moushaf le dit. Il
 * dit qu'elle est possible, ce qui suffit a arreter une faute de frappe :
 * « 2:300 » pour « 2:30 » ne passe pas.
 *
 * Rend `null` si la limite est acceptable, sinon le motif du refus.
 */
export function verifierCoherence(
  limites: readonly LimiteToumoun[],
  sourates: readonly Sourate[],
  thumnNumber: number,
  borne: Borne
): string | null {
  const courant = limites.find((l) => l.thumnNumber === thumnNumber);
  if (!courant) {
    return `Le toumoun ${thumnNumber} ne figure pas dans les donnees.`;
  }

  const cible = indexGlobal(sourates, borne);
  if (cible === null) {
    const sourate = sourates.find((s) => s.number === borne.surah);
    if (!sourate) {
      return `La sourate ${borne.surah} n'existe pas : le Coran en compte 114.`;
    }
    return (
      `Le verset ${borne.surah}:${borne.ayah} n'existe pas : ` +
      `la sourate ${borne.surah} en compte ${sourate.ayahCount}.`
    );
  }

  const precedent = limites.find((l) => l.thumnNumber === thumnNumber - 1);
  if (precedent && cible <= precedent.index) {
    return (
      `Le toumoun ${thumnNumber} doit contenir au moins un verset : sa limite ` +
      `doit suivre celle du toumoun ${precedent.thumnNumber}, qui commence en ` +
      `${formaterBorne(precedent.debut)}.`
    );
  }

  const suivant = limites.find((l) => l.thumnNumber === thumnNumber + 1);
  if (suivant && cible >= suivant.index) {
    return (
      `La limite du toumoun ${thumnNumber} doit preceder le debut du toumoun ` +
      `${suivant.thumnNumber}, qui est en ${formaterBorne(suivant.debut)}. ` +
      `Au-dela, les deux toumoun se recouvriraient.`
    );
  }

  return null;
}
