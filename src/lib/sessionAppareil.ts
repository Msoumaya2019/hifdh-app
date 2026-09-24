// La session Supabase, effacée pour de bon — et le téléphone avec.
//
// TROIS GESTES, ET L'ORDRE EST CONTRAINT
// --------------------------------------
// 1. `oublierLeJeton()` retire le jeton de CET appareil du compte qui s'en va.
//    Il doit passer EN PREMIER, et ce n'est pas un détail d'élégance : la
//    politique de la table `appareils` exige `auth.uid() = user_id`, donc il
//    faut être encore connecté. Appelé après, il ne ferait rien du tout, en
//    silence.
//
//    Ce qu'il évite est une fuite réelle : sans lui, le compte quitté
//    continuerait de recevoir ses notifications sur un téléphone qui n'est plus
//    le sien — et de les lire, puisque rien ne les lui retire.
//
// 2. `seDeconnecter()` révoque le jeton auprès du serveur, et retire la session
//    du stockage. C'est le geste propre — et il a besoin du jeton encore présent
//    pour s'adresser au serveur.
//
// 3. Mais il appelle le réseau : hors ligne, il échoue, et la session RESTE dans
//    le trousseau. « Tout remettre à zéro » deviendrait alors un mensonge : à la
//    réouverture, l'utilisateur serait encore connecté, avec son profil et sa
//    sauvegarde. On efface donc le stockage local **inconditionnellement**, après
//    la tentative de déconnexion.
//
// Ce que la révocation serveur manquerait à faire est borné : un jeton qui
// expire. Ce qu'un effacement local manqué laisserait est un appareil qui n'est
// pas redevenu neuf — c'est la promesse de l'écran, et c'est elle qui prime.
//
// POURQUOI `quitterLeCompte` EXISTE SÉPARÉMENT
// --------------------------------------------
// La déconnexion ordinaire (Profil → Sauvegarde) et la remise à zéro effacent
// des choses différentes, mais elles ont ceci de commun qu'elles doivent TOUTES
// DEUX oublier le jeton d'appareil. Deux copies de cette séquence divergeraient
// à la première modification ; il n'y en a donc qu'une, et les deux chemins
// passent par elle.

import { seDeconnecter } from './auth';
import { jetonSansDemander } from './push';
import { effacerSessionStockee } from './supabase';
import { oublierAppareil } from './sync/notifications';

/**
 * Retire le jeton de cet appareil du compte connecté.
 *
 * N'échoue jamais : une déconnexion doit aboutir même si le réseau est absent,
 * même si le projet Expo n'est pas relié, même si la personne n'a jamais activé
 * les notifications. Dans tous ces cas il n'y a rien à retirer, et ce n'est pas
 * une erreur.
 */
async function oublierLeJeton(): Promise<void> {
  try {
    const jeton = await jetonSansDemander();
    if (jeton === null) return;
    await oublierAppareil(jeton);
  } catch {
    // Voir plus haut : le silence est ici le comportement juste.
  }
}

/**
 * La déconnexion ordinaire : l'appareil cesse d'être joignable pour ce compte,
 * puis la session se ferme.
 *
 * À utiliser partout à la place de `seDeconnecter` — sinon le compte quitté
 * garde le droit de faire sonner ce téléphone.
 */
export async function quitterLeCompte(): Promise<void> {
  await oublierLeJeton();
  await seDeconnecter();
}

export async function effacerSession(): Promise<void> {
  await oublierLeJeton();
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
