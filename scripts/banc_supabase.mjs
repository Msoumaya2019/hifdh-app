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

// === Verdict ===============================================================

const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} épreuves concluantes.`);
process.exit(echecs.length === 0 ? 0 : 1);
