// Le magasin clé-valeur de l'application.
//
// `@react-native-async-storage/async-storage` y est employé pour deux choses :
// la préférence de thème, et — sur le web seulement — le repli de la session
// Supabase, qui vit sinon dans le trousseau.
//
// POURQUOI CE MODULE EXISTE, PLUTÔT QU'UN APPEL DIRECT
// ---------------------------------------------------
// La remise à zéro complète doit vider ce magasin. Écrire `AsyncStorage.clear()`
// dans le module de remise à zéro aurait marché, mais aurait rendu ce module
// inéprouvable — le paquet remonte à React Native, que `node --test` ne charge
// pas. Et surtout, le test du câblage n'aurait alors eu aucun moyen stable de
// désigner ce qu'il faut effacer : le chemin résolu d'un paquet dans
// `node_modules` dépend de son champ `main`, donc d'une version à l'autre.
//
// Ce module donne un nom à la chose, et ce nom est un fichier du dépôt.

import AsyncStorage from '@react-native-async-storage/async-storage';

/** Vide le magasin clé-valeur. Ne lève jamais pour une clé absente. */
export async function viderMagasin(): Promise<void> {
  await AsyncStorage.clear();
}
