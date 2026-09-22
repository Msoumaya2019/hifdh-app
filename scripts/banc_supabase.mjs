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

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

const resultats = [];
function noter(nom, ok, detail = '') {
  resultats.push({ nom, ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${nom}${detail ? `  — ${detail}` : ''}`);
}

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

// === Verdict ===============================================================

const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} épreuves concluantes.`);
process.exit(echecs.length === 0 ? 0 : 1);
