// Mesure : le prédicat « suis-je administrateur ? » a-t-il besoin d'être
// SECURITY DEFINER ?
//
// `administration.sql` déclare `public.est_administrateur()` en SECURITY
// DEFINER, avec un commentaire qui explique pourquoi. Ce commentaire est une
// affirmation ; ce fichier la met à l'épreuve en construisant la variante naïve
// — même corps, SECURITY INVOKER — et en regardant ce qui se passe.
//
// Le résultat n'est pas celui qu'on attendrait, et c'est tout l'intérêt de la
// mesure :
//
//   - pour un APPRENANT, la variante naïve fonctionne parfaitement. Elle rend
//     `false`, et la politique qu'elle porte ne gêne rien. Une épreuve écrite
//     sans y penser passerait au vert ;
//   - pour un ADMINISTRATEUR, la même fonction fait tomber le moteur. Le
//     prédicat se rappelle lui-même — la politique lit `profiles`, dont la
//     politique appelle le prédicat — et le moteur part en PANIC
//     (« ERRORDATA_STACK_SIZE exceeded »), sans se contenter de refuser.
//
// Autrement dit : le défaut est invisible dans le cas qu'on éprouve
// naturellement, et fatal dans celui qui décide. C'est ce qui justifie le
// SECURITY DEFINER, qui fait lire la table intérieure avec les droits du
// propriétaire, donc hors des politiques.
//
// Deux obstacles distincts se cachent derrière « la variante naïve échoue », et
// les confondre ferait écrire un commentaire faux :
//   a) si elle appelle auth.uid() dans son corps, il lui faut USAGE sur le
//      schéma auth — refus 42501, et elle n'atteint jamais la récursion ;
//   b) sinon, elle récursionne dès que le prédicat devrait rendre `true`.
//
// Pourquoi un fichier séparé, et non des épreuves de `banc_supabase.mjs` : un
// PANIC laisse l'instance PGlite inutilisable. Mesuré : dans le banc principal,
// toutes les épreuves suivantes échouaient, ce qui accusait la migration à
// tort. Ici, chaque mesure sacrifie sa propre base.
//
// Exécution :
//   NODE_PATH=<espace de travail isolé>/node_modules node scripts/banc_recursion.mjs

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

let PGlite;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
} catch {
  console.error(
    'PGlite est introuvable. Installez-le dans un espace isolé, puis lancez ce banc\n' +
      'avec NODE_PATH pointant sur son node_modules.'
  );
  process.exit(2);
}

const RACINE = new URL('..', import.meta.url);
const lire = (nom) => readFileSync(fileURLToPath(new URL(nom, RACINE)), 'utf8');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

const resultats = [];
function noter(nom, ok, detail = '') {
  resultats.push({ nom, ok });
  console.log(`${ok ? 'OK   ' : 'ECHEC'}  ${nom}${detail ? `  — ${detail}` : ''}`);
}

/** Une base neuve, schéma + administration appliqués, un ou deux comptes. */
async function nouvelleBase({ administrateurs = [] } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, email text);
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
  await db.exec(lire('supabase/schema.sql'));
  await db.exec(lire('supabase/administration.sql'));
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'a@exemple.fr'), ('${USER_B}', 'b@exemple.fr');
  `);
  for (const id of administrateurs) {
    await db.query(`update public.profiles set role = 'administrateur' where id = '${id}'`);
  }
  return db;
}

/** Exécute `action` en tant qu'utilisateur, et rend ce qui s'est passé. */
async function enTantQue(db, userId, action) {
  try {
    const valeur = await db.transaction(async (tx) => {
      await tx.exec('set local role authenticated');
      await tx.exec(`set local request.jwt.claims = '{"sub":"${userId}"}'`);
      return action(tx);
    });
    return { refus: false, code: null, severite: null, message: null, valeur };
  } catch (erreur) {
    return {
      refus: true,
      code: erreur.code ?? null,
      severite: erreur.severity ?? null,
      message: String(erreur.message ?? erreur),
      valeur: null,
    };
  }
}

const lirePrenom = (tx) =>
  tx.query('select public.est_administrateur() as e').then((r) => r.rows[0].e);
const compterProfils = (tx) =>
  tx.query('select count(*)::int as n from public.profiles').then((r) => r.rows[0].n);

/** La variante naïve : même corps, SECURITY INVOKER, portée par une politique. */
async function ajouterVarianteNaive(db, { avecAuthUid }) {
  const corps = avecAuthUid
    ? "select exists (select 1 from public.profiles where id = auth.uid() and role = 'administrateur')"
    : "select exists (select 1 from public.profiles where role = 'administrateur')";
  await db.exec(`
    create or replace function public.sonde_recursion() returns boolean
    language sql stable security invoker set search_path = public
    as $sonde$ ${corps} $sonde$;
    grant execute on function public.sonde_recursion() to authenticated;
    create policy "Sonde de recursion" on public.profiles
      for select to authenticated using (public.sonde_recursion());
  `);
}

// ============================================================================
// 1. Le prédicat du fichier, dans les deux cas qui comptent
// ============================================================================

{
  const db = await nouvelleBase();
  const apprenant = await enTantQue(db, USER_A, lirePrenom);
  const admin = await enTantQue(db, USER_A, compterProfils);
  noter(
    'est_administrateur() : faux pour un apprenant, et il voit sa seule ligne',
    apprenant.refus === false && apprenant.valeur === false && admin.valeur === 1,
    `prédicat=${apprenant.valeur}, ${admin.valeur} profil(s) visible(s)`
  );
  await db.close().catch(() => {});
}

{
  const db = await nouvelleBase({ administrateurs: [USER_A] });
  const admin = await enTantQue(db, USER_A, lirePrenom);
  const vus = await enTantQue(db, USER_A, compterProfils);
  noter(
    'est_administrateur() : vrai pour un administrateur, et il voit tous les profils',
    admin.refus === false && admin.valeur === true && vus.valeur === 2,
    `prédicat=${admin.valeur}, ${vus.valeur} profil(s) visible(s) — attendu 2`
  );
  await db.close().catch(() => {});
}

// ============================================================================
// 2. Variante naïve (a) : elle appelle auth.uid() dans son corps
// ============================================================================

{
  const db = await nouvelleBase();
  await ajouterVarianteNaive(db, { avecAuthUid: true });
  const r = await enTantQue(db, USER_A, compterProfils);
  noter(
    'variante appelant auth.uid() : refus 42501, avant même d’atteindre la récursion',
    r.refus === true && r.code === '42501',
    r.refus ? `${r.code} — ${r.message}` : `A RÉPONDU ${r.valeur}`
  );
  const survie = await db
    .query('select 1 as un')
    .then((x) => x.rows[0].un === 1)
    .catch(() => false);
  noter('après ce refus, la base reste utilisable', survie === true, survie ? '' : 'base perdue');
  await db.close().catch(() => {});
}

// ============================================================================
// 3. Variante naïve (b), éprouvée pour un APPRENANT : elle passe
// ============================================================================

{
  const db = await nouvelleBase();
  await ajouterVarianteNaive(db, { avecAuthUid: false });
  const predicat = await enTantQue(db, USER_A, (tx) =>
    tx.query('select public.sonde_recursion() as e').then((r) => r.rows[0].e)
  );
  const vus = await enTantQue(db, USER_A, compterProfils);
  noter(
    'la variante naïve passe pour un apprenant — le défaut y est invisible',
    predicat.refus === false && predicat.valeur === false && vus.refus === false && vus.valeur === 1,
    `prédicat=${predicat.valeur}, ${vus.valeur} profil(s) — c’est le cas qu’on éprouve naturellement`
  );
  await db.close().catch(() => {});
}

// ============================================================================
// 4. La même variante, éprouvée pour un ADMINISTRATEUR : le moteur tombe
// ============================================================================

{
  const db = await nouvelleBase({ administrateurs: [USER_A] });
  await ajouterVarianteNaive(db, { avecAuthUid: false });
  const r = await enTantQue(db, USER_A, compterProfils);
  noter(
    'la variante naïve fait tomber le moteur pour un administrateur',
    r.refus === true,
    r.refus
      ? `${r.severite ?? '?'} ${r.code} — ${r.message}`
      : `A RÉPONDU ${r.valeur} ligne(s) — le SECURITY DEFINER serait inutile`
  );
  const survie = await db
    .query('select 1 as un')
    .then((x) => (x.rows[0].un === 1 ? true : 'réponse inattendue'))
    .catch((e) => `non — ${e.message ?? e}`);
  console.log(
    `       survie de la base : ${survie === true ? 'oui' : survie}` +
      (r.severite === 'PANIC' ? ' — un PANIC ne se rattrape pas, d’où ce fichier séparé' : '')
  );
  await db.close().catch(() => {});
}

// ============================================================================
// Verdict
// ============================================================================

const echecs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length - echecs.length}/${resultats.length} épreuves concluantes.`);
process.exit(echecs.length === 0 ? 0 : 1);
