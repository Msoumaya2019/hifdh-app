-- ============================================================================
-- Hifdh App - Schéma SQL Supabase
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor)
--
-- Ce fichier ne contient aucun secret : uniquement des tables, des politiques
-- d'accès et des fonctions. Il est donc versionnable dans un dépôt public.
--
-- Il est rejouable : chaque instruction est gardée par « if not exists » ou par
-- un « drop ... if exists » préalable. Une exécution interrompue se reprend en
-- le relançant, sans erreur « already exists ».
-- ============================================================================

-- ============================================================================
-- Tables
-- ============================================================================

-- Profils utilisateurs (lié à auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration utilisateur
CREATE TABLE IF NOT EXISTS public.user_config (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passages mémorisés
CREATE TABLE IF NOT EXISTS public.memorized_passages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'perfect',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Séances d'apprentissage
--
-- La clé primaire est (user_id, id), et non (id) seule : l'application fabrique
-- les identifiants de séance à partir de leur date et de leur rang
-- (« session_1758523200000_0 »), si bien que deux utilisateurs générant leur
-- programme le même jour produisent exactement les mêmes identifiants. Avec une
-- clé primaire globale, le second utilisateur se verrait refuser toute
-- sauvegarde par une violation de clé, sans rapport avec ses propres données.
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  unit_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- Items de révision
-- Même raison que pour les séances : l'identifiant dérive de celui de la séance.
CREATE TABLE IF NOT EXISTS public.review_items (
  id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  review_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

-- ============================================================================
-- Index
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON public.learning_sessions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON public.learning_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_review_user_next ON public.review_items(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_memorized_user_surah ON public.memorized_passages(user_id, surah);

-- ============================================================================
-- Row Level Security (RLS)
-- Chaque utilisateur ne voit et ne modifie que ses propres données.
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorized_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;

-- Profils
DROP POLICY IF EXISTS "Profiles are viewable by owner" ON public.profiles;
CREATE POLICY "Profiles are viewable by owner" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles updatable by owner" ON public.profiles;
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles insertable by owner" ON public.profiles;
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Configuration utilisateur
DROP POLICY IF EXISTS "User config self read" ON public.user_config;
CREATE POLICY "User config self read" ON public.user_config
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User config self write" ON public.user_config;
CREATE POLICY "User config self write" ON public.user_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User config self update" ON public.user_config;
CREATE POLICY "User config self update" ON public.user_config
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User config self delete" ON public.user_config;
CREATE POLICY "User config self delete" ON public.user_config
  FOR DELETE USING (auth.uid() = user_id);

-- Passages mémorisés
DROP POLICY IF EXISTS "Memorized self read" ON public.memorized_passages;
CREATE POLICY "Memorized self read" ON public.memorized_passages
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Memorized self insert" ON public.memorized_passages;
CREATE POLICY "Memorized self insert" ON public.memorized_passages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Memorized self update" ON public.memorized_passages;
CREATE POLICY "Memorized self update" ON public.memorized_passages
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Memorized self delete" ON public.memorized_passages;
CREATE POLICY "Memorized self delete" ON public.memorized_passages
  FOR DELETE USING (auth.uid() = user_id);

-- Séances d'apprentissage
DROP POLICY IF EXISTS "Sessions self read" ON public.learning_sessions;
CREATE POLICY "Sessions self read" ON public.learning_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sessions self insert" ON public.learning_sessions;
CREATE POLICY "Sessions self insert" ON public.learning_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sessions self update" ON public.learning_sessions;
CREATE POLICY "Sessions self update" ON public.learning_sessions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sessions self delete" ON public.learning_sessions;
CREATE POLICY "Sessions self delete" ON public.learning_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Items de révision
DROP POLICY IF EXISTS "Reviews self read" ON public.review_items;
CREATE POLICY "Reviews self read" ON public.review_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Reviews self insert" ON public.review_items;
CREATE POLICY "Reviews self insert" ON public.review_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Reviews self update" ON public.review_items;
CREATE POLICY "Reviews self update" ON public.review_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Reviews self delete" ON public.review_items;
CREATE POLICY "Reviews self delete" ON public.review_items
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- Remplacement atomique de toutes les données d'un utilisateur
--
-- La sauvegarde envoie un instantané complet. Faire les suppressions puis les
-- insertions depuis le client laisserait, en cas d'interruption, un compte
-- vidé de sa progression — et donc une sauvegarde détruite par la sauvegarde
-- elle-même. Une fonction est atomique : tout ou rien.
--
-- SECURITY INVOKER (par défaut) : la fonction s'exécute avec l'identité de
-- l'appelant, donc les politiques RLS s'appliquent AUSSI à l'intérieur. C'est
-- volontaire, et c'est ce qui rend l'autorisation vérifiable à un seul endroit.
--
-- L'identifiant est reçu en paramètre au lieu d'être lu par auth.uid() ici.
-- Ce n'est pas un détail de style, c'est mesuré : un corps de fonction
-- s'exécute avec les droits du demandeur, qui n'a pas USAGE sur le schéma
-- « auth » — l'appel échoue alors en 42501 « permission denied for schema
-- auth », au lieu de refuser proprement. Une POLITIQUE, elle, peut appeler
-- auth.uid() sans ce droit. On ne demande donc rien au schéma auth ici, et
-- c'est RLS qui porte l'autorisation :
--
--   - le DELETE ne voit que les lignes de auth.uid() ;
--   - l'INSERT est validé par « WITH CHECK (auth.uid() = user_id) ».
--
-- Conséquence utile : passer l'identifiant d'un autre utilisateur ne donne
-- aucun accès. Les suppressions ne portent sur rien, et l'insertion est
-- refusée en 42501. L'identifiant reçu n'est donc pas une confiance, seulement
-- une commodité — la sécurité ne repose pas sur lui.
-- ============================================================================

-- CREATE OR REPLACE ne remplace que les fonctions de MÊME signature : une
-- signature différente crée une surcharge, et l'ancienne resterait appelable.
-- On la retire donc explicitement.
DROP FUNCTION IF EXISTS public.remplacer_donnees(JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.remplacer_donnees(
  p_user_id UUID,
  p_config JSONB,
  p_memorized JSONB,
  p_sessions JSONB,
  p_reviews JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'identifiant utilisateur requis' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.memorized_passages WHERE user_id = p_user_id;
  DELETE FROM public.learning_sessions WHERE user_id = p_user_id;
  DELETE FROM public.review_items WHERE user_id = p_user_id;
  DELETE FROM public.user_config WHERE user_id = p_user_id;

  IF p_config IS NOT NULL THEN
    INSERT INTO public.user_config (user_id, config_json, updated_at)
    VALUES (p_user_id, p_config, NOW());
  END IF;

  INSERT INTO public.memorized_passages (user_id, surah, start_ayah, end_ayah, level)
  SELECT p_user_id,
         (e ->> 'surah')::INTEGER,
         (e ->> 'startAyah')::INTEGER,
         (e ->> 'endAyah')::INTEGER,
         COALESCE(e ->> 'level', 'perfect')
  FROM jsonb_array_elements(COALESCE(p_memorized, '[]'::jsonb)) AS e;

  INSERT INTO public.learning_sessions
    (id, user_id, date, surah, start_ayah, end_ayah, unit_json, status, completed_at, created_at)
  SELECT e ->> 'id',
         p_user_id,
         (e ->> 'date')::DATE,
         (e ->> 'surah')::INTEGER,
         (e ->> 'startAyah')::INTEGER,
         (e ->> 'endAyah')::INTEGER,
         COALESCE(e -> 'unit', '{}'::jsonb),
         COALESCE(e ->> 'status', 'todo'),
         NULLIF(e ->> 'completedAt', '')::TIMESTAMPTZ,
         COALESCE(NULLIF(e ->> 'createdAt', '')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(COALESCE(p_sessions, '[]'::jsonb)) AS e;

  INSERT INTO public.review_items
    (id, user_id, surah, start_ayah, end_ayah, level, next_review_date,
     last_reviewed_at, review_count, interval_days, created_at)
  SELECT e ->> 'id',
         p_user_id,
         (e ->> 'surah')::INTEGER,
         (e ->> 'startAyah')::INTEGER,
         (e ->> 'endAyah')::INTEGER,
         COALESCE((e ->> 'level')::INTEGER, 0),
         (e ->> 'nextReviewDate')::DATE,
         NULLIF(e ->> 'lastReviewedAt', '')::TIMESTAMPTZ,
         COALESCE((e ->> 'reviewCount')::INTEGER, 0),
         COALESCE((e ->> 'intervalDays')::INTEGER, 1),
         COALESCE(NULLIF(e ->> 'createdAt', '')::TIMESTAMPTZ, NOW())
  FROM jsonb_array_elements(COALESCE(p_reviews, '[]'::jsonb)) AS e;
END;
$$;

-- ============================================================================
-- Trigger: créer un profil automatiquement à l'inscription
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- Droits
--
-- Sans ces GRANT, le rôle authentifié n'a aucun droit sur les tables : les
-- politiques RLS filtrent des lignes, elles n'accordent pas l'accès. C'est le
-- premier endroit à regarder devant un refus inattendu (42501).
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memorized_passages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.remplacer_donnees(UUID, JSONB, JSONB, JSONB, JSONB) TO authenticated;
