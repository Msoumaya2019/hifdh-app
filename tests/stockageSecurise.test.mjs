// Stockage sécurisé par morceaux.
//
// Le premier défaut couvert n'est pas visible : au-delà de 2048 octets,
// `expo-secure-store` n'échoue pas, il avertit — et la valeur peut ne pas être
// conservée. Une session perdue au redémarrage, sans message.
//
// Le second, lui, échoue en LEVANT : la plateforme refuse toute clé hors de
// `[A-Za-z0-9._-]`. Le banc ne pouvait pas le voir tant qu'il employait un
// dépôt en mémoire qui acceptait n'importe quelle clé — il écrivait même
// `'session::nb'` en toutes lettres. Il confronte donc maintenant chaque clé à
// la règle RÉELLE, lue dans le paquet installé.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  clePlateforme,
  creerStockageMorceaux,
  decouper,
  tailleUtf8,
  LIMITE_MORCEAU,
} from '@/lib/stockageSecurise';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/**
 * La règle de clé d'`expo-secure-store`, LUE dans le paquet livré.
 *
 * Pourquoi la lire au lieu de la réécrire : c'est la plateforme qui refuse, pas
 * nous. Une règle recopiée à la main se périmerait au premier changement du
 * paquet sans que rien ne le dise ; ici, le banc suit. Si le paquet disparaît
 * ou change de forme, l'assertion le dit au lieu de laisser croire au vert.
 */
function regleDeCleSecureStore() {
  const source = readFileSync(
    join(RACINE, 'node_modules', 'expo-secure-store', 'build', 'SecureStore.js'),
    'utf8'
  );
  const trouve = source.match(
    /return typeof key === 'string' && (\/[^/\n]+\/)\.test\(key\)/
  );
  assert.ok(
    trouve !== null,
    'la règle de clé doit se lire dans le paquet expo-secure-store installé'
  );
  return new RegExp(trouve[1].slice(1, -1));
}

/** Un dépôt de clés en mémoire, qui peut refuser d'écrire une clé donnée. */
function depotMemoire({ refuserEcriture, regle } = {}) {
  const contenu = new Map();

  // Le contrôle de clé est le même pour les trois gestes : la plateforme
  // l'applique dans `getItemAsync`, `setItemAsync` ET `deleteItemAsync`.
  const verifier = (cle) => {
    if (regle !== undefined && !regle.test(cle)) {
      throw new Error(`clé refusée par la plateforme : « ${cle} »`);
    }
  };

  return {
    contenu,
    async getItem(cle) {
      verifier(cle);
      return contenu.has(cle) ? contenu.get(cle) : null;
    },
    async setItem(cle, valeur) {
      verifier(cle);
      if (refuserEcriture !== undefined && refuserEcriture(cle)) {
        throw new Error(`écriture refusée pour ${cle}`);
      }
      contenu.set(cle, valeur);
    },
    async removeItem(cle) {
      verifier(cle);
      contenu.delete(cle);
    },
    cles: () => [...contenu.keys()].sort(),
  };
}

// === Découpage ===

test('un découpage ne dépasse jamais la limite, en octets', () => {
  const valeur = 'a'.repeat(10_000);
  const morceaux = decouper(valeur, 1500);

  for (const morceau of morceaux) {
    assert.ok(
      tailleUtf8(morceau) <= 1500,
      `morceau de ${tailleUtf8(morceau)} octets, au-delà de 1500`
    );
  }
});

test('le découpage recompose exactement la valeur d’origine', () => {
  const valeur = 'Le Coran compte six mille deux cent trente-six versets. '.repeat(120);
  assert.equal(decouper(valeur, 1500).join(''), valeur);
});

test('le découpage ne sépare pas les caractères hors du plan de base', () => {
  // Une paire de substitution coupée en deux produirait deux demi-caractères :
  // le stockage natif les remplacerait, et la reconstitution serait fausse.
  //
  // Le défaut ne se voit que si la FRONTIÈRE tombe au milieu d'une paire, et
  // elle ne tombe là que pour certaines longueurs de préfixe. Un banc qui
  // n'essaie qu'une longueur peut donc passer par chance : mesuré,
  // `'﷽'.repeat(400)` place la frontière sur une paire complète, et un découpage
  // par unités de code — celui qui coupe — y restait vert. On balaie donc les
  // décalages, et l'on vérifie les deux moitiés : la fin d'un morceau et le
  // début du suivant.
  for (let prefixe = 0; prefixe < 8; prefixe += 1) {
    const valeur = '﷽'.repeat(prefixe) + '🕌'.repeat(400);
    const morceaux = decouper(valeur, 1500);

    assert.equal(
      morceaux.join(''),
      valeur,
      `préfixe ${prefixe} : le découpage doit recomposer la valeur`
    );
    for (const morceau of morceaux) {
      assert.ok(
        !/[\uD800-\uDBFF]$/.test(morceau),
        `préfixe ${prefixe} : un morceau se termine sur une demi-paire de substitution`
      );
      assert.ok(
        !/^[\uDC00-\uDFFF]/.test(morceau),
        `préfixe ${prefixe} : un morceau commence sur une demi-paire de substitution`
      );
    }
  }
});

test('une chaîne vide donne un morceau, pas zéro', () => {
  assert.deepEqual(decouper('', 1500), ['']);
});

// === Aller-retour ===

test('une valeur courte est relue à l’identique', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await stockage.setItem('session', 'court');
  assert.equal(await stockage.getItem('session'), 'court');
});

test('une valeur plus longue que le plafond de SecureStore est relue à l’identique', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  const valeur = 'x'.repeat(9_000);
  await stockage.setItem('session', valeur);

  assert.equal(await stockage.getItem('session'), valeur);
  assert.ok(depot.cles().length > 1, 'la valeur doit avoir été découpée');
});

test('aucune valeur confiée au dépôt ne dépasse le plafond de 2048 octets', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await stockage.setItem('session', 'y'.repeat(9_000));

  for (const [cle, valeur] of depot.contenu) {
    assert.ok(
      tailleUtf8(valeur) <= 2048,
      `« ${cle} » pèse ${tailleUtf8(valeur)} octets et dépasserait le plafond`
    );
  }
});

test('un contenu non-ASCII traverse sans être altéré', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  const valeur = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'.repeat(200);
  await stockage.setItem('session', valeur);

  assert.equal(await stockage.getItem('session'), valeur);
});

test('une clé inconnue rend null', async () => {
  const stockage = creerStockageMorceaux(depotMemoire());
  assert.equal(await stockage.getItem('jamais-ecrite'), null);
});

// === Les échecs partiels ===

test('un morceau manquant rend null, jamais une valeur tronquée', async () => {
  // Rendre ce qu'on a donnerait un jeton à moitié relu, traité comme une
  // session valide — la panne apparaîtrait ailleurs, loin de sa cause.
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await stockage.setItem('session', 'z'.repeat(5_000));
  depot.contenu.delete('session_2');

  assert.equal(await stockage.getItem('session'), null);
});

test('une écriture interrompue avant le compteur laisse la clé absente', async () => {
  // Le compteur est écrit en dernier : tant qu'il manque, rien n'est relu.
  const depot = depotMemoire({ refuserEcriture: (cle) => cle === 'session_nb' });
  const stockage = creerStockageMorceaux(depot);

  await assert.rejects(() => stockage.setItem('session', 'z'.repeat(5_000)));
  assert.equal(await stockage.getItem('session'), null);
});

test('un compteur illisible rend null au lieu de lever', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await depot.setItem('session_nb', 'pas-un-nombre');
  assert.equal(await stockage.getItem('session'), null);

  await depot.setItem('session_nb', '0');
  assert.equal(await stockage.getItem('session'), null);

  await depot.setItem('session_nb', '-3');
  assert.equal(await stockage.getItem('session'), null);
});

test('removeItem efface le compteur et tous les morceaux', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await stockage.setItem('session', 'w'.repeat(5_000));
  await stockage.removeItem('session');

  assert.deepEqual(depot.cles(), []);
  assert.equal(await stockage.getItem('session'), null);
});

test('écraser une valeur longue par une courte ne laisse pas de morceaux orphelins', async () => {
  // Sans ce nettoyage, les morceaux de l'ancienne valeur occuperaient le
  // stockage sans jamais être relus.
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await stockage.setItem('session', 'v'.repeat(5_000));
  const nombreAvant = depot.cles().length;

  await stockage.setItem('session', 'bref');

  assert.equal(await stockage.getItem('session'), 'bref');
  assert.deepEqual(depot.cles(), ['session_0', 'session_nb']);
  assert.ok(depot.cles().length < nombreAvant, 'des morceaux doivent avoir été retirés');
});

// === La prémisse : une session Supabase frôle-t-elle le plafond ? ===

/**
 * Une session Supabase telle que `supabase-js` la sérialise, pour un compte à
 * courriel simple et une référence de projet de 20 caractères.
 */
function sessionRepresentative() {
  const base64url = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url');
  const maintenant = 1789999999;

  const charge = {
    iss: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1',
    aud: 'authenticated',
    exp: maintenant + 3600,
    iat: maintenant,
    sub: '11111111-1111-1111-1111-111111111111',
    email: 'utilisateur@exemple.fr',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { email: 'utilisateur@exemple.fr', email_verified: true },
    role: 'authenticated',
    aal: 'aal1',
    amr: [{ method: 'password', timestamp: maintenant }],
    session_id: '22222222-2222-2222-2222-222222222222',
    is_anonymous: false,
  };

  const jeton = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url(charge),
    's'.repeat(43),
  ].join('.');

  return {
    access_token: jeton,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: maintenant + 3600,
    refresh_token: `${'r'.repeat(20)}-${'x'.repeat(40)}`,
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'utilisateur@exemple.fr',
      email_confirmed_at: '2026-09-22T08:00:00.000000Z',
      phone: '',
      confirmed_at: '2026-09-22T08:00:00.000000Z',
      last_sign_in_at: '2026-09-22T08:00:00.000000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email: 'utilisateur@exemple.fr', email_verified: true },
      identities: [
        {
          identity_id: '33333333-3333-3333-3333-333333333333',
          id: '11111111-1111-1111-1111-111111111111',
          user_id: '11111111-1111-1111-1111-111111111111',
          identity_data: {
            email: 'utilisateur@exemple.fr',
            email_verified: false,
            phone_verified: false,
            sub: '11111111-1111-1111-1111-111111111111',
          },
          provider: 'email',
          last_sign_in_at: '2026-09-22T08:00:00.000000Z',
          created_at: '2026-09-22T08:00:00.000000Z',
          updated_at: '2026-09-22T08:00:00.000000Z',
        },
      ],
      created_at: '2026-09-22T08:00:00.000000Z',
      updated_at: '2026-09-22T08:00:00.000000Z',
      is_anonymous: false,
    },
  };
}

test('une session Supabase réaliste frôle le plafond de SecureStore', () => {
  // Mesuré : 2046 octets pour cette session, contre un plafond de 2048.
  //
  // Elle passe donc — de deux octets. C'est le pire des cas possibles, et non
  // un cas confortable : une adresse plus longue, une URL d'avatar dans
  // user_metadata, une seconde identité ajoutée plus tard en se connectant avec
  // Google, et la valeur bascule au-dessus du plafond. Or le dépassement ne
  // lève pas : `expo-secure-store` avertit et la valeur « may not be stored
  // successfully ». La session se perdrait au redémarrage, sans message.
  //
  // La marge de 1500 octets n'est donc pas du zèle : c'est ce qui absorbe les
  // variations légitimes d'une session d'un utilisateur à l'autre.
  const taille = tailleUtf8(JSON.stringify(sessionRepresentative()));

  assert.ok(
    taille > 1800,
    `session de ${taille} octets : trop loin du plafond pour illustrer le risque`
  );
  assert.ok(
    taille <= 2048,
    `session de ${taille} octets : elle dépasserait le plafond, la prémisse du test change`
  );
  assert.ok(
    taille > LIMITE_MORCEAU,
    `la marge de ${LIMITE_MORCEAU} octets doit être franchie par une session réelle`
  );
});

test('une telle session survit à un aller-retour complet', async () => {
  const depot = depotMemoire({ regle: regleDeCleSecureStore() });
  const stockage = creerStockageMorceaux(depot);

  const session = JSON.stringify(sessionRepresentative());

  await stockage.setItem('sb-abcdefghijklmnopqrst-auth-token', session);
  assert.equal(await stockage.getItem('sb-abcdefghijklmnopqrst-auth-token'), session);
});

// === Les clés : ce que la plateforme accepte, et ce qu'elle refuse ==========
//
// La plateforme ne se contente pas de plafonner les valeurs : elle refuse
// certaines clés, en LEVANT. Un dépôt en mémoire qui accepte tout ne prouve
// donc rien sur ce point — et c'est exactement ainsi qu'un séparateur `::` a
// survécu jusqu'à ce qu'un téléphone le signale.

test('la règle de clé se lit bien dans le paquet installé', () => {
  const regle = regleDeCleSecureStore();

  for (const acceptee of ['session', 'sb-abcdefghijklmnopqrst-auth-token_0', 'a.b-c_d']) {
    assert.ok(regle.test(acceptee), `« ${acceptee} » doit être acceptée`);
  }
  for (const refusee of ['session::nb', 'session::0', 'cle/avec/slash', 'cle avec espace']) {
    assert.ok(!regle.test(refusee), `« ${refusee} » doit être refusée`);
  }
});

test('toute clé confiée à la plateforme est une clé qu’elle accepte', async () => {
  // Le contrôle porte sur les clés RÉELLEMENT remises au dépôt — pas sur une
  // chaîne cherchée dans le source. Une clé composée fautive ne se voit qu'ici.
  const regle = regleDeCleSecureStore();
  const depot = depotMemoire({ regle });
  const stockage = creerStockageMorceaux(depot);

  const session = JSON.stringify(sessionRepresentative());
  await stockage.setItem('sb-abcdefghijklmnopqrst-auth-token', session);

  assert.ok(depot.cles().length > 1, 'la valeur doit avoir été découpée');
  for (const cle of depot.cles()) {
    assert.ok(regle.test(cle), `clé refusée par expo-secure-store : « ${cle} »`);
  }

  // Et les trois gestes passent : lire, écrire, effacer.
  assert.equal(await stockage.getItem('sb-abcdefghijklmnopqrst-auth-token'), session);
  await stockage.removeItem('sb-abcdefghijklmnopqrst-auth-token');
  assert.deepEqual(depot.cles(), []);
});

test('une clé de base hostile ne produit jamais une clé refusée', async () => {
  // La clé de base vient de l'appelant — `supabase-js`. La normalisation doit
  // donc tenir pour N'IMPORTE quelle clé, pas seulement pour celle d'aujourd'hui.
  const regle = regleDeCleSecureStore();
  const depot = depotMemoire({ regle });
  const stockage = creerStockageMorceaux(depot);

  const hostile = 'sb:avec/des::signes et des espaces';
  const valeur = 'q'.repeat(4_000);

  await stockage.setItem(hostile, valeur);
  assert.equal(await stockage.getItem(hostile), valeur);
  for (const cle of depot.cles()) {
    assert.ok(regle.test(cle), `clé refusée par expo-secure-store : « ${cle} »`);
  }
});

test('clePlateforme ne touche qu’aux caractères que la plateforme refuse', () => {
  assert.equal(clePlateforme('sb-abcdefghijklmnopqrst-auth-token'), 'sb-abcdefghijklmnopqrst-auth-token');
  assert.equal(clePlateforme('a.b-c_d'), 'a.b-c_d');
  assert.equal(clePlateforme('a:b/c d'), 'a_b_c_d');
});
