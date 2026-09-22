// Doublure de `expo-sqlite` pour les tests hors appareil.
//
// Le paquet réel exige l'environnement natif. Aucun test actuel n'exerce la
// couche base de données : cette doublure existe pour que le module qui
// l'importe reste chargeable, et pour rendre explicite qu'il n'est pas éprouvé
// ici. Elle n'implémente aucune requête.

const journal = [];

export const __journal = journal;

export async function openDatabaseAsync(nom) {
  journal.push(['open', nom]);
  throw new Error(
    `expo-sqlite est remplacé par une doublure : aucune base réelle n'est ouverte (${nom})`,
  );
}

export function openDatabaseSync(nom) {
  journal.push(['openSync', nom]);
  throw new Error(
    `expo-sqlite est remplacé par une doublure : aucune base réelle n'est ouverte (${nom})`,
  );
}

export default { openDatabaseAsync, openDatabaseSync };
