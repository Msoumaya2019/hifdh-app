// La session Supabase, effacée pour de bon.
//
// DEUX GESTES, ET LE SECOND EST CELUI QUI COMPTE
// ----------------------------------------------
// `seDeconnecter()` révoque le jeton auprès du serveur, et retire la session du
// stockage. C'est le geste propre — et il a besoin du jeton encore présent pour
// s'adresser au serveur.
//
// Mais il appelle le réseau : hors ligne, il échoue, et la session RESTE dans le
// trousseau. « Tout remettre à zéro » deviendrait alors un mensonge : à la
// réouverture, l'utilisateur serait encore connecté, avec son profil et sa
// sauvegarde. On efface donc le stockage local **inconditionnellement**, après
// la tentative de déconnexion.
//
// Ce que la révocation serveur manquerait à faire est borné : un jeton qui
// expire. Ce qu'un effacement local manqué laisserait est un appareil qui n'est
// pas redevenu neuf — c'est la promesse de l'écran, et c'est elle qui prime.

import { seDeconnecter } from './auth';
import { effacerSessionStockee } from './supabase';

export async function effacerSession(): Promise<void> {
  try {
    await seDeconnecter();
  } catch {
    // Hors ligne, la révocation côté serveur échoue. Ce n'est pas ce qui
    // empêche l'appareil de redevenir neuf : le jeton local part juste après.
    // On ne fait donc pas échouer l'étape pour autant — le rapport de la remise
    // à zéro doit dire ce qui a été effacé, pas ce que le réseau a refusé.
  }
  await effacerSessionStockee();
}
