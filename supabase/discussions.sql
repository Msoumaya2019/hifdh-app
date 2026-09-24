-- ============================================================================
-- Hifdh App - Espace de discussion entre deux amis
-- À exécuter APRÈS `supabase/schema.sql`, `administration.sql` et `amis.sql`.
--
-- Ce fichier ne contient aucun secret : uniquement une table, des politiques
-- d'accès et des fonctions. Il est donc versionnable dans un dépôt public.
--
-- Il est rejouable : chaque instruction est gardée par « if not exists » ou par
-- un « drop ... if exists » préalable. Une exécution interrompue se reprend en
-- le relançant.
--
-- ----------------------------------------------------------------------------
-- Ce qui est décidé ici, et pourquoi
-- ----------------------------------------------------------------------------
--
-- 1. DES MOTS, RIEN QUE DES MOTS. La table ne porte qu'une colonne de texte.
--    Il n'y a pas de colonne pour une pièce jointe, une image ou une vidéo —
--    et ce n'est pas un réglage qu'on pourrait changer : la colonne n'existe
--    pas, donc rien ne peut y être écrit. Une application qui n'a nulle part
--    où ranger un fichier ne peut pas en envoyer. La garantie est de forme, et
--    c'est la seule qui tienne dans le temps.
--
--    Corollaire : pas de stockage d'objets, pas de politique de compartiment,
--    pas de quota à surveiller. Rien à modérer de ce côté, parce que rien n'y
--    existe.
--
-- 2. UNE DISCUSSION APPARTIENT À UNE PAIRE. La relation d'amitié décrit déjà
--    la paire, et elle est réciproque par construction (une ligne, `user_a <
--    user_b`). Le fil s'y adosse : il n'ouvre aucune relation nouvelle, il
--    n'existe que là où l'amitié existe déjà. Rompre l'amitié ferme donc la
--    discussion **sans qu'aucune ligne de message ne soit supprimée** — voir
--    le point 5.
--
-- 3. L'AUTORISATION VIT DANS LES POLITIQUES. Le projet a mesuré la différence :
--    un corps de fonction s'exécute avec les droits de l'appelant, qui n'a pas
--    USAGE sur le schéma « auth », et `auth.uid()` y échoue en 42501 au lieu de
--    refuser proprement. Une politique, elle, peut l'appeler. Les prédicats de
--    ce fichier sont donc des politiques, ou des fonctions SECURITY DEFINER
--    appelées PAR une politique.
--
-- 4. LE MODÉRATEUR EXISTE DÉJÀ. Le rôle `administrateur` et le prédicat
--    `public.est_administrateur()` viennent de `administration.sql` ; ce
--    fichier ne les redéfinit pas, il s'en sert. Le propriétaire de
--    l'application étant administrateur, c'est lui le modérateur.
--
--    Ce qu'un modérateur PEUT faire : lire tous les fils, masquer un message,
--    le retirer du fil. Ce qu'il NE PEUT PAS faire : écrire un message à la
--    place de quelqu'un. Écrire exige `auth.uid()` = auteur, et aucune
--    politique ne le contourne — un modérateur n'a donc pas de voix dans une
--    discussion. C'est une contrainte voulue : modérer n'est pas parler.
--
-- 5. MASQUER N'EST PAS EFFACER. Deux gestes distincts, et la distinction est
--    le coeur de la modération :
--
--      - « retiré » (l'auteur, ou un modérateur) : le message disparaît du fil.
--        Une pierre tombale reste, qui dit « message retiré » — mais elle ne
--        dit PAS ce qu'il contenait. Rien ne s'écrase, pourtant : voir ci-après.
--
--      - « masqué » (un modérateur seul) : le message disparaît du fil pour les
--        deux amis, et reste lisible par le modérateur, qui peut revenir sur sa
--        décision. C'est le geste réversible, et c'est celui qu'on veut par
--        défaut quand on modère : on ne tranche pas définitivement dans
--        l'instant.
--
--    Dans les deux cas le MESSAGE EST CONSERVÉ. Effacer vraiment supposerait de
--    décider qui a le droit d'effacer la preuve de ce qu'il a dit ; le projet
--    tranche autrement : le texte n'est plus montré à personne sauf au
--    modérateur, et la trace reste. C'est le choix assumé d'un espace modéré
--    plutôt qu'un espace privé — et il doit être dit aux utilisateurs, ce que
--    fait l'écran, pas seulement ce fichier.
--
-- 6. LA LONGUEUR EST BORNÉE, DANS LA BASE. Une borne qu'on ne pose que dans
--    l'interface se contourne : il suffit d'appeler l'API autrement. La
--    contrainte `CHECK` est donc ici, et l'interface en pose une plus stricte
--    encore pour prévenir avant de refuser.
-- ============================================================================


-- ============================================================================
-- Table : les messages
-- ============================================================================

-- L'ORDRE CANONIQUE DE LA PAIRE est reporté sur la ligne du message, et ce
-- n'est pas de la redondance : c'est ce qui rend l'index utilisable. Si le fil
-- se lisait « (a = moi ou b = moi) », la base ne pourrait pas ordonner ni
-- borner la lecture sans parcourir toute la table. Avec une paire rangée
-- (`user_a < user_b`), lire un fil est une égalité sur un index, donc un
-- parcours de la seule tranche utile.
--
-- La contrainte `discussion_ordre_canonique` empêche qu'une même paire existe
-- sous deux formes, exactement comme pour `amis`.
CREATE TABLE IF NOT EXISTS public.discussion_messages (
  id BIGSERIAL PRIMARY KEY,
  user_a UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_b UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  auteur UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  -- Le corps du message. `TEXT` et rien d'autre : il n'y a pas de colonne
  -- « pièce jointe », donc aucune pièce jointe ne peut être écrite. Voir le
  -- point 1 de l'en-tête.
  corps TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Deux colonnes de modération, jamais l'une pour l'autre :
  --   modere_le      : renseigné par un modérateur, qui a masqué le message ;
  --   retire_le      : renseigné par l'auteur, ou par un modérateur, qui l'a
  --                    retiré du fil.
  -- Un message retiré EST un message masqué du point de vue de la lecture ;
  -- les deux dates restent séparées parce qu'elles ne disent pas la même chose
  -- de l'histoire du message, et qu'une modération se relit.
  modere_le TIMESTAMPTZ,
  retire_le TIMESTAMPTZ,
  CONSTRAINT discussion_ordre_canonique CHECK (user_a < user_b),
  CONSTRAINT discussion_pas_soi_meme CHECK (user_a <> user_b),
  -- L'auteur est l'un des deux, forcément. Sans cette contrainte, une ligne
  -- pourrait porter un auteur étranger à la paire, et le fil afficherait un
  -- message de quelqu'un qui n'y participe pas.
  CONSTRAINT discussion_auteur_dans_la_paire CHECK (auteur = user_a OR auteur = user_b),
  -- Bornes de longueur. La basse n'est pas une coquetterie : un message fait
  -- d'espaces ne se voit pas dans le fil et compte pourtant comme un message.
  -- La haute protège la base d'un envoi massif, et l'interface en pose une
  -- plus stricte (voir `LONGUEUR_MESSAGE_MAX` dans `src/lib/discussion.ts`).
  CONSTRAINT discussion_corps_non_vide CHECK (length(btrim(corps)) > 0),
  CONSTRAINT discussion_corps_borne CHECK (length(corps) <= 2000)
);

-- L'index de lecture d'un fil. La paire d'abord, la date ensuite : c'est
-- l'ordre exact dans lequel l'écran lit — les messages d'une paire, du plus
-- ancien au plus récent.
CREATE INDEX IF NOT EXISTS discussion_fil_idx
  ON public.discussion_messages (user_a, user_b, created_at, id);

ALTER TABLE public.discussion_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Le prédicat : « cette ligne de message m'est-elle destinée ? »
--
-- SECURITY DEFINER, pour la même raison que `est_ami_avec` et
-- `est_administrateur` : la fonction lit `public.amis`, et les politiques qui
-- l'appellent protègent `discussion_messages`. Une politique qui interroge une
-- autre table protégée s'exécute sous les droits de l'appelant ; quand cette
-- table a elle-même des politiques récursives, Postgres refuse par un
-- « infinite recursion detected in policy », et le remède mesuré sur ce projet
-- est une fonction SECURITY DEFINER à `search_path` figé.
--
-- Écrite ici en UN exemplaire, alors qu'elle pourrait être recopiée dans chaque
-- politique : trois politiques qui portent trois fois la même condition est
-- exactement la forme où l'une des trois finit par diverger des deux autres.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.est_dans_le_fil(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (auth.uid() = p_a OR auth.uid() = p_b)
     AND EXISTS (
       SELECT 1 FROM public.amis
       WHERE user_a = p_a AND user_b = p_b
     );
$$;


-- ============================================================================
-- Politiques : les deux amis écrivent et lisent, le modérateur modère
-- ============================================================================

-- LECTURE. Trois voies, en OU, et chacune dit une chose différente :
--
--   1. je participe à la paire, l'amitié tient toujours, et le message n'a été
--      ni masqué ni retiré  → je le vois ;
--   2. je participe à la paire, et le message a été retiré → je vois la pierre
--      tombale, pas le texte. La condition sur `retire_le` est donc ici, et pas
--      dans l'application : c'est la base qui refuse de rendre le texte, pas
--      l'écran qui s'abstient de l'afficher. Une interface qui cache est une
--      politesse ; une politique qui cache est une garantie.
--   3. je suis administrateur → je vois tout, y compris ce qui est masqué ou
--      retiré. C'est ce qui rend la modération possible *a posteriori*.
--
-- Ce qui N'EST PAS ici : un modérateur qui aurait besoin d'être ami avec les
-- deux. Il n'a pas à l'être, et heureusement : le propriétaire de
-- l'application ne peut pas être l'ami de tous les utilisateurs.
DROP POLICY IF EXISTS "Discussion : mon fil" ON public.discussion_messages;
CREATE POLICY "Discussion : mon fil" ON public.discussion_messages
  FOR SELECT TO authenticated
  USING (
    (
      public.est_dans_le_fil(user_a, user_b)
      AND modere_le IS NULL
      AND retire_le IS NULL
    )
    OR (
      public.est_dans_le_fil(user_a, user_b)
      AND retire_le IS NOT NULL
    )
    OR public.est_administrateur()
  );

-- ÉCRITURE. On n'écrit que dans un fil où l'amitié tient, et seulement sous son
-- propre nom. `auteur = auth.uid()` n'est pas une protection de confort : sans
-- elle, un participant pourrait signer un message du nom de l'autre — le seul
-- faux qui compte dans un espace où l'on s'encourage.
--
-- L'ordre canonique de la paire est imposé malgré la saisie : l'appelant peut
-- écrire (A,B) ou (B,A) dans sa requête, la contrainte de table refusera la
-- seconde forme. L'interface range avant d'envoyer, et la base une fois encore.
DROP POLICY IF EXISTS "Discussion : j'ecris chez moi" ON public.discussion_messages;
CREATE POLICY "Discussion : j'ecris chez moi" ON public.discussion_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auteur = auth.uid()
    AND public.est_dans_le_fil(user_a, user_b)
  );

-- MODIFICATION. Deux gestes, deux autorisations, et le `WITH CHECK` les
-- distingue par la valeur posée :
--
--   - l'auteur peut retirer son propre message      → `retire_le` se pose ;
--   - un modérateur peut masquer n'importe lequel   → `modere_le` se pose, mais
--     il ne peut PAS poser `retire_le` : retirer un message de quelqu'un
--     d'autre serait effacer sa parole, et ce n'est pas modérer.
--
-- Le corps du message, lui, ne se modifie JAMAIS — et c'est le `USING` qui le
-- garantit, pas le `WITH CHECK`.
--
-- LE PIÈGE A ÉTÉ PAYÉ À L'ÉCRITURE DE CE FICHIER, et il vaut la peine d'être
-- écrit noir sur blanc : la première version portait
-- `WITH CHECK (... AND corps = corps)`. Dans un `WITH CHECK`, les deux côtés
-- désignent la ligne NOUVELLE — la condition est donc une tautologie, toujours
-- vraie, et elle n'interdit rien. Le banc l'a montré : le témoin a bien été
-- réécrit en « autre chose ». Une garde qui ne garde rien est pire qu'aucune
-- garde, parce qu'elle rassure.
--
-- Ce qui interdit vraiment la réécriture est donc ailleurs : un `UPDATE` doit
-- comparer l'ancien et le nouveau corps, et dans une politique les deux noms
-- disponibles désignent toujours la ligne nouvelle. Le `USING` ci-dessous ne
-- porte donc que ce qu'il peut porter — qui a le droit de toucher à la ligne —
-- et la comparaison elle-même est confiée à un déclencheur, plus bas.
DROP POLICY IF EXISTS "Discussion : je retire, ou je masque" ON public.discussion_messages;
CREATE POLICY "Discussion : je retire, ou je masque" ON public.discussion_messages
  FOR UPDATE TO authenticated
  USING (
    (auteur = auth.uid() AND modere_le IS NULL)
    OR public.est_administrateur()
  )
  WITH CHECK (
    (auteur = auth.uid() AND modere_le IS NULL)
    OR public.est_administrateur()
  );

-- L'interdiction de réécrire, elle, est un DÉCLENCHEUR, et c'est le seul
-- endroit d'une politique où l'ancienne et la nouvelle valeur coexistent.
--
--   - `corps` ne change jamais : c'est la règle qui donne son sens au fil ;
--   - `auteur`, `user_a`, `user_b` non plus : un message ne change pas de main
--     ni de destinataire après coup.
--
-- Un déclencheur `BEFORE UPDATE` refuse en levant, avec un code SQL choisi
-- (`42501`, permission refusée) pour que l'appelant lise « refus », et non
-- « erreur de saisie ». Le message est en français : c'est lui qui remontera
-- dans l'application.
CREATE OR REPLACE FUNCTION public.discussion_message_immuable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.corps IS DISTINCT FROM OLD.corps THEN
    RAISE EXCEPTION 'Un message envoyé ne peut pas être réécrit.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.auteur IS DISTINCT FROM OLD.auteur
     OR NEW.user_a IS DISTINCT FROM OLD.user_a
     OR NEW.user_b IS DISTINCT FROM OLD.user_b THEN
    RAISE EXCEPTION 'Un message ne change ni d''auteur ni de destinataire.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- `DROP` puis `CREATE` : un déclencheur ne se remplace pas par `CREATE OR
-- REPLACE` (contrairement à une fonction), et le fichier doit rester rejouable.
DROP TRIGGER IF EXISTS discussion_message_immuable ON public.discussion_messages;
CREATE TRIGGER discussion_message_immuable
  BEFORE UPDATE ON public.discussion_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.discussion_message_immuable();

-- AUCUNE politique de DELETE, et c'est un choix, pas un oubli. Rien ne
-- disparaît vraiment : un message se masque ou se retire, et la trace demeure,
-- lisible par le modérateur. Une politique de suppression rendrait la
-- modération irréversible et laisserait un fil troué, sans moyen de savoir ce
-- qui manque. Le jour où un effacement réel serait exigé — un droit à
-- l'effacement, par exemple — il se ferait par une fonction dédiée, tracée, et
-- non par un `DELETE` ouvert aux participants.


-- ============================================================================
-- La lecture d'un fil, et la comptabilité de ce qui reste à voir
-- ============================================================================

-- Le fil d'une paire, du plus ancien au plus récent, borné.
--
-- `p_limite` existe parce qu'un fil sans borne se lirait entier un jour, et
-- qu'une lecture entière finit par être lente sans qu'on sache pourquoi. La
-- borne est dans la fonction, donc dans la base : l'appelant ne peut pas
-- l'oublier.
--
-- La fonction ne décide PAS de la visibilité : elle s'appuie sur les politiques
-- de la table, qui s'appliquent à sa lecture intérieure. Un message masqué
-- n'est donc pas rendu ici — sauf à un administrateur, pour qui la politique
-- l'ouvre. La règle est écrite une fois, à un seul endroit.
--
-- SECURITY INVOKER (le défaut) : c'est volontaire, et c'est le contraire des
-- prédicats ci-dessus. La fonction doit lire AVEC les droits de l'appelant,
-- sinon elle contournerait les politiques qu'on vient d'écrire. Un prédicat
-- doit voir plus que l'appelant pour trancher ; une lecture doit voir
-- exactement ce que l'appelant a le droit de voir.
CREATE OR REPLACE FUNCTION public.lire_fil(
  p_moi UUID,
  p_ami UUID,
  p_limite INTEGER DEFAULT 200
)
RETURNS TABLE (
  id BIGINT,
  auteur UUID,
  corps TEXT,
  created_at TIMESTAMPTZ,
  retire_le TIMESTAMPTZ,
  masque_par_moderateur BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.auteur,
    -- Le texte n'est rendu que s'il peut être lu : pour un message retiré, on
    -- rend `NULL` et l'écran affiche sa pierre tombale. Faire ce choix ici
    -- plutôt que dans l'application garantit qu'aucun écran, même écrit plus
    -- tard, ne peut afficher par mégarde un texte retiré.
    CASE WHEN m.retire_le IS NULL THEN m.corps ELSE NULL END AS corps,
    m.created_at,
    m.retire_le,
    (m.modere_le IS NOT NULL) AS masque_par_moderateur
  FROM public.discussion_messages m
  WHERE m.user_a = LEAST(p_moi, p_ami)
    AND m.user_b = GREATEST(p_moi, p_ami)
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limite, 200), 500), 1);
$$;

-- Le nombre de messages visibles d'un fil, pour l'aperçu sur la fiche d'un ami.
-- Il compte ce que l'appelant peut voir, et rien de plus : la fonction lit sous
-- les politiques, donc un message masqué n'est pas compté pour un ami et l'est
-- pour un modérateur. Le même appel rend donc deux nombres différents selon qui
-- regarde, et c'est exactement voulu.
CREATE OR REPLACE FUNCTION public.compter_fil(p_moi UUID, p_ami UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.discussion_messages m
  WHERE m.user_a = LEAST(p_moi, p_ami)
    AND m.user_b = GREATEST(p_moi, p_ami)
    AND m.retire_le IS NULL;
$$;


-- La lecture d'un fil PAR LE MODÉRATEUR, qui n'en est pas partie.
--
-- Les deux paramètres nomment LA PAIRE, et non « moi et un autre » : c'est
-- toute la différence avec `lire_fil`. Un modérateur n'est pas partie au fil
-- qu'il modère, donc lui demander `lire_fil(admin, A)` reviendrait à demander
-- le fil (admin, A) — qui n'existe pas — et rendrait zéro ligne en silence. Le
-- banc l'a montré, deux fois, avant que la signature ne soit comprise.
--
-- C'est une fonction à part, et non un paramètre de plus, parce que les deux
-- gestes n'ont pas la même autorisation : la première obéit aux politiques
-- (donc à l'amitié), la seconde exige le rôle. Les confondre ferait dépendre
-- la seconde d'un `if`, et un `if` dans une fonction SECURITY DEFINER est
-- exactement l'endroit où l'on oublie de vérifier.
--
-- SECURITY DEFINER, ici, et c'est nécessaire : la fonction doit voir les
-- messages masqués et retirés, que les politiques cachent à l'appelant. La
-- garde est donc la première ligne du corps, et elle n'est pas décorative —
-- sans elle, n'importe qui lirait n'importe quel fil. `search_path` est figé.
CREATE OR REPLACE FUNCTION public.lire_fil_moderation(
  p_paire_a UUID,
  p_paire_b UUID,
  p_limite INTEGER DEFAULT 500
)
RETURNS TABLE (
  id BIGINT,
  auteur UUID,
  corps TEXT,
  created_at TIMESTAMPTZ,
  retire_le TIMESTAMPTZ,
  masque_par_moderateur BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.est_administrateur() THEN
    RAISE EXCEPTION 'Réservé à la modération.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.auteur,
    -- Le modérateur, lui, voit le texte même d'un message retiré : c'est ce qui
    -- rend une modération relisible, et c'est le sens du choix « masquer n'est
    -- pas effacer ». Le texte n'est pas rendu à tout le monde, seulement ici.
    m.corps,
    m.created_at,
    m.retire_le,
    (m.modere_le IS NOT NULL) AS masque_par_moderateur
  FROM public.discussion_messages m
  WHERE m.user_a = LEAST(p_paire_a, p_paire_b)
    AND m.user_b = GREATEST(p_paire_a, p_paire_b)
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT GREATEST(LEAST(COALESCE(p_limite, 500), 1000), 1);
END;
$$;

-- Les fils d'une paire quelconque, pour la vue de modération : de qui, à qui,
-- combien de messages, combien masqués, et quand le dernier est passé.
CREATE OR REPLACE FUNCTION public.fils_de_moderation(p_limite INTEGER DEFAULT 100)
RETURNS TABLE (
  user_a UUID,
  user_b UUID,
  messages INTEGER,
  masques INTEGER,
  dernier TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.est_administrateur() THEN
    RAISE EXCEPTION 'Réservé à la modération.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.user_a,
    m.user_b,
    COUNT(*)::INTEGER AS messages,
    COUNT(*) FILTER (WHERE m.modere_le IS NOT NULL)::INTEGER AS masques,
    MAX(m.created_at) AS dernier
  FROM public.discussion_messages m
  GROUP BY m.user_a, m.user_b
  ORDER BY MAX(m.created_at) DESC
  LIMIT GREATEST(LEAST(COALESCE(p_limite, 100), 500), 1);
END;
$$;


-- ============================================================================
-- Les gestes de modération, en fonctions
--
-- Ils pourraient être écrits directement par l'application (un `update` sur la
-- table). Ils sont ici pour deux raisons :
--
--   1. le geste est borné à ce qu'il fait — on ne peut pas, en appelant
--      `masquer_message`, poser autre chose que `modere_le` ;
--   2. la vérification du rôle est faite une fois, dans la base, et non dans
--      chaque écran qui déciderait de l'afficher ou non.
--
-- Chacune rend un booléen : `true` si le geste a pris. Un geste qui ne prend
-- pas n'est pas une erreur — c'est le cas normal d'un modérateur qui n'en est
-- pas un, ou d'un message déjà retiré.
-- ============================================================================

-- Masquer un message. Réservé à l'administrateur : c'est la vérification de
-- rôle, et elle est faite ici plutôt que supposée.
CREATE OR REPLACE FUNCTION public.masquer_message(p_message BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.est_administrateur() THEN
    RETURN FALSE;
  END IF;

  UPDATE public.discussion_messages
     SET modere_le = COALESCE(modere_le, NOW())
   WHERE id = p_message;

  RETURN FOUND;
END;
$$;

-- Défaire un masquage. La politique d'UPDATE exige `modere_le IS NULL` pour un
-- auteur ; ici c'est une fonction SECURITY DEFINER qui écrit, donc la politique
-- ne s'applique pas à son écriture intérieure — d'où la vérification explicite
-- du rôle, qui est la seule garde. Elle y est.
CREATE OR REPLACE FUNCTION public.demasquer_message(p_message BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.est_administrateur() THEN
    RETURN FALSE;
  END IF;

  UPDATE public.discussion_messages
     SET modere_le = NULL
   WHERE id = p_message;

  RETURN FOUND;
END;
$$;

-- Retirer un message. L'auteur peut retirer le sien ; un modérateur peut
-- retirer n'importe lequel. Personne d'autre, et surtout pas un ami : on ne
-- retire pas la parole d'un autre.
--
-- `SECURITY INVOKER` ici, et c'est le bon choix : l'écriture passe par la
-- politique d'UPDATE, qui porte déjà la règle. La fonction n'ajoute que le
-- geste, elle ne remplace pas la garde — il n'y a donc pas deux endroits où
-- lire « qui a le droit », et pas deux occasions de les faire diverger.
CREATE OR REPLACE FUNCTION public.retirer_message(p_message BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
  WITH geste AS (
    UPDATE public.discussion_messages
       SET retire_le = COALESCE(retire_le, NOW())
     WHERE id = p_message
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM geste);
$$;


-- ============================================================================
-- Le premier : rien à nommer ici
--
-- Le modérateur est l'administrateur, et le premier administrateur se nomme à
-- la fin de `administration.sql` — il n'y a donc rien à nommer dans ce fichier.
-- C'est volontaire : un second endroit qui écrirait `role = 'administrateur'`
-- serait un second endroit à sécuriser, et le projet n'en veut qu'un.
-- ============================================================================


-- ============================================================================
-- Les droits, sans lesquels rien de ce qui précède n'est atteint
--
-- C'est le piège que le projet a déjà payé une fois, et que ce fichier a
-- repayé à sa première écriture : `GRANT` et RLS sont DEUX barrières
-- successives. Sans `GRANT`, le rôle `authenticated` se voit refuser la table
-- en `42501` **avant** qu'une politique soit consultée — et le message parle de
-- permission, pas de politique, ce qui envoie chercher au mauvais endroit. Le
-- banc a crié : « permission denied for table discussion_messages ».
--
-- Les gestes accordés sont exactement ceux que les politiques autorisent :
-- SELECT (lire son fil), INSERT (écrire), UPDATE (retirer, masquer). Pas de
-- DELETE : la table n'a aucune politique de suppression, et accorder le droit
-- sans politique ne ferait qu'ajouter une barrière qui refuse sans raison
-- lisible.
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.discussion_messages TO authenticated;

-- Et la SÉQUENCE, sans quoi l'insertion échoue en 42501 sur `nextval_internal`
-- alors que le droit sur la table, lui, est bien accordé.
--
-- La raison : `BIGSERIAL` crée une séquence séparée, qui est un objet à part
-- entière avec ses propres droits. Un `GRANT ... ON TABLE` ne la couvre pas.
-- Le message d'erreur parle de « permission denied for sequence », ce qui est
-- plus clair — mais seulement si on sait qu'une séquence existe. Les autres
-- tables du projet n'ont pas de colonne `BIGSERIAL`, ce piège n'y était donc
-- jamais apparu.
GRANT USAGE, SELECT ON SEQUENCE public.discussion_messages_id_seq TO authenticated;

GRANT EXECUTE ON FUNCTION public.est_dans_le_fil(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lire_fil(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compter_fil(UUID, UUID) TO authenticated;
-- Les deux lectures de modération se refusent elles-mêmes si l'appelant n'est
-- pas administrateur : accordées à `authenticated`, elles rendent un refus
-- lisible au lieu d'une erreur de permission, qui ne dirait rien de la règle.
GRANT EXECUTE ON FUNCTION public.lire_fil_moderation(UUID, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fils_de_moderation(INTEGER) TO authenticated;
-- Les trois gestes de modération : `retirer_message` est ouvert à l'auteur,
-- les deux autres se refusent eux-mêmes si l'appelant n'est pas modérateur —
-- le droit d'exécuter n'est donc pas le droit de modérer, et c'est la fonction
-- qui tranche. L'accorder à `authenticated` est nécessaire pour qu'un appelant
-- non modérateur reçoive `false` au lieu d'un refus de permission, qui ne
-- dirait rien de la règle.
GRANT EXECUTE ON FUNCTION public.retirer_message(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.masquer_message(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demasquer_message(BIGINT) TO authenticated;


-- ============================================================================
-- 7. Ce qui reste à lire, et le temps réel
--
-- Deux ajouts, et ils vont ensemble : un compteur de non-lus n'a d'intérêt que
-- s'il se met à jour sans qu'on rouvre l'écran, et le temps réel sans compteur
-- ne dirait pas *combien* de choses attendent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- La table des lectures
-- ----------------------------------------------------------------------------
--
-- UNE LIGNE PAR LECTEUR ET PAR FIL, et non une ligne par fil avec deux
-- colonnes. Les deux formes tiennent dans une table, mais elles ne se
-- comportent pas pareil : avec deux colonnes (`lu_par_a`, `lu_par_b`), chaque
-- personne écrit dans la MOITIÉ d'une ligne que l'autre possède aussi — et
-- deux écritures concurrentes sur la même ligne se bloquent, pour rien.
-- Séparer les lecteurs sépare aussi les écritures.
--
-- Le couple est ORDONNÉ (lecteur, autre) et non canonique : on ne lit que son
-- propre côté, il n'y a donc rien à ranger. C'est le contraire de `amis`, où
-- l'ordre canonique est ce qui rend la réciprocité structurelle — et la
-- différence est voulue, parce que la question posée n'est pas la même.
CREATE TABLE IF NOT EXISTS public.discussion_lectures (
  lecteur UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  autre UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  lu_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lecteur, autre),
  CONSTRAINT discussion_lectures_pas_soi_meme CHECK (lecteur <> autre)
);

ALTER TABLE public.discussion_lectures ENABLE ROW LEVEL SECURITY;

-- On ne lit et n'écrit que SA propre ligne. La politique d'insertion exige en
-- plus que `lecteur` soit bien l'appelant : sans cette seconde condition, on
-- pourrait marquer comme lu le fil de quelqu'un d'autre, et lui retirer sa
-- pastille de non-lus à distance.
DROP POLICY IF EXISTS "Lectures : la mienne" ON public.discussion_lectures;
CREATE POLICY "Lectures : la mienne" ON public.discussion_lectures
  FOR SELECT TO authenticated
  USING (auth.uid() = lecteur);

DROP POLICY IF EXISTS "Lectures : j'ecris la mienne" ON public.discussion_lectures;
CREATE POLICY "Lectures : j'ecris la mienne" ON public.discussion_lectures
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = lecteur);

DROP POLICY IF EXISTS "Lectures : je remets a jour la mienne" ON public.discussion_lectures;
CREATE POLICY "Lectures : je remets a jour la mienne" ON public.discussion_lectures
  FOR UPDATE TO authenticated
  USING (auth.uid() = lecteur)
  WITH CHECK (auth.uid() = lecteur);

-- Pas de politique de suppression : une lecture n'a aucune raison de
-- disparaître, et sa disparition remettrait à non-lu tout un fil ancien.

-- ----------------------------------------------------------------------------
-- Marquer un fil comme lu
-- ----------------------------------------------------------------------------
--
-- SECURITY INVOKER, donc les politiques portent l'autorisation : l'écriture
-- n'atteint que la ligne dont `lecteur` vaut `auth.uid()`.
--
-- `p_moi` est un paramètre et non `auth.uid()` lu dans le corps, pour la même
-- raison que partout ailleurs : un corps SECURITY INVOKER n'a pas USAGE sur le
-- schéma `auth`, et l'appel y échoue en 42501.
--
-- L'horodatage est `NOW()` — le début de la transaction — et non l'heure de
-- l'appareil. Un téléphone à l'heure fausse, en avance de quelques minutes,
-- marquerait comme lus des messages qui n'existent pas encore ; et le premier
-- message arrivé ensuite serait invisible à jamais, puisqu'il serait plus
-- ancien que la marque. C'est le serveur qui date, parce que c'est lui qui
-- date les messages.
CREATE OR REPLACE FUNCTION public.marquer_fil_lu(p_moi UUID, p_ami UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_moi IS NULL OR p_ami IS NULL OR p_moi = p_ami THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.discussion_lectures (lecteur, autre, lu_le)
  VALUES (p_moi, p_ami, NOW())
  ON CONFLICT (lecteur, autre) DO UPDATE SET lu_le = NOW();

  RETURN TRUE;
END;
$$;

-- ----------------------------------------------------------------------------
-- Ce qui reste à lire
-- ----------------------------------------------------------------------------
--
-- Une ligne par fil qui a au moins un message non lu. Les fils entièrement lus
-- ne sont pas rendus : la liste des conversations s'affiche à partir des amis,
-- et une seconde liste de lignes vides ne ferait qu'ajouter des jointures à
-- recoller côté client.
--
-- Le compte EXCLUT les messages retirés et masqués, et ce n'est pas un détail
-- de confort : compter une pierre tombale comme un message à lire ferait
-- clignoter une pastille pour quelque chose qui ne s'ouvre pas.
--
-- Un fil sans ligne de lecture est ENTIÈREMENT non lu : c'est le cas d'un fil
-- jamais ouvert, et c'est bien ce qu'on veut montrer. D'où le `COALESCE` sur
-- une date très ancienne plutôt qu'un `NULL` — un `NULL` rendrait la
-- comparaison fausse, donc zéro non-lu, c'est-à-dire exactement l'inverse.
CREATE OR REPLACE FUNCTION public.non_lus_par_fil(p_moi UUID)
RETURNS TABLE (
  autre UUID,
  non_lus INTEGER,
  dernier_le TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE WHEN m.user_a = p_moi THEN m.user_b ELSE m.user_a END AS autre,
    COUNT(*)::INTEGER AS non_lus,
    MAX(m.created_at) AS dernier_le
  FROM public.discussion_messages m
  LEFT JOIN public.discussion_lectures l
    ON l.lecteur = p_moi
   AND l.autre = CASE WHEN m.user_a = p_moi THEN m.user_b ELSE m.user_a END
  WHERE (m.user_a = p_moi OR m.user_b = p_moi)
    AND m.auteur <> p_moi
    AND m.retire_le IS NULL
    AND m.modere_le IS NULL
    AND m.created_at > COALESCE(l.lu_le, '-infinity'::timestamptz)
  GROUP BY 1
  ORDER BY 3 DESC;
$$;

-- Le total, pour la pastille de l'écran d'accueil.
--
-- Une fonction à part plutôt qu'une somme faite par le client : la pastille
-- s'affiche sur l'écran d'accueil, qui n'a aucune raison de charger la liste
-- détaillée de tous les fils pour afficher un nombre. Et c'est la base qui
-- compte, donc le nombre est le même partout.
CREATE OR REPLACE FUNCTION public.total_non_lus(p_moi UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(n.non_lus), 0)::INTEGER
  FROM public.non_lus_par_fil(p_moi) n;
$$;

-- ----------------------------------------------------------------------------
-- L'aperçu des fils
-- ----------------------------------------------------------------------------
--
-- Une ligne par fil qui contient au moins un message visible, avec le DERNIER
-- de ces messages. C'est ce qui donne à la liste des conversations autre chose
-- qu'une suite de noms — et c'est la seule information qu'on y cherche du
-- regard : « qui m'a écrit, et quand ».
--
-- `DISTINCT ON` plutôt qu'une fonction de fenêtrage : Postgres sait prendre la
-- première ligne de chaque groupe selon un ordre donné, et le faire ici évite
-- de rendre tout l'historique au client pour n'en garder qu'une ligne par fil.
-- Un fil de deux mille messages coûte alors le même prix qu'un fil de deux.
--
-- Les règles de visibilité sont CELLES DE `lire_fil`, et elles doivent le
-- rester : un message masqué par la modération ne s'aperçoit pas, et un message
-- retiré s'aperçoit comme retiré — `apercu` est alors NULL, exactement comme
-- `corps` l'est dans le fil. Laisser passer l'un ou l'autre ferait apparaître
-- dans la liste un texte que la conversation refuse de montrer.
--
-- Le texte n'est PAS tronqué ici. Couper une chaîne en SQL coupe des octets,
-- donc des graphèmes : un extrait d'arabe vocalisé peut se retrouver terminé au
-- milieu d'un signe, et s'afficher avec un carré vide. C'est l'affichage qui
-- tronque — `numberOfLines={1}` — et il le fait sur des caractères entiers.
--
-- L'ordre extérieur est la récence : la liste des conversations se lit du plus
-- récent au plus ancien, et `DISTINCT ON` impose le sien (le groupe d'abord).
CREATE OR REPLACE FUNCTION public.apercu_fils(p_moi UUID)
RETURNS TABLE (
  autre UUID,
  dernier_le TIMESTAMPTZ,
  apercu TEXT,
  de_moi BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  SELECT dedans.autre, dedans.dernier_le, dedans.apercu, dedans.de_moi
  FROM (
    SELECT DISTINCT ON (CASE WHEN m.user_a = p_moi THEN m.user_b ELSE m.user_a END)
      CASE WHEN m.user_a = p_moi THEN m.user_b ELSE m.user_a END AS autre,
      m.created_at AS dernier_le,
      CASE WHEN m.retire_le IS NULL THEN m.corps ELSE NULL END AS apercu,
      (m.auteur = p_moi) AS de_moi
    FROM public.discussion_messages m
    WHERE (m.user_a = p_moi OR m.user_b = p_moi)
      AND m.modere_le IS NULL
    ORDER BY
      CASE WHEN m.user_a = p_moi THEN m.user_b ELSE m.user_a END,
      m.created_at DESC,
      m.id DESC
  ) AS dedans
  ORDER BY dedans.dernier_le DESC;
$$;

-- ----------------------------------------------------------------------------
-- Le temps réel
-- ----------------------------------------------------------------------------
--
-- La table des messages rejoint la publication `supabase_realtime`, ce qui est
-- la seule chose qu'un abonnement client ne peut pas faire lui-même : Realtime
-- ne diffuse que les tables PUBLIÉES, et l'ajout se fait normalement à la main
-- dans le tableau de bord.
--
-- Le faire ici, et pas dans une case à cocher, a une raison précise : la
-- configuration devient une ligne du dépôt, donc une ligne qu'on peut relire,
-- comparer et rejouer. Une case cochée dans un tableau de bord ne laisse aucune
-- trace, et la question « pourquoi je ne reçois rien ? » se cherche alors dans
-- le code, où la réponse n'est pas.
--
-- Ce que Realtime diffuse obéit aux MÊMES politiques RLS : la publication
-- n'ouvre rien, elle rend seulement observable ce que l'abonnement a déjà le
-- droit de lire. Un fil fermé reste fermé.
--
-- `WHEN OTHERS` : PGlite n'a pas de publication, et le banc d'épreuve doit
-- pouvoir jouer ce fichier sans mourir sur une ligne qui ne le concerne pas.
-- C'est la même raison que pour pgcrypto dans `amis.sql` — un échec ici
-- empêcherait la création des tables qui suivent, pour une commodité.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.discussion_messages;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Publication supabase_realtime indisponible (%) : a ajouter depuis le tableau de bord.', SQLERRM;
END;
$$;

-- ----------------------------------------------------------------------------
-- Les droits
-- ----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.discussion_lectures TO authenticated;
GRANT EXECUTE ON FUNCTION public.marquer_fil_lu(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.non_lus_par_fil(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.total_non_lus(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apercu_fils(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
