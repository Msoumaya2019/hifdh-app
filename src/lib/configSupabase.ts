// Lecture et normalisation de la configuration Supabase.
//
// Le tableau de bord Supabase expose plusieurs URL, et la plus visible est
// celle de l'API REST — « https://<ref>.supabase.co/rest/v1/ ». C'est celle
// qu'on copie naturellement. Or `createClient` attend l'URL du **projet**, et
// construit lui-même ses chemins : avec le suffixe, il interrogerait
// « /rest/v1/auth/v1/token », qui n'existe pas.
//
// La panne serait déroutante : les lectures de table fonctionneraient (le
// chemin « /rest/v1/rest/v1/... » échouerait, lui aussi, mais autrement), et
// seule l'authentification échouerait — au moment précis où l'utilisateur
// croit avoir correctement configuré son projet.
//
// On retire donc les suffixes d'API connus. La règle est volontairement
// étroite : on ne touche à rien d'autre, et une URL inattendue est rendue
// telle quelle plutôt que devinée.

const SUFFIXES_API = ['/rest/v1', '/auth/v1', '/storage/v1', '/graphql/v1', '/realtime/v1'];

/**
 * L'URL du projet, débarrassée d'un éventuel suffixe d'API.
 *
 * Rend une chaîne vide si l'entrée est vide : l'appelant traite ce cas comme
 * « non configuré ».
 */
export function normaliserUrlSupabase(brut: string | null | undefined): string {
  if (brut === null || brut === undefined) return '';

  let url = brut.trim();
  if (url === '') return '';

  // Un schéma absent est fréquent quand on recopie une référence de projet :
  // sans lui, `fetch` échouerait sur une URL relative, sans message clair.
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // Les barres finales sont retirées avant les suffixes, sinon
  // « /rest/v1/ » ne correspondrait à aucun d'eux.
  url = url.replace(/\/+$/, '');

  let modifie = true;
  while (modifie) {
    modifie = false;
    for (const suffixe of SUFFIXES_API) {
      if (url.toLowerCase().endsWith(suffixe)) {
        url = url.slice(0, -suffixe.length).replace(/\/+$/, '');
        modifie = true;
      }
    }
  }

  return url;
}

/**
 * La première valeur réellement renseignée.
 *
 * `??` ne suffit pas ici : `app.json` peut porter une clé vide (« »), qui n'est
 * pas nulle. Avec `??`, cette chaîne vide l'emporterait sur la variable
 * d'environnement, et l'application se croirait non configurée alors que tout
 * est renseigné — sans que rien ne le signale. C'est précisément le défaut
 * qu'une clé laissée vide dans `app.json` provoquait.
 */
export function premierNonVide(...valeurs: (string | undefined | null)[]): string {
  for (const valeur of valeurs) {
    if (typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim();
  }
  return '';
}
