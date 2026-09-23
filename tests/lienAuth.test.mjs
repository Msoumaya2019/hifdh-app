// La lecture des liens de retour de Supabase.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// C'est le seul endroit du projet où une erreur est SILENCIEUSE par nature :
// une adresse mal lue ne lève rien, elle rend simplement « rien à faire », et
// l'utilisateur reste devant un écran qui n'explique pas pourquoi son lien de
// réinitialisation ne produit aucun effet.
//
// Le piège central, et c'est celui que ce fichier surveille : Supabase dépose
// les jetons dans le FRAGMENT (`#access_token=…`), et
// `new URL(url).searchParams` ne voit PAS le fragment. Un module écrit avec
// `searchParams` rendrait donc un lien vide sur un lien parfaitement valide.
//
// Les adresses ci-dessous sont écrites comme Supabase les produit réellement :
// fragment pour les jetons, `error_code` pour un lien expiré, `?code=` pour le
// flux PKCE.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lienDemandeUnNouveauMotDePasse,
  lienPorteDesJetons,
  lireLienAuth,
  messageDuLien,
} from '@/lib/lienAuth';

// === Le lien qui marche, et son fragment ====================================

test('un lien de réinitialisation livre ses jetons, pris dans le fragment', () => {
  const lien = lireLienAuth(
    'hifdh://reinitialisation#access_token=eyJhbGciOiJIUzI1NiJ9.corps.signature' +
      '&expires_in=3600&refresh_token=v1-abcdef-123456&token_type=bearer&type=recovery'
  );

  assert.equal(lien.type, 'reinitialisation');
  assert.equal(lien.accessToken, 'eyJhbGciOiJIUzI1NiJ9.corps.signature');
  assert.equal(lien.refreshToken, 'v1-abcdef-123456');
  assert.equal(lien.erreur, null);
  assert.equal(lienPorteDesJetons(lien), true);
  assert.equal(lienDemandeUnNouveauMotDePasse(lien), true);
});

test('le fragment est lu, et pas seulement la requête', () => {
  // Le contrôle qui compte : une adresse SANS requête, dont tout le contenu est
  // dans le fragment. Un module qui n'interrogerait que `searchParams` rendrait
  // ici un lien vide, sans erreur — le défaut le plus coûteux de ce module.
  const lien = lireLienAuth('hifdh://reinitialisation#access_token=jeton&type=recovery');

  assert.equal(lien.accessToken, 'jeton', 'le jeton du fragment doit être lu');
  assert.equal(lien.type, 'reinitialisation');
  assert.notEqual(lien.accessToken, null, 'ne pas rendre un lien vide sur un lien valide');
});

// === Le lien expiré =========================================================

test('un lien expiré est dit expiré, et ne porte aucun jeton', () => {
  const lien = lireLienAuth(
    'hifdh://reinitialisation#error=access_denied&error_code=otp_expired' +
      '&error_description=Email+link+is+invalid+or+has+expired'
  );

  assert.notEqual(lien.erreur, null, 'une erreur doit être dite');
  assert.equal(lien.accessToken, null);
  assert.equal(lienPorteDesJetons(lien), false);
  assert.match(lien.erreur, /expiré/, 'la phrase doit dire ce qui s’est passé');
  assert.match(lien.erreur, /nouveau/, 'et donner la seule action utile');
});

test('la description en anglais n’est pas recopiée telle quelle', () => {
  // Supabase écrit « Email link is invalid or has expired », avec des `+` pour
  // les espaces. La recopier afficherait une phrase anglaise, et avec des `+`
  // visibles si le décodage était oublié.
  const lien = lireLienAuth(
    'hifdh://reinitialisation#error_code=otp_expired&error_description=Email+link+is+invalid'
  );

  assert.ok(!/Email\+link/.test(lien.erreur), 'les + ne doivent pas rester visibles');
  assert.ok(!/link is invalid/i.test(lien.erreur), 'la phrase ne doit pas être anglaise');
});

test('un code d’erreur inconnu ne fait pas deviner une cause', () => {
  const lien = lireLienAuth('hifdh://reinitialisation#error_code=quelque_chose_de_nouveau');

  assert.notEqual(lien.erreur, null);
  assert.match(lien.erreur, /nouveau/, 'on demande un nouveau lien');
  assert.ok(!/expiré/.test(lien.erreur), 'on n’invente pas « expiré » sans le savoir');
});

// === Les autres formes de lien ==============================================

test('un lien de confirmation est reconnu, et ne demande pas de mot de passe', () => {
  const lien = lireLienAuth(
    'hifdh://confirmation#access_token=jeton&refresh_token=rafraichissement&type=signup'
  );

  assert.equal(lien.type, 'confirmation');
  assert.equal(lienDemandeUnNouveauMotDePasse(lien), false);
  assert.equal(lienPorteDesJetons(lien), true);
});

test('un lien PKCE porte un code, pas des jetons', () => {
  const lien = lireLienAuth('hifdh://reinitialisation?code=abc123def456');

  assert.equal(lien.code, 'abc123def456');
  assert.equal(lien.accessToken, null);
  assert.equal(lien.erreur, null, 'un code est exploitable, ce n’est pas une erreur');
  assert.equal(
    lienPorteDesJetons(lien),
    false,
    'sans jeton, il faudra un échange réseau — ce module ne le fait pas'
  );
});

test('le fragment l’emporte quand les deux portent la MÊME clé', () => {
  // Le contrôle doit porter sur des clés qui SE RECOUVRENT, et c'est mesuré.
  //
  // Une première version de ce test utilisait `?code=…` d'un côté et
  // `access_token=…` de l'autre. Elle ne prouvait RIEN : les clés étant
  // disjointes, lire la requête d'abord ou le fragment d'abord donne le même
  // résultat, et la mutation qui inverse l'ordre restait verte. Il fallait donc
  // que les deux sources définissent la même clé, avec des valeurs différentes.
  //
  // Cas réel : une redirection en cascade, où un jeton d'une étape précédente
  // traîne dans la requête tandis que le jeton final est dans le fragment.
  const lien = lireLienAuth(
    'hifdh://lien?access_token=jeton_de_la_requete&refresh_token=raf_de_la_requete' +
      '#access_token=jeton_du_fragment&refresh_token=raf_du_fragment'
  );

  assert.equal(lien.accessToken, 'jeton_du_fragment', 'le fragment doit gagner');
  assert.equal(lien.refreshToken, 'raf_du_fragment', 'et pour les deux clés');
});

test('les valeurs encodées sont décodées, y compris celles qui servent vraiment', () => {
  // Le décodage doit être prouvé sur une valeur que le module UTILISE — pas sur
  // `error_description`, qui n'est jamais affichée (seule sa présence est
  // regardée). Une première version de ce fichier ne testait que la description,
  // et la mutation qui retire le décodage y restait invisible.
  //
  // `otp%5Fexpired` est le cas réaliste : un client de messagerie qui ré-encode
  // le souligné. Décodé, le code est reconnu et la phrase parle d'expiration ;
  // non décodé, il tombe dans les causes inconnues.
  const encode = lireLienAuth('hifdh://lien#error_code=otp%5Fexpired');
  assert.match(encode.erreur ?? '', /expir/i, 'le code encodé doit être reconnu');

  // Et sur un jeton, où le décodage change la valeur rendue telle quelle.
  const jeton = lireLienAuth('hifdh://lien#access_token=a%2Bb&refresh_token=c%2Fd');
  assert.equal(jeton.accessToken, 'a+b', 'le %2B doit devenir +');
  assert.equal(jeton.refreshToken, 'c/d', 'le %2F doit devenir /');
});

// === Ce qui ne doit jamais arriver ==========================================

test('une adresse vide ou absente ne lève pas, et ne dit rien', () => {
  for (const entree of ['', '   ', null, undefined]) {
    const lien = lireLienAuth(entree);
    assert.equal(lien.erreur, null, 'il n’y a rien à reprocher à une absence');
    assert.equal(lienPorteDesJetons(lien), false);
    assert.equal(lienDemandeUnNouveauMotDePasse(lien), false);
    assert.equal(messageDuLien(lien), null, 'et rien à afficher');
  }
});

test('une adresse abîmée ne fait pas lever la lecture', () => {
  // `decodeURIComponent('%ZZ')` lève une `URIError`. Une adresse tronquée par
  // un client de messagerie est un cas réel : elle ne doit pas faire planter
  // l'écran, mais rendre un résultat vide ou partiel.
  for (const entree of [
    'hifdh://reinitialisation#access_token=%ZZ&type=recovery',
    'hifdh://reinitialisation#%',
    'pas une adresse du tout',
    '#',
    '?',
  ]) {
    const lien = lireLienAuth(entree);
    assert.equal(typeof lien.erreur, 'object' === typeof null ? 'object' : typeof lien.erreur);
    assert.ok(lien !== null && lien !== undefined, 'la lecture doit rendre un objet');
  }
});

test('un lien sans action ni jeton ni erreur ne fait rien', () => {
  // Une adresse qui n'est pas un lien d'authentification : l'application ne
  // doit ni annoncer un succès, ni afficher une erreur.
  const lien = lireLienAuth('hifdh://reinitialisation?utm_source=courriel');

  assert.equal(lien.type, 'inconnu');
  assert.equal(lien.erreur, null);
  assert.equal(lienPorteDesJetons(lien), false);
  assert.equal(messageDuLien(lien), null);
});

// === Les phrases montrées ===================================================

test('le message d’un lien valide dit quoi faire', () => {
  const reinit = lireLienAuth('hifdh://reinitialisation#access_token=j&type=recovery');
  assert.match(messageDuLien(reinit) ?? '', /nouveau mot de passe/i);

  const confirm = lireLienAuth('hifdh://confirmation#access_token=j&type=signup');
  assert.match(messageDuLien(confirm) ?? '', /confirmée/i);
});

test('le message d’un lien expiré est celui de l’erreur', () => {
  const lien = lireLienAuth('hifdh://reinitialisation#error_code=otp_expired');
  assert.equal(messageDuLien(lien), lien.erreur, 'la phrase de l’erreur est celle qu’on montre');
});

// === La forme du source =====================================================

test('le module ne dépend ni d’Expo ni de React', () => {
  // C'est ce qui rend ce fichier éprouvable : un module qui importerait Expo
  // exigerait le chargeur d'alias et un environnement d'application. La
  // décision de lecture est pure, et doit le rester.
  const source = lire('src/lib/lienAuth.ts');

  for (const interdit of ['expo', 'react-native', 'react', '@supabase']) {
    assert.ok(
      !new RegExp(`from '${interdit}`, 'i').test(source),
      `lienAuth.ts ne doit rien importer de ${interdit}`
    );
  }
});

test('la lecture ne passe pas par searchParams, qui ignore le fragment', () => {
  // Le défaut que ce module surveille. Si un jour la lecture est réécrite avec
  // `new URL(...).searchParams`, les jetons du fragment deviennent invisibles
  // et les tests ci-dessus tombent — mais autant le dire ici, à l'endroit où
  // la raison est écrite.
  //
  // Le contrôle porte sur le CODE, pas sur le texte : ce fichier et le module
  // CITENT tous deux `searchParams` pour expliquer le piège. Un contrôle qui
  // lirait le source brut se déclencherait donc sur sa propre documentation, et
  // annoncerait un défaut qui n'existe pas. On retire les commentaires avant.
  const code = sansCommentaires(lire('src/lib/lienAuth.ts'));

  assert.ok(
    !/searchParams/.test(code),
    'le fragment n’est pas dans searchParams : la lecture doit être manuelle'
  );
});

// Retire les commentaires de ligne et de bloc, pour ne mesurer que le code.
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('//'))
    .join('\n');
}

// === Outillage ==============================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function lire(chemin) {
  return readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
}
