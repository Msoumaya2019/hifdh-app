// Les phrases montrées quand l'authentification échoue.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// Ces phrases vivaient dans `src/lib/auth.ts`, et n'étaient couvertes par RIEN.
// La raison est mécanique : `auth.ts` importe `./supabase`, donc
// `expo-constants` et `react-native`, et un test qui l'importerait exigerait
// tout l'environnement d'une application. Deux mutations du falsificateur l'ont
// montré en restant vertes — la traduction n'était surveillée par personne.
//
// L'ENJEU N'EST PAS COSMÉTIQUE
// ----------------------------
// Chaque phrase dit une ACTION différente :
//   - « Ce lien a expiré » → redemander un lien ;
//   - « Adresse ou mot de passe incorrect » → vérifier sa saisie ;
//   - « Pas de connexion » → réessayer plus tard.
// Confondre deux causes n'échoue à aucun test de comportement, ne lève rien, et
// laisse l'utilisateur tourner en rond. D'où le contrôle le plus important de ce
// fichier : deux causes distinctes ne doivent PAS donner la même phrase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  LONGUEUR_MOT_DE_PASSE,
  traduireErreur,
  verifierEmail,
  verifierNouveauMotDePasse,
} from '@/lib/erreursAuth';

const lire = (chemin) =>
  readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');

// === Chaque cause, par son code =============================================

test('une cause connue est traduite par son code', () => {
  const cas = [
    ['invalid_credentials', /incorrect/i],
    ['email_not_confirmed', /confirm/i],
    ['user_already_exists', /existe déjà/i],
    ['weak_password', /caractères/i],
    ['otp_expired', /expir/i],
    ['token_expired', /expir/i],
    ['same_password', /même que l’ancien/i],
    ['session_not_found', /session/i],
    ['session_expired', /session/i],
    ['over_email_send_rate_limit', /tentatives/i],
  ];

  for (const [code, motif] of cas) {
    const phrase = traduireErreur({ code });
    assert.match(phrase, motif, `le code ${code} doit être traduit`);
  }
});

test('une cause connue est traduite par le texte, quand le code manque', () => {
  // Tous les chemins de Supabase ne remplissent pas `code`. Se reposer sur lui
  // seul laisserait passer une erreur en anglais, telle quelle.
  const cas = [
    ['Invalid login credentials', /incorrect/i],
    ['Email not confirmed', /confirm/i],
    ['User already registered', /existe déjà/i],
    ['Password should be at least 6 characters', /caractères/i],
    ['Token has expired or is invalid', /expir/i],
    ['New password should be different from the old password', /même que l’ancien/i],
    ['Email link is invalid or has expired', /expir/i],
  ];

  for (const [message, motif] of cas) {
    assert.match(traduireErreur({ message }), motif, `« ${message} » doit être traduit`);
  }
});

test('le texte est lu sans tenir compte de la casse', () => {
  // Supabase ne garantit pas la casse de ses messages. Comparer sans mettre en
  // minuscules ferait passer « INVALID LOGIN CREDENTIALS » pour une cause
  // inconnue, et l'utilisateur lirait la phrase générique.
  assert.match(traduireErreur({ message: 'INVALID LOGIN CREDENTIALS' }), /incorrect/i);
  assert.match(traduireErreur({ message: 'Email Not Confirmed' }), /confirm/i);
});

// === Le filet, et ce qu'il ne doit jamais faire ==============================

test('une cause inconnue rend quand même une phrase, jamais une chaîne vide', () => {
  // C'est la garantie la plus importante du module : il n'existe pas de chemin
  // où l'utilisateur reste sans explication.
  const inconnues = [
    { code: 'quelque_chose_de_nouveau' },
    { message: 'un texte que personne n’a prévu' },
    { code: '', message: '' },
    null,
    undefined,
  ];

  for (const entree of inconnues) {
    const phrase = traduireErreur(entree);
    assert.equal(typeof phrase, 'string');
    assert.ok(phrase.trim().length > 0, `« ${JSON.stringify(entree)} » doit donner une phrase`);
    assert.ok(!/undefined|null|\[object/.test(phrase), 'aucun détail technique ne doit fuir');
  }
});

test('la phrase générique ne recopie pas le message anglais', () => {
  // Afficher le message brut de Supabase donnerait une phrase anglaise et
  // technique au moment précis où l'utilisateur est bloqué.
  const phrase = traduireErreur({ message: 'unexpected failure of the auth server' });

  assert.ok(!/unexpected|failure|auth server/i.test(phrase), 'la phrase doit être en français');
});

// === Deux causes distinctes ne se confondent pas =============================

test('deux causes distinctes ne donnent jamais la même phrase', () => {
  // LE contrôle de ce fichier. Si deux causes se confondaient, l'utilisateur
  // agirait sur la mauvaise : il redemanderait un lien là où il fallait
  // simplement réessayer, ou l'inverse.
  const causes = [
    { code: 'invalid_credentials' },
    { code: 'email_not_confirmed' },
    { code: 'user_already_exists' },
    { code: 'weak_password' },
    { code: 'otp_expired' },
    { code: 'same_password' },
    { code: 'session_not_found' },
    { code: 'over_email_send_rate_limit' },
    { message: 'invalid email' },
    { message: 'network error' },
  ];

  const phrases = causes.map((c) => traduireErreur(c));
  const uniques = new Set(phrases);

  assert.equal(
    uniques.size,
    phrases.length,
    `chaque cause doit avoir sa phrase : ${phrases.length} causes, ${uniques.size} phrase(s) distincte(s)`
  );
});

test('un lien expiré et une session expirée ne disent pas la même chose', () => {
  // Les deux parlent d'expiration, et ce sont pourtant deux situations
  // différentes : la première se répare en redemandant un lien, la seconde en
  // se reconnectant. C'est le couple le plus facile à confondre.
  const lien = traduireErreur({ code: 'otp_expired' });
  const session = traduireErreur({ code: 'session_not_found' });

  assert.notEqual(lien, session);
  assert.match(lien, /lien/i, 'la première doit parler du lien');
  assert.match(session, /session/i, 'la seconde doit parler de la session');
});

// === Les contrôles de saisie ================================================

test('une adresse sans arobase est refusée, et la phrase dit quoi saisir', () => {
  assert.equal(verifierEmail('moi@exemple.fr'), null);
  assert.equal(verifierEmail('  moi@exemple.fr  '), null, 'les espaces autour sont tolérés');

  for (const mauvais of ['', '   ', 'moi', 'sans arobase']) {
    const refus = verifierEmail(mauvais);
    assert.notEqual(refus, null, `« ${mauvais} » doit être refusé`);
    assert.match(refus, /adresse/i);
  }
});

test('une adresse incomplète est laissée à Supabase, et c’est délibéré', () => {
  // `moi@` n'a pas de domaine, et le contrôle local l'ACCEPTE. Ce n'est pas un
  // oubli : la validation locale ne vérifie que la présence d'une arobase, et
  // le vrai juge est Supabase — qui répondra « adresse invalide », phrase que
  // `traduireErreur` sait déjà traduire.
  //
  // Vouloir refuser davantage ici serait pire : toute règle locale un peu
  // stricte rejette des adresses légitimes (domaines internationalisés, parties
  // locales à points ou à `+`), et l'utilisateur se verrait refuser une adresse
  // qui marche. Ce contrôle fixe donc la limite : le local ne juge que le vide
  // et l'absence d'arobase.
  assert.equal(verifierEmail('moi@'), null, 'le domaine n’est pas jugé ici');
  assert.equal(verifierEmail('moi@exemple.fr'), null);

  // En revanche, ce que Supabase refuserait est traduit, et non recopié.
  assert.match(traduireErreur({ message: 'Unable to validate email address: invalid format' }), /adresse/i);
});

test('un mot de passe trop court est refusé, et la longueur est dite', () => {
  assert.equal(verifierNouveauMotDePasse('a'.repeat(LONGUEUR_MOT_DE_PASSE)), null);

  const refus = verifierNouveauMotDePasse('a'.repeat(LONGUEUR_MOT_DE_PASSE - 1));
  assert.notEqual(refus, null);
  assert.match(
    refus,
    new RegExp(String(LONGUEUR_MOT_DE_PASSE)),
    'le nombre annoncé doit être celui appliqué'
  );
});

test('la longueur annoncée et la longueur appliquée sont la même', () => {
  // Le défaut que ce contrôle ferme : une phrase qui annonce 6 alors que le
  // contrôle en exige 8. L'utilisateur saisit 6, se fait refuser, et n'a aucun
  // moyen de comprendre — la phrase lui ment.
  const refus = verifierNouveauMotDePasse('a'.repeat(LONGUEUR_MOT_DE_PASSE - 1));
  assert.ok(refus !== null);

  const annonce = Number(refus.match(/(\d+)/)?.[1]);
  assert.equal(
    annonce,
    LONGUEUR_MOT_DE_PASSE,
    `la phrase annonce ${annonce}, le contrôle applique ${LONGUEUR_MOT_DE_PASSE}`
  );

  // Et la phrase de l'erreur `weak_password` annonce la même chose.
  const parCode = traduireErreur({ code: 'weak_password' });
  assert.equal(Number(parCode.match(/(\d+)/)?.[1]), LONGUEUR_MOT_DE_PASSE);
});

// === La forme du source =====================================================

test('le module n’importe rien : c’est ce qui le rend éprouvable', () => {
  // S'il importait Expo, ce fichier devrait charger tout l'environnement d'une
  // application — et c'est exactement pour cette raison que la traduction des
  // erreurs n'était couverte par rien avant d'être extraite ici.
  const code = sansCommentaires(lire('src/lib/erreursAuth.ts'));

  assert.ok(
    !/^\s*import\s/m.test(code),
    'erreursAuth.ts ne doit rien importer, sinon il cesse d’être éprouvable seul'
  );
});

/** Retire les commentaires, pour ne mesurer que le code. */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('//'))
    .join('\n');
}
