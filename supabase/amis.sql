-- ============================================================================
-- Hifdh App - Suivi entre amis
-- À exécuter APRÈS `supabase/schema.sql` (et après `administration.sql`).
--
-- Ce fichier ne contient aucun secret : uniquement des tables, des politiques
-- d'accès et des fonctions. Il est donc versionnable dans un dépôt public.
--
-- Il est rejouable : chaque instruction est gardée par « if not exists » ou par
-- un « drop ... if exists » préalable.
--
-- ----------------------------------------------------------------------------
-- Ce qui est décidé ici, et pourquoi
-- ----------------------------------------------------------------------------
--
-- 1. Le suivi est IMMÉDIAT, sans acceptation. Saisir le code d'invitation de
--    quelqu'un suffit à ce que les deux se suivent. C'est le choix retenu par
--    le propriétaire de l'application : plus simple, et le code n'est transmis
--    qu'à qui l'on veut.
--
--    Conséquence, et elle est assumée : connaître un code suffit à entrer dans
--    la progression de son porteur. Un code est donc un secret, et la seule
--    protection est qu'il ne circule pas. Il est long (10 caractères) et se
--    regénère.
--
-- 2. La réciprocité est STRUCTURELLE, pas déclarative. Une seule ligne décrit
--    la relation, et elle donne accès dans les deux sens : il n'existe pas de
--    suivi à sens unique, donc pas d'état où A suit B sans que B suive A. Ce
--    n'est pas une politesse : c'est la seule forme où « je vois qui me voit »
--    est vrai par construction.
--
-- 3. Ce qui est visible d'un ami est CE QU'IL A APPRIS, pas ce qu'il doit
--    réviser. Le nombre de versets de la semaine, sa page courante, sa sourate
--    en cours, son avancement. En revanche le nombre de passages ÉCHUS en
--    révision n'est pas exposé : c'est le seul indicateur qui dit « je suis en
--    retard », et le rendre visible changerait l'usage — on masquerait ses
--    échecs plutôt que de les travailler. Le choix a été posé et tranché.
--
-- 4. L'autorisation vit dans les POLITIQUES, pas dans les corps de fonction.
--    Le projet a mesuré la différence : un corps de fonction s'exécute avec
--    les droits de l'appelant, qui n'a pas USAGE sur le schéma « auth », et
--    `auth.uid()` y échoue en 42501 au lieu de refuser proprement. Une
--    politique, elle, peut l'appeler. Les fonctions de ce fichier ne lisent
--    donc jamais l'identité elles-mêmes : elles la reçoivent, ou elles
--    s'appuient sur une politique.
-- ============================================================================

-- ============================================================================
-- Table : le code d'invitation, porté par le profil
-- ============================================================================

-- Le code vit sur `profiles` plutôt que dans une table à part : il y en a
-- exactement un par personne, et une table d'une ligne par utilisateur ne
-- ferait qu'ajouter une jointure et un risque de désaccord.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS friend_code TEXT;

-- 10 caractères, sans I, L, O ni 0 : ces signes se confondent à la lecture ou
-- à la recopie d'un code dicté de vive voix (I/1, L/1, O/0).
--
-- L'alphabet fait EXACTEMENT 32 signes, et c'est une contrainte du générateur,
-- pas une coquetterie : `get_byte` rend un octet (0-255), et `% 32` en tire un
-- indice de 0 à 31. Avec 31 signes, l'indice 31 tombait un cran au-delà du
-- dernier caractère ; `substr` rendait alors la chaîne VIDE et le code sortait
-- à 9 caractères, une fois sur 32. Mesuré : 57 codes non conformes sur 200
-- tirages. C'est ce que la contrainte ci-dessous a attrapé — elle a bien
-- travaillé, et le défaut était dans le générateur.
--
--   lettres :  A B C D E F G H J K M N P Q R S T U V W X Y Z        (23)
--   chiffres : 1 2 3 4 5 6 7 8 9                                   ( 9)
--   total    : 32
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_friend_code_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_friend_code_format
  CHECK (friend_code IS NULL OR friend_code ~ '^[A-HJ-KM-NP-Z1-9]{10}$');

-- Unique, mais plusieurs NULL sont permis : un profil sans code reste valide,
-- et l'unicité n'est pas un index partiel qu'on pourrait oublier.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_friend_code_unique;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_friend_code_unique UNIQUE (friend_code);

-- ============================================================================
-- Table : la relation de suivi
-- ============================================================================

-- Une ligne = une paire, rangée dans un ordre canonique (petit identifiant
-- d'abord). C'est ce qui rend la réciprocité structurelle :
--
--   - la paire ne peut exister qu'une fois, quel que soit l'ordre de saisie
--     des deux identifiants (contrainte d'ordre ci-dessous) ;
--   - les politiques interrogent la table dans les deux sens (a = moi ou
--     b = moi), donc la même ligne ouvre les deux progressions.
--
-- Sans l'ordre canonique, (A,B) et (B,A) seraient deux lignes distinctes, et
-- l'on pourrait suivre quelqu'un sans être suivi de lui.
CREATE TABLE IF NOT EXISTS public.amis (
  user_a UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_b UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_a, user_b),
  CONSTRAINT amis_ordre_canonique CHECK (user_a < user_b),
  CONSTRAINT amis_pas_soi_meme CHECK (user_a <> user_b)
);

CREATE INDEX IF NOT EXISTS amis_user_b_idx ON public.amis (user_b);

ALTER TABLE public.amis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Politiques : on ne lit que ses propres relations
-- ============================================================================

DROP POLICY IF EXISTS "Amis : mes relations" ON public.amis;
CREATE POLICY "Amis : mes relations" ON public.amis
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

-- On ne s'ajoute pas soi-même, et l'on ne peut être que le côté A ou B de la
-- ligne qu'on écrit. Quelqu'un ne peut donc pas déclarer une relation à
-- laquelle il ne participe pas.
DROP POLICY IF EXISTS "Amis : je me declare" ON public.amis;
CREATE POLICY "Amis : je me declare" ON public.amis
  FOR INSERT WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

-- On peut rompre une relation à laquelle on participe. Symétriquement : rompre
-- la relation rompt les deux sens, puisqu'il n'y a qu'une ligne.
DROP POLICY IF EXISTS "Amis : je romps" ON public.amis;
CREATE POLICY "Amis : je romps" ON public.amis
  FOR DELETE USING (auth.uid() = user_a OR auth.uid() = user_b);

-- Aucune politique d'UPDATE : une relation ne se modifie pas, elle se crée ou
-- se rompt. Les colonnes sont de toute façon la clé primaire et une date.

-- ============================================================================
-- Le code d'invitation : le lire, le regénérer
-- ============================================================================

-- Le générateur de nombres aléatoires est pris à Postgres.
--
-- `gen_random_bytes` vient de pgcrypto. Supabase l'active par défaut, mais on
-- ne s'y fie pas, et le banc d'épreuve a montré pourquoi : PGlite ne l'a pas,
-- et l'échec remonte en 0A000 (`feature_not_supported`), une condition que
-- `undefined_file` ne couvre pas. Une liste de conditions trop étroite ferait
-- échouer TOUT le fichier — les tables ne seraient même pas créées — pour une
-- commodité dont on peut se passer.
--
-- D'où `WHEN OTHERS` : mieux vaut un code tiré par `random()` qu'une migration
-- morte. Un code d'invitation n'est pas un jeton de sécurité, c'est une adresse
-- à partager ; `random()` y suffit largement, et `gen_random_bytes` est utilisé
-- quand il est là.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto indisponible (%) : les codes d''invitation seront tires par random().', SQLERRM;
END;
$$;

-- Deux générateurs, choisis à l'exécution selon ce qui est réellement
-- disponible — et non selon ce qu'on suppose installé.
CREATE OR REPLACE FUNCTION public.octets_aleatoires(p_n INTEGER)
RETURNS BYTEA
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  BEGIN
    RETURN gen_random_bytes(p_n);
  EXCEPTION WHEN undefined_function THEN
    -- `md5` rend 16 octets : on en demande deux fois pour couvrir 10 signes,
    -- et l'on concatène de l'horloge pour que deux appels rapprochés ne
    -- tombent pas sur le même tirage.
    RETURN decode(
      md5(random()::text || clock_timestamp()::text) ||
      md5(random()::text || clock_timestamp()::text),
      'hex'
    );
  END;
END;
$$;

-- L'alphabet est exposé par une fonction, et ce n'est pas un ornement : il doit
-- faire exactement la taille du modulo employé par `generer_code_ami`, sinon le
-- tirage sort de la chaîne. Mesuré : 31 signes pour un modulo de 32 rendaient un
-- code vide une fois sur 32. Le banc d'épreuve appelle cette fonction pour
-- vérifier l'accord, au lieu de le croire sur parole.
CREATE OR REPLACE FUNCTION public.alphabet_code_ami()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'ABCDEFGHJKMNPQRSTUVWXYZ123456789'::text;
$$;

CREATE OR REPLACE FUNCTION public.generer_code_ami()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet TEXT := public.alphabet_code_ami();
  resultat TEXT := '';
  octets BYTEA;
  i INTEGER;
BEGIN
  octets := public.octets_aleatoires(10);

  -- `length(alphabet)` en diviseur, et non 32 écrit en dur : si quelqu'un
  -- retire un signe à l'alphabet, le tirage reste dans la chaîne. Le modulo
  -- cesse alors d'être une puissance de deux, ce qui introduit un biais de
  -- 1/256 — négligeable pour un code d'invitation, et de toute façon
  -- préférable à une chaîne vide.
  FOR i IN 0..9 LOOP
    resultat := resultat || substr(alphabet, (get_byte(octets, i) % length(alphabet)) + 1, 1);
  END LOOP;

  RETURN resultat;
END;
$$;

-- Le code est créé à la demande, et l'on repart quand on veut.
--
-- SECURITY DEFINER n'est pas nécessaire ici : la fonction n'écrit que dans
-- `profiles`, et la politique « Profiles updatable by owner » exige déjà
-- `auth.uid() = id`. L'autorisation reste donc dans la politique, une fois de
-- plus — et la fonction le DIT en prenant l'identifiant en paramètre plutôt
-- qu'en le lisant, exactement comme `remplacer_donnees`.
CREATE OR REPLACE FUNCTION public.obtenir_code_ami(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  existant TEXT;
  nouveau TEXT;
  essai INTEGER := 0;
  ecrites INTEGER;
BEGIN
  SELECT friend_code INTO existant FROM public.profiles WHERE id = p_user_id;
  IF existant IS NOT NULL THEN
    RETURN existant;
  END IF;

  -- Une collision sur 32^10 est improbable, mais « improbable » n'est pas
  -- « impossible », et elle ferait échouer l'inscription d'un utilisateur pour
  -- une raison qui ne le concerne pas. On réessaie.
  LOOP
    essai := essai + 1;
    nouveau := public.generer_code_ami();
    BEGIN
      UPDATE public.profiles SET friend_code = nouveau, updated_at = NOW()
      WHERE id = p_user_id;

      -- `UPDATE` sur zéro ligne n'est PAS une erreur, et c'est précisément le
      -- piège : appelée sur le profil d'un autre, cette fonction rendait un
      -- code parfaitement plausible — tiré au sort, bien formé — que la
      -- politique RLS venait de refuser d'écrire. L'écran l'affichait, et il
      -- ne menait à rien. Mesuré : le profil restait à `null` côté base, et le
      -- code rendu ne correspondait à aucune ligne.
      --
      -- C'est le seul endroit du fichier où l'on compte les lignes touchées.
      -- Ailleurs, l'autorisation est portée par la politique et le refus est
      -- visible dans le résultat ; ici, la fonction doit rendre une valeur, et
      -- une valeur doit être vraie.
      GET DIAGNOSTICS ecrites = ROW_COUNT;
      IF ecrites = 0 THEN
        RETURN NULL;
      END IF;

      RETURN nouveau;
    EXCEPTION WHEN unique_violation THEN
      IF essai >= 5 THEN
        RAISE EXCEPTION 'Impossible de generer un code unique apres 5 essais';
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.regenerer_code_ami(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  nouveau TEXT;
  essai INTEGER := 0;
  ecrites INTEGER;
BEGIN
  LOOP
    essai := essai + 1;
    nouveau := public.generer_code_ami();
    BEGIN
      UPDATE public.profiles SET friend_code = nouveau, updated_at = NOW()
      WHERE id = p_user_id;

      -- Même piège que dans `obtenir_code_ami`, et la même réponse : un code
      -- que la politique a refusé d'écrire ne doit pas être rendu. Régénérer
      -- le code d'autrui reviendrait sinon à invalider le sien à distance —
      -- tous ses amis potentiels se verraient répondre « aucun compte ne porte
      -- ce code », sans qu'il comprenne pourquoi.
      GET DIAGNOSTICS ecrites = ROW_COUNT;
      IF ecrites = 0 THEN
        RETURN NULL;
      END IF;

      RETURN nouveau;
    EXCEPTION WHEN unique_violation THEN
      IF essai >= 5 THEN
        RAISE EXCEPTION 'Impossible de generer un code unique apres 5 essais';
      END IF;
    END;
  END LOOP;
END;
$$;

-- ============================================================================
-- Ajouter un ami par son code
-- ============================================================================

-- Cette fonction est SECURITY DEFINER, et c'est le seul endroit du fichier où
-- c'est le cas. La raison est précise : pour trouver le porteur d'un code, il
-- faut lire `profiles`, dont la politique n'autorise que son propre profil.
-- Sans SECURITY DEFINER, chercher un ami serait impossible — on ne pourrait
-- pas voir la ligne qui contient le code.
--
-- Ce que cela ouvre, et comment c'est refermé :
--   - la fonction ne rend AUCUNE donnée du profil trouvé : ni nom, ni code,
--     rien. Seulement l'identifiant, qui sert à créer la relation ;
--   - elle ne cherche que par code exact, donc elle ne permet pas d'énumérer ;
--   - `SET search_path = public` est obligatoire sur une fonction SECURITY
--     DEFINER : sans lui, un schéma tiers pourrait redéfinir `profiles` et
--     détourner l'élévation de droits.
--
-- L'identité, elle, reste un paramètre : la fonction ne lit pas auth.uid().
-- L'appelant peut donc mentir sur son propre identifiant, mais la politique
-- d'insertion sur `amis` l'arrête — « Auth : je me declare » exige
-- auth.uid() = user_a OR auth.uid() = user_b. Un mensonge échoue en 42501.
-- C'est la politique qui porte l'autorisation, pas la fonction.
CREATE OR REPLACE FUNCTION public.ajouter_ami_par_code(p_user_id UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cible UUID;
  a UUID;
  b UUID;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Code d''invitation vide' USING ERRCODE = '22023';
  END IF;

  -- Le code se recopie à la main : on tolère la casse et les espaces autour,
  -- mais rien d'autre. Un code trop court ne peut pas exister, on le dit.
  SELECT id INTO cible
  FROM public.profiles
  WHERE friend_code = upper(trim(p_code));

  IF cible IS NULL THEN
    RAISE EXCEPTION 'Aucun compte ne porte ce code d''invitation'
      USING ERRCODE = 'P0002';
  END IF;

  IF cible = p_user_id THEN
    RAISE EXCEPTION 'On ne s''ajoute pas soi-même' USING ERRCODE = '22023';
  END IF;

  -- Ordre canonique : c'est la contrainte de la table, on la respecte ici.
  a := LEAST(p_user_id, cible);
  b := GREATEST(p_user_id, cible);

  INSERT INTO public.amis (user_a, user_b) VALUES (a, b)
  ON CONFLICT (user_a, user_b) DO NOTHING;

  RETURN cible;
END;
$$;

-- ============================================================================
-- Ce qu'un ami peut voir
-- ============================================================================

-- Les séances d'un ami deviennent lisibles *si et seulement si* une ligne de
-- `amis` le relie à moi. C'est ajouté aux politiques existantes, qui restent
-- en place : « Sessions self read » continue de s'appliquer, et Postgres
-- combine les politiques permissives par un OU. Rien n'est retiré.
--
-- La politique est SECURITY DEFINER indirectement : elle lit `public.amis`,
-- qui est elle-même protégée par RLS. Une politique qui interroge une table
-- protégée depuis une politique de cette même table provoquerait une récursion
-- (« infinite recursion detected in policy »), d'où un prédicat isolé dans une
-- fonction SECURITY DEFINER avec search_path figé.
CREATE OR REPLACE FUNCTION public.est_ami_avec(p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.amis
    WHERE (user_a = auth.uid() AND user_b = p_autre)
       OR (user_b = auth.uid() AND user_a = p_autre)
  );
$$;

DROP POLICY IF EXISTS "Sessions lues par un ami" ON public.learning_sessions;
CREATE POLICY "Sessions lues par un ami" ON public.learning_sessions
  FOR SELECT USING (public.est_ami_avec(user_id));

DROP POLICY IF EXISTS "Memorized lus par un ami" ON public.memorized_passages;
CREATE POLICY "Memorized lus par un ami" ON public.memorized_passages
  FOR SELECT USING (public.est_ami_avec(user_id));

-- Le profil d'un ami : on a besoin de son nom affiché et de son code, et de
-- rien d'autre. On ne peut pas, en revanche, modifier le profil d'un ami —
-- les politiques d'écriture existantes exigent auth.uid() = id, et « Amis »
-- n'ajoute qu'une lecture.
DROP POLICY IF EXISTS "Profils lisibles par un ami" ON public.profiles;
CREATE POLICY "Profils lisibles par un ami" ON public.profiles
  FOR SELECT USING (public.est_ami_avec(id));

-- ============================================================================
-- La synthèse : le point d'un ami, en une ligne
-- ============================================================================

-- Ce que rend cette fonction est exactement ce que le propriétaire a choisi
-- d'exposer : où en est l'ami, et combien il a appris cette semaine. Le
-- nombre de passages échus en révision n'y figure PAS, et ce n'est pas un
-- oubli : c'est la décision rappelée en tête de fichier.
--
-- SECURITY INVOKER (défaut) : la fonction lit les tables avec l'identité de
-- l'appelant, donc les politiques s'appliquent — y compris celle qui exige
-- d'être ami. Quelqu'un qui appelle cette fonction sur un inconnu obtient
-- zéro ligne, pas une erreur : c'est le comportement voulu, il ne doit pas
-- apprendre par un message d'erreur que le compte existe.
--
-- La date est un PARAMÈTRE, jamais NOW() : c'est ce qui permet au banc
-- d'épreuve de déplacer la semaine et de vérifier le calcul, au lieu de le
-- croire.
CREATE OR REPLACE FUNCTION public.point_d_un_ami(p_ami_id UUID, p_aujourdhui DATE)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  versets_cette_semaine INTEGER,
  pages_cette_semaine NUMERIC,
  derniere_seance DATE,
  derniere_sourate INTEGER,
  jours_d_etude_7j INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH debut_semaine AS (
    -- Semaine du lundi au dimanche : `date_trunc('week')` place le lundi
    -- premier, ce qui est la convention française et celle du calendrier
    -- scolaire. Le dimanche américain décalerait tout d'un jour.
    SELECT (date_trunc('week', p_aujourdhui::timestamp))::date AS lundi
  ),
  seances_semaine AS (
    SELECT s.* FROM public.learning_sessions s, debut_semaine d
    WHERE s.user_id = p_ami_id
      AND s.date >= d.lundi
      AND s.date <= p_aujourdhui
  )
  SELECT
    p_ami_id,
    COALESCE(pr.display_name, 'Un apprenant'),
    COALESCE((
      SELECT SUM(s.end_ayah - s.start_ayah + 1)::int
      FROM seances_semaine s WHERE s.status = 'done'
    ), 0),
    -- Les pages sont comptées en pages ÉQUIVALENTES, comme dans
    -- l'application : une demi-page vaut 0,5. Un simple nombre de pages
    -- touchées gonflerait le chiffre d'un facteur qui n'a pas de sens.
    COALESCE((
      SELECT ROUND(SUM((s.unit_json ->> 'count')::numeric) FILTER (
        WHERE s.unit_json ->> 'type' IN ('page', 'half_page')
      ), 1)
      FROM seances_semaine s WHERE s.status = 'done'
    ), 0),
    (SELECT MAX(s.date) FROM public.learning_sessions s WHERE s.user_id = p_ami_id),
    (SELECT s.surah FROM public.learning_sessions s
     WHERE s.user_id = p_ami_id ORDER BY s.date DESC, s.id DESC LIMIT 1),
    COALESCE((
      SELECT COUNT(DISTINCT s.date)::int FROM public.learning_sessions s
      WHERE s.user_id = p_ami_id AND s.status = 'done'
        AND s.date > p_aujourdhui - 7 AND s.date <= p_aujourdhui
    ), 0)
  FROM public.profiles pr
  WHERE pr.id = p_ami_id;
$$;

-- ============================================================================
-- Mes amis, avec leur point
-- ============================================================================

-- Une fonction plutôt qu'une jointure écrite dans l'application : elle évite
-- de faire remonter les lignes brutes de `amis` et de les recoller côté
-- client, où l'ordre canonique devrait être redéfait à la main.
--
-- L'identité est un PARAMÈTRE, et non `auth.uid()`. Ce n'est pas un choix de
-- style : `auth.uid()` dans un corps de fonction échoue en 42501 « permission
-- denied for schema auth », parce qu'un corps s'exécute avec les droits du
-- demandeur, qui n'a pas USAGE sur le schéma `auth`. Mesuré, sur cette
-- fonction même. Une POLITIQUE peut appeler auth.uid(), un corps non — c'est
-- la distinction que le projet applique partout ailleurs.
--
-- Cela n'ouvre rien : la fonction est SECURITY INVOKER, donc la politique de
-- `amis` s'applique. Un appelant qui nommerait une autre identité que la
-- sienne ne verrait que les relations de cette identité... c'est-à-dire rien,
-- puisque la politique, elle, lit le VRAI auth.uid() et filtre les lignes.
CREATE OR REPLACE FUNCTION public.mes_amis(p_moi UUID, p_aujourdhui DATE)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  versets_cette_semaine INTEGER,
  pages_cette_semaine NUMERIC,
  derniere_seance DATE,
  derniere_sourate INTEGER,
  jours_d_etude_7j INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT a.ami_id,
         (p).nom,
         (p).versets_cette_semaine,
         (p).pages_cette_semaine,
         (p).derniere_seance,
         (p).derniere_sourate,
         (p).jours_d_etude_7j
  FROM (
    SELECT CASE WHEN user_a = p_moi THEN user_b ELSE user_a END AS ami_id
    FROM public.amis
    WHERE user_a = p_moi OR user_b = p_moi
  ) a,
  LATERAL public.point_d_un_ami(a.ami_id, p_aujourdhui) p;
$$;

-- ============================================================================
-- Droits
-- ============================================================================

GRANT SELECT, INSERT, DELETE ON public.amis TO authenticated;
GRANT EXECUTE ON FUNCTION public.alphabet_code_ami() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.obtenir_code_ami(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerer_code_ami(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ajouter_ami_par_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_ami_avec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.point_d_un_ami(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_amis(UUID, DATE) TO authenticated;
