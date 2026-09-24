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
-- 1. UNE DEMANDE, PUIS UNE AMITIÉ. Saisir le code d'invitation de quelqu'un
--    n'établit plus la relation : cela lui ENVOIE une demande, qu'il accepte ou
--    refuse. La table `amis` ne contient donc que des liens acceptés.
--
--    C'est un changement de modèle, et il est assumé. La version précédente
--    créait le lien immédiatement : connaître un code suffisait à entrer dans
--    la progression de son porteur, sans qu'il ait rien accepté, et le code
--    devenait un secret dont la seule protection était de ne pas circuler. Le
--    code reste le moyen de TROUVER quelqu'un ; il n'est plus le moyen de
--    s'imposer à lui.
--
-- 2. LA RÉCIPROCITÉ RESTE STRUCTURELLE. Une ligne = une paire, rangée dans un
--    ordre canonique (`user_a < user_b`). Il n'existe pas d'amitié à sens
--    unique : c'est la seule forme où « je vois qui me voit » est vrai par
--    construction. La table `amis` ne change pas de forme ; c'est ce qui la
--    remplit qui change.
--
-- 3. BLOQUER EST UNILATÉRAL, ET BLOQUER ROMPT. `blocages` porte une FLÈCHE, pas
--    une paire : A bloque B, et cette seule flèche suffit. Bloquer rompt
--    l'amitié et efface les demandes en attente des deux côtés — il n'existe
--    donc pas d'état « je t'ai bloqué mais nous sommes encore amis ».
--
--    Le blocage n'a pas besoin d'une seconde mécanique pour tenir : la
--    discussion s'adosse à l'amitié (voir `discussions.sql`), donc rompre
--    l'amitié ferme le fil, et un utilisateur bloqué ne peut plus écrire. Ce
--    n'est PAS répété par une condition de plus dans la politique d'écriture
--    des messages : une garde qui ne peut jamais être fausse rassure sans
--    garder, et son épreuve passerait pour une raison qui n'est pas la sienne.
--
--    Ce que le bloqué voit : rien. Sa liste d'amis a perdu une ligne, sa
--    demande a disparu, ses envois échouent. Il n'apprend pas qu'il est
--    bloqué — le lui dire serait lui offrir une raison de recommencer
--    autrement.
--
-- 4. CE QU'UN AMI PEUT VOIR, ET CE QU'IL NE PEUT PAS. Un ami voit ce que son
--    ami a APPRIS : versets de la semaine, pages équivalentes, page courante,
--    sourate en cours, jours d'étude. Il ne voit PAS le nombre de passages
--    échus en révision : c'est le seul indicateur qui dit « je suis en retard »,
--    et le rendre visible changerait l'usage — on masquerait ses échecs plutôt
--    que de les travailler.
--
--    Et il ne le voit que si l'intéressé y consent : `partage_progression`.
--    Tant qu'il est faux, la fonction rend le nom et l'avatar, et des zéros
--    ACCOMPAGNÉS D'UN DRAPEAU (`partage = false`), jamais des zéros seuls —
--    l'écran doit pouvoir écrire « ne partage pas sa progression » plutôt que
--    « n'a pas encore commencé », qui serait un mensonge.
--
--    La valeur par défaut est VRAIE, et c'est délibéré : le suivi existait déjà
--    et partageait. Passer à faux par défaut aurait éteint en silence une
--    fonctionnalité en service — l'interrupteur est là, c'est à l'utilisateur
--    de s'en servir.
--
-- 5. L'IDENTIFIANT PUBLIC EST PUBLIC, LE CODE NE L'EST PAS. Deux façons d'être
--    trouvé, et elles ne disent pas la même chose :
--
--      - `friend_code` : 10 signes tirés au sort, SECRET. Le chercher ne rend
--        RIEN du profil — pas même le pseudonyme —, seulement de quoi envoyer
--        une demande. C'est ce qui permet de le dicter sans se dévoiler.
--
--      - `public_id` : choisi par l'utilisateur, UNIQUE, cherchable. Le
--        chercher rend le pseudonyme et l'avatar, parce que c'est sa raison
--        d'être : un identifiant public qui ne dirait rien ne servirait à rien.
--
--    L'adresse électronique et le téléphone ne sont exposés par aucun des deux :
--    ils ne figurent dans aucune colonne lue par ce fichier.
--
-- 6. L'AUTORISATION VIT DANS LES POLITIQUES, pas dans les corps de fonction.
--    Le projet a mesuré la différence : un corps de fonction s'exécute avec
--    les droits de l'appelant, qui n'a pas USAGE sur le schéma « auth », et
--    `auth.uid()` y échoue en 42501 au lieu de refuser proprement. Une
--    politique, elle, peut l'appeler.
--
--    Trois exceptions, nommées :
--      - les prédicats SECURITY DEFINER doivent voir plus que l'appelant pour
--        trancher, et tournent donc sous les droits du propriétaire, qui a
--        USAGE sur `auth` ;
--      - `demander_ami_par_code` et `rechercher_par_identifiant` doivent lire
--        `profiles`, dont la politique n'ouvre que son propre profil. La
--        première vérifie donc elle-même `auth.uid() = p_moi`, et c'est écrit
--        dans son corps ;
--      - les synthèses (`point_d_un_ami`, `mes_amis`) reçoivent l'identité en
--        PARAMÈTRE au lieu de la lire, pour la raison ci-dessus.
-- ============================================================================


-- ============================================================================
-- 1. Le profil public
--
-- Quatre colonnes, et pas une table : il y a exactement une ligne de profil par
-- personne, une table « profils publics » ne ferait qu'ajouter une jointure et
-- un risque de désaccord entre deux lignes qui devraient dire la même chose.
-- ============================================================================

-- L'identifiant public : choisi par l'utilisateur, cherchable, unique.
--
-- Le format est contraint en base et pas seulement à l'écran : une borne posée
-- dans l'interface se contourne en appelant l'API autrement. Trois signes au
-- minimum — en dessous, un identifiant n'est plus distinctif ; trente au plus —
-- au-delà, il ne se retient plus. Une lettre d'abord, pour qu'un identifiant ne
-- puisse pas se confondre avec un nombre.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_public_id_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_id_format
  CHECK (public_id IS NULL OR public_id ~ '^[a-z][a-z0-9_]{2,29}$');

-- Unique, mais plusieurs NULL sont permis : un profil sans identifiant public
-- reste valide, et l'on n'oblige personne à en choisir un. Sans identifiant,
-- on n'est simplement pas trouvable par ce chemin — le code d'invitation
-- continue de fonctionner.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_public_id_unique;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_public_id_unique UNIQUE (public_id);

-- L'avatar : une COULEUR, pas un fichier.
--
-- Le projet a pesé les deux. Un avatar-image suppose un compartiment de
-- stockage, ses politiques, un sélecteur d'images natif — une dépendance de
-- plus, et un service externe à configurer avant que la fonctionnalité ne
-- marche. Une couleur choisie dans un jeu fermé ne demande RIEN : elle marche
-- hors ligne, ne se modère pas, et l'écran dessine les initiales du pseudonyme
-- sur un disque de cette couleur. C'est un avatar, il est reconnaissable, et il
-- est disponible immédiatement.
--
-- La liste est fermée (`CHECK`), et volontairement courte : six teintes qui
-- tiennent sur les quatre palettes de l'application, du vert au bleu en
-- passant par le rose. Une teinte libre produirait des couples illisibles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_couleur TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_couleur_valide;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_couleur_valide
  CHECK (
    avatar_couleur IS NULL
    OR avatar_couleur IN ('vert', 'bleu', 'rose', 'or', 'ardoise', 'olive')
  );

-- Les deux consentements, et ils sont séparés parce qu'ils ne disent pas la
-- même chose : partager « où j'en suis » n'est pas partager « ce que je vise ».
--
-- `partage_progression` est VRAI par défaut (voir le point 4 de l'en-tête).
-- `partage_objectif` est FAUX par défaut : l'objectif est une intention, pas un
-- résultat, et rien n'oblige à l'annoncer pour utiliser le suivi.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partage_progression BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partage_objectif BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================================
-- 2. Le code d'invitation, porté par le profil
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
-- 3. La relation acceptée
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
-- 4. Les demandes
--
-- La table ne porte AUCUN état. Une demande existe, ou elle n'existe plus :
-- accepter l'efface et écrit la ligne d'amitié, refuser l'efface. Il n'y a donc
-- pas de colonne `statut` à tenir à jour, pas d'état intermédiaire qu'on
-- oublierait de nettoyer, et pas de demande « acceptée » qui traînerait encore
-- dans une boîte de réception.
-- ============================================================================

-- Le SENS compte ici, contrairement à `amis` : « reçue » et « envoyée » ne sont
-- pas la même chose, et l'écran les range dans deux sections différentes. D'où
-- une paire ORDONNÉE (de, vers) au lieu d'une paire canonique.
--
-- Les deux colonnes sont donc bien `de` et `vers`, et non `user_a`/`user_b` :
-- reprendre les noms de `amis` aurait laissé croire à un ordre canonique, qui
-- est exactement ce qu'il ne faut pas ici.
CREATE TABLE IF NOT EXISTS public.demandes_amis (
  de UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vers UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (de, vers),
  CONSTRAINT demandes_amis_pas_soi_meme CHECK (de <> vers)
);

-- L'index de la boîte de réception : on lit « ce qu'on m'a envoyé », donc par
-- `vers`. La clé primaire couvre déjà `de`, et l'index ci-dessus `vers`.
CREATE INDEX IF NOT EXISTS demandes_amis_vers_idx ON public.demandes_amis (vers);

ALTER TABLE public.demandes_amis ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 5. Les blocages
--
-- Une FLÈCHE, et non une paire : A bloque B n'est pas B bloque A. Ranger les
-- deux identifiants dans un ordre canonique, comme pour `amis`, aurait
-- exactement dit le contraire de ce qu'on veut.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocages (
  bloque_par UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bloque UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bloque_par, bloque),
  CONSTRAINT blocages_pas_soi_meme CHECK (bloque_par <> bloque)
);

-- L'index du sens inverse : « qui m'a bloqué » n'est pas exposé aujourd'hui,
-- mais la question « suis-je bloqué par cette personne ? » se pose à chaque
-- demande d'ami, et elle se lit par `bloque`.
CREATE INDEX IF NOT EXISTS blocages_bloque_idx ON public.blocages (bloque);

ALTER TABLE public.blocages ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 6. Les prédicats
--
-- Tous SECURITY DEFINER, pour la même raison que `est_ami_avec` : ils lisent
-- des tables protégées, et une politique qui interroge une autre table
-- protégée s'exécute sous les droits de l'appelant — d'où, quand la table lue
-- a elle-même des politiques, un « infinite recursion detected in policy ». Le
-- remède mesuré sur ce projet est une fonction SECURITY DEFINER à `search_path`
-- figé.
--
-- Chacun est écrit en UN exemplaire, alors qu'il pourrait être recopié dans
-- chaque politique : trois politiques qui portent trois fois la même condition
-- est exactement la forme où l'une des trois finit par diverger.
-- ============================================================================

-- L'amitié, telle qu'elle existait déjà. Inchangée.
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

-- « Ai-je bloqué cette personne ? » — ASYMÉTRIQUE, et c'est le point.
--
-- Elle sert à ouvrir le profil de quelqu'un QU'ON A bloqué : on sait qui on a
-- bloqué, et une liste de blocages sans nom serait inutilisable. L'inverse est
-- faux : celui qui est bloqué ne voit rien de celui qui l'a bloqué.
CREATE OR REPLACE FUNCTION public.je_bloque(p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocages
    WHERE bloque_par = auth.uid() AND bloque = p_autre
  );
$$;

-- « Y a-t-il un blocage entre nous, dans un sens ou dans l'autre ? »
--
-- Symétrique, celle-là, et c'est ce qu'il faut pour interdire : une demande
-- d'ami ne passe ni dans le sens du blocage, ni dans l'autre. Sans cette
-- symétrie, la personne bloquée pourrait envoyer une demande et se retrouver
-- dans la boîte de réception de quelqu'un qui ne veut plus la voir.
CREATE OR REPLACE FUNCTION public.est_bloque_avec(p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocages
    WHERE (bloque_par = auth.uid() AND bloque = p_autre)
       OR (bloque_par = p_autre AND bloque = auth.uid())
  );
$$;

-- Une demande est en attente, dans un sens ou dans l'autre.
CREATE OR REPLACE FUNCTION public.demande_pendante_avec(p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.demandes_amis
    WHERE (de = auth.uid() AND vers = p_autre)
       OR (de = p_autre AND vers = auth.uid())
  );
$$;

-- « Y a-t-il un LIEN entre nous ? » — le prédicat qui ouvre la lecture d'un
-- profil. Trois liens, et chacun a sa raison :
--
--   - ami : le cas normal, on voit le profil de ses amis ;
--   - demande en attente : on vient d'envoyer une demande à quelqu'un, ou on
--     vient d'en recevoir une, et il faut bien afficher de qui il s'agit.
--     Sans ce cas, la boîte de réception serait une liste d'identifiants
--     anonymes ;
--   - je l'ai bloqué : pour que la liste de blocages porte des noms.
--
-- Ce qui n'y est PAS : « il m'a bloqué ». La personne bloquée ne doit pas
-- pouvoir lire le profil de celui qui l'a bloquée — c'est le sens même du
-- blocage, et c'est la seule asymétrie de ce prédicat.
CREATE OR REPLACE FUNCTION public.lien_avec(p_autre UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.est_ami_avec(p_autre)
      OR public.demande_pendante_avec(p_autre)
      OR public.je_bloque(p_autre);
$$;

-- « Puis-je demander cette personne en ami ? » — la règle, en un seul endroit,
-- partagée par la politique d'insertion et par les fonctions qui envoient une
-- demande. Écrite une fois, elle ne peut pas diverger d'elle-même.
CREATE OR REPLACE FUNCTION public.peut_demander(p_cible UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND p_cible IS NOT NULL
     AND p_cible <> auth.uid()
     AND NOT public.est_ami_avec(p_cible)
     AND NOT public.est_bloque_avec(p_cible);
$$;


-- ============================================================================
-- 7. Les politiques
-- ============================================================================

-- --- La relation acceptée --------------------------------------------------

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

-- --- Les demandes ----------------------------------------------------------

-- Je vois celles que j'ai envoyées et celles qu'on m'a envoyées.
DROP POLICY IF EXISTS "Demandes : ma boite" ON public.demandes_amis;
CREATE POLICY "Demandes : ma boite" ON public.demandes_amis
  FOR SELECT TO authenticated
  USING (auth.uid() = de OR auth.uid() = vers);

-- Je retire la mienne (annuler) ou celle qu'on m'a faite (refuser) : dans les
-- deux cas, la demande disparaît sans laisser de trace, parce qu'une demande
-- n'est pas un événement à conserver — c'est une question en attente de
-- réponse, et une question sans réponse n'a pas d'histoire.
DROP POLICY IF EXISTS "Demandes : je reponds ou je retire" ON public.demandes_amis;
CREATE POLICY "Demandes : je reponds ou je retire" ON public.demandes_amis
  FOR DELETE TO authenticated
  USING (auth.uid() = de OR auth.uid() = vers);

-- AUCUNE politique d'INSERTION, et c'est délibéré.
--
-- Une demande ne s'écrit pas directement : elle s'ENVOIE par un geste, qui
-- résout d'abord le code ou l'identifiant public, puis vérifie `peut_demander`.
-- Laisser une insertion ouverte permettrait d'écrire une demande vers
-- n'importe quel identifiant deviné, en contournant les deux vérifications.
--
-- Les deux gestes (`demander_ami_par_code`, `demander_ami_par_identifiant`)
-- sont SECURITY DEFINER — ils doivent lire `profiles` — et écrivent donc sans
-- passer par une politique. C'est `peut_demander` qui les garde, et il est
-- appelé par les deux.

-- --- Les blocages ----------------------------------------------------------

-- Je vois qui J'AI bloqué, et personne d'autre. Celui qui est bloqué ne voit
-- pas la ligne : c'est ce qui fait qu'un blocage ne se renseigne pas.
DROP POLICY IF EXISTS "Blocages : ceux que j'ai bloques" ON public.blocages;
CREATE POLICY "Blocages : ceux que j'ai bloques" ON public.blocages
  FOR SELECT TO authenticated
  USING (auth.uid() = bloque_par);

DROP POLICY IF EXISTS "Blocages : je bloque" ON public.blocages;
CREATE POLICY "Blocages : je bloque" ON public.blocages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = bloque_par AND bloque_par <> bloque);

DROP POLICY IF EXISTS "Blocages : je debloque" ON public.blocages;
CREATE POLICY "Blocages : je debloque" ON public.blocages
  FOR DELETE TO authenticated
  USING (auth.uid() = bloque_par);

-- Aucune politique d'UPDATE : on bloque, ou on débloque. Une ligne de blocage
-- n'a rien d'autre à dire.


-- ============================================================================
-- 8. Ce qu'un ami peut voir
-- ============================================================================

-- Les séances d'un ami deviennent lisibles *si et seulement si* une ligne de
-- `amis` le relie à moi. C'est ajouté aux politiques existantes, qui restent
-- en place : « Sessions self read » continue de s'appliquer, et Postgres
-- combine les politiques permissives par un OU. Rien n'est retiré.
DROP POLICY IF EXISTS "Sessions lues par un ami" ON public.learning_sessions;
CREATE POLICY "Sessions lues par un ami" ON public.learning_sessions
  FOR SELECT USING (public.est_ami_avec(user_id));

DROP POLICY IF EXISTS "Memorized lus par un ami" ON public.memorized_passages;
CREATE POLICY "Memorized lus par un ami" ON public.memorized_passages
  FOR SELECT USING (public.est_ami_avec(user_id));

-- Le profil d'un LIEN : un ami, une demande en attente, ou quelqu'un que j'ai
-- bloqué. Voir `lien_avec` pour la raison de chacun des trois cas.
--
-- On ne peut pas, en revanche, MODIFIER le profil d'un autre — les politiques
-- d'écriture existantes exigent auth.uid() = id, et celle-ci n'ajoute qu'une
-- lecture.
--
-- L'ancien nom de cette politique (« Profils lisibles par un ami ») est
-- abandonné : elle ne dit plus seulement « un ami », et un nom qui survit à son
-- sens est un nom qui trompe.
DROP POLICY IF EXISTS "Profils lisibles par un ami" ON public.profiles;
DROP POLICY IF EXISTS "Profils lisibles par un lien" ON public.profiles;
CREATE POLICY "Profils lisibles par un lien" ON public.profiles
  FOR SELECT USING (public.lien_avec(id));


-- ============================================================================
-- 9. Les gestes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Envoyer une demande par le code d'invitation
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER, et c'est nécessaire : pour trouver le porteur d'un code, il
-- faut lire `profiles`, dont la politique n'autorise que son propre profil.
-- Sans cela, chercher un ami serait impossible — on ne pourrait pas voir la
-- ligne qui contient le code.
--
-- Ce que cela ouvre, et comment c'est refermé :
--   - la fonction ne rend AUCUNE donnée du profil trouvé : ni nom, ni code,
--     ni identifiant public. Seulement l'identifiant technique, qui sert à
--     envoyer la demande. C'est ce qui permet de dicter son code sans se
--     dévoiler ;
--   - elle ne cherche que par code exact, donc elle ne permet pas d'énumérer ;
--   - `SET search_path = public` est obligatoire sur une fonction SECURITY
--     DEFINER : sans lui, un schéma tiers pourrait redéfinir `profiles` et
--     détourner l'élévation de droits ;
--   - l'identité, elle, est un PARAMÈTRE — la fonction ne pourrait pas lire
--     `auth.uid()` sans le droit d'usage sur le schéma `auth`… sauf qu'étant
--     SECURITY DEFINER, elle l'a. Elle compare donc `p_moi` à `auth.uid()` et
--     refuse si les deux diffèrent. C'est la garde qui remplace la politique,
--     puisque l'écriture en SECURITY DEFINER ne passe pas par RLS.
--
-- L'ancienne fonction `ajouter_ami_par_code` est retirée : son nom disait
-- « ajouter un ami », et elle n'ajoute plus rien — elle demande.
DROP FUNCTION IF EXISTS public.ajouter_ami_par_code(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.demander_ami_par_code(p_moi UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cible UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas agir au nom de quelqu''un d''autre.'
      USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RAISE EXCEPTION 'Code d''invitation vide' USING ERRCODE = '22023';
  END IF;

  -- Le code se recopie à la main : on tolère la casse et les espaces autour,
  -- mais rien d'autre.
  SELECT id INTO cible
  FROM public.profiles
  WHERE friend_code = upper(trim(p_code));

  IF cible IS NULL THEN
    RAISE EXCEPTION 'Aucun compte ne porte ce code d''invitation'
      USING ERRCODE = 'P0002';
  END IF;

  IF cible = p_moi THEN
    RAISE EXCEPTION 'On ne s''ajoute pas soi-même' USING ERRCODE = '22023';
  END IF;

  -- Déjà amis : c'est un conflit, pas une erreur de saisie. Le code 23505 est
  -- celui qu'un index unique aurait levé, et l'écran sait déjà le lire.
  IF public.est_ami_avec(cible) THEN
    RAISE EXCEPTION 'Vous êtes déjà amis' USING ERRCODE = '23505';
  END IF;

  IF public.est_bloque_avec(cible) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas envoyer de demande à ce compte.'
      USING ERRCODE = '42501';
  END IF;

  -- `DO NOTHING` : renvoyer deux fois le même code ne crée pas deux demandes,
  -- et ne produit pas d'erreur. C'est le cas normal d'un utilisateur qui
  -- appuie deux fois.
  INSERT INTO public.demandes_amis (de, vers) VALUES (p_moi, cible)
  ON CONFLICT (de, vers) DO NOTHING;

  RETURN cible;
END;
$$;

-- ----------------------------------------------------------------------------
-- Envoyer une demande par l'identifiant public
-- ----------------------------------------------------------------------------
--
-- Même geste, autre chemin. Les deux existent parce qu'ils ne disent pas la
-- même chose : le code est un secret qu'on se transmet, l'identifiant public
-- est une adresse qu'on affiche.
--
-- Mêmes gardes, mêmes codes d'erreur — et une seule différence : la recherche
-- porte sur `public_id`, normalisé en minuscules.
CREATE OR REPLACE FUNCTION public.demander_ami_par_identifiant(p_moi UUID, p_identifiant TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  cible UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas agir au nom de quelqu''un d''autre.'
      USING ERRCODE = '42501';
  END IF;

  IF p_identifiant IS NULL OR length(trim(p_identifiant)) = 0 THEN
    RAISE EXCEPTION 'Identifiant vide' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO cible
  FROM public.profiles
  WHERE public_id = lower(ltrim(trim(p_identifiant), '@'));

  IF cible IS NULL THEN
    RAISE EXCEPTION 'Aucun compte ne porte cet identifiant'
      USING ERRCODE = 'P0002';
  END IF;

  IF cible = p_moi THEN
    RAISE EXCEPTION 'On ne s''ajoute pas soi-même' USING ERRCODE = '22023';
  END IF;

  IF public.est_ami_avec(cible) THEN
    RAISE EXCEPTION 'Vous êtes déjà amis' USING ERRCODE = '23505';
  END IF;

  IF public.est_bloque_avec(cible) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas envoyer de demande à ce compte.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.demandes_amis (de, vers) VALUES (p_moi, cible)
  ON CONFLICT (de, vers) DO NOTHING;

  RETURN cible;
END;
$$;

-- ----------------------------------------------------------------------------
-- Répondre à une demande : accepter, ou refuser
-- ----------------------------------------------------------------------------
--
-- Les deux issues sont dans une seule fonction parce qu'elles sont le même
-- geste vu de deux côtés — et parce qu'accepter demande d'écrire la relation
-- ET d'effacer la demande, ce qui doit être atomique : une interruption entre
-- les deux laisserait une amitié avec une demande en attente, c'est-à-dire un
-- état que rien dans l'application ne sait afficher.
--
-- SECURITY INVOKER, et l'autorisation reste donc dans les politiques : c'est
-- `p_de` qui décide de la ligne écrite, mais c'est `auth.uid()` qui décide du
-- droit de l'écrire. Un appelant qui nommerait quelqu'un d'autre comme
-- destinataire verrait ses deux écritures refusées en 42501.
--
-- L'identité est un PARAMÈTRE (`p_moi`) et non `auth.uid()` lu dans le corps :
-- un corps SECURITY INVOKER n'a pas USAGE sur le schéma `auth`, et l'appel y
-- échoue en 42501. C'est la règle mesurée de ce projet, appliquée ici comme
-- partout ailleurs.
CREATE OR REPLACE FUNCTION public.repondre_demande_ami(
  p_moi UUID,
  p_de UUID,
  p_accepter BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ecrites INTEGER;
BEGIN
  IF p_moi IS NULL OR p_de IS NULL OR p_moi = p_de THEN
    RAISE EXCEPTION 'Demande invalide' USING ERRCODE = '22023';
  END IF;

  IF p_accepter THEN
    -- IL FAUT QU'UNE DEMANDE EXISTE, et cette garde n'est pas décorative.
    --
    -- Sans elle, la politique d'insertion de `amis` (« auth.uid() = user_a OR
    -- auth.uid() = user_b ») acceptait d'elle-même la paire (p_moi, p_de) : un
    -- appelant qui nommait un inconnu se liait à lui sans qu'aucune demande
    -- n'ait jamais été faite. La politique ne pouvait pas le voir — elle ne
    -- connaît que la ligne écrite, pas l'histoire qui l'a précédée.
    --
    -- La lecture ci-dessous passe par la POLITIQUE de `demandes_amis`, qui
    -- n'ouvre la ligne qu'à ses deux parties : quelqu'un qui nomme une demande
    -- à laquelle il ne participe pas lit zéro ligne, et la fonction rend
    -- `false`. L'autorisation reste donc dans la politique, comme partout
    -- ailleurs dans ce fichier.
    IF NOT EXISTS (
      SELECT 1 FROM public.demandes_amis WHERE de = p_de AND vers = p_moi
    ) THEN
      RETURN FALSE;
    END IF;

    -- Accepter une demande de quelqu'un qu'on a bloqué entre-temps n'a pas de
    -- sens. Le blocage a déjà effacé la demande, donc le cas est improbable —
    -- mais « improbable » n'est pas « impossible », et accepter recréerait
    -- l'amitié que le blocage venait de rompre.
    IF public.est_bloque_avec(p_de) THEN
      RETURN FALSE;
    END IF;

    INSERT INTO public.amis (user_a, user_b)
    VALUES (LEAST(p_moi, p_de), GREATEST(p_moi, p_de))
    ON CONFLICT (user_a, user_b) DO NOTHING;

    GET DIAGNOSTICS ecrites = ROW_COUNT;

    -- Les deux demandes croisées tombent, s'il y en avait deux : accepter
    -- laisse une amitié, jamais une amitié PLUS une demande en attente.
    DELETE FROM public.demandes_amis
     WHERE (de = p_de AND vers = p_moi)
        OR (de = p_moi AND vers = p_de);

    -- `ecrites = 0` signifie « déjà amis » : l'amitié existait, et l'insertion
    -- n'a rien ajouté. Ce n'est pas un échec — c'est le résultat demandé.
    RETURN TRUE;
  END IF;

  -- Refuser : la demande disparaît. La politique de suppression exige d'être
  -- partie à la ligne, donc un appelant ne peut effacer que la sienne ou une
  -- demande qui lui est adressée.
  DELETE FROM public.demandes_amis WHERE de = p_de AND vers = p_moi;
  GET DIAGNOSTICS ecrites = ROW_COUNT;
  RETURN ecrites > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Annuler une demande qu'on a envoyée
-- ----------------------------------------------------------------------------
--
-- Même écriture que « refuser », vue de l'autre côté : c'est le même `DELETE`,
-- avec la même politique. Les deux fonctions existent parce que les deux gestes
-- ne s'appellent pas pareil à l'écran, et qu'un écran qui dit « annuler » en
-- appelant « refuser » finit par se tromper de côté.
CREATE OR REPLACE FUNCTION public.annuler_demande_ami(p_moi UUID, p_vers UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ecrites INTEGER;
BEGIN
  DELETE FROM public.demandes_amis WHERE de = p_moi AND vers = p_vers;
  GET DIAGNOSTICS ecrites = ROW_COUNT;
  RETURN ecrites > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Bloquer, débloquer
-- ----------------------------------------------------------------------------
--
-- SECURITY INVOKER, et les trois écritures passent par les politiques : elles
-- exigent toutes d'être partie à la ligne touchée. Un appelant qui nommerait
-- un autre que lui comme auteur du blocage serait refusé en 42501 dès la
-- première instruction, et la transaction entière tomberait — donc aucune des
-- trois ne s'appliquerait.
--
-- L'ordre compte : le blocage d'abord, la rupture ensuite. Si l'identité est
-- fausse, on échoue avant d'avoir rompu quoi que ce soit.
--
-- Ce que bloquer efface, et pourquoi :
--   - la ligne d'amitié, s'il y en avait une — c'est ce qui ferme la
--     discussion, puisque le fil s'adosse à l'amitié ;
--   - les demandes en attente, dans les deux sens — sinon une demande
--     attendrait dans la boîte de quelqu'un qui ne veut plus rien recevoir.
--
-- Ce que bloquer NE fait PAS : supprimer des messages. Ils restent, lisibles
-- par la modération, comme après une simple rupture.
CREATE OR REPLACE FUNCTION public.bloquer_utilisateur(p_moi UUID, p_cible UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_moi IS NULL OR p_cible IS NULL OR p_moi = p_cible THEN
    RAISE EXCEPTION 'On ne se bloque pas soi-même' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.blocages (bloque_par, bloque) VALUES (p_moi, p_cible)
  ON CONFLICT (bloque_par, bloque) DO NOTHING;

  DELETE FROM public.amis
   WHERE user_a = LEAST(p_moi, p_cible) AND user_b = GREATEST(p_moi, p_cible);

  DELETE FROM public.demandes_amis
   WHERE (de = p_moi AND vers = p_cible)
      OR (de = p_cible AND vers = p_moi);

  RETURN TRUE;
END;
$$;

-- Débloquer ne RECRÉE PAS l'amitié, et c'est un choix, pas un oubli. Le lien
-- s'était rompu au moment du blocage ; le rétablir d'un geste rendrait le
-- blocage réversible en un geste par la personne qui l'a posé, et ferait
-- réapparaître une relation que l'autre n'a jamais acceptée à nouveau. Il faut
-- donc redemander, et être accepté.
CREATE OR REPLACE FUNCTION public.debloquer_utilisateur(p_moi UUID, p_cible UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  ecrites INTEGER;
BEGIN
  DELETE FROM public.blocages WHERE bloque_par = p_moi AND bloque = p_cible;
  GET DIAGNOSTICS ecrites = ROW_COUNT;
  RETURN ecrites > 0;
END;
$$;

-- ----------------------------------------------------------------------------
-- Chercher par identifiant public
-- ----------------------------------------------------------------------------
--
-- SECURITY DEFINER : `profiles` n'ouvre, par politique, que son propre profil
-- et celui de ses liens. Chercher quelqu'un dont on ne sait encore rien exige
-- donc de passer outre — et c'est précisément ce qu'un identifiant PUBLIC
-- autorise.
--
-- Ce que la fonction rend : de quoi se reconnaître (identifiant, pseudonyme,
-- couleur d'avatar) et de quoi décider (déjà ami, demande en cours). Rien
-- d'autre. Ni le code d'invitation, ni l'adresse électronique, ni le moindre
-- chiffre de progression — un identifiant public rend visible, il ne rend pas
-- transparent.
--
-- Elle ne rend rien si l'un des deux a bloqué l'autre, et rien si l'on se
-- cherche soi-même : dans les deux cas, il n'y a pas de demande possible.
CREATE OR REPLACE FUNCTION public.rechercher_par_identifiant(p_identifiant TEXT)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  identifiant_public TEXT,
  avatar_couleur TEXT,
  deja_ami BOOLEAN,
  demande_envoyee BOOLEAN,
  demande_recue BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  propre TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  propre := lower(ltrim(trim(COALESCE(p_identifiant, '')), '@'));
  IF length(propre) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pr.id,
    COALESCE(pr.display_name, 'Un apprenant'),
    pr.public_id,
    pr.avatar_couleur,
    public.est_ami_avec(pr.id),
    EXISTS (SELECT 1 FROM public.demandes_amis d WHERE d.de = auth.uid() AND d.vers = pr.id),
    EXISTS (SELECT 1 FROM public.demandes_amis d WHERE d.de = pr.id AND d.vers = auth.uid())
  FROM public.profiles pr
  WHERE pr.public_id = propre
    AND pr.id <> auth.uid()
    AND NOT public.est_bloque_avec(pr.id);
END;
$$;


-- ============================================================================
-- 10. La synthèse
-- ============================================================================

-- Ce que rend cette fonction est exactement ce que le propriétaire a choisi
-- d'exposer : où en est l'ami, et combien il a appris cette semaine. Le nombre
-- de passages échus en révision n'y figure PAS, et ce n'est pas un oubli :
-- c'est la décision rappelée en tête de fichier.
--
-- Et il n'est rendu que si l'intéressé partage. `partage = false` accompagne
-- toujours les zéros : sans ce drapeau, l'écran ne pourrait pas distinguer
-- « ne partage pas » de « n'a rien fait », et écrirait la seconde phrase pour
-- dire la première.
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
--
-- La signature de retour change (deux colonnes de plus) : `CREATE OR REPLACE`
-- ne sait pas changer un type de retour, la fonction est donc retirée d'abord.
-- `mes_amis` en dépend, et tombe avec elle — recréée juste après.
DROP FUNCTION IF EXISTS public.mes_amis(UUID, DATE);
DROP FUNCTION IF EXISTS public.point_d_un_ami(UUID, DATE);

CREATE OR REPLACE FUNCTION public.point_d_un_ami(p_ami_id UUID, p_aujourdhui DATE)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  identifiant_public TEXT,
  avatar_couleur TEXT,
  partage BOOLEAN,
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
  -- La ligne du profil est lue, et non sous-entendue : c'est ELLE qui décide
  -- s'il y a un résultat. La politique « Profils lisibles par un lien » filtre
  -- cette lecture, donc quelqu'un qui n'a aucun lien avec `p_ami_id` obtient
  -- ZÉRO ligne — et non une ligne de zéros, qui lui apprendrait que le compte
  -- existe. Écrire la fonction sans `FROM` rendait une ligne à tout le monde :
  -- c'est exactement le défaut que le banc a attrapé.
  SELECT
    p_ami_id,
    COALESCE(pr.display_name, 'Un apprenant'),
    pr.public_id,
    pr.avatar_couleur,
    -- `COALESCE` vers VRAI : une ligne de profil absente ne doit pas éteindre
    -- le partage par accident. Le défaut de la colonne est vrai, et le défaut
    -- de lecture doit dire la même chose.
    COALESCE(pr.partage_progression, TRUE),
    CASE WHEN COALESCE(pr.partage_progression, TRUE) THEN
      COALESCE((
        SELECT SUM(s.end_ayah - s.start_ayah + 1)::int
        FROM seances_semaine s WHERE s.status = 'done'
      ), 0)
    ELSE 0 END,
    -- Les pages sont comptées en pages ÉQUIVALENTES, comme dans
    -- l'application : une demi-page vaut 0,5. Un simple nombre de pages
    -- touchées gonflerait le chiffre d'un facteur qui n'a pas de sens.
    CASE WHEN COALESCE(pr.partage_progression, TRUE) THEN
      COALESCE((
        SELECT ROUND(SUM((s.unit_json ->> 'count')::numeric) FILTER (
          WHERE s.unit_json ->> 'type' IN ('page', 'half_page')
        ), 1)
        FROM seances_semaine s WHERE s.status = 'done'
      ), 0)
    ELSE 0 END,
    CASE WHEN COALESCE(pr.partage_progression, TRUE) THEN
      (SELECT MAX(s.date) FROM public.learning_sessions s WHERE s.user_id = p_ami_id)
    ELSE NULL END,
    CASE WHEN COALESCE(pr.partage_progression, TRUE) THEN
      (SELECT s.surah FROM public.learning_sessions s
       WHERE s.user_id = p_ami_id ORDER BY s.date DESC, s.id DESC LIMIT 1)
    ELSE NULL END,
    CASE WHEN COALESCE(pr.partage_progression, TRUE) THEN
      COALESCE((
        SELECT COUNT(DISTINCT s.date)::int FROM public.learning_sessions s
        WHERE s.user_id = p_ami_id AND s.status = 'done'
          AND s.date > p_aujourdhui - 7 AND s.date <= p_aujourdhui
      ), 0)
    ELSE 0 END
  FROM public.profiles pr
  WHERE pr.id = p_ami_id;
$$;

-- Une fonction plutôt qu'une jointure écrite dans l'application : elle évite
-- de faire remonter les lignes brutes de `amis` et de les recoller côté
-- client, où l'ordre canonique devrait être défait à la main.
--
-- L'identité est un PARAMÈTRE, et non `auth.uid()`. Ce n'est pas un choix de
-- style : `auth.uid()` dans un corps de fonction échoue en 42501 « permission
-- denied for schema auth », parce qu'un corps s'exécute avec les droits du
-- demandeur, qui n'a pas USAGE sur le schéma `auth`. Mesuré, sur cette
-- fonction même. Une POLITIQUE peut appeler auth.uid(), un corps non.
--
-- Cela n'ouvre rien : la fonction est SECURITY INVOKER, donc la politique de
-- `amis` s'applique. Un appelant qui nommerait une autre identité que la
-- sienne ne verrait que les relations de cette identité... c'est-à-dire rien,
-- puisque la politique, elle, lit le VRAI auth.uid() et filtre les lignes.
CREATE OR REPLACE FUNCTION public.mes_amis(p_moi UUID, p_aujourdhui DATE)
RETURNS TABLE (
  user_id UUID,
  nom TEXT,
  identifiant_public TEXT,
  avatar_couleur TEXT,
  partage BOOLEAN,
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
         (p).identifiant_public,
         (p).avatar_couleur,
         (p).partage,
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

-- Les demandes, dans les deux sens, avec de quoi les afficher.
--
-- `recue` dit de quel côté on est : c'est ce qui permet à l'écran de ranger la
-- même ligne dans « Reçues » ou dans « Envoyées » sans recalculer la
-- comparaison. Un booléen rendu par la base vaut mieux qu'une comparaison
-- refaite dans trois écrans.
--
-- SECURITY INVOKER : les politiques de `demandes_amis` et de `profiles`
-- s'appliquent. La seconde ouvre le profil d'un lien en attente, ce qui est
-- exactement le cas de chaque ligne rendue ici.
CREATE OR REPLACE FUNCTION public.mes_demandes(p_moi UUID)
RETURNS TABLE (
  demandeur UUID,
  destinataire UUID,
  nom TEXT,
  identifiant_public TEXT,
  avatar_couleur TEXT,
  created_at TIMESTAMPTZ,
  recue BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    d.de,
    d.vers,
    COALESCE(pr.display_name, 'Un apprenant'),
    pr.public_id,
    pr.avatar_couleur,
    d.created_at,
    (d.vers = p_moi) AS recue
  FROM public.demandes_amis d
  JOIN public.profiles pr
    ON pr.id = CASE WHEN d.de = p_moi THEN d.vers ELSE d.de END
  WHERE d.de = p_moi OR d.vers = p_moi
  ORDER BY d.created_at DESC;
$$;

-- Ceux que j'ai bloqués, pour pouvoir les débloquer.
CREATE OR REPLACE FUNCTION public.mes_blocages(p_moi UUID)
RETURNS TABLE (
  bloque UUID,
  nom TEXT,
  identifiant_public TEXT,
  avatar_couleur TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.bloque,
    COALESCE(pr.display_name, 'Un apprenant'),
    pr.public_id,
    pr.avatar_couleur,
    b.created_at
  FROM public.blocages b
  JOIN public.profiles pr ON pr.id = b.bloque
  WHERE b.bloque_par = p_moi
  ORDER BY b.created_at DESC;
$$;


-- ============================================================================
-- Droits
-- ============================================================================

GRANT SELECT, INSERT, DELETE ON public.amis TO authenticated;
-- Pas d'INSERT sur `demandes_amis` : une demande s'envoie par un geste, jamais
-- par une écriture directe. Voir la politique correspondante pour la raison.
GRANT SELECT, DELETE ON public.demandes_amis TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.blocages TO authenticated;

GRANT EXECUTE ON FUNCTION public.alphabet_code_ami() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.obtenir_code_ami(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.regenerer_code_ami(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_ami_avec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.je_bloque(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.est_bloque_avec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demande_pendante_avec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lien_avec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peut_demander(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demander_ami_par_code(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demander_ami_par_identifiant(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repondre_demande_ami(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_demande_ami(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bloquer_utilisateur(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debloquer_utilisateur(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rechercher_par_identifiant(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.point_d_un_ami(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_amis(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_demandes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_blocages(UUID) TO authenticated;

-- ============================================================================
-- Rechargement du cache de PostgREST
-- ============================================================================

-- PostgREST garde le schéma EN CACHE. Une fonction créée par ce fichier peut
-- exister en base et répondre `PGRST202` (« could not find the function »)
-- jusqu'au rechargement — et le message ne distingue pas « absente » de « cache
-- en retard ». Sans cette ligne, on recolle une migration déjà appliquée en
-- croyant qu'elle ne l'a pas été.
--
-- `NOTIFY` est sans effet s'il n'y a pas d'écouteur : l'exécuter depuis l'éditeur
-- SQL est sans danger, et c'est la seule instruction de ce fichier qui ne modifie
-- aucune donnée.
NOTIFY pgrst, 'reload schema';
