// Stockage sécurisé par morceaux.
//
// `expo-secure-store` plafonne chaque valeur à 2048 octets, et l'avertissement
// du paquet est explicite : au-delà, « it may not be stored successfully » —
// c'est-à-dire un échec silencieux.
//
// Mesuré : une session Supabase d'un compte à courriel simple, avec une
// référence de projet de 20 caractères, pèse 2046 octets. Elle passe donc — de
// deux octets. C'est le pire des cas possibles, et non un cas confortable :
// une adresse plus longue, une URL d'avatar dans user_metadata, une seconde
// identité ajoutée en se connectant plus tard avec Google, et la valeur bascule
// au-dessus du plafond. Stockée d'un bloc, la session se perdrait alors sans
// message : l'utilisateur croirait s'être connecté, et se retrouverait
// déconnecté au redémarrage.
//
// On découpe donc, et on recolle. Deux propriétés comptent plus que le reste :
//
//   - un découpage ne coupe jamais un caractère en deux (l'itération par point
//     de code garde les paires de substitution ensemble) ;
//   - une lecture incomplète rend `null`, jamais une valeur tronquée. Un jeton
//     à moitié relu serait traité comme une session valide et échouerait
//     ailleurs, plus loin de la cause.
//
// Il y a une SECONDE contrainte, et celle-là ne pardonne pas : `expo-secure-store`
// refuse toute clé hors de `[A-Za-z0-9._-]`, en levant. Elle est traitée plus
// bas, avec les clés composées. Elle a coûté une session entière — la connexion
// échouait alors que les identifiants étaient bons — et un rond qui tournait
// sans fin sur « Mes amis ».

/** Le dépôt de clés sous-jacent, tel que `expo-secure-store`. */
export interface DepotCles {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Le stockage attendu par le client Supabase. */
export interface StockageAsynchrone {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Marge sous le plafond de 2048 octets.
 *
 * On vise 1500 plutôt que 2048 : la limite annoncée porte sur la valeur seule,
 * et rien ne garantit qu'une implémentation native ne compte pas d'octets
 * supplémentaires. Une marge coûte quelques clés de plus ; l'absence de marge
 * coûte la session.
 */
export const LIMITE_MORCEAU = 1500;

/** Nombre d'octets UTF-8 d'une chaîne, sans dépendre de `TextEncoder`. */
export function tailleUtf8(valeur: string): number {
  let total = 0;
  for (const caractere of valeur) {
    const point = caractere.codePointAt(0) ?? 0;
    total += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return total;
}

/**
 * Découpe une chaîne en morceaux respectant la limite d'octets.
 *
 * L'itération `for...of` parcourt les points de code : une paire de
 * substitution (emoji, caractère rare) n'est jamais séparée. Un découpage par
 * unités de code produirait deux demi-caractères, que le stockage natif
 * refuserait ou remplacerait — et la reconstitution ne serait plus identique.
 */
export function decouper(valeur: string, limite: number = LIMITE_MORCEAU): string[] {
  if (valeur === '') return [''];

  const morceaux: string[] = [];
  let courant = '';
  let taille = 0;

  for (const caractere of valeur) {
    const octets = tailleUtf8(caractere);
    if (taille + octets > limite && courant !== '') {
      morceaux.push(courant);
      courant = '';
      taille = 0;
    }
    courant += caractere;
    taille += octets;
  }
  if (courant !== '') morceaux.push(courant);

  return morceaux;
}

/**
 * Rend une clé acceptable pour la plateforme.
 *
 * `expo-secure-store` REFUSE toute clé hors de `[A-Za-z0-9._-]`, et il refuse
 * en LEVANT : `getItemAsync`, `setItemAsync` et `deleteItemAsync` appellent
 * toutes les trois `ensureValidKey`, dont la règle est — mesurée dans le paquet
 * livré, `node_modules/expo-secure-store/build/SecureStore.js` :
 *
 *     function isValidKey(key) {
 *       return typeof key === 'string' && /^[\w.-]+$/.test(key);
 *     }
 *
 * Le suffixe ne suffit pas à garantir la propriété : la clé de base vient de
 * l'appelant — ici `supabase-js`, qui emploie `sb-<référence>-auth-token`. Une
 * version future pourrait y mettre un caractère refusé, et le défaut
 * reviendrait par une autre porte. On remplace donc tout caractère hors de
 * `[A-Za-z0-9._-]` par `_` : quelle que soit la clé reçue, celle confiée à la
 * plateforme est acceptable.
 *
 * La transformation n'est pas injective, et c'est sans conséquence : les clés
 * que ce projet reçoit ne diffèrent jamais par un caractère remplacé.
 */
export function clePlateforme(cle: string): string {
  return cle.replace(/[^\w.-]/g, '_');
}

/**
 * Les clés composées, et pourquoi elles ne contiennent PAS de deux-points.
 *
 * Le séparateur était `::`. Or `:` est hors de la règle ci-dessus, donc
 * `ensureValidKey` levait à CHAQUE lecture et à CHAQUE écriture de session. La
 * session ne pouvait donc être ni enregistrée ni relue : la connexion échouait
 * alors que les identifiants étaient bons, et `getSession()` REJETAIT au lieu
 * de rendre `null` — ce qui laissait « Mes amis » sur un rond sans fin, faute
 * de `connecte` jamais posé.
 *
 * Aucune donnée n'est à reprendre sous l'ancienne forme : `setItem` lit le
 * compteur avant d'écrire le premier morceau, et cette lecture levait déjà.
 * Rien n'a donc jamais pu être écrit.
 */
const suffixeNombre = (cle: string) => `${cle}_nb`;
const suffixeMorceau = (cle: string, index: number) => `${cle}_${index}`;

/**
 * Enveloppe un dépôt de clés pour lui faire accepter des valeurs longues.
 *
 * Le format est autoportant : `<clé>_nb` porte le nombre de morceaux, et
 * `<clé>_<i>` chaque morceau. Une clé sans compteur est considérée absente,
 * ce qui rend une écriture interrompue inoffensive — mieux vaut pas de session
 * qu'une session à moitié écrite.
 */
export function creerStockageMorceaux(
  depot: DepotCles,
  limite: number = LIMITE_MORCEAU
): StockageAsynchrone {
  return {
    async getItem(cle: string): Promise<string | null> {
      const base = clePlateforme(cle);
      const brut = await depot.getItem(suffixeNombre(base));
      if (brut === null) return null;

      const nombre = Number(brut);
      if (!Number.isInteger(nombre) || nombre <= 0) return null;

      const morceaux: string[] = [];
      for (let index = 0; index < nombre; index += 1) {
        const morceau = await depot.getItem(suffixeMorceau(base, index));
        // Un morceau manquant signifie une écriture interrompue. Rendre ce
        // qu'on a donnerait un jeton tronqué, donc une panne plus loin.
        if (morceau === null) return null;
        morceaux.push(morceau);
      }
      return morceaux.join('');
    },

    async setItem(cle: string, valeur: string): Promise<void> {
      const base = clePlateforme(cle);
      const morceaux = decouper(valeur, limite);

      // On retire d'abord l'ancien contenu : sans cela, écrire une valeur
      // courte après une longue laisserait des morceaux orphelins, qui
      // occuperaient le stockage sans jamais être relus.
      const ancien = await depot.getItem(suffixeNombre(base));
      const ancienNombre = ancien === null ? 0 : Number(ancien);
      if (Number.isInteger(ancienNombre) && ancienNombre > morceaux.length) {
        for (let index = morceaux.length; index < ancienNombre; index += 1) {
          await depot.removeItem(suffixeMorceau(base, index));
        }
      }

      for (let index = 0; index < morceaux.length; index += 1) {
        await depot.setItem(suffixeMorceau(base, index), morceaux[index]);
      }
      // Le compteur est écrit en dernier : tant qu'il manque, la clé est
      // considérée absente, et aucun morceau partiel n'est relu.
      await depot.setItem(suffixeNombre(base), String(morceaux.length));
    },

    async removeItem(cle: string): Promise<void> {
      const base = clePlateforme(cle);
      const ancien = await depot.getItem(suffixeNombre(base));
      const ancienNombre = ancien === null ? 0 : Number(ancien);
      if (Number.isInteger(ancienNombre) && ancienNombre > 0) {
        for (let index = 0; index < ancienNombre; index += 1) {
          await depot.removeItem(suffixeMorceau(base, index));
        }
      }
      await depot.removeItem(suffixeNombre(base));
    },
  };
}
