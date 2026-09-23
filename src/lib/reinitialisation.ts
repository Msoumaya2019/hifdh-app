// Remettre l'application à l'état d'une installation neuve.
//
// CE QUE CETTE FONCTION FAIT, ET CE QU'ELLE NE FAIT PAS
// -----------------------------------------------------
// Elle ordonne l'effacement et rapporte ce qui a été effacé. Elle n'efface rien
// elle-même : les effaceurs lui sont **donnés**. C'est ce qui la rend éprouvable
// — les effaceurs réels remontent à `expo-sqlite`, `expo-secure-store` et
// React Native, qu'un test ne charge pas, tandis qu'une doublure qui compte ses
// appels se lit en dix lignes.
//
// ELLE NE S'ARRÊTE PAS AU PREMIER ÉCHEC, ET C'EST DÉLIBÉRÉ
// --------------------------------------------------------
// « Tout supprimer » est une promesse d'ensemble : si le cache des pages échoue,
// les séances et la progression doivent partir quand même. S'arrêter au premier
// échec laisserait l'appareil à moitié effacé — le pire des états, parce que
// l'utilisateur croirait avoir tout remis à zéro.
//
// Le rapport est donc le résultat : ce qui a été effacé, et ce qui ne l'a pas
// été, avec la raison. L'écran s'en sert pour dire la vérité plutôt que
// d'annoncer un succès qu'il n'a pas obtenu.

/**
 * Les étapes, dans l'ordre.
 *
 * L'ordre n'est pas indifférent pour la première : la déconnexion s'adresse au
 * serveur avec le jeton, et doit donc précéder l'effacement du stockage qui le
 * porte. Les trois autres n'ont pas d'ordre obligé entre elles ; elles sont
 * nommées dans l'ordre où elles ont été écrites, pour qu'un lecteur n'ait pas à
 * deviner s'il en manque une.
 */
export const ETAPES_REINITIALISATION = ['session', 'magasin', 'base', 'cache'] as const;

export type Etape = (typeof ETAPES_REINITIALISATION)[number];

/** Les effaceurs, un par étape. Tous obligatoires : un `Record` incomplet ne compile pas. */
export type Effaceurs = Record<Etape, () => Promise<void>>;

export const LIBELLES_ETAPES: Record<Etape, string> = {
  session: 'la session',
  magasin: 'les préférences',
  base: 'la progression',
  cache: 'les pages gardées hors ligne',
};

export interface EchecEtape {
  etape: Etape;
  raison: string;
}

export interface ResultatReinitialisation {
  reussies: Etape[];
  echecs: EchecEtape[];
}

/** La raison d'un échec, en clair. Un rejet peut porter n'importe quoi. */
function raisonDe(erreur: unknown): string {
  if (erreur instanceof Error && erreur.message !== '') return erreur.message;
  return String(erreur);
}

/**
 * Efface tout, et rapporte ce qui a été effacé.
 *
 * Les étapes sont jouées **l'une après l'autre**, jamais en parallèle : deux
 * effacements simultanés du même appareil ne vont pas plus vite, et ils
 * rendraient le rapport ambigu — un échec ne dirait plus à quelle étape il
 * appartient.
 */
export async function reinitialiserTout(
  effaceurs: Effaceurs
): Promise<ResultatReinitialisation> {
  const reussies: Etape[] = [];
  const echecs: EchecEtape[] = [];

  for (const etape of ETAPES_REINITIALISATION) {
    try {
      await effaceurs[etape]();
      reussies.push(etape);
    } catch (erreur) {
      echecs.push({ etape, raison: raisonDe(erreur) });
    }
  }

  return { reussies, echecs };
}

/** Le message à montrer lorsque tout a été effacé. */
export function messageDeSucces(): string {
  return "L'application a été remise à zéro. Tu peux recommencer ta configuration.";
}

/**
 * Le message à montrer lorsqu'une partie seulement a été effacée.
 *
 * Il **nomme** ce qui a résisté. Annoncer « tout a été effacé » alors que la
 * progression est restée ferait douter l'utilisateur du bouton, et non de la
 * panne — et il recommencerait, sans que rien ne change.
 */
export function messageEnCasDEchec(resultat: ResultatReinitialisation): string {
  if (resultat.echecs.length === 0) return messageDeSucces();
  const noms = resultat.echecs.map((e) => LIBELLES_ETAPES[e.etape]).join(', ');
  return `Une partie n'a pas pu être effacée : ${noms}. Ferme puis rouvre l'application, et réessaie.`;
}
