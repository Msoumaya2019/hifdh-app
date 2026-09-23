// Banc d'épreuve du schéma Supabase, sans Docker.
//
// PGlite est un Postgres compilé en WebAssembly : il exécute le vrai
// `supabase/schema.sql`, avec de vrais rôles, de vraies politiques RLS et de
// vraies contraintes. Aucun serveur, aucune installation système.
//
// Ce que ce banc prouve :
//   - le schéma s'applique, et se rejoue sans erreur ;
//   - deux utilisateurs peuvent porter le même identifiant de séance ;
//   - chaque utilisateur ne voit et n'écrit que chez lui ;
//   - une revendication absente refuse, sans lever ;
//   - le remplacement des données remplace, sans empiler ni déborder.
//
// Et, pour `supabase/administration.sql` :
//   - la migration s'applique après le schéma, et se rejoue sans erreur ;
//   - un apprenant ne peut pas se promouvoir administrateur ;
//   - un administrateur lit les données de tous, un apprenant les siennes ;
//   - la table des vérifications de bornes refuse ce qui n'est pas une
//     vérification complète ;
//   - la synthèse ne compte pas comme mémorisé un passage déclaré inconnu.
//
// Ce qu'il ne prouve pas : les droits par défaut de Supabase, `auth.users` et
// `auth.jwt()` réels, les extensions, Realtime, les performances. Le socle
// d'authentification est donc reconstitué ici, fidèlement mais localement.
//
// Exécution :
//   NODE_PATH=<espace de travail isolé>/node_modules node scripts/banc_supabase.mjs

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let PGlite;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
} catch {
  console.error(
    "PGlite est introuvable. Installez-le dans un espace isolé, puis lancez ce banc\n" +
      'avec NODE_PATH pointant sur son node_modules.'
  );
  process.exit(2);
}

const RACINE = new URL('..', import.meta.url);
const CHEMIN_SCHEMA = fileURLToPath(new URL('supabase/schema.sql', RACINE));
const CHEMIN_ADMINISTRATION = fileURLToPath(new URL('supabase/administration.sql', RACINE));


const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
// Un troisième compte, promu administrateur par le propriétaire de la base :
// c'est le seul chemin qui existe pour le devenir.
const USER_ADMIN = '44444444-4444-4444-4444-444444444444';

const resultats = [];
function noter(nom, ok, detail = '') {
  resultats.push({ nom, ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${nom}${detail ? `  — ${detail}` : ''}`);
}

// Un arrêt du moteur — un PANIC de Postgres, par exemple — ne doit pas se
// confondre avec un banc vert. Sans ce garde, la promesse de plus haut niveau
// rejetée ferait sortir Node en 1 avec une longue trace, mais sans dire ce qui
// restait à éprouver.
process.on('unhandledRejection', (raison) => {
  console.error(
    `\nLe banc s’est interrompu avant son verdict : ${raison?.message ?? raison}\n` +
      `${resultats.length} épreuve(s) avaient été notées, et ${resultats.filter((r) => !r.ok).length} en échec.`
  );
  process.exit(1);
});

const db = new PGlite();

// === Le socle d'authentification, tel que Supabase le pose ==================

await db.exec(`
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key,
    email text
  );

  -- Reproduction fidèle de auth.uid() : la revendication peut venir de
  -- request.jwt.claim.sub ou de request.jwt.claims ->> 'sub'. Les DEUX gardes
  -- nullif sont nécessaires : current_setting(..., true) rend une chaine vide,
  -- pas NULL, et ''::jsonb est une erreur de syntaxe.
  create or replace function auth.uid() returns uuid
  language sql stable
  as $fonction$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $fonction$;

  create role authenticated;
  create role anon;
`);

// === Le schéma réel, appliqué deux fois ====================================

const schema = readFileSync(CHEMIN_SCHEMA, 'utf8');

let premiereApplication = null;
try {
  await db.exec(schema);
} catch (erreur) {
  premiereApplication = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter('le schéma s’applique sans erreur', premiereApplication === null, premiereApplication ?? '');

let secondeApplication = null;
try {
  await db.exec(schema);
} catch (erreur) {
  secondeApplication = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter(
  'le schéma se rejoue sans erreur (exécution interrompue reprenable)',
  secondeApplication === null,
  secondeApplication ?? ''
);

// === La migration d'administration, appliquée après le schéma ==============

const administration = readFileSync(CHEMIN_ADMINISTRATION, 'utf8');

let premiereAdministration = null;
try {
  await db.exec(administration);
} catch (erreur) {
  premiereAdministration = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter(
  'l’administration s’applique après le schéma',
  premiereAdministration === null,
  premiereAdministration ?? ''
);

let secondeAdministration = null;
try {
  await db.exec(administration);
} catch (erreur) {
  secondeAdministration = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter(
  'l’administration se rejoue sans erreur',
  secondeAdministration === null,
  secondeAdministration ?? ''
);

// === Le témoin : le propriétaire voit tout =================================

await db.exec(`
  insert into auth.users (id, email) values ('${USER_A}', 'a@exemple.fr'), ('${USER_B}', 'b@exemple.fr');
  insert into public.learning_sessions (id, user_id, date, surah, start_ayah, end_ayah, unit_json, status)
  values
    ('session_1_0', '${USER_A}', '2026-09-22', 2, 1, 5, '{"type":"verses","count":5}', 'todo'),
    ('session_1_1', '${USER_A}', '2026-09-23', 2, 6, 10, '{"type":"verses","count":5}', 'todo'),
    ('session_1_0', '${USER_B}', '2026-09-22', 2, 1, 5, '{"type":"verses","count":5}', 'todo');
`);

{
  const r = await db.query('select count(*)::int as n from public.learning_sessions');
  noter('témoin : le propriétaire voit les 3 lignes', r.rows[0].n === 3, `${r.rows[0].n} ligne(s)`);
}

{
  // Le point du schéma : les identifiants de séance sont fabriqués à partir de
  // la date et du rang, donc identiques d'un utilisateur à l'autre. Avec une
  // clé primaire globale, l'insertion ci-dessus aurait échoué en 23505.
  const r = await db.query(
    "select count(*)::int as n from public.learning_sessions where id = 'session_1_0'"
  );
  noter(
    'deux utilisateurs portent le même identifiant de séance',
    r.rows[0].n === 2,
    `${r.rows[0].n} ligne(s) pour « session_1_0 »`
  );
}

// === Le harnais : jouer un utilisateur =====================================

/** Exécute `action` en tant qu'utilisateur, puis annule tout. */
async function enTantQue(userId, action) {
  let valeur;
  try {
    await db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      if (userId !== null) {
        await tx.exec(`set local request.jwt.claims = '{"sub":"${userId}"}'`);
      }
      valeur = await action(tx);
      throw new Error('rollback-volontaire');
    });
  } catch (erreur) {
    if (erreur.message !== 'rollback-volontaire') throw erreur;
  }
  return valeur;
}

/** Exécute `action` en tant qu'utilisateur, en laissant remonter l'erreur. */
async function tentative(userId, action) {
  try {
    await enTantQue(userId, action);
    return { refus: false, code: null, message: null };
  } catch (erreur) {
    return { refus: true, code: erreur.code ?? null, message: erreur.message ?? String(erreur) };
  }
}

/**
 * Exécute `action` en tant qu'utilisateur, et **COMMITE**.
 *
 * `enTantQue` annule toujours sa transaction — c'est ce qui rend les épreuves
 * de lecture indépendantes les unes des autres. Mais une épreuve qui doit
 * laisser une trace derrière elle (poser une amitié, écrire un message) ne peut
 * pas s'en servir : son écriture disparaît, et l'épreuve suivante échoue pour
 * une raison qui n'existe pas.
 *
 * C'est l'erreur qui a été commise en écrivant le banc des discussions, deux
 * fois : une amitié « posée » par `enTantQue` n'existait pas, puis trois
 * messages « écrits » de même. Les deux fois l'échec accusait une politique,
 * qui était juste. Ce helper existe pour que la confusion ne revienne pas.
 */
async function enTantQueEtCommit(userId, action) {
  let valeur;
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    if (userId !== null) {
      await tx.exec(`set local request.jwt.claims = '{"sub":"${userId}"}'`);
    }
    valeur = await action(tx);
  });
  return valeur;
}

// === Lecture ===============================================================

{
  const n = await enTantQue(USER_A, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.learning_sessions');
    return r.rows[0].n;
  });
  noter('RLS lecture : A ne voit que ses 2 lignes', n === 2, `${n} ligne(s)`);
}

{
  const n = await enTantQue(USER_B, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.learning_sessions');
    return r.rows[0].n;
  });
  noter('RLS lecture : B ne voit que sa ligne', n === 1, `${n} ligne(s)`);
}

{
  // Une revendication absente doit refuser, pas casser la requête.
  const n = await enTantQue(null, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.learning_sessions');
    return r.rows[0].n;
  });
  noter('RLS lecture : sans revendication, 0 ligne et aucune exception', n === 0, `${n} ligne(s)`);
}

// === Écriture ==============================================================

{
  // La moitié qu'on oublie : une politique de lecture seule ne suffit pas.
  const r = await tentative(USER_A, async (tx) => {
    await tx.query(
      `insert into public.learning_sessions (id, user_id, date, surah, start_ayah, end_ayah, unit_json, status)
       values ('intrusion', '${USER_B}', '2026-09-24', 2, 11, 15, '{}', 'todo')`
    );
  });
  noter(
    'RLS écriture : A ne peut pas écrire au nom de B',
    r.refus && r.message.includes('row-level security'),
    r.refus ? `${r.code} — ${r.message}` : 'A ÉCRIT CHEZ B'
  );
}

// === La fonction de remplacement ===========================================

const CONFIG_A = { onboardingCompleted: true, objective: { type: 'full_quran' } };
const SEANCE_A = {
  id: 'session_1_0',
  date: '2026-09-22',
  surah: 2,
  startAyah: 1,
  endAyah: 5,
  unit: { type: 'verses', count: 5 },
  status: 'todo',
  createdAt: '2026-09-22T08:00:00.000Z',
};

function appelRemplacement(
  tx,
  userId,
  { config = CONFIG_A, memorized = [], sessions = [], reviews = [] }
) {
  return tx.query(
    'select public.remplacer_donnees($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)',
    [
      userId,
      JSON.stringify(config),
      JSON.stringify(memorized),
      JSON.stringify(sessions),
      JSON.stringify(reviews),
    ]
  );
}

{
  // Sans revendication, auth.uid() vaut NULL : le WITH CHECK des politiques
  // refuse l'insertion. La fonction ne porte aucune autorisation elle-même.
  const r = await tentative(null, (tx) => appelRemplacement(tx, USER_A, { sessions: [SEANCE_A] }));
  noter(
    'remplacer_donnees : refus sans authentification',
    r.refus && r.message.includes('row-level security'),
    r.refus ? `${r.code} — ${r.message}` : 'A ACCEPTÉ SANS COMPTE'
  );
}

{
  // Le point qui compte : un identifiant reçu du client n'est pas une confiance.
  // A se déclare B — les suppressions ne portent sur rien, l'insertion est
  // refusée. Aucune donnée de B n'est touchée.
  const r = await tentative(USER_A, (tx) => appelRemplacement(tx, USER_B, { sessions: [SEANCE_A] }));
  noter(
    'remplacer_donnees : A ne peut pas se déclarer B',
    r.refus && r.message.includes('row-level security'),
    r.refus ? `${r.code} — ${r.message}` : 'A ÉCRIT CHEZ B'
  );
}

{
  // Le piège mesuré, conservé pour qu'il ne revienne pas : un CORPS de fonction
  // qui appelle auth.uid() échoue, faute d'USAGE sur le schéma auth — alors
  // qu'une POLITIQUE y parvient (toutes les épreuves ci-dessus le montrent).
  await db.exec(`
    create or replace function public.sonde_uid_dans_corps() returns uuid
    language plpgsql security invoker set search_path = public
    as $sonde$ begin return auth.uid(); end; $sonde$;
    grant execute on function public.sonde_uid_dans_corps() to authenticated;
  `);

  const r = await tentative(USER_A, (tx) => tx.query('select public.sonde_uid_dans_corps()'));
  noter(
    'le piège est réel : auth.uid() dans un corps de fonction échoue en 42501',
    r.refus && r.code === '42501' && r.message.includes('schema auth'),
    r.refus ? `${r.code} — ${r.message}` : 'A PASSÉ (le piège aurait disparu)'
  );
}

{
  const resultat = await enTantQue(USER_A, async (tx) => {
    await appelRemplacement(tx, USER_A, {
      sessions: [SEANCE_A, { ...SEANCE_A, id: 'session_1_1', date: '2026-09-23' }],
      memorized: [{ surah: 2, startAyah: 1, endAyah: 10, level: 'perfect' }],
      reviews: [
        {
          id: 'review_session_1_0',
          surah: 2,
          startAyah: 1,
          endAyah: 5,
          level: 1,
          nextReviewDate: '2026-09-23',
          reviewCount: 1,
          intervalDays: 1,
          createdAt: '2026-09-22T08:00:00.000Z',
        },
      ],
    });

    const s = await tx.query('select count(*)::int as n from public.learning_sessions');
    const m = await tx.query('select count(*)::int as n from public.memorized_passages');
    const v = await tx.query('select count(*)::int as n from public.review_items');
    const c = await tx.query('select count(*)::int as n from public.user_config');
    return {
      sessions: s.rows[0].n,
      memorized: m.rows[0].n,
      reviews: v.rows[0].n,
      config: c.rows[0].n,
    };
  });

  noter(
    'remplacer_donnees : écrit les quatre ensembles',
    resultat.sessions === 2 &&
      resultat.memorized === 1 &&
      resultat.reviews === 1 &&
      resultat.config === 1,
    JSON.stringify(resultat)
  );
}

{
  // Deux appels successifs avec la même charge ne doivent pas empiler.
  const resultat = await enTantQue(USER_A, async (tx) => {
    await appelRemplacement(tx, USER_A, {
      sessions: [SEANCE_A, { ...SEANCE_A, id: 'session_1_1', date: '2026-09-23' }],
    });
    await appelRemplacement(tx, USER_A, {
      sessions: [SEANCE_A, { ...SEANCE_A, id: 'session_1_1', date: '2026-09-23' }],
    });
    const s = await tx.query('select count(*)::int as n from public.learning_sessions');
    return s.rows[0].n;
  });
  noter('remplacer_donnees : remplace au lieu d’empiler', resultat === 2, `${resultat} ligne(s)`);
}

{
  // Une charge plus petite doit faire disparaître le surplus.
  const resultat = await enTantQue(USER_A, async (tx) => {
    await appelRemplacement(tx, USER_A, {
      sessions: [SEANCE_A, { ...SEANCE_A, id: 'session_1_1', date: '2026-09-23' }],
    });
    await appelRemplacement(tx, USER_A, { sessions: [SEANCE_A] });
    const s = await tx.query('select count(*)::int as n from public.learning_sessions');
    return s.rows[0].n;
  });
  noter('remplacer_donnees : une charge réduite retire le surplus', resultat === 1, `${resultat} ligne(s)`);
}

{
  // Le point sensible : sauvegarder depuis le compte A ne doit rien toucher
  // chez B, alors même que leurs identifiants de séance sont identiques.
  const restant = await enTantQue(USER_A, async (tx) => {
    await appelRemplacement(tx, USER_A, { sessions: [SEANCE_A] });
    return null;
  });
  void restant;

  const r = await db.query(
    `select count(*)::int as n from public.learning_sessions where user_id = '${USER_B}'`
  );
  noter(
    'remplacer_donnees : la sauvegarde de A ne touche pas B',
    r.rows[0].n === 1,
    `${r.rows[0].n} ligne(s) chez B`
  );
}

{
  const r = await db.query(
    `select count(*)::int as n from public.learning_sessions where user_id = '${USER_A}'`
  );
  noter(
    'les transactions d’épreuve sont bien annulées',
    r.rows[0].n === 2,
    `${r.rows[0].n} ligne(s) chez A — état de départ attendu : 2`
  );
}

// === Le déclencheur de profil ==============================================

{
  const nouvelId = '33333333-3333-3333-3333-333333333333';
  await db.query(`insert into auth.users (id, email) values ('${nouvelId}', 'c@exemple.fr')`);
  const r = await db.query(`select count(*)::int as n from public.profiles where id = '${nouvelId}'`);
  noter('le déclencheur crée le profil à l’inscription', r.rows[0].n === 1, `${r.rows[0].n} profil(s)`);
}

// ============================================================================
// Administration
// ============================================================================

await db.exec(`
  insert into auth.users (id, email)
  values ('${USER_ADMIN}', 'admin@exemple.fr');

  -- Le seul chemin vers le rôle : une action du propriétaire de la base.
  update public.profiles set role = 'administrateur', display_name = 'Administration'
   where id = '${USER_ADMIN}';
  update public.profiles set display_name = 'Apprenant A' where id = '${USER_A}';

  -- Jeu d'essai de la synthèse. Le passage de niveau « unknown » est là pour
  -- une raison précise : il ne doit pas gonfler les versets mémorisés.
  insert into public.memorized_passages (user_id, surah, start_ayah, end_ayah, level)
  values
    ('${USER_A}', 2, 1, 10, 'perfect'),
    ('${USER_A}', 2, 11, 20, 'unknown');

  insert into public.learning_sessions (id, user_id, date, surah, start_ayah, end_ayah, unit_json, status)
  values ('session_0_0', '${USER_A}', '2026-09-21', 2, 1, 5, '{}', 'completed');

  insert into public.review_items
    (id, user_id, surah, start_ayah, end_ayah, level, next_review_date, review_count, interval_days)
  values
    ('review_due',    '${USER_A}', 2, 1, 5, 1, '2026-09-20', 1, 1),
    ('review_future', '${USER_A}', 2, 6, 10, 1, '2026-09-30', 1, 1);

  insert into public.division_verifications (thumn_number, statut, note)
  values (100, 'confirmee', 'posée par le propriétaire, pour l’épreuve');
`);

// --- Le prédicat ------------------------------------------------------------

{
  const est = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select public.est_administrateur() as est').then((r) => r.rows[0].est)
  );
  noter('est_administrateur() : vrai pour l’administrateur', est === true, String(est));
}

{
  const est = await enTantQue(USER_A, (tx) =>
    tx.query('select public.est_administrateur() as est').then((r) => r.rows[0].est)
  );
  noter('est_administrateur() : faux pour l’apprenant', est === false, String(est));
}

// La variante SECURITY INVOKER — qui récursionne — est mesurée par
// `scripts/banc_recursion.mjs`, dans son propre processus : elle provoque un
// PANIC du moteur, qui rendrait l'instance inutilisable pour le reste du banc.
// La mesurer ici ferait échouer toutes les épreuves suivantes, en silence.

// --- L'élévation de privilèges ---------------------------------------------

{
  const r = await tentative(USER_A, (tx) =>
    tx.query(`update public.profiles set role = 'administrateur' where id = '${USER_A}'`)
  );
  noter(
    'un apprenant ne peut pas se promouvoir administrateur',
    r.refus && r.message.includes('row-level security'),
    r.refus ? `${r.code} — ${r.message}` : 'A ÉTÉ PROMU'
  );
}

{
  // Le pendant indispensable : un garde qui refuse aussi l'usage légitime n'est
  // pas un garde. Changer son nom doit passer.
  const r = await tentative(USER_A, (tx) =>
    tx.query(`update public.profiles set display_name = 'Nouveau nom' where id = '${USER_A}'`)
  );
  noter('un apprenant peut modifier son propre nom', !r.refus, r.refus ? `${r.code} — ${r.message}` : '');
}

{
  // RLS filtre, elle ne lève pas : l'assertion porte donc sur les lignes
  // touchées, et non sur une exception.
  const touchees = await enTantQue(USER_A, async (tx) => {
    const r = await tx.query(
      `update public.profiles set role = 'administrateur' where id = '${USER_B}'`
    );
    return r.affectedRows;
  });
  const roleB = await db.query(`select role from public.profiles where id = '${USER_B}'`);
  noter(
    'un apprenant ne peut pas promouvoir quelqu’un d’autre',
    touchees === 0 && roleB.rows[0].role === 'apprenant',
    `${touchees} ligne(s) touchée(s), rôle de B : ${roleB.rows[0].role}`
  );
}

{
  // Le rôle est écrit par du code : une valeur inattendue doit être refusée par
  // la base, pas découverte plus tard par un écran vide. L'épreuve se fait
  // maintenant que des profils existent — sinon elle ne toucherait aucune ligne
  // et passerait pour de mauvaises raisons.
  let refus = null;
  try {
    await db.query(`update public.profiles set role = 'superadmin' where id = '${USER_A}'`);
  } catch (erreur) {
    refus = erreur;
  }
  const roleA = await db.query(`select role from public.profiles where id = '${USER_A}'`);
  noter(
    'un rôle inconnu est refusé par la contrainte',
    refus !== null && refus.code === '23514' && roleA.rows[0].role === 'apprenant',
    refus === null ? 'LE RÔLE A ÉTÉ ACCEPTÉ' : `${refus.code} — ${refus.message}`
  );
}

// --- La lecture élargie -----------------------------------------------------

{
  // La comparaison se fait au compte du propriétaire, et non à un nombre figé :
  // un nombre figé dirait « 4 » et deviendrait faux à la prochaine épreuve
  // ajoutée, sans que personne ne sache pourquoi.
  const tous = await db.query('select count(*)::int as n from public.profiles');
  const n = await enTantQue(USER_ADMIN, async (tx) => {
    const s = await tx.query('select count(*)::int as n from public.learning_sessions');
    const p = await tx.query('select count(*)::int as n from public.profiles');
    return { seances: s.rows[0].n, profils: p.rows[0].n };
  });
  const toutesSeances = await db.query('select count(*)::int as n from public.learning_sessions');
  noter(
    'un administrateur voit les séances de tous',
    n.seances === toutesSeances.rows[0].n,
    `${n.seances} sur ${toutesSeances.rows[0].n}`
  );
  noter(
    'un administrateur voit tous les profils',
    n.profils === tous.rows[0].n,
    `${n.profils} sur ${tous.rows[0].n}`
  );
}

{
  // La politique d'administration s'ajoute en OU : elle ne doit pas élargir la
  // vue de celui qui n'est pas administrateur. C'est la régression à craindre.
  const n = await enTantQue(USER_A, async (tx) => {
    const s = await tx.query('select count(*)::int as n from public.learning_sessions');
    const p = await tx.query('select count(*)::int as n from public.profiles');
    return { seances: s.rows[0].n, profils: p.rows[0].n };
  });
  noter(
    'un apprenant ne voit toujours que ses lignes',
    n.seances === 3 && n.profils === 1,
    `${n.seances} séance(s), ${n.profils} profil(s)`
  );
}

// --- La table des vérifications ---------------------------------------------

function insererVerification(tx, valeurs) {
  return tx.query(
    `insert into public.division_verifications (thumn_number, statut, limite_surah, limite_ayah, note)
     values ($1, $2, $3, $4, $5)`,
    valeurs
  );
}

{
  const r = await tentative(USER_A, (tx) =>
    insererVerification(tx, [5, 'confirmee', null, null, 'tentative'])
  );
  noter(
    'un apprenant ne peut pas écrire une vérification',
    r.refus && r.message.includes('row-level security'),
    r.refus ? `${r.code} — ${r.message}` : 'A ÉCRIT'
  );
}

{
  const n = await enTantQue(USER_A, (tx) =>
    tx.query('select count(*)::int as n from public.division_verifications').then((r) => r.rows[0].n)
  );
  noter('un apprenant ne peut pas lire les vérifications', n === 0, `${n} ligne(s)`);
}

{
  const n = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select count(*)::int as n from public.division_verifications').then((r) => r.rows[0].n)
  );
  noter('un administrateur lit les vérifications', n === 1, `${n} ligne(s)`);
}

{
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [1, 'confirmee', null, null, 'borne estimée confirmée'])
  );
  noter('une confirmation sans borne est acceptée', !r.refus, r.refus ? `${r.code} — ${r.message}` : '');
}

{
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [2, 'corrigee', null, null, 'correction sans bornes'])
  );
  noter(
    'une correction sans bornes est refusée',
    r.refus && r.code === '23514',
    r.refus ? `${r.code} — ${r.message}` : 'A ÉTÉ ACCEPTÉE'
  );
}

{
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [3, 'confirmee', 2, 5, 'confirmation avec bornes'])
  );
  noter(
    'une confirmation portant des bornes est refusée',
    r.refus && r.code === '23514',
    r.refus ? `${r.code} — ${r.message}` : 'A ÉTÉ ACCEPTÉE'
  );
}

{
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [4, 'corrigee', 2, 5, 'borne corrigée'])
  );
  noter('une correction complète est acceptée', !r.refus, r.refus ? `${r.code} — ${r.message}` : '');
}

{
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [481, 'confirmee', null, null, 'hors bornes'])
  );
  noter(
    'un numéro de toumoun hors 1..480 est refusé',
    r.refus && r.code === '23514',
    r.refus ? `${r.code} — ${r.message}` : 'A ÉTÉ ACCEPTÉ'
  );
}

{
  // Un statut inconnu est refusé — mais par la contrainte de complétude, et non
  // par celle du statut : les deux se recouvrent, puisque la complétude énumère
  // elle aussi les deux statuts valides. Aucune insertion ne peut donc isoler
  // `division_verifications_statut_valide`. L'épreuve dit ce qu'elle constate,
  // et non ce qu'on aimerait qu'elle isole.
  const r = await tentative(USER_ADMIN, (tx) =>
    insererVerification(tx, [6, 'peut-etre', null, null, 'statut inventé'])
  );
  noter(
    'un statut inconnu est refusé',
    r.refus && r.code === '23514',
    r.refus ? `${r.code} — ${r.message}` : 'A ÉTÉ ACCEPTÉ'
  );
}

{
  // Le rejeu d'un même toumoun : l'administrateur corrige après avoir confirmé.
  // Chaque épreuve précédente a été annulée, donc seule la ligne du propriétaire
  // (toumoun 100) subsiste : deux lignes après celle-ci.
  const r = await enTantQue(USER_ADMIN, async (tx) => {
    await insererVerification(tx, [7, 'confirmee', null, null, 'première lecture']);
    await tx.query(
      `update public.division_verifications set statut = 'corrigee', limite_surah = 3, limite_ayah = 200
        where thumn_number = 7`
    );
    const n = await tx.query('select count(*)::int as n from public.division_verifications');
    const ligne = await tx.query(
      'select statut, limite_surah from public.division_verifications where thumn_number = 7'
    );
    return { total: n.rows[0].n, statut: ligne.rows[0]?.statut, limite: ligne.rows[0]?.limite_surah };
  });
  noter(
    'un administrateur peut revenir sur sa propre vérification',
    r.total === 2 && r.statut === 'corrigee' && r.limite === 3,
    JSON.stringify(r)
  );
}

{
  const touchees = await enTantQue(USER_A, async (tx) => {
    const r = await tx.query('delete from public.division_verifications where thumn_number = 100');
    return r.affectedRows;
  });
  const reste = await db.query(
    'select count(*)::int as n from public.division_verifications where thumn_number = 100'
  );
  noter(
    'un apprenant ne peut pas supprimer une vérification',
    touchees === 0 && reste.rows[0].n === 1,
    `${touchees} ligne(s) supprimée(s), ${reste.rows[0].n} restante(s)`
  );
}

// --- La synthèse ------------------------------------------------------------

const AUJOURDHUI = '2026-09-23';

/** PGlite rend une colonne DATE en objet Date : on la ramène au jour civil. */
function jour(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Date) {
    const decale = new Date(valeur.getTime() - valeur.getTimezoneOffset() * 60000);
    return decale.toISOString().slice(0, 10);
  }
  return String(valeur).slice(0, 10);
}

{
  const tous = await db.query('select count(*)::int as n from public.profiles');
  const r = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select * from public.resume_apprenants($1::date)', [AUJOURDHUI])
  );
  noter(
    'la synthèse rend une ligne par apprenant pour un administrateur',
    r.rows.length === tous.rows[0].n,
    `${r.rows.length} sur ${tous.rows[0].n} profil(s)`
  );

  const a = r.rows.find((l) => l.user_id === USER_A);
  noter(
    'la synthèse ne compte pas un passage inconnu comme mémorisé',
    a !== undefined && Number(a.versets_memorises) === 10 && Number(a.passages_memorises) === 1,
    a === undefined
      ? 'A ABSENT'
      : `versets=${a.versets_memorises}, passages=${a.passages_memorises} — attendu 10 et 1 (20 si « unknown » comptait)`
  );
  noter(
    'la synthèse compte les séances faites, dues et en retard',
    a !== undefined &&
      Number(a.seances_total) === 3 &&
      Number(a.seances_terminees) === 1 &&
      Number(a.seances_retard) === 1 &&
      jour(a.derniere_seance) === '2026-09-21',
    a === undefined
      ? 'A ABSENT'
      : `total=${a.seances_total}, faites=${a.seances_terminees}, retard=${a.seances_retard}, dernière=${jour(a.derniere_seance)}`
  );
  noter(
    'la synthèse ne compte que les révisions échues',
    a !== undefined && Number(a.revisions_dues) === 1,
    a === undefined ? 'A ABSENT' : `${a.revisions_dues} due(s) — attendu 1 sur 2`
  );
  noter(
    'la synthèse porte le nom affiché',
    a !== undefined && a.nom === 'Apprenant A',
    a === undefined ? 'A ABSENT' : String(a.nom)
  );
}

{
  // La date est un paramètre, donc l'épreuve peut la déplacer : au 20 septembre,
  // aucune séance n'est encore en retard.
  const r = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select user_id, seances_retard from public.resume_apprenants($1::date)', ['2026-09-20'])
  );
  const a = r.rows.find((l) => l.user_id === USER_A);
  noter(
    'la synthèse suit la date qu’on lui donne, pas l’horloge',
    a !== undefined && Number(a.seances_retard) === 0,
    a === undefined ? 'A ABSENT' : `${a.seances_retard} en retard au 20 septembre`
  );
}

{
  const r = await enTantQue(USER_A, (tx) =>
    tx.query('select user_id from public.resume_apprenants($1::date)', [AUJOURDHUI])
  );
  noter(
    'la synthèse ne rend à un apprenant que sa propre ligne',
    r.rows.length === 1 && r.rows[0].user_id === USER_A,
    `${r.rows.length} ligne(s)`
  );
}

{
  // Sans revendication : aucune ligne, et aucune exception.
  const r = await enTantQue(null, (tx) =>
    tx.query('select count(*)::int as n from public.resume_apprenants($1::date)', [AUJOURDHUI]).then(
      (x) => x.rows[0].n
    )
  );
  noter('la synthèse ne rend rien sans revendication', r === 0, `${r} ligne(s)`);
}

// === Le suivi entre amis ===================================================

const CHEMIN_AMIS = fileURLToPath(new URL('supabase/amis.sql', RACINE));
const amis = readFileSync(CHEMIN_AMIS, 'utf8');

let premiereAmis = null;
try {
  await db.exec(amis);
} catch (erreur) {
  premiereAmis = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter('le suivi entre amis s’applique après le schéma', premiereAmis === null, premiereAmis ?? '');

let secondeAmis = null;
try {
  await db.exec(amis);
} catch (erreur) {
  secondeAmis = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter('le suivi entre amis se rejoue sans erreur', secondeAmis === null, secondeAmis ?? '');

// Deux comptes témoins, sans lien au départ, plus un troisième qui restera
// étranger à la relation : c'est lui qui doit ne rien voir.
const USER_C = '33333333-3333-3333-3333-333333333333';

// Le code est effacé d'abord : le fichier se rejoue, et les codes tirés au
// sort lors de l'exécution précédente ne doivent pas décider du résultat. Un
// banc qui dépend d'un état laissé par un autre passage ne prouve rien.
//
// RLS est désactivée le temps de cette remise à zéro, et ce n'est pas une
// entorse : la préparation d'un banc s'exécute avec les droits du propriétaire
// de la base, pas ceux d'un utilisateur. La première version de ce bloc l'avait
// oublié, et le résultat était trompeur — un `update` refusé par la politique
// « Profiles updatable by owner » (auth.uid() y vaut NULL hors requête
// authentifiée) ne lève rien, il ne touche simplement aucune ligne. Les codes
// de l'exécution précédente survivaient alors, et l'épreuve d'idempotence
// accusait la fonction, qui était juste.
await db.exec(`
  insert into auth.users (id, email) values
    ('${USER_C}', 'c@exemple.fr')
  on conflict (id) do nothing;

  alter table public.profiles disable row level security;
  update public.profiles set friend_code = null
    where id in ('${USER_A}', '${USER_B}', '${USER_C}');
  update public.profiles set display_name = 'Apprenant A' where id = '${USER_A}';
  update public.profiles set display_name = 'Apprenant B' where id = '${USER_B}';
  delete from public.amis;
  alter table public.profiles enable row level security;
`);

{
  // La remise à zéro doit avoir eu lieu : sans cette vérification, un échec
  // silencieux du bloc ci-dessus (comme celui qui a eu lieu) se confondrait
  // avec une fonction fautive.
  const r = await db.query(
    `select count(*)::int as n from public.profiles
     where id in ('${USER_A}', '${USER_B}', '${USER_C}') and friend_code is not null`
  );
  noter('la remise a zero du banc a bien efface les codes', r.rows[0].n === 0, `${r.rows[0].n} code(s) subsistant(s)`);
}

// --- Le code d'invitation --------------------------------------------------

{
  // Le générateur, éprouvé sur un grand nombre de tirages.
  //
  // C'est l'épreuve qui manquait, et son absence a coûté cher : la première
  // version de l'alphabet faisait 31 signes alors que le modulo en produit 32,
  // donc `substr` sortait de la chaîne une fois sur 32 et le code tombait à 9
  // caractères. Un seul tirage sur trente-deux passait — les épreuves
  // précédentes, qui n'en faisaient qu'un, ne pouvaient pas le voir.
  //
  // Un tirage ne prouve rien d'un générateur. On en fait donc 300, et l'on
  // exige que TOUS soient conformes.
  const tirages = await db.query(
    `select count(*) filter (where c ~ '^[A-HJ-KM-NP-Z1-9]{10}$')::int as conformes,
            count(*)::int as total,
            count(*) filter (where length(c) <> 10)::int as mauvaise_longueur
     from (select public.generer_code_ami() as c from generate_series(1, 300)) t`
  );
  const t = tirages.rows[0];
  noter(
    'sur 300 tirages, tous les codes sont conformes a la contrainte',
    t.conformes === t.total,
    `${t.conformes}/${t.total} conformes, ${t.mauvaise_longueur} de mauvaise longueur`
  );

  // L'accord entre l'alphabet et le modulo, dit explicitement. C'est la cause
  // du défaut ci-dessus, et une contrainte de la table le rattraperait — mais
  // seulement à l'écriture, alors qu'ici on voit la cause.
  const accord = await db.query(
    `select (length(public.alphabet_code_ami()) = 32) as accord,
            length(public.alphabet_code_ami()) as taille`
  );
  noter(
    'l’alphabet des codes fait exactement 32 signes, comme le modulo',
    accord.rows[0].accord === true,
    `${accord.rows[0].taille} signe(s)`
  );
}

{
  // L'idempotence s'éprouve DANS une seule transaction, et ce n'est pas un
  // détail de méthode : `enTantQue` annule toujours son travail (c'est ainsi
  // qu'il isole une épreuve), donc deux appels séparés repartent chacun d'une
  // base vierge et ne peuvent rien montrer l'un de l'autre. La première
  // version de cette épreuve comparait deux transactions : elle accusait la
  // fonction de ne pas être idempotente alors que le harnais effaçait son
  // propre travail entre les deux.
  const [code, encore] = await enTantQue(USER_A, async (tx) => {
    const a = await tx.query('select public.obtenir_code_ami($1::uuid) as c', [USER_A]);
    const b = await tx.query('select public.obtenir_code_ami($1::uuid) as c', [USER_A]);
    return [a.rows[0].c, b.rows[0].c];
  });

  noter(
    'un code d’invitation se crée à la demande',
    typeof code === 'string' && /^[A-HJ-KM-NP-Z1-9]{10}$/.test(code),
    `code : ${code}`
  );

  // Le rappeler ne le change pas : c'est le même code, sinon un utilisateur
  // qui rouvre l'écran perdrait celui qu'il vient de partager.
  noter(
    'rappeler le code ne le regenere pas',
    code === encore,
    `${code} puis ${encore}`
  );
}

{
  // Sans droit sur le profil d'un autre, on ne peut pas lui fabriquer un code.
  //
  // La politique « Profiles updatable by owner » ne s'applique qu'à la ligne
  // de l'appelant : B qui demande le code de A ne voit aucune ligne à mettre à
  // jour. Et parce que `obtenir_code_ami` ne LÈVE pas — un UPDATE sur zéro
  // ligne n'est pas une erreur — c'est l'EFFET qu'il faut mesurer, pas le
  // refus. La fonction a d'ailleurs rendu NULL, ce qui est la bonne réponse :
  // elle n'a rien trouvé et n'a rien pu écrire.
  const avant = await db.query('select friend_code from public.profiles where id = $1', [USER_A]);

  const rendu = await enTantQue(USER_B, (tx) =>
    tx.query('select public.obtenir_code_ami($1::uuid) as c', [USER_A]).then((r) => r.rows[0].c)
  );

  const apres = await db.query('select friend_code from public.profiles where id = $1', [USER_A]);
  noter(
    'on ne fabrique pas le code d’autrui',
    rendu === null && apres.rows[0].friend_code === avant.rows[0].friend_code,
    `rendu ${rendu ?? 'null'}, code de A ${avant.rows[0].friend_code === apres.rows[0].friend_code ? 'inchange' : 'MODIFIE'}`
  );
}

// --- La relation -----------------------------------------------------------

let codeB = null;
let codeA = null;
{
  // Les codes sont produits par le générateur sous l'identité de leur porteur
  // — c'est ainsi qu'ils se créent en vrai — mais hors de `enTantQue`, qui
  // annule tout. Un code lu dans une transaction annulée n'existe pas, et
  // `ajouter_ami_par_code` répondrait alors « aucun compte ne porte ce code ».
  //
  // La remise à zéro du banc les a mis à `null` ; on les repose donc ici, avec
  // l'identité de chacun, puis on les relit en tant que propriétaire pour être
  // sûr qu'ils sont bien en base.
  for (const id of [USER_A, USER_B]) {
    await db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      await tx.exec(`set local request.jwt.claims = '{"sub":"${id}"}'`);
      await tx.query('select public.obtenir_code_ami($1::uuid)', [id]);
    });
  }

  const codes = await db.query(
    'select id, friend_code from public.profiles where id in ($1, $2)',
    [USER_A, USER_B]
  );
  codeA = codes.rows.find((r) => r.id === USER_A)?.friend_code ?? null;
  codeB = codes.rows.find((r) => r.id === USER_B)?.friend_code ?? null;

  noter('le code de A existe', /^[A-HJ-KM-NP-Z1-9]{10}$/.test(codeA ?? ''), `code A : ${codeA}`);
  noter('le code de B existe', /^[A-HJ-KM-NP-Z1-9]{10}$/.test(codeB ?? ''), `code B : ${codeB}`);
  noter(
    'deux comptes ont deux codes differents',
    codeA !== null && codeB !== null && codeA !== codeB,
    `${codeA} / ${codeB}`
  );
}

{
  // Avant toute relation, personne ne voit personne.
  const n = await enTantQue(USER_C, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.learning_sessions where user_id = $1', [
      USER_A,
    ]);
    return r.rows[0].n;
  });
  noter('un etranger ne voit rien des seances d’autrui', n === 0, `${n} ligne(s)`);
}

{
  // A saisit le code de B : la relation se crée, dans l'ordre canonique.
  //
  // Cette épreuve COMMITE, et c'est nécessaire : les suivantes ont besoin que
  // la relation existe réellement, et `enTantQue` l'annulerait. Le geste est
  // reproduit tel quel — identité de A, transaction qui aboutit — donc rien
  // n'est court-circuité.
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.exec(`set local request.jwt.claims = '{"sub":"${USER_A}"}'`);
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [USER_A, codeB]);
  });

  const r = await db.query('select user_a, user_b from public.amis');
  noter(
    'saisir le code d’un ami cree la relation',
    r.rows.length === 1 && r.rows[0].user_b === USER_B,
    `${r.rows.length} ligne(s), cible ${r.rows[0]?.user_b ?? 'aucune'}`
  );
}

{
  // La réciprocité est structurelle : une seule ligne, et elle suffit aux deux.
  const n = await enTantQue(USER_B, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.amis');
    return r.rows[0].n;
  });
  noter('B voit la relation sans l’avoir demandee', n === 1, `${n} ligne(s)`);
}

{
  // Et dans l'autre sens : B voit les séances de A.
  //
  // Le nombre attendu est LU, pas écrit : les sections précédentes du banc
  // ajoutent des séances à A, et une constante ici deviendrait fausse au
  // premier ajout — l'épreuve accuserait alors la politique, qui est juste.
  // Ce qui compte est que B voie EXACTEMENT ce que le propriétaire voit.
  const total = await db.query('select count(*)::int as n from public.learning_sessions where user_id = $1', [
    USER_A,
  ]);
  const vueParB = await enTantQue(USER_B, async (tx) => {
    const r = await tx.query('select count(*)::int as n from public.learning_sessions where user_id = $1', [
      USER_A,
    ]);
    return r.rows[0].n;
  });
  noter(
    'un ami voit exactement les seances de son ami',
    vueParB === total.rows[0].n && total.rows[0].n > 0,
    `${vueParB} vue(s) par B, ${total.rows[0].n} en base`
  );
}

{
  // Le point de la table : A suit B, donc B suit A. Il n'existe pas d'état à
  // sens unique — c'est la clé primaire ordonnée qui le garantit.
  const r = await db.query('select user_a, user_b from public.amis');
  const ligne = r.rows[0];
  noter(
    'la relation est rangee dans un ordre canonique',
    ligne !== undefined && ligne.user_a < ligne.user_b,
    ligne ? `${ligne.user_a} < ${ligne.user_b}` : 'aucune ligne'
  );
}

{
  // Un code qui ne désigne personne. On ne le fabrique pas en abîmant un vrai
  // code — un tirage malchanceux aurait pu tomber sur un code valide et
  // l'épreuve aurait alors accusé la fonction. On prend un code bien formé
  // mais qui n'a jamais été distribué, ce qui est exactement le cas réel.
  const r = await tentative(USER_B, async (tx) => {
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [USER_B, 'ZZZZZZZZZZ']);
  });
  noter(
    'un code inconnu est refuse',
    r.refus === true && r.code === 'P0002',
    `${r.code ?? 'aucun code'} — ${r.message ?? ''}`
  );

  // Un code vide est un autre refus, avec son propre code d'erreur : l'écran
  // doit pouvoir distinguer « champ vide » de « code inexistant ».
  const vide = await tentative(USER_B, async (tx) => {
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [USER_B, '   ']);
  });
  noter(
    'un code vide est refuse autrement qu’un code inconnu',
    vide.refus === true && vide.code === '22023',
    `${vide.code ?? 'aucun code'} — ${vide.message ?? ''}`
  );

  const n = await db.query('select count(*)::int as n from public.amis');
  noter('aucun des deux refus n’a rien cree', n.rows[0].n === 1, `${n.rows[0].n} ligne(s)`);
}

{
  // On ne s'ajoute pas soi-même. Le code de A est celui qui est réellement en
  // base — on le relit, on ne le redemande pas dans une transaction annulée.
  const r = await tentative(USER_A, async (tx) => {
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [USER_A, codeA]);
  });
  noter(
    'on ne s’ajoute pas soi-meme',
    r.refus === true && r.code === '22023',
    `${r.code ?? 'aucun refus'} — ${r.message ?? ''}`
  );

  // Et la casse ne compte pas : un code recopié en minuscules doit marcher.
  // C'est ce qu'on fait en le dictant au téléphone.
  const enMinuscules = await enTantQue(USER_C, async (tx) => {
    const r = await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text) as c', [
      USER_C,
      codeA.toLowerCase(),
    ]);
    return r.rows[0].c;
  });
  noter(
    'un code recopie en minuscules est accepte',
    enMinuscules === USER_A,
    `rendu : ${enMinuscules ?? 'null'}`,
  );
}

{
  // Un étranger à la relation ne peut pas la rompre : la politique de
  // suppression n'ouvre que les lignes où l'on figure. Et parce qu'un DELETE
  // refusé ne lève pas — il ne touche aucune ligne — c'est l'effet qu'on
  // mesure. On COMMITE pour que la mesure porte sur le disque et non sur une
  // transaction qu'on s'apprête à annuler.
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.exec(`set local request.jwt.claims = '{"sub":"${USER_C}"}'`);
    await tx.query('delete from public.amis');
  });
  const apres = await db.query('select count(*)::int as n from public.amis');
  noter(
    'un etranger ne peut pas rompre la relation d’un autre',
    apres.rows[0].n === 1,
    `${apres.rows[0].n} ligne(s) restante(s)`
  );
}

{
  // Le mensonge, et ce qu'il permet vraiment.
  //
  // `ajouter_ami_par_code` est SECURITY DEFINER et reçoit l'identifiant en
  // paramètre : l'appelant peut donc mentir sur SON identité. C'est la
  // POLITIQUE d'insertion qui arrête le mensonge — mais pas celui qu'on
  // croirait. Écrire `p_user_id = A` quand on est C produit la paire (A, C) ;
  // la politique exige « auth.uid() = user_a OR auth.uid() = user_b », et
  // auth.uid() vaut C, qui EST user_b. Elle l'accepte donc.
  //
  // Autrement dit : on peut se lier soi-même à n'importe qui, ce qui est
  // exactement le comportement retenu (suivi immédiat, sans acceptation), mais
  // on ne peut pas fabriquer une relation où l'on ne figure pas. C'est ce
  // second cas qu'il faut refuser, et c'est celui-ci qu'on éprouve.
  const codeA2 = await db.query('select friend_code from public.profiles where id = $1', [USER_A]);
  const cibleA = codeA2.rows[0].friend_code;

  // C ment : il dit être A, et saisit le code de A. La paire serait (A, A).
  const soi = await tentative(USER_C, async (tx) => {
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [USER_A, cibleA]);
  });
  noter(
    'mentir sur son identifiant ne permet pas de se lier a soi-meme',
    soi.refus === true && soi.code === '22023',
    `${soi.code ?? 'aucun refus'} — ${soi.message ?? ''}`
  );

  // Et C ne peut pas non plus créer une relation entre A et B, où il ne figure
  // pas : il n'a pas le code de B sous la main, il a le sien, et se lier à B
  // est légitime. On vérifie donc plutôt qu'aucune paire parasite n'existe.
  const paires = await db.query('select user_a, user_b from public.amis');
  noter(
    'aucune paire parasite n’a ete creee',
    paires.rows.length === 1,
    paires.rows.map((r) => `(${r.user_a.slice(0, 4)},${r.user_b.slice(0, 4)})`).join(' ') || 'aucune'
  );
}

// --- La synthèse -----------------------------------------------------------

{
  const r = await enTantQue(USER_A, (tx) =>
    tx.query('select * from public.mes_amis($1::uuid, $2::date)', [USER_A, AUJOURDHUI])
  );
  noter('mes_amis rend exactement un ami', r.rows.length === 1, `${r.rows.length} ligne(s)`);
  if (r.rows.length === 1) {
    const ami = r.rows[0];
    noter('la synthese porte l’identifiant de l’ami', ami.user_id === USER_B, ami.user_id);
    noter('la synthese porte le nom de l’ami', ami.nom === 'Apprenant B', ami.nom ?? 'aucun nom');
    noter(
      'la synthese expose les versets de la semaine',
      ami.versets_cette_semaine !== undefined && ami.versets_cette_semaine !== null,
      `${ami.versets_cette_semaine}`
    );
  }
}

{
  // Le mensonge symétrique : C tente de lire le point de A, dont il n'est pas
  // l'ami. La politique doit rendre zéro ligne — et non une erreur, qui
  // apprendrait à C que le compte existe.
  const r = await enTantQue(USER_C, (tx) =>
    tx.query('select * from public.point_d_un_ami($1::uuid, $2::date)', [USER_A, AUJOURDHUI])
  );
  noter(
    'un etranger n’obtient rien du point d’un ami (et non une erreur)',
    r.rows.length === 0,
    `${r.rows.length} ligne(s)`
  );
}

{
  // Rompre la relation ferme les DEUX sens, puisqu'il n'y a qu'une ligne.
  //
  // Cette épreuve s'exécute hors de `enTantQue` et COMMITE, et c'est
  // nécessaire : rompre est une suppression, et l'observer depuis une
  // transaction qui l'annule ne montrerait que le travail du harnais. Elle est
  // la dernière du fichier, donc elle ne perturbe rien.
  const vueAvant = await enTantQue(USER_B, async (tx) => {
    const r = await tx.query(
      'select count(*)::int as n from public.learning_sessions where user_id = $1',
      [USER_A]
    );
    return r.rows[0].n;
  });
  noter('avant rupture, B voit les seances de A', vueAvant > 0, `${vueAvant} ligne(s)`);

  // B rompt la relation — c'est le geste réel, sous son identité, et il commit.
  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.exec(`set local request.jwt.claims = '{"sub":"${USER_B}"}'`);
    await tx.query('delete from public.amis');
  });

  const restant = await db.query('select count(*)::int as n from public.amis');
  noter('rompre supprime bien la ligne', restant.rows[0].n === 0, `${restant.rows[0].n} ligne(s)`);

  const vueApres = await enTantQue(USER_B, async (tx) => {
    const r = await tx.query(
      'select count(*)::int as n from public.learning_sessions where user_id = $1',
      [USER_A]
    );
    return r.rows[0].n;
  });
  noter(
    'apres rupture, B ne voit plus rien de A — l’autre sens est ferme aussi',
    vueApres === 0,
    `${vueApres} ligne(s)`
  );

  // Et le point d'un ami ne rend plus rien non plus.
  const point = await enTantQue(USER_B, (tx) =>
    tx.query('select * from public.point_d_un_ami($1::uuid, $2::date)', [USER_A, AUJOURDHUI])
  );
  noter('apres rupture, le point de l’ami ne rend plus rien', point.rows.length === 0, `${point.rows.length} ligne(s)`);
}

// === L'espace de discussion ================================================

const CHEMIN_DISCUSSIONS = fileURLToPath(new URL('supabase/discussions.sql', RACINE));
const discussions = readFileSync(CHEMIN_DISCUSSIONS, 'utf8');

let premiereDiscussions = null;
try {
  await db.exec(discussions);
} catch (erreur) {
  premiereDiscussions = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter(
  'les discussions s’appliquent après le suivi entre amis',
  premiereDiscussions === null,
  premiereDiscussions ?? ''
);

let secondeDiscussions = null;
try {
  await db.exec(discussions);
} catch (erreur) {
  secondeDiscussions = `${erreur.code ?? '?'} — ${erreur.message ?? erreur}`;
}
noter('les discussions se rejouent sans erreur', secondeDiscussions === null, secondeDiscussions ?? '');

// L'ordre canonique de la paire, pour l'écrire dans le banc sans se tromper.
const [PAIRE_A, PAIRE_B] = [USER_A, USER_B].sort();

// --- La relation doit exister avant le fil ---------------------------------
//
// Le fil s'adosse à l'amitié : sans elle, rien ne s'écrit. On le vérifie AVANT
// de poser l'amitié, sinon l'épreuve ne prouverait rien.

{
  await db.exec('delete from public.discussion_messages; delete from public.amis;');

  const refus = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, $4)`,
      [PAIRE_A, PAIRE_B, USER_A, 'sans amitie, rien ne passe']
    )
  );
  noter(
    'sans amitie, un message ne s’ecrit pas',
    refus.refus,
    refus.refus ? `refus ${refus.code ?? ''}` : 'accepte'
  );
}

// On pose l'amitié par le vrai geste : chacun saisit le code de l'autre. C'est
// la fonction éprouvée plus haut, donc la relation du banc est celle qu'un
// utilisateur obtiendrait.
//
// Ce bloc COMMITE, et c'est indispensable : `enTantQue` annule toujours sa
// transaction, si bien qu'une amitié posée par elle n'existerait pas pour les
// épreuves suivantes. L'erreur a été commise en écrivant ce banc — le premier
// `insert` du fil a échoué en 42501 sur la politique d'INSERT, et l'on aurait
// pu accuser la politique alors que la relation n'avait jamais été écrite.
{
  const codes = await db.query(
    `select id, friend_code from public.profiles
      where id in ('${USER_A}', '${USER_B}')`
  );
  const codeDe = Object.fromEntries(codes.rows.map((r) => [r.id, r.friend_code]));
  noter(
    'les deux comptes temoins ont un code',
    Boolean(codeDe[USER_A]) && Boolean(codeDe[USER_B]),
    JSON.stringify(Object.keys(codeDe))
  );

  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.exec(`set local request.jwt.claims = '{"sub":"${USER_B}"}'`);
    await tx.query('select public.ajouter_ami_par_code($1::uuid, $2::text)', [
      USER_B,
      codeDe[USER_A],
    ]);
  });

  const n = await db.query('select count(*)::int as n from public.amis');
  noter('l’amitie est posee pour la suite', n.rows[0].n === 1, `${n.rows[0].n} ligne(s)`);
}

// --- Écrire et lire --------------------------------------------------------

{
  await db.exec('delete from public.discussion_messages;');

  // A écrit deux messages, B un seul. Aucun ne prend l'autre pour soi.
  //
  // Ces écritures COMMITENT — sans quoi les épreuves de lecture ci-dessous
  // liraient un fil vide, et l'échec accuserait les politiques, qui sont
  // justes. C'est précisément l'erreur que le helper `enTantQueEtCommit`
  // documente.
  const ecrit = await enTantQueEtCommit(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, 'Bismillah'),
              ($1::uuid, $2::uuid, $3::uuid, 'On commence par la fatiha ?')
       returning id`,
      [PAIRE_A, PAIRE_B, USER_A]
    )
  );
  noter('A ecrit dans son fil', ecrit.rows.length === 2, `${ecrit.rows.length} message(s)`);

  await enTantQueEtCommit(USER_B, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, 'Oui, allons-y')`,
      [PAIRE_A, PAIRE_B, USER_B]
    )
  );

  const enBase = await db.query('select count(*)::int as n from public.discussion_messages');
  noter(
    'les trois messages sont bien en base',
    enBase.rows[0].n === 3,
    `${enBase.rows[0].n} message(s)`
  );

  // B lit le fil entier : trois messages, dans l'ordre.
  const filB = await enTantQue(USER_B, (tx) =>
    tx.query('select corps from public.lire_fil($1::uuid, $2::uuid)', [USER_B, USER_A])
  );
  noter(
    'B lit les trois messages du fil',
    filB.rows.length === 3,
    `${filB.rows.length} message(s)`
  );
  noter(
    'le fil se lit du plus ancien au plus recent',
    filB.rows[0]?.corps === 'Bismillah' && filB.rows[2]?.corps === 'Oui, allons-y',
    filB.rows.map((r) => r.corps).join(' | ')
  );

  // Et A le lit aussi — la réciprocité n'est pas déclarative.
  const filA = await enTantQue(USER_A, (tx) =>
    tx.query('select count(*)::int as n from public.lire_fil($1::uuid, $2::uuid)', [USER_A, USER_B])
  );
  noter('A lit le meme fil que B', filA.rows[0].n === 3, `${filA.rows[0].n} message(s)`);
}

// --- L'étranger ne voit rien -----------------------------------------------

{
  // C n'est l'ami de personne. Il ne doit voir aucun message, et les fonctions
  // elles-mêmes ne doivent rien lui rendre.
  const vue = await enTantQue(USER_C, (tx) =>
    tx.query('select count(*)::int as n from public.discussion_messages')
  );
  noter('un etranger ne voit aucun message', vue.rows[0].n === 0, `${vue.rows[0].n} message(s)`);

  const fil = await enTantQue(USER_C, (tx) =>
    tx.query('select * from public.lire_fil($1::uuid, $2::uuid)', [USER_C, USER_A])
  );
  noter('un etranger ne lit pas le fil par la fonction non plus', fil.rows.length === 0, `${fil.rows.length} ligne(s)`);
}

// --- On ne signe pas du nom de l'autre -------------------------------------

{
  const refus = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, 'ce n’est pas moi qui l’ai dit')`,
      [PAIRE_A, PAIRE_B, USER_B]
    )
  );
  noter(
    'on ne signe pas un message du nom de l’autre',
    refus.refus,
    refus.refus ? `refus ${refus.code ?? ''}` : 'accepte'
  );
}

// --- Ce que la table refuse, et pourquoi -----------------------------------

{
  // Un corps vide, ou fait d'espaces : refusé par la contrainte, pas par
  // l'interface. C'est la base qui tranche.
  const vide = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, '   ')`,
      [PAIRE_A, PAIRE_B, USER_A]
    )
  );
  noter('un message fait d’espaces est refuse par la base', vide.refus, vide.refus ? `refus ${vide.code ?? ''}` : 'accepte');

  // Trop long : la borne de la base, qui n'est pas celle de l'interface.
  const long = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, repeat('a', 2001))`,
      [PAIRE_A, PAIRE_B, USER_A]
    )
  );
  noter('un message trop long est refuse par la base', long.refus, long.refus ? `refus ${long.code ?? ''}` : 'accepte');

  // Et la paire inversée : l'ordre canonique tient.
  const inverse = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, 'paire a l’envers')`,
      [PAIRE_B, PAIRE_A, USER_A]
    )
  );
  noter('la paire doit etre rangee dans l’ordre canonique', inverse.refus, inverse.refus ? `refus ${inverse.code ?? ''}` : 'accepte');
}

// --- Retirer et masquer : deux gestes, deux autorisations ------------------

{
  await db.exec('delete from public.discussion_messages;');

  const poses = await db.query(
    `insert into public.discussion_messages (user_a, user_b, auteur, corps)
     values ('${PAIRE_A}', '${PAIRE_B}', '${USER_A}', 'a retirer'),
            ('${PAIRE_A}', '${PAIRE_B}', '${USER_A}', 'a masquer'),
            ('${PAIRE_A}', '${PAIRE_B}', '${USER_B}', 'temoin')
     returning id, corps`
  );
  const parCorps = Object.fromEntries(poses.rows.map((r) => [r.corps, r.id]));

  // B, qui n'est pas l'auteur, ne peut PAS retirer un message d'A.
  //
  // `retirer_message` est SECURITY INVOKER : son écriture passe par la
  // politique d'UPDATE, qui n'ouvre que l'auteur ou un administrateur. Le geste
  // ne lève donc pas — il ne touche simplement aucune ligne, et rend `false`.
  // C'est la forme à vérifier ici : un `false`, pas une exception.
  const gesteB = await enTantQueEtCommit(USER_B, (tx) =>
    tx.query('select public.retirer_message($1::bigint) as fait', [parCorps['a retirer']])
  );
  noter(
    'on ne retire pas le message d’un autre',
    gesteB.rows[0].fait === false,
    `rendu ${gesteB.rows[0].fait}`
  );

  // Et la preuve que rien n'a bougé, lue en base plutôt que supposée.
  const intact = await db.query(
    `select retire_le from public.discussion_messages where id = $1::bigint`,
    [parCorps['a retirer']]
  );
  noter('le message d’un autre reste intact', intact.rows[0].retire_le === null, `${intact.rows[0].retire_le}`);

  // A retire le sien. C'est son droit.
  const retire = await enTantQueEtCommit(USER_A, (tx) =>
    tx.query('select public.retirer_message($1::bigint) as fait', [parCorps['a retirer']])
  );
  noter('l’auteur retire son propre message', retire.rows[0].fait === true, `${retire.rows[0].fait}`);

  // Le texte du message retiré n'est plus rendu : `lire_fil` pose `NULL`, la
  // politique laisse la ligne visible pour la pierre tombale.
  //
  // On interroge `masque_par_moderateur`, qui est une COLONNE DE `lire_fil` et
  // non de la table — l'erreur a été commise en écrivant ce banc, et le message
  // rendu (« column masque_par_moderateur does not exist ») désignait la
  // fonction, pas la table.
  const fil = await enTantQue(USER_A, (tx) =>
    tx.query('select corps, retire_le, masque_par_moderateur from public.lire_fil($1::uuid, $2::uuid)', [
      USER_A,
      USER_B,
    ])
  );
  const tombe = fil.rows.find((r) => r.retire_le !== null);
  noter(
    'un message retire est rendu sans son texte',
    tombe !== undefined && tombe.corps === null,
    `corps=${JSON.stringify(tombe?.corps)}, present=${tombe !== undefined}`
  );

  // Un ami ne masque pas : `masquer_message` exige le rôle, et B ne l'a pas.
  const masquageRefuse = await enTantQueEtCommit(USER_B, (tx) =>
    tx.query('select public.masquer_message($1::bigint) as fait', [parCorps['a masquer']])
  );
  noter(
    'un simple ami ne masque pas un message',
    masquageRefuse.rows[0].fait === false,
    `${masquageRefuse.rows[0].fait}`
  );

  // Le modérateur, lui, masque.
  const masque = await enTantQueEtCommit(USER_ADMIN, (tx) =>
    tx.query('select public.masquer_message($1::bigint) as fait', [parCorps['a masquer']])
  );
  noter('un moderateur masque un message', masque.rows[0].fait === true, `${masque.rows[0].fait}`);

  // L'ami ne voit plus le message masqué ; le modérateur, si.
  const filAmi = await enTantQue(USER_A, (tx) =>
    tx.query('select corps from public.lire_fil($1::uuid, $2::uuid)', [USER_A, USER_B])
  );
  const voitMasque = filAmi.rows.some((r) => r.corps === 'a masquer');
  noter('un message masque disparait du fil des amis', voitMasque === false, `${filAmi.rows.length} message(s)`);

  // Le modérateur lit par SA fonction, pas par `lire_fil` : celle-ci borne sur
  // le fil de l'appelant, et un modérateur qui n'est pas partie au fil n'y
  // verrait rien. Ses deux paramètres nomment LA PAIRE, pas « moi et un autre ».
  // Le premier jet de ce banc s'y est trompé deux fois, et l'échec accusait la
  // politique alors que la lecture était simplement la mauvaise.
  const filAdmin = await enTantQue(USER_ADMIN, (tx) =>
    tx.query(
      'select corps, masque_par_moderateur from public.lire_fil_moderation($1::uuid, $2::uuid)',
      [PAIRE_A, PAIRE_B]
    )
  );
  noter(
    'le moderateur voit encore le message masque',
    filAdmin.rows.some((r) => r.corps === 'a masquer' && r.masque_par_moderateur === true),
    `${filAdmin.rows.length} message(s)`
  );

  // Et il voit aussi le TEXTE du message retiré, que les amis ne voient plus.
  noter(
    'le moderateur voit le texte d’un message retire',
    filAdmin.rows.some((r) => r.corps === 'a retirer'),
    filAdmin.rows.map((r) => r.corps).join(' | ')
  );

  // Un simple ami ne peut pas emprunter cette lecture : elle exige le rôle.
  const refusLecture = await tentative(USER_A, (tx) =>
    tx.query('select * from public.lire_fil_moderation($1::uuid, $2::uuid)', [PAIRE_A, PAIRE_B])
  );
  noter(
    'un simple ami ne peut pas lire par la moderation',
    refusLecture.refus,
    refusLecture.refus ? `refus ${refusLecture.code ?? ''}` : 'accepte'
  );

  // Ni parcourir la liste des fils.
  const refusFils = await tentative(USER_A, (tx) =>
    tx.query('select * from public.fils_de_moderation(10)')
  );
  noter(
    'un simple ami ne parcourt pas la liste des fils',
    refusFils.refus,
    refusFils.refus ? `refus ${refusFils.code ?? ''}` : 'accepte'
  );

  const fils = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select * from public.fils_de_moderation(10)')
  );
  noter(
    'le moderateur parcourt les fils et y voit ce qui est masque',
    fils.rows.length === 1 && fils.rows[0].masques === 1,
    `${fils.rows.length} fil(s), ${fils.rows[0]?.masques ?? '?'} masque(s)`
  );

  // Défaire un masquage : réversible, et c'est le point.
  const demasque = await enTantQueEtCommit(USER_ADMIN, (tx) =>
    tx.query('select public.demasquer_message($1::bigint) as fait', [parCorps['a masquer']])
  );
  noter('le moderateur defait son masquage', demasque.rows[0].fait === true, `${demasque.rows[0].fait}`);

  const filRedonne = await enTantQue(USER_A, (tx) =>
    tx.query('select corps from public.lire_fil($1::uuid, $2::uuid)', [USER_A, USER_B])
  );
  noter(
    'le message demasque revient dans le fil',
    filRedonne.rows.some((r) => r.corps === 'a masquer'),
    `${filRedonne.rows.length} message(s)`
  );
}

// --- On ne reecrit pas ce qu'on a dit --------------------------------------

{
  const cible = await db.query(
    `select id from public.discussion_messages where corps = 'temoin' limit 1`
  );
  const id = cible.rows[0].id;

  // B, auteur du temoin, tente de changer le texte. Le déclencheur refuse et
  // LÈVE — un `42501`, pour que l'appelant lise « refus » et non « erreur de
  // saisie ».
  //
  // L'épreuve regarde donc les DEUX faces : que le geste échoue **et** que le
  // texte n'ait pas bougé. Un déclencheur qui lèverait après avoir écrit
  // passerait la première et raterait la seconde.
  const reecriture = await tentative(USER_B, (tx) =>
    tx.query(`update public.discussion_messages set corps = 'autre chose' where id = $1::bigint`, [id])
  );
  noter(
    'on ne reecrit pas un message deja envoye',
    reecriture.refus,
    reecriture.refus ? `refus ${reecriture.code ?? ''}` : 'accepte'
  );

  // Et le texte n'a pas bouge, malgre la tentative.
  const lu = await db.query(`select corps from public.discussion_messages where id = $1::bigint`, [id]);
  noter('le texte d’origine est intact', lu.rows[0].corps === 'temoin', lu.rows[0].corps);

  // Le modérateur non plus ne réécrit pas : son rôle ouvre le masquage, pas la
  // parole d'autrui. C'est la même garde, et elle vaut pour tout le monde.
  const reecritureAdmin = await tentative(USER_ADMIN, (tx) =>
    tx.query(`update public.discussion_messages set corps = 'reecrit par le moderateur' where id = $1::bigint`, [
      id,
    ])
  );
  noter(
    'un moderateur ne reecrit pas la parole d’autrui',
    reecritureAdmin.refus,
    reecritureAdmin.refus ? `refus ${reecritureAdmin.code ?? ''}` : 'accepte'
  );

  // Et un message ne change pas de main : ni d'auteur, ni de destinataire.
  //
  // C'est L'AUTEUR du témoin qui tente le geste — B. Le tenter sous une autre
  // identité ne prouverait rien ici : la politique d'UPDATE écarterait la ligne
  // avant même le déclencheur (aucune politique ne laisse toucher le message
  // d'autrui), et l'épreuve serait verte sans que la règle sur l'auteur soit
  // jamais atteinte. Il faut donc l'auteur, qui a bien le droit de toucher sa
  // ligne — et c'est le déclencheur, et lui seul, qui refuse.
  const auteurDuTemoin = await db.query(
    `select auteur from public.discussion_messages where id = $1::bigint`,
    [id]
  );
  const changeAuteur = await tentative(auteurDuTemoin.rows[0].auteur, (tx) =>
    tx.query(`update public.discussion_messages set auteur = $2::uuid where id = $1::bigint`, [
      id,
      USER_A,
    ])
  );
  noter(
    'un message ne change pas d’auteur, meme par son auteur',
    changeAuteur.refus,
    changeAuteur.refus ? `refus ${changeAuteur.code ?? ''}` : 'accepte'
  );

  // Et la ligne est bien intacte, auteur compris.
  const relu = await db.query(
    `select auteur, corps from public.discussion_messages where id = $1::bigint`,
    [id]
  );
  noter(
    'l’auteur d’origine est intact',
    relu.rows[0].auteur === auteurDuTemoin.rows[0].auteur,
    `${relu.rows[0].auteur}`
  );
}

// --- Aucun effacement reel n'est possible ----------------------------------

{
  // La table n'accorde aucune politique de DELETE — et, en fait, pas même le
  // DROIT de supprimer : le `GRANT` ne porte que SELECT, INSERT, UPDATE. Un
  // `delete` lève donc un `42501` de permission, AVANT d'atteindre une
  // politique. Les deux barrières disent la même chose ici, et c'est voulu :
  // accorder un droit qu'aucune politique n'ouvre ne ferait qu'ajouter un refus
  // silencieux (« 0 ligne supprimée ») là où l'on veut un refus lisible.
  //
  // L'épreuve regarde donc le refus, et confirme ensuite que rien n'a bougé.
  const effaceAdmin = await tentative(USER_ADMIN, (tx) =>
    tx.query('delete from public.discussion_messages returning id')
  );
  noter(
    'meme un moderateur ne peut pas supprimer un message',
    effaceAdmin.refus,
    effaceAdmin.refus ? `refus ${effaceAdmin.code ?? ''}` : 'accepte'
  );

  const effaceAuteur = await tentative(USER_A, (tx) =>
    tx.query('delete from public.discussion_messages returning id')
  );
  noter(
    'un auteur ne supprime pas ses propres messages',
    effaceAuteur.refus,
    effaceAuteur.refus ? `refus ${effaceAuteur.code ?? ''}` : 'accepte'
  );

  const restant = await db.query('select count(*)::int as n from public.discussion_messages');
  noter('les messages sont tous encore la', restant.rows[0].n === 3, `${restant.rows[0].n} message(s)`);
}

// --- Rompre l'amitie ferme la discussion sans effacer les messages ---------

{
  const avant = await db.query('select count(*)::int as n from public.discussion_messages');

  await db.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    await tx.exec(`set local request.jwt.claims = '{"sub":"${USER_B}"}'`);
    await tx.query('delete from public.amis');
  });

  const apres = await db.query('select count(*)::int as n from public.discussion_messages');
  noter(
    'rompre l’amitie ne supprime aucun message',
    apres.rows[0].n === avant.rows[0].n,
    `${avant.rows[0].n} avant, ${apres.rows[0].n} apres`
  );

  // Mais plus personne n'ecrit, et plus personne ne lit.
  const ecriture = await tentative(USER_A, (tx) =>
    tx.query(
      `insert into public.discussion_messages (user_a, user_b, auteur, corps)
       values ($1::uuid, $2::uuid, $3::uuid, 'apres rupture')`,
      [PAIRE_A, PAIRE_B, USER_A]
    )
  );
  noter('apres rupture, on n’ecrit plus dans le fil', ecriture.refus, ecriture.refus ? `refus ${ecriture.code ?? ''}` : 'accepte');

  const lecture = await enTantQue(USER_A, (tx) =>
    tx.query('select count(*)::int as n from public.discussion_messages')
  );
  noter(
    'apres rupture, on ne lit plus le fil — les messages restent en base',
    lecture.rows[0].n === 0,
    `${lecture.rows[0].n} message(s) visible(s)`
  );

  // Le moderateur, lui, voit toujours — c'est ce qui rend la moderation
  // possible apres coup, sans dependre de l'amitie.
  const vueAdmin = await enTantQue(USER_ADMIN, (tx) =>
    tx.query('select count(*)::int as n from public.discussion_messages')
  );
  noter(
    'le moderateur voit le fil meme apres rupture',
    vueAdmin.rows[0].n === 3,
    `${vueAdmin.rows[0].n} message(s)`
  );
}

// === Verdict ===============================================================

const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} épreuves concluantes.`);
process.exit(echecs.length === 0 ? 0 : 1);
