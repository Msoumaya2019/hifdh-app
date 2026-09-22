-- ============================================================================
-- Hifdh App - Schéma SQL Supabase
-- À exécuter dans l'éditeur SQL Supabase (Dashboard > SQL Editor)
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  level TEXT NOT NULL DEFAULT 'perfect',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Séances d'apprentissage
CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  unit_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items de révision
CREATE TABLE IF NOT EXISTS public.review_items (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  end_ayah INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL,
  last_reviewed_at TIMESTAMPTZ,
  review_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
-- Chaque utilisateur ne voit que ses propres données
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memorized_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_items ENABLE ROW LEVEL SECURITY;

-- Profils: un utilisateur peut lire et modifier son propre profil
CREATE POLICY "Profiles are viewable by owner" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User config: propriétaire uniquement
CREATE POLICY "User config self read" ON public.user_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "User config self write" ON public.user_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User config self update" ON public.user_config
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "User config self delete" ON public.user_config
  FOR DELETE USING (auth.uid() = user_id);

-- Memorized passages: propriétaire uniquement
CREATE POLICY "Memorized self read" ON public.memorized_passages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Memorized self insert" ON public.memorized_passages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Memorized self update" ON public.memorized_passages
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Memorized self delete" ON public.memorized_passages
  FOR DELETE USING (auth.uid() = user_id);

-- Learning sessions: propriétaire uniquement
CREATE POLICY "Sessions self read" ON public.learning_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Sessions self insert" ON public.learning_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Sessions self update" ON public.learning_sessions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Sessions self delete" ON public.learning_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Review items: propriétaire uniquement
CREATE POLICY "Reviews self read" ON public.review_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Reviews self insert" ON public.review_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Reviews self update" ON public.review_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Reviews self delete" ON public.review_items
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- Trigger: créer un profil automatiquement à l'inscription
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
