-- ============================================================================
-- Hifdh App - Administration
-- À exécuter APRÈS supabase/schema.sql, dans l'éditeur SQL Supabase
-- (Dashboard > SQL Editor).
--
-- Ce fichier ne contient aucun secret : uniquement des colonnes, des
-- politiques d'accès et des fonctions. Il est donc versionnable.
--
-- Il est rejouable : chaque instruction est gardée par « if not exists », par
-- un « drop ... if exists » préalable, ou par un bloc qui teste le catalogue.
-- Une exécution interrompue se reprend en le relançant.
--
-- Ce qu'il apporte :
--   1. un nom affiché et un rôle, sur les profils ;
--   2. le prédicat « suis-je administrateur ? » ;
--   3. l'interdiction de se promouvoir soi-même ;
--   4. la lecture des données de tous les apprenants, pour un administrateur ;
--   5. la table des vérifications de bornes de toumoun ;
--   6. une fonction de synthèse, pour le tableau de bord.
--
-- Ce qu'il n'apporte pas : aucune écriture d'un administrateur sur les données
-- d'un apprenant. Le tableau de bord observe, il ne corrige pas la progression
-- de quelqu'un d'autre.
-- ============================================================================


-- ============================================================================
-- 1. Nom affiché et rôle
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Le rôle décide de tout le reste. Il vaut « apprenant » par défaut : un compte
-- neuf n'a aucun privilège, et il faut une action explicite pour lui en donner.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'apprenant';

-- Une contrainte, et non un simple commentaire : la valeur est écrite par du
-- code, et une faute de frappe produirait sinon un rôle qui ne serait ni
-- apprenant ni administrateur — donc un compte qui ne peut rien faire, ou pire,
-- un rôle que le prédicat du point 2 ne reconnaîtrait pas.
-- Le test porte sur (table, nom), et non sur le seul nom : `conname` n'est pas
-- unique dans une base, et une contrainte homonyme posée ailleurs ferait croire
-- à tort que celle-ci existe déjà.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_valide'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_valide
      CHECK (role IN ('apprenant', 'administrateur'));
  END IF;
END;
$$;


-- ============================================================================
-- 2. Le prédicat « suis-je administrateur ? »
--
-- SECURITY DEFINER, et ce n'est pas un détail : la fonction lit `profiles`,
-- table sur laquelle les politiques du point 3 et du point 4 l'appellent. En
-- SECURITY INVOKER, la lecture intérieure serait soumise aux politiques qui
-- l'appellent — Postgres détecte alors une récursion de politiques et refuse
-- toute requête. En SECURITY DEFINER, la lecture intérieure s'exécute avec les
-- droits du propriétaire, qui contourne la RLS faute de FORCE ROW LEVEL
-- SECURITY : plus de récursion.
--
-- `SET search_path = public` est obligatoire : sans lui, un appelant pourrait
-- placer un schéma à lui en tête du chemin de recherche et faire résoudre
-- `profiles` vers une table qu'il contrôle.
--
-- `auth.uid()` reste lisible : la revendication vient de la session, pas des
-- droits sur le schéma `auth`.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.est_administrateur()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'administrateur'
  );
$$;


-- ============================================================================
-- 3. Interdire de se promouvoir soi-même
--
-- La politique d'origine — « Profiles updatable by owner » — autorise le
-- propriétaire à modifier sa propre ligne, sans restriction de colonne. Avec
-- l'arrivée du rôle, elle devient une élévation de privilèges : n'importe quel
-- apprenant pourrait s'écrire `role = 'administrateur'` et lire ensuite les
-- données de tout le monde.
--
-- La garde tient en une ligne, et elle est dans la politique plutôt que dans un
-- déclencheur : « la nouvelle ligne peut garder le rôle d'apprenant, ou bien
-- l'appelant est déjà administrateur ». Un apprenant ne peut donc pas s'élever,
-- et un administrateur ne peut pas se rétrograder par accident — ce qui est le
-- comportement souhaitable, la rétrogradation se faisant en SQL.
--
-- Le premier administrateur, lui, se nomme en SQL : voir la fin du fichier.
-- ============================================================================

DROP POLICY IF EXISTS "Profiles updatable by owner" ON public.profiles;
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (role = 'apprenant' OR public.est_administrateur())
  );

-- L'insertion porte le même trou : un compte pourrait créer sa ligne de profil
-- avec un rôle élevé. La clé primaire l'en empêche en pratique, puisque le
-- déclencheur `handle_new_user` a déjà créé la ligne — mais « en pratique » ne
-- vaut pas « par construction ».
DROP POLICY IF EXISTS "Profiles insertable by owner" ON public.profiles;
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND (role = 'apprenant' OR public.est_administrateur())
  );


-- ============================================================================
-- 4. Lecture par un administrateur
--
-- Une politique de lecture par table, et rien de plus : l'administrateur
-- observe. Les politiques d'écriture restent celles du propriétaire, donc un
-- administrateur ne peut pas modifier la progression de quelqu'un d'autre.
--
-- Les politiques s'ajoutent en OU : un apprenant continue de voir ses lignes
-- par « self read », un administrateur voit tout par celle-ci.
-- ============================================================================

DROP POLICY IF EXISTS "Profiles lisibles par un administrateur" ON public.profiles;
CREATE POLICY "Profiles lisibles par un administrateur" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.est_administrateur());

DROP POLICY IF EXISTS "Config lisible par un administrateur" ON public.user_config;
CREATE POLICY "Config lisible par un administrateur" ON public.user_config
  FOR SELECT TO authenticated
  USING (public.est_administrateur());

DROP POLICY IF EXISTS "Passages lisibles par un administrateur" ON public.memorized_passages;
CREATE POLICY "Passages lisibles par un administrateur" ON public.memorized_passages
  FOR SELECT TO authenticated
  USING (public.est_administrateur());

DROP POLICY IF EXISTS "Seances lisibles par un administrateur" ON public.learning_sessions;
CREATE POLICY "Seances lisibles par un administrateur" ON public.learning_sessions
  FOR SELECT TO authenticated
  USING (public.est_administrateur());

DROP POLICY IF EXISTS "Revisions lisibles par un administrateur" ON public.review_items;
CREATE POLICY "Revisions lisibles par un administrateur" ON public.review_items
  FOR SELECT TO authenticated
  USING (public.est_administrateur());


-- ============================================================================
-- 5. Vérification des bornes de toumoun
--
-- Les 480 toumoun vivent dans `data/quran/thumn_hafs.json`, embarqué dans
-- l'application à la compilation. Une correction ne peut donc pas être « live » :
-- elle est enregistrée ici, puis reportée dans le fichier, qui repart avec la
-- prochaine version. C'est ce que la spécification demande — corriger les
-- divisions sans toucher au reste de l'application.
--
-- Une ligne par toumoun vérifié, et non 480 lignes vides : la table ne contient
-- que ce qui a été regardé, ce qui rend visible l'avancement du travail.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.division_verifications (
  thumn_number INTEGER PRIMARY KEY,
  -- « confirmee » : la borne estimée était juste. « corrigee » : elle ne l'était
  -- pas, et fin_surah/fin_ayah portent la bonne.
  statut TEXT NOT NULL,
  fin_surah INTEGER,
  fin_ayah INTEGER,
  note TEXT,
  verifie_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verifie_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT division_verifications_numero_valide
    CHECK (thumn_number BETWEEN 1 AND 480),
  CONSTRAINT division_verifications_statut_valide
    CHECK (statut IN ('confirmee', 'corrigee')),
  -- Une correction sans borne n'est pas une correction. Une confirmation, elle,
  -- n'en porte pas : c'est justement le cas où la borne estimée était la bonne.
  CONSTRAINT division_verifications_correction_complete
    CHECK (
      (statut = 'confirmee' AND fin_surah IS NULL AND fin_ayah IS NULL)
      OR (statut = 'corrigee' AND fin_surah IS NOT NULL AND fin_ayah IS NOT NULL)
    )
);

ALTER TABLE public.division_verifications ENABLE ROW LEVEL SECURITY;

-- Réservée aux administrateurs, dans les deux sens. Un apprenant n'a rien à y
-- faire : ces bornes ne sont pas ses données.
DROP POLICY IF EXISTS "Verifications lues par un administrateur" ON public.division_verifications;
CREATE POLICY "Verifications lues par un administrateur" ON public.division_verifications
  FOR SELECT TO authenticated
  USING (public.est_administrateur());

DROP POLICY IF EXISTS "Verifications ecrites par un administrateur" ON public.division_verifications;
CREATE POLICY "Verifications ecrites par un administrateur" ON public.division_verifications
  FOR INSERT TO authenticated
  WITH CHECK (public.est_administrateur());

DROP POLICY IF EXISTS "Verifications modifiees par un administrateur" ON public.division_verifications;
CREATE POLICY "Verifications modifiees par un administrateur" ON public.division_verifications
  FOR UPDATE TO authenticated
  USING (public.est_administrateur())
  WITH CHECK (public.est_administrateur());

DROP POLICY IF EXISTS "Verifications supprimees par un administrateur" ON public.division_verifications;
CREATE POLICY "Verifications supprimees par un administrateur" ON public.division_verifications
  FOR DELETE TO authenticated
  USING (public.est_administrateur());


-- ============================================================================
-- 6. Synthèse par apprenant
--
-- Une seule requête pour tout le tableau de bord, plutôt qu'une par apprenant :
-- un écran qui interroge la base vingt fois est un écran qui échoue vingt fois.
--
-- SECURITY INVOKER, volontairement : les politiques de lecture s'appliquent, donc
-- un apprenant qui appellerait la fonction n'obtiendrait que sa propre ligne, et
-- un administrateur les obtient toutes. L'autorisation reste dans la RLS, pas
-- dans le corps de la fonction — c'est la règle du projet.
--
-- `p_aujourdhui` est un paramètre et non `CURRENT_DATE` : un calcul de retard qui
-- lit l'horloge du serveur ne s'éprouve pas. L'appelant injecte la date, le banc
-- aussi.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resume_apprenants(p_aujourdhui DATE)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  role TEXT,
  inscrit_le TIMESTAMPTZ,
  versets_memorises BIGINT,
  passages_memorises BIGINT,
  seances_total BIGINT,
  seances_terminees BIGINT,
  seances_retard BIGINT,
  revisions_dues BIGINT,
  derniere_seance DATE,
  objectif TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.display_name,
    p.role,
    p.created_at,
    COALESCE(m.versets, 0),
    COALESCE(m.passages, 0),
    COALESCE(s.total, 0),
    COALESCE(s.terminees, 0),
    COALESCE(s.retard, 0),
    COALESCE(r.dues, 0),
    s.derniere,
    c.config_json ->> 'objective'
  FROM public.profiles p
  LEFT JOIN (
    -- `level = 'unknown'` est un passage que l'apprenant a déclaré ne pas
    -- connaître : il compte dans le programme, pas dans la progression. Le
    -- compter ici gonflerait le pourcentage affiché.
    SELECT user_id,
           SUM(end_ayah - start_ayah + 1) AS versets,
           COUNT(*) AS passages
    FROM public.memorized_passages
    WHERE level <> 'unknown'
    GROUP BY user_id
  ) m ON m.user_id = p.id
  LEFT JOIN (
    SELECT user_id,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS terminees,
           -- « En retard » : une séance encore à faire dont la date est passée.
           COUNT(*) FILTER (WHERE status = 'todo' AND date < p_aujourdhui) AS retard,
           MAX(date) FILTER (WHERE status = 'completed') AS derniere
    FROM public.learning_sessions
    GROUP BY user_id
  ) s ON s.user_id = p.id
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS dues
    FROM public.review_items
    WHERE next_review_date <= p_aujourdhui
    GROUP BY user_id
  ) r ON r.user_id = p.id
  LEFT JOIN public.user_config c ON c.user_id = p.id
  ORDER BY p.created_at;
$$;


-- ============================================================================
-- Droits
--
-- Les politiques RLS filtrent des lignes, elles n'accordent pas l'accès : sans
-- GRANT, tout échoue en 42501 avant même d'atteindre une politique. C'est le
-- premier endroit à regarder devant un refus inattendu.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.est_administrateur() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_apprenants(DATE) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.division_verifications TO authenticated;


-- ============================================================================
-- Nommer le premier administrateur
--
-- À faire UNE FOIS, dans l'éditeur SQL, après avoir créé le compte dans
-- l'application. Remplacer l'adresse par celle du compte :
--
--   UPDATE public.profiles
--      SET role = 'administrateur'
--    WHERE id = (SELECT id FROM auth.users WHERE email = 'adresse@exemple.fr');
--
-- Puis vérifier :
--
--   SELECT p.role, u.email
--     FROM public.profiles p JOIN auth.users u ON u.id = p.id
--    ORDER BY p.role, u.email;
--
-- Cette requête ne peut pas être faite depuis l'application : la politique du
-- point 3 interdit à un apprenant de s'élever, et il n'y a pas encore
-- d'administrateur pour autoriser le changement. C'est voulu — le premier
-- administrateur se nomme par le propriétaire de la base, pas par l'interface.
-- ============================================================================
