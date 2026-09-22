// Stockage sécurisé par morceaux.
//
// Le défaut couvert n'est pas visible : au-delà de 2048 octets,
// `expo-secure-store` n'échoue pas, il avertit — et la valeur peut ne pas être
// conservée. Une session perdue au redémarrage, sans message.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  creerStockageMorceaux,
  decouper,
  tailleUtf8,
  LIMITE_MORCEAU,
} from '@/lib/stockageSecurise';

/** Un dépôt de clés en mémoire, qui peut refuser d'écrire une clé donnée. */
function depotMemoire({ refuserEcriture } = {}) {
  const contenu = new Map();

  return {
    contenu,
    async getItem(cle) {
      return contenu.has(cle) ? contenu.get(cle) : null;
    },
    async setItem(cle, valeur) {
      if (refuserEcriture !== undefined && refuserEcriture(cle)) {
        throw new Error(`écriture refusée pour ${cle}`);
      }
      contenu.set(cle, valeur);
    },
    async removeItem(cle) {
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
  const valeur = '﷽'.repeat(400) + '🕌'.repeat(400);
  const morceaux = decouper(valeur, 1500);

  assert.equal(morceaux.join(''), valeur);
  for (const morceau of morceaux) {
    assert.ok(
      !/[\uD800-\uDBFF]$/.test(morceau),
      'un morceau se termine sur une demi-paire de substitution'
    );
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
  depot.contenu.delete('session::2');

  assert.equal(await stockage.getItem('session'), null);
});

test('une écriture interrompue avant le compteur laisse la clé absente', async () => {
  // Le compteur est écrit en dernier : tant qu'il manque, rien n'est relu.
  const depot = depotMemoire({ refuserEcriture: (cle) => cle === 'session::nb' });
  const stockage = creerStockageMorceaux(depot);

  await assert.rejects(() => stockage.setItem('session', 'z'.repeat(5_000)));
  assert.equal(await stockage.getItem('session'), null);
});

test('un compteur illisible rend null au lieu de lever', async () => {
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  await depot.setItem('session::nb', 'pas-un-nombre');
  assert.equal(await stockage.getItem('session'), null);

  await depot.setItem('session::nb', '0');
  assert.equal(await stockage.getItem('session'), null);

  await depot.setItem('session::nb', '-3');
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
  assert.deepEqual(depot.cles(), ['session::0', 'session::nb']);
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
  const depot = depotMemoire();
  const stockage = creerStockageMorceaux(depot);

  const session = JSON.stringify(sessionRepresentative());

  await stockage.setItem('sb-abcdefghijklmnopqrst-auth-token', session);
  assert.equal(await stockage.getItem('sb-abcdefghijklmnopqrst-auth-token'), session);
});
