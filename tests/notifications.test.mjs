// Les notifications : ce qui se décide sans réseau, et sans Expo.
//
// Ce fichier n'éprouve ni le service d'Expo ni la base — la première chose ne
// se teste pas depuis `node`, et la seconde a son banc (`scripts/banc_supabase.mjs`).
// Il éprouve les décisions qui, elles, se trompent en silence :
//
//   1. LE DÉFAUT D'UNE PRÉFÉRENCE ABSENTE. Quelqu'un qui n'a jamais ouvert les
//      réglages doit recevoir ses messages. Une colonne lue avec `??` sur la
//      ligne entière ferait basculer les six d'un coup.
//
//   2. LA CIBLE D'UN APPUI. Les données d'une notification arrivent d'un
//      service extérieur : elles ne passent par aucune politique de base, et
//      rien ne garantit leur forme. Un identifiant absent doit mener à l'écran
//      des amis — jamais à une conversation sans participant, qui afficherait
//      une erreur de base pour une donnée qui n'est jamais arrivée.
//
//   3. LE MASQUAGE. `masquer_contenu` absent vaut FAUX, et c'est l'inverse des
//      cinq autres : masquer par accident ferait disparaître le texte que la
//      personne attend.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LIBELLES_PREFERENCES,
  PREFERENCES_PAR_DEFAUT,
  basculer,
  cibleNotification,
  lirePreferences,
  resumeNotifications,
} from '@/lib/notifications';

const lire = (chemin) =>
  readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');

const AMI = '22222222-2222-2222-2222-222222222222';

test('sans rien de réglé, tout est activé sauf le masquage', () => {
  assert.deepEqual(lirePreferences(null), PREFERENCES_PAR_DEFAUT);
  assert.deepEqual(lirePreferences(undefined), PREFERENCES_PAR_DEFAUT);
  assert.equal(PREFERENCES_PAR_DEFAUT.messages, true);
  assert.equal(PREFERENCES_PAR_DEFAUT.masquer_contenu, false);
});

test('une ligne incomplète ne fait pas basculer les autres colonnes', () => {
  // Le défaut de cette lecture : un `??` posé sur la LIGNE ferait tomber les
  // six préférences à leurs valeurs de repli dès qu'une colonne manque — une
  // colonne ajoutée plus tard suffirait à éteindre les notifications de tout
  // le monde.
  const lues = lirePreferences({ messages: false });

  assert.equal(lues.messages, false, 'la colonne lue est respectée');
  assert.equal(lues.demandes_amis, true, 'les autres restent au défaut');
  assert.equal(lues.progression_partagee, true);
  assert.equal(lues.rappels_apprentissage, true);
  assert.equal(lues.rappels_revision, true);
  assert.equal(lues.masquer_contenu, false);
});

test('masquer_contenu absent vaut faux, et non vrai', () => {
  // C'est le seul dont le défaut va dans l'autre sens : masquer par accident
  // ferait disparaître le texte que la personne attend, alors que ne pas
  // masquer n'enlève rien à personne.
  assert.equal(lirePreferences({}).masquer_contenu, false);
  assert.equal(lirePreferences({ masquer_contenu: null }).masquer_contenu, false);
  assert.equal(lirePreferences({ masquer_contenu: true }).masquer_contenu, true);
});

test('un `false` explicite est respecté, un `null` ne l’est pas', () => {
  // `null` veut dire « pas de valeur », et non « non » : c'est la distinction
  // qui permet à une colonne vide de valoir le défaut sans l'écrire partout.
  assert.equal(lirePreferences({ messages: null }).messages, true);
  assert.equal(lirePreferences({ messages: false }).messages, false);
});

test('basculer ne touche qu’un interrupteur', () => {
  const avant = { ...PREFERENCES_PAR_DEFAUT };
  const apres = basculer(avant, 'messages');

  assert.equal(apres.messages, false);
  assert.equal(avant.messages, true, 'l’objet reçu n’est pas modifié');
  assert.equal(apres.demandes_amis, true);
});

test('le résumé dit quand plus rien ne partira', () => {
  // « Je ne reçois rien » et « j'ai tout coupé » se ressemblent beaucoup. C'est
  // cette phrase qui les distingue, et sans elle on cherche une panne qui
  // n'existe pas.
  const toutCoupe = {
    messages: false,
    demandes_amis: false,
    progression_partagee: false,
    rappels_apprentissage: false,
    rappels_revision: false,
    masquer_contenu: false,
  };
  assert.equal(resumeNotifications(toutCoupe), 'Aucune notification ne sera envoyée.');
  assert.match(resumeNotifications(PREFERENCES_PAR_DEFAUT), /Toutes les notifications/);
  assert.match(
    resumeNotifications({ ...PREFERENCES_PAR_DEFAUT, masquer_contenu: true }),
    /contenu masqué/
  );

  const deux = { ...toutCoupe, messages: true, demandes_amis: true };
  assert.equal(resumeNotifications(deux), '2 types de notification sur 3.');
});

test('le masquage ne compte pas parmi les types qui envoient', () => {
  // Il n'envoie rien : le compter ferait dire « tout est actif » à quelqu’un qui
  // a coupé les messages, ce qui est faux.
  const coupe = { ...PREFERENCES_PAR_DEFAUT, messages: false };
  assert.equal(resumeNotifications(coupe), '2 types de notification sur 3.');
});

test('les rappels sont rangés sans être comptés', () => {
  // Les deux rappels sont stockés et seront respectés le jour où l'application
  // saura les poser — mais aujourd'hui aucun rappel ne part. Les compter
  // ferait dire « toutes les notifications sont activées » à quelqu'un qui
  // attendrait un rappel qui n'existe pas.
  const rappels = LIBELLES_PREFERENCES.filter((entree) => entree.bientot).map((e) => e.cle);
  assert.deepEqual(rappels, ['rappels_apprentissage', 'rappels_revision']);

  const sansRappels = {
    messages: false,
    demandes_amis: false,
    progression_partagee: false,
    rappels_apprentissage: true,
    rappels_revision: true,
    masquer_contenu: false,
  };
  assert.equal(resumeNotifications(sansRappels), 'Aucune notification ne sera envoyée.');

  // Et chaque ligne marquée « bientôt » le DIT, au lieu de promettre un rappel.
  for (const entree of LIBELLES_PREFERENCES.filter((e) => e.bientot)) {
    assert.match(entree.aide, /Bientôt/);
  }
});

// === La cible d'un appui ====================================================

test('un message ouvre la conversation de celui qui l’a écrit', () => {
  assert.deepEqual(cibleNotification({ genre: 'message', conversationAvec: AMI }), {
    type: 'discussion',
    amiId: AMI,
  });
});

test('une demande acceptée ouvre la conversation avec qui a accepté', () => {
  assert.deepEqual(cibleNotification({ genre: 'demande_acceptee', acteur: AMI }), {
    type: 'discussion',
    amiId: AMI,
  });
});

test('une demande d’ami et une étape partagée mènent aux amis', () => {
  assert.deepEqual(cibleNotification({ genre: 'demande_ami', acteur: AMI }), { type: 'amis' });
  assert.deepEqual(cibleNotification({ genre: 'progression', acteur: AMI }), { type: 'amis' });
});

test('une conversation sans identifiant mène aux amis, jamais à un fil vide', () => {
  // C'est le défaut que ce test garde : un `amiId` vide mènerait à un fil sans
  // participant, et l'écran afficherait une erreur de base pour une donnée qui
  // n'est jamais arrivée — c'est-à-dire un défaut qu'on chercherait dans la
  // base, où il n'est pas.
  assert.deepEqual(cibleNotification({ genre: 'message' }), { type: 'amis' });
  assert.deepEqual(cibleNotification({ genre: 'message', conversationAvec: '' }), { type: 'amis' });
  assert.deepEqual(cibleNotification({ genre: 'message', conversationAvec: 'x' }), { type: 'amis' });
  assert.deepEqual(
    cibleNotification({ genre: 'message', conversationAvec: 42 }),
    { type: 'amis' },
    'un identifiant d’un autre type est écarté'
  );
});

test('ce qui n’est pas une charge utile connue mène à l’accueil', () => {
  // Ces données viennent d'un service extérieur : elles ne passent par aucune
  // politique de base, et rien ne garantit leur forme.
  assert.deepEqual(cibleNotification(null), { type: 'accueil' });
  assert.deepEqual(cibleNotification(undefined), { type: 'accueil' });
  assert.deepEqual(cibleNotification('message'), { type: 'accueil' });
  assert.deepEqual(cibleNotification({}), { type: 'accueil' });
  assert.deepEqual(cibleNotification({ genre: 'inconnu' }), { type: 'accueil' });
});

test('les libellés couvrent exactement les six préférences', () => {
  // Un interrupteur oublié dans l'écran serait une préférence qu'on ne peut pas
  // changer, et donc une notification qu'on ne peut pas couper.
  const cles = LIBELLES_PREFERENCES.map((entree) => entree.cle).sort();
  assert.deepEqual(cles, [
    'demandes_amis',
    'masquer_contenu',
    'messages',
    'progression_partagee',
    'rappels_apprentissage',
    'rappels_revision',
  ]);
  for (const entree of LIBELLES_PREFERENCES) {
    assert.ok(entree.titre.length > 0, `le titre de ${entree.cle} est écrit`);
    assert.ok(entree.aide.length > 0, `l’aide de ${entree.cle} est écrite`);
  }
});

test('le module des décisions n’importe RIEN', () => {
  // C'est ce qui le rend éprouvable : `src/lib/auth.ts` importe Expo, donc tout
  // ce qui l'importe devient inéprouvable. Une seule ligne d'import ajoutée ici
  // ferait tomber ce fichier entier, et l'échec parlerait d'un module natif
  // introuvable — à cent lieues de la cause.
  const source = lire('src/lib/notifications.ts');
  assert.doesNotMatch(source, /^\s*import\s/m, 'aucun import, même de type');
  assert.doesNotMatch(source, /require\s*\(/, 'aucun require');
});
