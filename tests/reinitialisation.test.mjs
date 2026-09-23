// La remise à zéro complète : l'ordre, le rapport, et le câblage réel.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// L'utilisateur a demandé un réglage qui « remet tout à 0 comme si
// l'application était nouvellement installée ». Trois défauts silencieux se
// logent dans une telle fonctionnalité, et aucun ne se voit à l'écran :
//
//   1. l'arrêt au premier échec. Si le cache d'images échoue et que la fonction
//      s'arrête là, la progression reste — et l'utilisateur, qui vient de lire
//      « tout a été effacé », ne comprend pas pourquoi ses versets sont encore
//      là. Le pire état possible : à moitié effacé, et cru effacé ;
//   2. l'étape associée au mauvais effaceur. Un tableau de correspondance où
//      `base` pointerait sur `viderCachePages` effacerait le cache en annonçant
//      avoir effacé la progression. Le code compile, l'écran ne dit rien ;
//   3. la session laissée dans le trousseau. Mesuré : sur iOS et Android, la
//      session Supabase est rangée par `expo-secure-store`, **pas** dans
//      `AsyncStorage`. Un effacement qui ne viserait que le second laisserait
//      l'utilisateur connecté après une « remise à zéro ».
//
// COMMENT LE CÂBLAGE EST ÉPROUVÉ
// ------------------------------
// `src/lib/effaceursAppareil.ts` importe `expo-sqlite`, `expo-secure-store` et
// React Native, qu'un test ne charge pas. On remplace donc ces modules au
// niveau du CHARGEUR (`scripts/doublures.mjs` écrit un dépôt que
// `scripts/alias-loader.mjs` relit à chaque chargement), et les doublures
// ENREGISTRENT chaque appel. Ce qu'on vérifie, c'est ce qui part réellement —
// pas ce que le module annonce.
//
// Aucun autre fichier de test n'importe `@/lib/database` ni
// `@/lib/cachePagesMoushaf` : la doublure posée ici ne peut donc pas servir à
// un test qui ne l'a pas demandée. Le retrait est posé en sortie, même en cas
// d'échec.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { poserDoublure, retirerToutesLesDoublures } from '../scripts/doublures.mjs';
import {
  ETAPES_REINITIALISATION,
  LIBELLES_ETAPES,
  messageEnCasDEchec,
  messageDeSucces,
  reinitialiserTout,
} from '@/lib/reinitialisation';

after(() => {
  retirerToutesLesDoublures();
});

// === Les effaceurs simulés ===

/** Un effaceur qui réussit, et note son passage. */
function effaceurQuiReussit(journal, nom) {
  return async () => {
    journal.push(nom);
  };
}

/** Un effaceur qui échoue, en notant son passage. */
function effaceurQuiEchoue(journal, nom, raison) {
  return async () => {
    journal.push(nom);
    throw new Error(raison);
  };
}

/** Les quatre effaceurs, tous réussissants. */
function effaceursReussissants(journal) {
  return {
    session: effaceurQuiReussit(journal, 'session'),
    magasin: effaceurQuiReussit(journal, 'magasin'),
    base: effaceurQuiReussit(journal, 'base'),
    cache: effaceurQuiReussit(journal, 'cache'),
  };
}

test('les quatre étapes sont jouées, et dans l’ordre déclaré', async () => {
  const journal = [];
  const resultat = await reinitialiserTout(effaceursReussissants(journal));

  assert.deepEqual(journal, [...ETAPES_REINITIALISATION]);
  assert.deepEqual(resultat.reussies, [...ETAPES_REINITIALISATION]);
  assert.deepEqual(resultat.echecs, []);
});

test('la déconnexion précède l’effacement du magasin', async () => {
  // L'ordre n'est pas cosmétique : `signOut` s'adresse au serveur avec le jeton,
  // et doit donc partir avant que le stockage qui le porte ne soit vidé.
  const journal = [];
  await reinitialiserTout(effaceursReussissants(journal));
  assert.ok(
    journal.indexOf('session') < journal.indexOf('magasin'),
    `la session doit partir avant le magasin, journal = ${journal.join(' > ')}`
  );
});

test('un échec n’arrête pas les étapes suivantes', async () => {
  const journal = [];
  const effaceurs = effaceursReussissants(journal);
  // Le cache échoue — c'est l'étape la moins grave, et elle vient en dernier :
  // si la boucle s'arrêtait là, le défaut ne se verrait jamais. On fait donc
  // échouer la PREMIÈRE, pour que les trois autres aient à être jouées après.
  effaceurs.session = effaceurQuiEchoue(journal, 'session', 'réseau indisponible');

  const resultat = await reinitialiserTout(effaceurs);

  assert.deepEqual(journal, ['session', 'magasin', 'base', 'cache']);
  assert.deepEqual(resultat.reussies, ['magasin', 'base', 'cache']);
  assert.deepEqual(resultat.echecs, [{ etape: 'session', raison: 'réseau indisponible' }]);
});

test('tous les échecs sont rapportés, pas seulement le premier', async () => {
  const journal = [];
  const effaceurs = {
    session: effaceurQuiEchoue(journal, 'session', 'un'),
    magasin: effaceurQuiEchoue(journal, 'magasin', 'deux'),
    base: effaceurQuiEchoue(journal, 'base', 'trois'),
    cache: effaceurQuiEchoue(journal, 'cache', 'quatre'),
  };

  const resultat = await reinitialiserTout(effaceurs);

  assert.deepEqual(resultat.reussies, []);
  assert.equal(resultat.echecs.length, 4);
  assert.deepEqual(
    resultat.echecs.map((e) => e.etape),
    [...ETAPES_REINITIALISATION]
  );
  assert.deepEqual(
    resultat.echecs.map((e) => e.raison),
    ['un', 'deux', 'trois', 'quatre']
  );
});

test('un rejet qui ne porte pas d’Error est quand même décrit', async () => {
  // Une promesse peut rejeter n'importe quoi. Sans conversion, la raison
  // affichée serait « [object Object] », ou rien du tout.
  const effaceurs = {
    session: async () => {
      throw 'une chaîne';
    },
    magasin: async () => {
      throw { code: 42 };
    },
    base: async () => {
      throw new Error('');
    },
    cache: async () => {},
  };

  const resultat = await reinitialiserTout(effaceurs);

  assert.deepEqual(
    resultat.echecs.map((e) => e.raison),
    ['une chaîne', '[object Object]', 'Error']
  );
});

test('le message de succès ne parle pas d’échec, et l’inverse', () => {
  assert.equal(messageEnCasDEchec({ reussies: [...ETAPES_REINITIALISATION], echecs: [] }), messageDeSucces());

  const message = messageEnCasDEchec({
    reussies: ['session'],
    echecs: [{ etape: 'base', raison: 'disque plein' }],
  });
  assert.match(message, /la progression/);
  assert.doesNotMatch(message, /tout a été effacé/i);
});

test('chaque étape a un libellé français', () => {
  for (const etape of ETAPES_REINITIALISATION) {
    const libelle = LIBELLES_ETAPES[etape];
    assert.equal(typeof libelle, 'string');
    assert.ok(libelle.length > 0, `l'étape « ${etape} » n'a pas de libellé`);
  }
  assert.deepEqual(
    Object.keys(LIBELLES_ETAPES).sort(),
    [...ETAPES_REINITIALISATION].sort(),
    'un libellé sans étape, ou une étape sans libellé'
  );
});

// === Le câblage réel ===

/** Le journal partagé avec les doublures, qui vivent dans un autre contexte. */
const CLE_JOURNAL = '__hifdhJournalEffacement';

/**
 * Pose les quatre doublures, qui notent leur appel dans `globalThis`.
 *
 * Le journal passe par `globalThis` parce que la doublure est évaluée dans le
 * contexte du CHARGEUR, et non dans celui du test : une variable de module n'y
 * serait pas la même. `globalThis` est le seul terrain commun.
 */
function poserDoubluresDesEffaceurs() {
  globalThis[CLE_JOURNAL] = [];

  const noter = (etape) => `globalThis.${CLE_JOURNAL}.push('${etape}');`;

  poserDoublure(
    'src/lib/sessionAppareil.ts',
    `export async function effacerSession() { ${noter('session')} }\n`
  );
  poserDoublure(
    'src/lib/magasin.ts',
    `export async function viderMagasin() { ${noter('magasin')} }\n`
  );
  poserDoublure(
    'src/lib/database.ts',
    `export async function effacerBase() { ${noter('base')} }\n`
  );
  poserDoublure(
    'src/lib/cachePagesMoushaf.ts',
    `export async function viderCachePages() { ${noter('cache')} return 0; }\n`
  );
}

test('le câblage réel efface bien les quatre choses, chacune par son effaceur', async () => {
  poserDoubluresDesEffaceurs();
  try {
    const { EFFACEURS_APPAREIL } = await import('@/lib/effaceursAppareil');
    const resultat = await reinitialiserTout(EFFACEURS_APPAREIL);

    assert.deepEqual(resultat.echecs, [], 'aucune étape ne devrait échouer');
    // Le journal est ce que les VRAIS effaceurs ont fait : si `base` était
    // associé à `viderCachePages`, on lirait deux fois « cache » et jamais
    // « base ».
    assert.deepEqual(globalThis[CLE_JOURNAL], [...ETAPES_REINITIALISATION]);
  } finally {
    delete globalThis[CLE_JOURNAL];
  }
});

test('les effaceurs réels sont quatre fonctions distinctes, pas la même répétée', async () => {
  poserDoubluresDesEffaceurs();
  try {
    const { EFFACEURS_APPAREIL } = await import('@/lib/effaceursAppareil');
    const fonctions = ETAPES_REINITIALISATION.map((etape) => EFFACEURS_APPAREIL[etape]);
    assert.equal(new Set(fonctions).size, ETAPES_REINITIALISATION.length);
    for (const fonction of fonctions) {
      assert.equal(typeof fonction, 'function');
    }
  } finally {
    delete globalThis[CLE_JOURNAL];
  }
});
