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

  const dansChargeur = chargeur.match(/new URL\('\.\/([^']+)', import\.meta\.url\)/)?.[1] ?? '';
  const dansTest = coteTest.match(/new URL\('\.\/([^']+)', import\.meta\.url\)/)?.[1] ?? '';

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
  assert.match(
    ignore,
    /doublures-deposees\.json/,
    'le dépôt de doublures doit être ignoré par git'
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
