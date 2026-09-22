// Le suivi entre amis : ce qui se décide sans réseau.
//
// Ce fichier n'éprouve pas la base — c'est le rôle de `scripts/banc_supabase.mjs`,
// qui exécute le vrai SQL sous Postgres. Il éprouve la couche qui reçoit les
// lignes et les rend lisibles : conversion des nombres, des dates, des noms,
// codes d'erreur, et les phrases montrées à l'utilisateur.
//
// Convertir les nombres n'est pas cosmétique : PostgREST rend les `NUMERIC` et
// les `BIGINT` en CHAÎNES. Un `"2"` affiché tel quel passe encore, mais un
// `"2"` comparé à `2` échoue en silence, et une addition de chaînes donne
// « 12 » là où l'on attend 3.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  codePlausible,
  formaterCodeAmi,
  formaterDateCourte,
  lirePointAmi,
  messageErreurAmi,
  nettoyerCodeSaisi,
  normaliserNom,
  ouEnEst,
  resumeActivite,
} from '@/lib/amis';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

// === Conversion des lignes ==================================================

test('une ligne de la base se lit en point d’ami', () => {
  const point = lirePointAmi({
    user_id: '22222222-2222-2222-2222-222222222222',
    nom: 'Aïcha',
    versets_cette_semaine: 12,
    pages_cette_semaine: 2.5,
    derniere_seance: '2026-09-21',
    derniere_sourate: 36,
    jours_d_etude_7j: 4,
  });

  assert.notEqual(point, null);
  assert.equal(point.userId, '22222222-2222-2222-2222-222222222222');
  assert.equal(point.nom, 'Aïcha');
  assert.equal(point.versetsCetteSemaine, 12);
  assert.equal(point.pagesCetteSemaine, 2.5);
  assert.equal(point.derniereSeance, '2026-09-21');
  assert.equal(point.derniereSourate, 36);
  assert.equal(point.joursDEtude7j, 4);
});

test('les nombres rendus en chaine par la passerelle sont convertis', () => {
  // PostgREST sérialise `NUMERIC` et `BIGINT` en texte. Sans conversion, une
  // addition donnerait « 1 » + « 2 » = « 12 ».
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: '12',
    pages_cette_semaine: '2.5',
    derniere_sourate: '36',
    jours_d_etude_7j: '4',
  });

  assert.equal(typeof point.versetsCetteSemaine, 'number');
  assert.equal(point.versetsCetteSemaine, 12);
  assert.equal(typeof point.pagesCetteSemaine, 'number');
  assert.equal(point.pagesCetteSemaine, 2.5);
  assert.equal(point.derniereSourate, 36);
  assert.equal(typeof point.joursDEtude7j, 'number');

  // Et la somme se comporte comme une somme.
  assert.equal(point.versetsCetteSemaine + 3, 15);
});

test('une ligne sans identifiant ne devient pas un ami', () => {
  // Une ligne qu'on ne peut pas nommer ne doit pas entrer dans la liste : on ne
  // saurait ni l'afficher ni la retirer.
  assert.equal(lirePointAmi({ nom: 'Sans identifiant' }), null);
  assert.equal(lirePointAmi({ user_id: '', nom: 'Vide' }), null);
  assert.equal(lirePointAmi({ user_id: null }), null);
});

test('les valeurs absentes ou aberrantes deviennent zero, jamais NaN', () => {
  // Un « NaN » affiché dans une phrase (« NaN versets cette semaine ») ferait
  // douter de toute la ligne. Zéro dit la même chose sans mentir.
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: null,
    pages_cette_semaine: 'pas un nombre',
    derniere_sourate: null,
    jours_d_etude_7j: undefined,
  });

  assert.equal(point.versetsCetteSemaine, 0);
  assert.equal(point.pagesCetteSemaine, 0);
  assert.equal(point.derniereSourate, null);
  assert.equal(point.joursDEtude7j, 0);
  assert.ok(Number.isFinite(point.pagesCetteSemaine));
});

test('l’infini est ramene a zero comme le reste', () => {
  // `Number.isNaN` ne suffirait pas : `Infinity` n'est pas NaN, et
  // `Math.round(Infinity)` rend `Infinity`. La phrase afficherait alors
  // « Infinity versets cette semaine » — un nombre que personne n'a saisi.
  // `Number.isFinite` est donc la seule garde qui tienne pour les deux.
  const point = lirePointAmi({
    user_id: 'a',
    versets_cette_semaine: Infinity,
    pages_cette_semaine: '-Infinity',
    derniere_sourate: 'Infinity',
    jours_d_etude_7j: Infinity,
  });

  assert.ok(Number.isFinite(point.versetsCetteSemaine));
  assert.ok(Number.isFinite(point.pagesCetteSemaine));
  assert.ok(Number.isFinite(point.joursDEtude7j));
  assert.ok(Number.isFinite(point.derniereSourate));
  assert.ok(
    !resumeActivite(point).includes('Infinity'),
    'aucune phrase ne doit contenir « Infinity »'
  );
});

test('un compteur negatif est ramene a zero', () => {
  // Une valeur négative n'a pas de sens pour un compteur de versets ; l'afficher
  // ferait douter du reste de la ligne.
  const point = lirePointAmi({ user_id: 'a', versets_cette_semaine: -5, jours_d_etude_7j: -1 });
  assert.equal(point.versetsCetteSemaine, 0);
  assert.equal(point.joursDEtude7j, 0);
});

test('une date horodatee est ramenee au jour', () => {
  // `TIMESTAMPTZ` arrive avec l'heure et le fuseau ; seule la date nous sert.
  const point = lirePointAmi({ user_id: 'a', derniere_seance: '2026-09-21T18:04:00+02:00' });
  assert.equal(point.derniereSeance, '2026-09-21');
  assert.equal(formaterDateCourte(point.derniereSeance), '21/09');
});

// === Le nom affiché =========================================================

test('un nom absent ou blanc ne laisse pas de trou a l’ecran', () => {
  assert.equal(normaliserNom(null), 'Un apprenant');
  assert.equal(normaliserNom(undefined), 'Un apprenant');
  assert.equal(normaliserNom(''), 'Un apprenant');
  assert.equal(normaliserNom('   '), 'Un apprenant');
  assert.equal(normaliserNom('  Aïcha  '), 'Aïcha');
});

test('la synthese ne dit jamais « en retard »', () => {
  // La fonctionnalité met en relation des personnes, elle ne les classe pas.
  // La comparaison entre pairs est exactement ce qu'elle ne doit pas devenir.
  const phrases = [
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0 })),
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 12 })),
    ouEnEst(lirePointAmi({ user_id: 'a', derniere_sourate: 36, derniere_seance: '2026-09-21' })),
    ouEnEst(lirePointAmi({ user_id: 'a' })),
  ];

  for (const phrase of phrases) {
    const bas = phrase.toLowerCase();
    for (const mot of ['retard', 'en avance', 'derrière', 'moins que', 'mieux que']) {
      assert.ok(!bas.includes(mot), `« ${mot} » ne doit pas apparaître : « ${phrase} »`);
    }
  }
});

test('la synthese d’un ami sans activite est neutre, pas un reproche', () => {
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0, derniere_seance: null })),
    "N'a pas encore commencé"
  );
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 0, derniere_seance: '2026-09-10' })),
    "Rien cette semaine pour l'instant"
  );
});

test('la synthese s’accorde au singulier et au pluriel', () => {
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 1 })),
    '1 verset cette semaine'
  );
  assert.equal(
    resumeActivite(lirePointAmi({ user_id: 'a', versets_cette_semaine: 2 })),
    '2 versets cette semaine'
  );
});

// === Le code d'invitation ===================================================

test('le code se dicte et se lit par groupes de cinq', () => {
  // Dix caractères d'affilée se recopient mal, et un code se dicte au
  // téléphone. C'est un affichage : la valeur en base reste d'un seul tenant.
  assert.equal(formaterCodeAmi('ABCDEFGHJK'), 'ABCDE FGHJK');
  assert.equal(nettoyerCodeSaisi('ABCDE FGHJK'), 'ABCDEFGHJK');

  // La valeur en base n'est jamais mise en forme.
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  assert.match(
    source,
    /obtenir_code_ami/,
    'le service doit appeler la fonction SQL, pas fabriquer un code'
  );
  assert.doesNotMatch(
    source,
    /formaterCodeAmi\(\s*data\s*\)/,
    'le code envoyé ou lu ne doit pas être mis en forme : seul l’affichage l’est'
  );
});

test('la saisie tolere espaces, tirets et minuscules', () => {
  // On recopie un code dicté : les espaces et la casse ne sont pas des fautes.
  assert.equal(nettoyerCodeSaisi(' abcde-fghjk '), 'ABCDEFGHJK');
  assert.equal(nettoyerCodeSaisi('abcde fghjk'), 'ABCDEFGHJK');
  assert.ok(codePlausible('abcde fghjk'));
  assert.ok(codePlausible('ABCDE-FGHJK'));
});

test('les signes ambigus sont refuses a la saisie', () => {
  // I, L, O et 0 ne sont dans aucun code : les accepter laisserait croire à
  // une faute de frappe alors que le code ne peut pas les contenir.
  for (const ambigu of ['ABCDEFGHIJ', 'ABCDEFGHIL', 'ABCDEFGHIO', 'ABCDEFGHI0']) {
    assert.ok(!codePlausible(ambigu), `${ambigu} ne doit pas passer`);
  }
  // Et un code trop court ou trop long non plus.
  assert.ok(!codePlausible('ABCDEFGHJ'));
  assert.ok(!codePlausible('ABCDEFGHJKL'));
});

test('le refus distingue « code inconnu » de « saisie invalide »', () => {
  // Les deux méritent des phrases différentes : l'un se corrige en demandant
  // le bon code, l'autre en relisant ce qu'on a tapé.
  const inconnu = messageErreurAmi('P0002', 'Aucun compte ne porte ce code');
  const invalide = messageErreurAmi('22023', 'Code vide');

  assert.notEqual(inconnu, invalide);
  assert.match(inconnu, /Aucun compte/);
  assert.match(invalide, /valide/);
});

test('un code d’erreur inconnu ne laisse pas l’utilisateur sans phrase', () => {
  assert.ok(messageErreurAmi('XX000', null).length > 0);
  assert.ok(messageErreurAmi(null, null).length > 0);
  // Et une panne réseau n'est pas présentée comme une faute de l'utilisateur.
  assert.ok(messageErreurAmi(null, 'Failed to fetch').length > 0);
});

// === La forme du service ====================================================

test('la semaine envoyee a la base est la date LOCALE, pas UTC', () => {
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  // `toISOString()` bascule la date d'un jour en soirée : le projet l'a déjà
  // payé. La date du jour doit être construite à la main.
  const fonction = source.slice(source.indexOf('function aujourdhuiLocal'));
  const corps = fonction.slice(0, fonction.indexOf('\n}'));
  assert.doesNotMatch(corps, /toISOString/, 'la date locale ne doit pas passer par toISOString');
  assert.match(corps, /getFullYear\(\)/, 'la date locale se lit sur les accesseurs locaux');
});

test('l’autorisation n’est pas verifiee dans le service : elle reste en base', () => {
  const source = readFileSync(join(RACINE, 'src/lib/sync/amis.ts'), 'utf8');
  // Le projet pose l'autorisation dans les politiques RLS, pas dans le corps
  // des fonctions ni dans le client. Un service qui « vérifie » avant d'appeler
  // donnerait une fausse assurance : c'est la base qui tranche.
  assert.doesNotMatch(
    source,
    /if\s*\(\s*amiId\s*===\s*ctx\.userId\s*\)/,
    'le refus d’une action sur soi-même vient de la base, pas du client'
  );
  assert.match(source, /ajouter_ami_par_code/, 'l’ajout passe par la fonction SQL dédiée');
});
