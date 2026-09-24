// L'espace de discussion : la couche réseau, éprouvée contre un faux client.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `tests/discussion.test.mjs` éprouve les décisions pures. Il ne dit rien de
// `src/lib/sync/discussion.ts`, qui est pourtant l'endroit où trois défauts
// silencieux se logent :
//
//   1. l'attente non bornée. Le client Supabase sérialise la lecture de session
//      derrière un verrou de stockage ; un verrou jamais relâché laisse la
//      promesse en attente pour toujours. Sur l'écran, « en attente pour
//      toujours » et « planté » se ressemblent exactement ;
//   2. le délai dépassé présenté comme un résultat. C'est le piège jumeau du
//      précédent : un marqueur `null` ferait passer un blocage pour un fil
//      vide — un mensonge silencieux, pire qu'un rond qui tourne ;
//   3. la paire non rangée. La table impose `user_a < user_b` ; envoyer la
//      paire dans l'ordre où on l'a reçue fait refuser l'écriture par la base,
//      et le refus parle de contrainte, pas de la vraie cause.
//
// COMMENT ON L'ÉPROUVE SANS RÉSEAU
// --------------------------------
// Le module lit son client et sa session par des imports statiques. On les
// remplace donc au niveau du CHARGEUR (`scripts/doublures.mjs` écrit un dépôt
// que `scripts/alias-loader.mjs` relit à chaque chargement), et le module sous
// test est importé dynamiquement APRÈS avoir posé les doublures.
//
// Le dépôt passe par le DISQUE, et non par un `Map` partagé : `--import`
// instancie le chargeur dans un contexte séparé, si bien qu'un module importé
// des deux côtés y est évalué deux fois. Un `Map` exporté donnait donc deux
// registres distincts, et la doublure posée par le test restait invisible au
// chargeur. Ce fichier-ci ne peut pas le vérifier par lui-même ; le test de
// forme, plus bas, compare les deux chemins écrits.
//
// Un point qui compte : `utilisateurCourant` est remplacé par une fonction qui
// `await` la valeur posée. Poser une promesse qui ne rend JAMAIS est donc le
// seul moyen d'atteindre réellement le délai dépassé — et c'est exactement le
// défaut signalé depuis un téléphone.
//
// Un faux qui rend toujours la même chose ne prouve rien : chaque test règle sa
// réponse, et le faux ENREGISTRE chaque appel. Ce qu'on vérifie, c'est ce qui
// PART — la paire rangée, l'auteur, le corps préparé — pas seulement ce qui
// revient.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  poserFauxClient,
  poserFausseSession,
  retirerToutesLesDoublures,
} from '../scripts/doublures.mjs';

// Le dépôt est un fichier : le laisser en place ferait servir un faux client à
// la suite de la série, et l'échec parlerait d'un module qu'on n'éprouve pas.
// Le retrait est donc posé une fois pour tout le fichier, et il s'exécute même
// si un test échoue.
after(() => {
  retirerToutesLesDoublures();
});

const MOI = '11111111-1111-1111-1111-111111111111';
const AMI = '22222222-2222-2222-2222-222222222222';

const lire = (chemin) =>
  readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');

/**
 * Un client qui enregistre ce qu'on lui demande et rend ce qu'on lui dit.
 *
 * `appels` est la partie qui compte : sans elle, on ne saurait pas si le
 * module a envoyé la paire rangée, ou signé le message du bon auteur.
 */
function fauxClient(reponses = {}) {
  const appels = { rpc: [], insert: [] };

  const client = {
    rpc(fonction, parametres) {
      appels.rpc.push({ fonction, parametres });
      const reponse = reponses.rpc?.[fonction];
      if (typeof reponse === 'function') return reponse(fonction, parametres);
      return Promise.resolve(reponse ?? { data: null, error: null });
    },
    from(table) {
      return {
        insert(ligne) {
          appels.insert.push({ table, ligne });
          const reponse = reponses.insert;
          if (typeof reponse === 'function') return reponse(ligne);
          return Promise.resolve(reponse ?? { data: null, error: null });
        },
      };
    },
  };

  return { client, appels };
}

/**
 * Le module sous test, chargé avec les doublures en place.
 *
 * Une requête différente à chaque appel : sans elle, le cache de modules
 * rendrait l'instance du premier test — et son faux client avec.
 */
let compteur = 0;
async function chargerModule({ client, session = { id: MOI, email: 'moi@exemple.fr' } }) {
  poserFauxClient(client);
  poserFausseSession(session);
  compteur += 1;
  return import(`../src/lib/sync/discussion.ts?doublure=${compteur}`);
}

// === La paire rangée ========================================================

test('la paire est rangée dans l’ordre de la base', async () => {
  const { paireCanonique } = await chargerModule({ client: fauxClient().client });

  // La table impose `user_a < user_b`. Envoyer la paire dans l'autre ordre
  // ferait refuser l'écriture par la contrainte, et le refus parlerait de
  // contrainte au lieu de la vraie cause.
  assert.deepEqual(paireCanonique(MOI, AMI), [MOI, AMI], 'déjà rangée');
  assert.deepEqual(paireCanonique(AMI, MOI), [MOI, AMI], 'rangée dans l’autre sens');
  assert.deepEqual(paireCanonique('b', 'a'), ['a', 'b']);
  assert.deepEqual(paireCanonique('a', 'a'), ['a', 'a'], 'une paire égale ne bouge pas');

  // Le rangement est LEXICOGRAPHIQUE, comme la contrainte SQL, qui compare des
  // `UUID` textuellement. `'10'` vient donc avant `'9'` — contrairement à
  // l'ordre numérique. Un `localeCompare` ou un tri par longueur donnerait
  // l'inverse, et la base refuserait ensuite : deux identifiants rangés
  // autrement qu'elle ne l'attend sont une paire inexistante.
  assert.deepEqual(paireCanonique('9', '10'), ['10', '9'], 'l’ordre est celui du texte');
});

test('l’écriture envoie la paire rangée, jamais celle reçue', async () => {
  const { client, appels } = fauxClient({
    insert: { data: null, error: null },
    rpc: { lire_fil: { data: [], error: null } },
  });
  const { envoyerMessage } = await chargerModule({ client });

  // `envoyerMessage(amiId, saisie)` reçoit l'ami en premier : le module doit
  // ranger AVANT d'écrire, sinon la contrainte de la table refuse.
  await envoyerMessage(AMI, 'Courage');

  assert.equal(appels.insert.length, 1, 'un seul message doit partir');
  const ligne = appels.insert[0].ligne;
  assert.equal(ligne.user_a, MOI, 'user_a est le plus petit des deux');
  assert.equal(ligne.user_b, AMI, 'user_b est le plus grand');
  assert.ok(ligne.user_a < ligne.user_b, 'la base impose un ordre strict');
});

test('l’écriture range la paire même quand c’est MOI qui ai le plus grand identifiant', async () => {
  // Le test précédent ne suffit pas, et c'est mesuré : avec MOI < AMI, la paire
  // rangée vaut exactement celle reçue — `[ctx.userId, amiId]` — donc écrire
  // l'une ou l'autre donne le même résultat, et une mutation qui enverrait la
  // paire NON rangée y reste invisible. C'est le cas où l'expéditeur a le plus
  // grand identifiant qui les sépare : l'ordre reçu est `[moi, ami]`, l'ordre
  // rangé est l'inverse. Seul ce cas prouve que le module range.
  const amiPlusPetit = '00000000-0000-0000-0000-000000000000';
  const { client, appels } = fauxClient({
    insert: { data: null, error: null },
    rpc: { lire_fil: { data: [], error: null } },
  });
  const { envoyerMessage } = await chargerModule({ client });

  // MOI = '1111…' et l'ami = '0000…' : l'expéditeur est le plus GRAND.
  await envoyerMessage(amiPlusPetit, 'Courage');

  const ligne = appels.insert[0].ligne;
  assert.equal(ligne.user_a, amiPlusPetit, 'user_a est le plus petit, pas l’expéditeur');
  assert.equal(ligne.user_b, MOI, 'user_b est le plus grand, ici l’expéditeur');
  assert.ok(ligne.user_a < ligne.user_b, 'la base impose un ordre strict');
  assert.notDeepEqual(
    [ligne.user_a, ligne.user_b],
    [MOI, amiPlusPetit],
    'la paire écrite est rangée, pas celle reçue'
  );
});

test('un message est signé par l’expéditeur, jamais par le destinataire', async () => {
  const { client, appels } = fauxClient({
    insert: { data: null, error: null },
    rpc: { lire_fil: { data: [], error: null } },
  });
  const { envoyerMessage } = await chargerModule({ client });

  await envoyerMessage(AMI, 'Courage');

  // Signer du nom de l'autre serait une usurpation : le fil afficherait le
  // message du mauvais côté.
  assert.equal(appels.insert[0].ligne.auteur, MOI, 'l’auteur est celui qui écrit');
  assert.notEqual(appels.insert[0].ligne.auteur, AMI);
});

test('le message part préparé, sans ses caractères de contrôle', async () => {
  const { client, appels } = fauxClient({
    insert: { data: null, error: null },
    rpc: { lire_fil: { data: [], error: null } },
  });
  const { envoyerMessage } = await chargerModule({ client });

  await envoyerMessage(AMI, '  bonjour\u0000  ');

  // Ce qui est écrit en base doit être exactement ce que l'écran a montré. Un
  // caractère de contrôle laissé passer casserait l'affichage du fil.
  assert.equal(appels.insert[0].ligne.corps, 'bonjour');
  assert.equal(appels.insert[0].ligne.corps.includes('\u0000'), false);
});

test('le message relu est celui que la base contient, pas celui qu’on croit', async () => {
  // `insert` sans `select` ne rend pas la ligne écrite : le module relit le
  // fil. C'est ce qui garantit qu'un message que la politique aurait refusé en
  // silence ne serait pas affiché comme envoyé.
  const { client, appels } = fauxClient({
    insert: { data: null, error: null },
    rpc: {
      lire_fil: {
        data: [{ id: '9', auteur: MOI, corps: 'Courage', created_at: '2026-09-23T10:00:00.000Z' }],
        error: null,
      },
    },
  });
  const { envoyerMessage } = await chargerModule({ client });

  const resultat = await envoyerMessage(AMI, 'Courage');

  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.message.id, 9, 'l’identifiant vient de la relecture');
  assert.ok(
    appels.rpc.some((a) => a.fonction === 'lire_fil'),
    'le fil doit être relu après l’écriture'
  );
});

// === La borne ===============================================================

test('une session qui ne répond jamais rend une panne, pas un rond sans fin', async () => {
  const module = await chargerModule({
    client: fauxClient().client,
    session: new Promise(() => {}), // ne rend JAMAIS
  });

  const debut = Date.now();
  const resultat = await module.lireFil(AMI);
  const ecoule = Date.now() - debut;

  // Le cœur du défaut signalé depuis un téléphone : la promesse ne se résout
  // jamais. Sans borne, l'écran tournerait indéfiniment.
  assert.equal(resultat.statut, 'erreur', 'un blocage est une panne, pas un fil vide');
  assert.ok(ecoule < 20000, `l’appel a rendu en ${ecoule} ms : il n’a pas attendu sans borne`);
});

test('un délai dépassé n’est jamais présenté comme un résultat vide', async () => {
  // C'est le piège jumeau : si le marqueur du délai valait `null` — la valeur
  // d'un fil vide —, un verrou bloqué se présenterait comme « aucun message ».
  const module = await chargerModule({
    client: fauxClient().client,
    session: new Promise(() => {}),
  });

  const resultat = await module.lireFil(AMI);
  assert.notEqual(resultat.statut, 'ok', 'un délai n’est pas une lecture réussie');
  assert.match(
    resultat.statut === 'erreur' ? resultat.message : '',
    /répondu à temps/i,
    'l’échec doit être dit, avec une phrase agissable'
  );
});

test('un appel RPC qui ne répond jamais est abandonné lui aussi', async () => {
  // La borne la plus facile à manquer : celle du RPC, parce que la session,
  // elle, répond. Un `borner` retiré du helper laisserait le fil en attente
  // pour toujours avec une session parfaitement valide.
  const { client } = fauxClient({
    rpc: { lire_fil: () => new Promise(() => {}) },
  });
  const module = await chargerModule({ client });

  const debut = Date.now();
  const resultat = await module.lireFil(AMI);
  const ecoule = Date.now() - debut;

  assert.equal(resultat.statut, 'erreur');
  assert.ok(ecoule < 20000, `le RPC a rendu en ${ecoule} ms`);
});

test('la lecture de session est bornée, et le marqueur n’est pas « null »', () => {
  // Vérifié sur le source : la borne doit porter sur la lecture de session,
  // qui est exactement l'appel que le verrou de stockage sérialise. Et le
  // marqueur ne doit pas être `null`, qui veut dire « pas de résultat ».
  const source = lire('src/lib/sync/discussion.ts');

  assert.match(
    source,
    /const utilisateur = await borner\(utilisateurCourant\(\)\);/,
    'la lecture de session doit être bornée'
  );
  assert.match(
    source,
    /if \(utilisateur === DELAI_DEPASSE\) return \{ refus: 'delai' \};/,
    'le délai dépassé doit devenir un refus explicite'
  );
  assert.match(
    source,
    /const DELAI_DEPASSE = Symbol\(/,
    'le marqueur du délai doit être un symbole, distinct de tout résultat'
  );
  assert.doesNotMatch(source, /const DELAI_DEPASSE = null/, '« null » veut dire « pas de résultat »');
  assert.match(
    source,
    /const reponse = await borner\(client\.rpc\(fonction, parametres\)\);/,
    'le helper RPC doit lui-même être borné'
  );
  assert.match(
    source,
    /const reponse = await borner\(\s*\n\s*ctx\.client\.from\('discussion_messages'\)\.insert\(/,
    'l’écriture doit être bornée elle aussi'
  );
});

test('un délai dépassé n’est pas maquillé en refus de la base', () => {
  // « code inconnu » et « la base n’a pas répondu » ne se disent pas pareil.
  // Le délai n’a pas de code SQL : il doit être rendu comme une panne.
  const source = lire('src/lib/sync/discussion.ts');

  assert.match(
    source,
    /if \(reponse === DELAI_DEPASSE\) return \{ erreur: MESSAGE_DELAI \};/,
    'le délai doit être rendu comme une erreur, pas comme un résultat'
  );
  assert.match(
    source,
    /if \(typeof appel\.erreur === 'string'\) \{\s*\n\s*return \{ statut: 'erreur', message: appel\.erreur \};/,
    'une panne n’est pas un refus métier'
  );
});

// === Les lignes illisibles ==================================================

test('une ligne illisible est écartée du fil, pas affichée', async () => {
  const { client } = fauxClient({
    rpc: {
      lire_fil: {
        data: [
          { id: '1', auteur: MOI, corps: 'Bonjour', created_at: '2026-09-23T10:00:00.000Z' },
          { id: 'pas un nombre', auteur: AMI, corps: 'fantôme' },
          { id: '3', auteur: null, corps: 'sans auteur' },
          { id: '4', auteur: AMI, corps: 'Courage', created_at: '2026-09-23T11:00:00.000Z' },
        ],
        error: null,
      },
    },
  });
  const module = await chargerModule({ client });

  const resultat = await module.lireFil(AMI);
  assert.equal(resultat.statut, 'ok');
  // Deux lignes sur quatre sont lisibles. Un message fantôme dans un fil est
  // pire qu'un message absent : on ne peut ni le nommer ni le placer.
  assert.equal(resultat.messages.length, 2, 'les lignes illisibles sont écartées');
  assert.deepEqual(
    resultat.messages.map((m) => m.id),
    [1, 4]
  );
});

test('un corps de réponse qui n’est pas une liste ne fait pas planter la lecture', async () => {
  // La passerelle peut rendre autre chose qu'une liste — `null` sur un refus
  // silencieux, un objet sur une réponse d'erreur. Le fil doit se lire vide, et
  // non lever.
  const { client } = fauxClient({ rpc: { lire_fil: { data: null, error: null } } });
  const module = await chargerModule({ client });

  const resultat = await module.lireFil(AMI);
  assert.equal(resultat.statut, 'ok');
  assert.deepEqual(resultat.messages, []);
});

// === Les gestes =============================================================

test('un geste refusé par la base n’est pas annoncé comme fait', async () => {
  // `masquer_message` rend `false` à qui n'est pas modérateur : ce n'est pas
  // une erreur, c'est le cas normal d'un refus. Mais l'annoncer « fait »
  // ferait croire à une modération qui n'a pas eu lieu.
  const { client } = fauxClient({ rpc: { masquer_message: { data: false, error: null } } });
  const module = await chargerModule({ client });

  const resultat = await module.masquerMessage(7);
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.fait, false, 'un refus de la base n’est pas un geste accompli');
});

test('un geste accepté par la base est annoncé comme fait', async () => {
  const { client } = fauxClient({ rpc: { masquer_message: { data: true, error: null } } });
  const module = await chargerModule({ client });

  const resultat = await module.masquerMessage(7);
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.fait, true);
});

test('un geste de retrait rend lui aussi ce que la base a dit', async () => {
  // Le retrait passe par une AUTRE fonction que la modération, avec le même
  // code de retour. Les deux doivent lire `data`, pas supposer le succès.
  const { client } = fauxClient({ rpc: { retirer_message: { data: false, error: null } } });
  const module = await chargerModule({ client });

  const resultat = await module.retirerMessage(12);
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.fait, false, 'le retrait d’un message qui n’est pas le sien est refusé');
});

test('les deux gestes de modération passent par la bonne fonction SQL', async () => {
  const { client, appels } = fauxClient({
    rpc: {
      masquer_message: { data: true, error: null },
      demasquer_message: { data: true, error: null },
    },
  });
  const module = await chargerModule({ client });

  await module.masquerMessage(7);
  await module.demasquerMessage(7);

  assert.deepEqual(
    appels.rpc.map((a) => a.fonction),
    ['masquer_message', 'demasquer_message'],
    'masquer et démasquer ne sont pas le même geste'
  );
  assert.equal(appels.rpc[0].parametres.p_message, 7);
});

// === Les refus ==============================================================

test('un refus de la base garde son code SQL et sa phrase', async () => {
  const { client } = fauxClient({
    rpc: {
      lire_fil: {
        data: null,
        error: { message: 'new row violates row-level security policy', code: '42501' },
      },
    },
  });
  const module = await chargerModule({ client });

  const resultat = await module.lireFil(AMI);
  assert.equal(resultat.statut, 'refuse');
  assert.equal(resultat.code, '42501', 'le code doit être rendu, pour que l’écran décide');
  assert.match(resultat.message, /amitié/i, 'et la phrase doit être utile');
});

test('sans client configuré, rien n’est tenté', async () => {
  // L'application reste utilisable sans Supabase configuré, et c'est son mode
  // normal hors ligne : le module doit rendre un état affichable, pas lever.
  const module = await chargerModule({ client: null });

  const resultat = await module.lireFil(AMI);
  assert.equal(resultat.statut, 'indisponible');
});

test('sans session, l’écriture est refusée avant tout appel', async () => {
  const { client, appels } = fauxClient();
  const module = await chargerModule({ client, session: null });

  const resultat = await module.envoyerMessage(AMI, 'Courage');
  assert.equal(resultat.statut, 'non_authentifie');
  assert.equal(appels.insert.length, 0, 'rien ne doit partir sans session');
});

// === La forme, dans la couche réseau =======================================

test('le module ne connaît aucune notion de pièce jointe', () => {
  // La garantie est de FORME, et elle vaut aussi pour la couche réseau : si
  // elle ne sait pas nommer un fichier, elle ne peut pas en envoyer un.
  const source = lire('src/lib/sync/discussion.ts');

  for (const mot of ['fichier', 'attachment', 'piece_jointe', 'imageUrl', 'videoUrl', 'base64']) {
    assert.equal(
      source.toLowerCase().includes(mot.toLowerCase()),
      false,
      `la couche réseau ne doit pas connaître « ${mot} »`
    );
  }
});

test('l’autorisation n’est pas décidée dans la couche réseau', () => {
  // Elle vit dans les politiques RLS. Un module qui « vérifie » avant d'appeler
  // donne une fausse assurance, et devient un second endroit où la règle
  // s'écrit — donc un second endroit où elle peut diverger.
  const source = lire('src/lib/sync/discussion.ts');

  assert.doesNotMatch(
    source,
    /if\s*\(\s*amiId\s*===\s*ctx\.userId\s*\)/,
    'le client ne juge pas la relation : la base tranche'
  );
  assert.doesNotMatch(
    source,
    /est_administrateur|estAdministrateur/,
    'la modération est jugée en base, pas ici'
  );
});

// === Les garanties de la base ==============================================

test('lire un fil de modération nomme la paire, pas « moi et quelqu’un »', () => {
  // Le défaut trouvé par le banc : `lire_fil(admin, A)` demande le fil
  // (admin, A), qui n'existe pas, et rend zéro ligne EN SILENCE. Un modérateur
  // n'est pas partie au fil ; il faut donc une fonction dont les deux
  // paramètres nomment la paire observée.
  const source = lire('supabase/discussions.sql');

  assert.match(
    source,
    /CREATE OR REPLACE FUNCTION public\.lire_fil_moderation\(\s*\n\s*p_paire_a UUID,\s*\n\s*p_paire_b UUID,/,
    'la lecture de modération doit nommer la paire observée, pas « moi et quelqu’un »'
  );
});

test('chaque fonction de modération se refuse elle-même', () => {
  // Un `GRANT EXECUTE` à `authenticated` est nécessaire pour qu'un appelant
  // non modérateur reçoive un refus LISIBLE ; c'est donc la fonction qui doit
  // trancher, pas le droit d'exécuter.
  const source = lire('supabase/discussions.sql');

  const refus = source.match(/IF NOT public\.est_administrateur\(\) THEN/g) ?? [];
  assert.ok(
    refus.length >= 4,
    `chaque lecture et chaque geste de modération doit se refuser lui-même, ${refus.length} trouvé(s)`
  );
});

test('le droit d’écrire couvre la séquence, sans quoi l’insertion échoue', () => {
  // `BIGSERIAL` crée une séquence séparée, objet à part entière avec ses
  // propres droits qu'un `GRANT ... ON TABLE` ne couvre pas. Le projet a payé
  // ce refus en `42501` sur `nextval_internal`, et aucune autre table n'a de
  // `BIGSERIAL`.
  const source = lire('supabase/discussions.sql');

  assert.match(
    source,
    /GRANT USAGE, SELECT ON SEQUENCE public\.discussion_messages_id_seq TO authenticated;/,
    'la séquence doit être accordée explicitement'
  );
  assert.match(
    source,
    /GRANT SELECT, INSERT, UPDATE ON public\.discussion_messages TO authenticated;/,
    'les trois gestes autorisés doivent être accordés'
  );
  // Et PAS de DELETE : la table n'a aucune politique de suppression.
  //
  // Le motif est limité à une ligne, et c'est nécessaire : `ON DELETE CASCADE`
  // apparaît sur les trois clés étrangères, et une recherche sur plusieurs
  // lignes confondrait la suppression en cascade d'un COMPTE avec le droit de
  // supprimer un MESSAGE — deux choses sans rapport.
  assert.doesNotMatch(
    source,
    /GENERATED|^GRANT[^\n]*DELETE[^\n]*ON public\.discussion_messages/m,
    'aucun droit de suppression ne doit être accordé sur cette table'
  );
  assert.doesNotMatch(
    source,
    /^GRANT[^\n]*DELETE/m,
    'aucun GRANT ne doit porter DELETE : un message se retire, il ne s’efface pas'
  );
});

test('aucune politique ne supprime un message', () => {
  const source = lire('supabase/discussions.sql');

  const politiques = source.match(/CREATE POLICY[^;]+;/g) ?? [];
  assert.ok(
    politiques.length >= 3,
    `la table doit porter ses politiques, ${politiques.length} trouvée(s)`
  );
  for (const politique of politiques) {
    assert.doesNotMatch(
      politique,
      /\bFOR DELETE\b/i,
      'aucune politique de suppression : un message se retire, il ne s’efface pas'
    );
  }
});

test('la table ne peut pas accueillir un fichier : aucune colonne ne le permet', () => {
  // La garantie est de FORME, et c'est la plus forte du lot : une colonne qui
  // n'existe pas ne peut rien recevoir, quel que soit l'écran écrit plus tard.
  // On lit les colonnes DÉCLARÉES, pas les mots du commentaire qui explique
  // justement cette absence.
  const source = lire('supabase/discussions.sql');
  const table = source.split('CREATE TABLE IF NOT EXISTS public.discussion_messages')[1] ?? '';
  const declaration = table.split(');')[0];

  for (const colonne of ['fichier', 'piece_jointe', 'image', 'video', 'url', 'octets', 'mime', 'blob']) {
    assert.doesNotMatch(
      declaration,
      new RegExp(`^\\s*${colonne}\\w*\\s`, 'm'),
      `la colonne « ${colonne} » ne doit pas exister`
    );
  }
  assert.match(declaration, /^\s*corps TEXT NOT NULL,/m, 'le corps est la seule prise prévue');
});

test('les deux côtés s’accordent sur le fichier du dépôt de doublures', () => {
  // Le vrai défaut payé ici : `--import` instancie le chargeur dans un contexte
  // séparé, donc tout module partagé est évalué DEUX fois. Un registre en
  // mémoire donnait deux `Map` distincts, la doublure restait invisible au
  // chargeur, et l'échec parlait d'un module React Native non transpilé.
  //
  // L'accord se vérifie donc sur le seul point qui compte : les deux fichiers
  // doivent nommer le MÊME dépôt. Deux constantes écrites séparément ne peuvent
  // pas se lire l'une l'autre ; un test peut, lui, les comparer.
  const chargeur = lire('scripts/alias-loader.mjs');
  const coteTest = lire('scripts/doublures.mjs');

  const dansChargeur = chargeur.match(/const NOM_DEPOT = `([^`]+)`/)?.[1] ?? '';
  const dansTest = coteTest.match(/const NOM_DEPOT = `([^`]+)`/)?.[1] ?? '';

  assert.ok(dansChargeur.length > 0, 'le chargeur doit nommer son dépôt');
  assert.ok(
    dansChargeur.includes('doublures-deposees'),
    `le chargeur doit lire le dépôt des doublures, « ${dansChargeur} » trouvé`
  );
  assert.equal(
    dansTest,
    dansChargeur,
    `les deux côtés doivent nommer le même dépôt : « ${dansTest} » contre « ${dansChargeur} »`
  );

  // Et le nom doit porter le PID du processus. Sans lui, deux fichiers de test
  // lancés en parallèle écrivent le MÊME fichier : chacun relit, modifie,
  // réécrit, donc ils se font perdre leurs entrées — et
  // `retirerToutesLesDoublures` en sortie de l'un SUPPRIME le fichier, donc
  // efface les doublures de l'autre en pleine exécution.
  //
  // Mesuré, et c'est ce qui a fait écrire ce contrôle : les deux fichiers qui
  // déposent des doublures, lancés ensemble, donnaient 20 échecs sur 40 avec
  // « Unexpected non-whitespace character after JSON » ; chacun seul, 31/31 et
  // 9/9. Le défaut ne se voyait pas fichier par fichier.
  for (const [cote, nom] of [
    ['chargeur', dansChargeur],
    ['test', dansTest],
  ]) {
    assert.match(
      nom,
      /process\.pid/,
      `le nom du dépôt vu du ${cote} doit porter le PID : « ${nom} »`
    );
  }
});

test('une doublure posée n’est pas un `Map` en mémoire', () => {
  // La forme de la correction, et la raison pour laquelle elle a été écrite
  // deux fois : le chargeur ne doit PAS importer le registre. C'est
  // l'import qui créait la seconde instance, et donc les deux registres.
  const chargeur = lire('scripts/alias-loader.mjs');
  const coteTest = lire('scripts/doublures.mjs');

  assert.doesNotMatch(
    chargeur,
    /import \{ doublures \} from '\.\/doublures\.mjs'/,
    'le chargeur ne doit pas importer un registre : il le lit du disque'
  );
  assert.doesNotMatch(
    coteTest,
    /export const doublures = new Map\(\)/,
    'le côté test ne doit pas tenir un registre en mémoire'
  );
  assert.match(chargeur, /function lireDepot\(\)/, 'le chargeur relit le dépôt à chaque chargement');
});

test('le dépôt de doublures n’est jamais livré dans le dépôt git', () => {
  // Le fichier est un état d'exécution, écrit par les tests. Le livrer ferait
  // qu'une doublure posée un jour resterait en place, et toute une série de
  // tests éprouverait des faux sans le dire.
  const ignore = lire('.gitignore');
  // Les DEUX formes sont exigées : celle d'avant le PID, et celle qui le porte.
  // Un dépôt oublié par une exécution ancienne ne doit pas se retrouver dans un
  // commit ; et la forme vivante doit être ignorée, sans quoi le premier test
  // qui dépose une doublure salirait l'arbre de travail.
  assert.match(
    ignore,
    /^scripts\/doublures-deposees\.json$/m,
    'la forme sans PID doit rester ignorée par git'
  );
  assert.match(
    ignore,
    /^scripts\/doublures-deposees\.\*\.json$/m,
    'la forme avec PID doit être ignorée par git'
  );
});

test('le harnais retire toute doublure en sortant, même après un échec', () => {
  // Une doublure laissée en place contaminerait la suite : le faux client d'un
  // test servirait le suivant, et l'échec parlerait d'un module qu'on
  // n'éprouvait pas. Le retrait doit donc être dans un `after`, pas à la fin
  // de chaque test.
  const source = lire('tests/discussion_reseau.test.mjs');
  assert.match(
    source,
    /after\(\(\) => \{\s*\n\s*retirerToutesLesDoublures\(\);\s*\n\}\);/,
    'le retrait doit être un `after`, et non la dernière ligne d’un test'
  );
  assert.match(source, /import test, \{ after \} from 'node:test'/, '`after` doit être importé du lanceur');
});

// === Les non-lus : les garanties de la base =================================

test('un fil jamais ouvert est entièrement non lu, pas entièrement lu', () => {
  // Le défaut le plus coûteux de cette fonctionnalité, et le plus silencieux.
  // Un fil jamais ouvert n'a AUCUNE ligne dans `discussion_lectures` : la
  // jointure rend donc `NULL`. Or `created_at > NULL` n'est pas vrai — c'est
  // inconnu, donc écarté. Sans le `COALESCE`, tout fil neuf serait compté
  // comme entièrement lu, c'est-à-dire exactement l'inverse de ce qu'on veut.
  const source = lire('supabase/discussions.sql');

  assert.match(
    source,
    /m\.created_at > COALESCE\(l\.lu_le, '-infinity'::timestamptz\)/,
    'sans repli sur une date très ancienne, un fil jamais ouvert compte zéro non-lu'
  );
});

test('le compte des non-lus ne retient que ce qui s’ouvre', () => {
  // Trois exclusions, et chacune a sa raison :
  //   - ses propres messages ne sont pas « à lire » ;
  //   - un message retiré laisse une pierre tombale qui ne s'ouvre pas ;
  //   - un message masqué par la modération non plus.
  // Une pastille qui clignote pour quelque chose d'inouvrable est un défaut
  // qu'on ne remarque qu'à l'usage, et qu'aucune erreur ne signale.
  const source = lire('supabase/discussions.sql');
  const fonction = source.split('CREATE OR REPLACE FUNCTION public.non_lus_par_fil')[1] ?? '';
  const corps = fonction.split('$$;')[0];

  assert.match(corps, /AND m\.auteur <> p_moi/, 'ses propres messages ne sont pas à lire');
  assert.match(corps, /AND m\.retire_le IS NULL/, 'un message retiré ne se lit pas');
  assert.match(corps, /AND m\.modere_le IS NULL/, 'un message masqué ne se lit pas');
});

test('la marque de lecture vient du serveur, jamais de l’appareil', () => {
  // Un téléphone à l'heure fausse, en avance de quelques minutes, marquerait
  // comme lus des messages qui n'existent pas encore — et le premier message
  // arrivé ensuite serait invisible à jamais, puisque plus ancien que la
  // marque. La fonction ne prend donc AUCUN horodatage en paramètre : c'est ce
  // qui rend le défaut impossible, plutôt que de compter sur la discipline de
  // l'appelant.
  const source = lire('supabase/discussions.sql');
  const fonction = source.split('CREATE OR REPLACE FUNCTION public.marquer_fil_lu')[1] ?? '';
  const entete = fonction.split('AS $$')[0];
  const corps = fonction.split('AS $$')[1]?.split('$$;')[0] ?? '';

  // `entete` commence APRÈS le nom de la fonction : c'est la coupure qui l'a
  // consommé, et le motif ne doit donc pas le redemander.
  assert.match(entete, /\(p_moi UUID, p_ami UUID\)/, 'deux paramètres, et pas d’horodatage');
  assert.doesNotMatch(entete, /lu_le/, 'aucun horodatage n’est reçu du dehors');
  assert.match(corps, /NOW\(\)/, 'le serveur date la lecture, comme il date les messages');
});

test('on ne marque pas comme lu le fil de quelqu’un d’autre', () => {
  // La politique de lecture suffit à protéger la consultation, pas l'écriture.
  // Sans `WITH CHECK (auth.uid() = lecteur)`, n'importe qui pourrait écrire la
  // ligne d'un autre et lui retirer sa pastille à distance.
  const source = lire('supabase/discussions.sql');
  const table = source.split('ALTER TABLE public.discussion_lectures ENABLE ROW LEVEL SECURITY')[1] ?? '';
  const politiques = table.split('CREATE OR REPLACE FUNCTION')[0];

  const ecritures = politiques.match(/WITH CHECK \(auth\.uid\(\) = lecteur\)/g) ?? [];
  assert.ok(
    ecritures.length >= 2,
    `l'insertion ET la mise à jour doivent exiger le lecteur, ${ecritures.length} trouvée(s)`
  );
  assert.doesNotMatch(
    politiques,
    /FOR DELETE/i,
    'une lecture ne se supprime pas : sa disparition remettrait tout un fil à non-lu'
  );
});

test('la table des messages est publiée pour le temps réel', () => {
  // Realtime ne diffuse que les tables PUBLIÉES, et l'ajout se fait
  // normalement à la main dans le tableau de bord — donc sans trace. Écrit
  // ici, il devient une ligne du dépôt qu'on peut relire et rejouer.
  const source = lire('supabase/discussions.sql');

  assert.match(
    source,
    /ALTER PUBLICATION supabase_realtime ADD TABLE public\.discussion_messages;/,
    'sans publication, la conversation ne se met pas à jour toute seule'
  );
});

test('les quatre fonctions des non-lus sont exécutables par un utilisateur connecté', () => {
  // Un `GRANT EXECUTE` manquant rend un `42501` que rien ne distingue d'un
  // refus métier — et le message montré parlerait de droits alors qu'il
  // s'agirait d'un oubli.
  const source = lire('supabase/discussions.sql');

  for (const fonction of [
    'marquer_fil_lu(UUID, UUID)',
    'non_lus_par_fil(UUID)',
    'total_non_lus(UUID)',
    'apercu_fils(UUID)',
  ]) {
    assert.match(
      source,
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fonction.replace(/[()]/g, '\\$&')} TO authenticated;`),
      `la fonction ${fonction} doit être accordée`
    );
  }
});

// === Les non-lus, les aperçus, et le temps réel =============================

/**
 * Un faux client qui sait ouvrir des canaux.
 *
 * Le faux généraliste ne connaît que `rpc` et `from` : l'appeler sur un
 * abonnement ferait échouer le module sur un `channel` absent, et l'échec
 * parlerait de la doublure au lieu du code. On garde donc les canaux, les
 * rappels posés et les retraits, pour pouvoir vérifier ce qui PART.
 */
function fauxClientTempsReel() {
  const appels = { canaux: [], retires: [], rappels: [] };

  const client = {
    rpc: () => Promise.resolve({ data: null, error: null }),
    from: () => ({ insert: () => Promise.resolve({ data: null, error: null }) }),
    channel(nom) {
      const canal = {
        nom,
        on(_type, _filtre, rappel) {
          appels.rappels.push({ nom, rappel });
          return canal;
        },
        subscribe() {
          appels.canaux.push(nom);
          return canal;
        },
      };
      return canal;
    },
    removeChannel(canal) {
      appels.retires.push(canal.nom);
      return Promise.resolve('ok');
    },
  };

  return { client, appels };
}

test('le total de l’accueil se lit seul, sans charger les conversations', async () => {
  // L'accueil affiche un nombre : il n'a donc pas à charger une ligne par
  // conversation pour l'obtenir. C'est `total_non_lus` qui compte, et c'est la
  // même fonction qui sert partout — donc le même nombre partout.
  const { client, appels } = fauxClient({
    rpc: { total_non_lus: { data: 7, error: null } },
  });
  const { totalNonLus } = await chargerModule({ client });

  const resultat = await totalNonLus();
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.total, 7);
  assert.equal(appels.rpc[0].fonction, 'total_non_lus');
  assert.deepEqual(Object.keys(appels.rpc[0].parametres), ['p_moi']);
});

test('un total arrivé en chaîne est converti, et un total illisible vaut zéro', async () => {
  const { client } = fauxClient({ rpc: { total_non_lus: { data: '12', error: null } } });
  const { totalNonLus } = await chargerModule({ client });
  assert.equal((await totalNonLus()).total, 12, 'un total en chaîne est converti');

  const { client: autre } = fauxClient({ rpc: { total_non_lus: { data: null, error: null } } });
  const module = await chargerModule({ client: autre });
  assert.equal((await module.totalNonLus()).total, 0, 'sans total, rien à lire');
});

test('les non-lus se lisent, se convertissent et se totalisent', async () => {
  const { client, appels } = fauxClient({
    rpc: {
      non_lus_par_fil: {
        data: [
          // Le compte arrive en CHAÎNE : `COUNT(*)` est un `BIGINT`, que
          // PostgREST sérialise en texte pour ne pas perdre de précision.
          { autre: AMI, non_lus: '3', dernier_le: '2026-09-23T14:32:11Z' },
          { autre: 'autre-ami', non_lus: 2, dernier_le: null },
        ],
        error: null,
      },
    },
  });
  const { mesNonLus } = await chargerModule({ client });

  const resultat = await mesNonLus();
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.fils.length, 2);
  assert.equal(resultat.fils[0].nonLus, 3, 'un compte en chaîne est converti en nombre');
  assert.equal(resultat.total, 5, 'le total additionne les fils');
  assert.equal(appels.rpc[0].fonction, 'non_lus_par_fil');
  assert.equal(appels.rpc[0].parametres.p_moi, MOI, 'la fonction reçoit mon identifiant');
});

test('un compte illisible est écarté, il ne devient pas zéro', async () => {
  // La différence compte : écarter la ligne laisse le fil sans pastille ;
  // la garder à zéro laisse croire qu'on a tout lu.
  const { client } = fauxClient({
    rpc: {
      non_lus_par_fil: {
        data: [
          { autre: AMI, non_lus: 4, dernier_le: null },
          { autre: null, non_lus: 9, dernier_le: null },
        ],
        error: null,
      },
    },
  });
  const { mesNonLus } = await chargerModule({ client });

  const resultat = await mesNonLus();
  assert.equal(resultat.fils.length, 1, 'la ligne sans participant est écartée');
  assert.equal(resultat.total, 4);
});

test('les aperçus se lisent, et un message retiré reste retiré', async () => {
  const { client, appels } = fauxClient({
    rpc: {
      apercu_fils: {
        data: [
          { autre: AMI, dernier_le: '2026-09-23T14:32:11Z', apercu: 'salam', de_moi: false },
          { autre: 'autre-ami', dernier_le: '2026-09-22T09:00:00Z', apercu: null, de_moi: true },
        ],
        error: null,
      },
    },
  });
  const { mesApercus } = await chargerModule({ client });

  const resultat = await mesApercus();
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.apercus.length, 2);
  assert.equal(resultat.apercus[0].apercu, 'salam');
  assert.equal(resultat.apercus[1].apercu, null, 'un message retiré n’a pas de texte');
  assert.equal(resultat.apercus[1].deMoi, true);
  assert.equal(appels.rpc[0].fonction, 'apercu_fils');
});

test('marquer un fil comme lu n’envoie aucun horodatage', async () => {
  // C'est la garantie de forme qui protège d'un téléphone à l'heure fausse :
  // la fonction SQL date avec `NOW()`. Si un horodatage pouvait partir d'ici,
  // un appareil en avance marquerait comme lus des messages à venir, et le
  // premier message arrivé ensuite serait invisible à jamais.
  const { client, appels } = fauxClient({
    rpc: { marquer_fil_lu: { data: true, error: null } },
  });
  const { marquerFilLu } = await chargerModule({ client });

  const resultat = await marquerFilLu(AMI);
  assert.equal(resultat.statut, 'ok');
  assert.equal(resultat.fait, true);

  const envoi = appels.rpc[0];
  assert.equal(envoi.fonction, 'marquer_fil_lu');
  assert.deepEqual(
    Object.keys(envoi.parametres).sort(),
    ['p_ami', 'p_moi'],
    'deux paramètres, et pas d’horodatage'
  );
  assert.equal(envoi.parametres.p_ami, AMI);
});

test('une ligne appartient au fil si l’ami est l’un de ses deux membres', async () => {
  const { concerneLeFil } = await chargerModule({ client: fauxClient().client });

  assert.equal(concerneLeFil({ user_a: AMI, user_b: MOI }, AMI), true);
  assert.equal(concerneLeFil({ user_a: MOI, user_b: AMI }, AMI), true, 'l’ordre n’importe pas');
  assert.equal(concerneLeFil({ user_a: 'autre', user_b: MOI }, AMI), false);
  assert.equal(concerneLeFil({ user_a: null, user_b: null }, AMI), false);
  assert.equal(concerneLeFil({ user_a: AMI, user_b: MOI }, ''), false, 'sans ami, aucun fil');
});

test('l’abonnement à un fil ne rend que les messages de ce fil', async () => {
  // Realtime ne sait filtrer que sur UNE colonne, alors qu'un fil se définit
  // par une paire. On s'abonne donc sans filtre serveur, et c'est ici que le
  // tri se fait — un tri qu'aucun test de forme ne remplacerait.
  const { client, appels } = fauxClientTempsReel();
  const { abonnerFil } = await chargerModule({ client });

  let changements = 0;
  const retirer = abonnerFil(AMI, () => {
    changements += 1;
  });

  assert.equal(appels.canaux.length, 1, 'un seul canal est ouvert');
  assert.equal(appels.rappels.length, 1, 'un seul rappel est posé');
  assert.equal(appels.rappels[0].nom, appels.canaux[0], 'le rappel porte le nom du canal');

  appels.rappels[0].rappel({ new: { user_a: AMI, user_b: MOI } });
  assert.equal(changements, 1, 'un message du fil réveille l’écran');

  appels.rappels[0].rappel({ new: { user_a: 'autre', user_b: MOI } });
  assert.equal(changements, 1, 'un message d’un autre fil ne le réveille pas');

  retirer();
  assert.deepEqual(appels.retires, [appels.canaux[0]], 'le canal est retiré au démontage');
});

test('l’abonnement à tous les fils réagit à n’importe quel message', async () => {
  // C'est ce qu'il faut pour une pastille de non-lus : elle ne connaît pas le
  // fil d'avance, donc elle ne peut pas trier.
  const { client, appels } = fauxClientTempsReel();
  const { abonnerFils } = await chargerModule({ client });

  let changements = 0;
  abonnerFils(() => {
    changements += 1;
  });

  appels.rappels[0].rappel({ new: { user_a: 'x', user_b: 'y' } });
  appels.rappels[0].rappel({ new: { user_a: 'z', user_b: 'w' } });
  assert.equal(changements, 2);
});

test('sans client, l’abonnement rend quand même de quoi se retirer', async () => {
  // Un écran qui appelle ceci dans un `useEffect` attend une fonction : lui
  // rendre `undefined` ferait échouer le nettoyage au démontage, et le défaut
  // ne se verrait qu'en changeant d'écran.
  const { abonnerFil, abonnerFils } = await chargerModule({ client: null });

  for (const retirer of [abonnerFil(AMI, () => {}), abonnerFils(() => {})]) {
    assert.equal(typeof retirer, 'function', 'le retrait doit exister même sans client');
    retirer();
  }
});

test('l’aperçu d’un fil ne montre pas ce que le fil cache', () => {
  // La liste des conversations est un second chemin vers le même texte. Si
  // elle ne reprenait pas les règles du fil, un message masqué par la
  // modération s'y lirait — c'est-à-dire à l'endroit où on le voit le plus.
  const source = lire('supabase/discussions.sql');
  const fonction = source.split('CREATE OR REPLACE FUNCTION public.apercu_fils')[1] ?? '';
  const corps = fonction.split('$$;')[0];

  assert.match(corps, /AND m\.modere_le IS NULL/, 'un message masqué ne s’aperçoit pas');
  assert.match(
    corps,
    /CASE WHEN m\.retire_le IS NULL THEN m\.corps ELSE NULL END/,
    'un message retiré s’aperçoit sans son texte'
  );
  assert.match(corps, /DISTINCT ON/, 'un seul message par fil : le dernier');
});
