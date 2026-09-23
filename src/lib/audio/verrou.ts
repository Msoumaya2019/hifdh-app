// Le verrou de séance : ce qui empêche deux récitations de se superposer.
//
// LE DÉFAUT QU'IL FERME
// ---------------------
// Une séance de lecture est une suite d'attentes : on demande un fichier, on
// attend qu'il se charge, on le joue, on attend sa fin, on passe au suivant.
// Chacune de ces attentes peut se terminer APRÈS que l'utilisateur a quitté
// l'écran, changé de passage, ou appuyé sur « arrêter ».
//
// Sans verrou, la suite continue de s'exécuter : un verset de l'ancienne séance
// se met à jouer par-dessus la nouvelle, ou l'écran affiche un verset que
// personne n'écoute. Le défaut ne se signale pas par une erreur — il se signale
// par deux voix en même temps, ce qui est exactement ce que la spécification
// interdit.
//
// COMMENT IL FERME CE DÉFAUT
// --------------------------
// Chaque séance reçoit un **jeton**, et le verrou retient le dernier ouvert.
// Avant d'agir sur le résultat d'une attente, la suite demande si son jeton est
// encore le courant ; s'il ne l'est plus, elle s'arrête là.
//
// C'est une comparaison d'entiers, et non un drapeau booléen : un drapeau
// partagé ne saurait pas distinguer « la séance A a été annulée » de « la séance
// B a été annulée puis rouverte ». Le jeton, lui, est unique par séance, donc
// une réponse en retard ne peut jamais être prise pour une réponse en cours.
//
// POURQUOI CE MODULE EST SÉPARÉ
// -----------------------------
// La règle est une décision pure, et elle se teste : « cette réponse appartient-
// elle encore à la séance courante ? ». Mêlée au composant, elle ne serait
// éprouvable qu'en montant un lecteur audio, ce qui demanderait un appareil.

export interface Verrou {
  /** Le jeton de la séance en cours. Zéro veut dire « aucune séance ». */
  courant: number;
  /** Le dernier jeton distribué. Croît toujours, et ne revient jamais en arrière. */
  dernier: number;
}

/** Un verrou neuf, sans séance ouverte. */
export function creerVerrou(): Verrou {
  return { courant: 0, dernier: 0 };
}

/**
 * Ouvre une séance et rend son jeton.
 *
 * Toute séance ouverte invalide la précédente **immédiatement** : c'est le point
 * du verrou. L'appelant n'a rien à fermer avant d'ouvrir.
 */
export function ouvrirSeance(verrou: Verrou): number {
  verrou.dernier += 1;
  verrou.courant = verrou.dernier;
  return verrou.courant;
}

/** Ferme la séance en cours. Les réponses en retard deviennent caduques. */
export function fermerSeance(verrou: Verrou): void {
  verrou.courant = 0;
}

/**
 * Vrai si le jeton appartient encore à la séance en cours.
 *
 * Rend `false` après une fermeture : un jeton ne vaut jamais zéro, donc aucune
 * séance ne peut être confondue avec « aucune séance ».
 */
export function estActive(verrou: Verrou, jeton: number): boolean {
  return jeton !== 0 && verrou.courant === jeton;
}
