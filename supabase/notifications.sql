-- ============================================================================
-- Les notifications push
-- ============================================================================
--
-- Ce fichier fait trois choses, et rien d'autre :
--   1. il range les APPAREILS — un jeton Expo par appareil, rattaché à un
--      compte, et à un seul ;
--   2. il range les PRÉFÉRENCES de chacun, et c'est ici qu'elles décident :
--      une préférence lue au moment de l'envoi vaut mieux qu'une préférence
--      relue par le client, qui pourrait ne pas être ouvert ;
--   3. il remplit une BOÎTE D'ENVOI à chaque geste qui mérite une
--      notification, par déclencheur — donc côté serveur.
--
-- POURQUOI UNE BOÎTE D'ENVOI, ET NON UN APPEL DEPUIS LE TÉLÉPHONE
-- ---------------------------------------------------------------
-- C'est l'exigence la plus importante de cette fonctionnalité, et elle se dit
-- en une phrase : **l'expéditeur peut fermer l'application aussitôt après avoir
-- appuyé sur « envoyer »**. Un envoi déclenché par son téléphone n'aurait alors
-- jamais lieu — pas parce que le réseau a échoué, mais parce que plus personne
-- n'était là pour appeler. La notification doit donc partir de la BASE, au
-- moment où la ligne est écrite, et c'est un DÉCLENCHEUR qui s'en charge.
--
-- La boîte d'envoi est ensuite vidée par une fonction serveur
-- (`supabase/functions/envoyer-notifications`), qui seule détient la clé de
-- service et parle au service de notification d'Expo. Rien de tout cela ne
-- passe par l'application.
--
-- POURQUOI LES PRÉFÉRENCES SONT LUES DANS LE DÉCLENCHEUR
-- -----------------------------------------------------
-- Parce qu'une ligne écrite dans la boîte d'envoi est une ligne qui partira.
-- Si quelqu'un a demandé à ne pas être dérangé pour les messages, la ligne ne
-- doit PAS exister — et surtout pas exister puis être filtrée plus tard, car
-- alors un correctif dans la fonction serveur pourrait la laisser passer.
-- L'absence de ligne est une garantie, pas une convention.
--
-- Et si quelqu'un a demandé à MASQUER LE CONTENU, le corps n'est pas écrit du
-- tout : « Vous avez reçu un nouveau message » ne peut pas fuiter par accident
-- s'il n'y a jamais eu de texte à montrer.
--
-- À exécuter APRÈS `discussions.sql`, qui crée `discussion_messages`.

-- ----------------------------------------------------------------------------
-- Les appareils
-- ----------------------------------------------------------------------------
--
-- La clé primaire est le JETON, et non un identifiant technique. Ce n'est pas
-- un raccourci : un jeton désigne une installation de l'application, et une
-- seule. En faire la clé rend impossible la faute la plus coûteuse de cette
-- table — deux lignes pour le même appareil, donc deux notifications envoyées
-- pour un seul message.
--
-- Un même compte a donc PLUSIEURS lignes : son téléphone et sa tablette. C'est
-- ce que « gérer plusieurs appareils » veut dire, et cela tombe tout seul.
CREATE TABLE IF NOT EXISTS public.appareils (
  jeton TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plateforme TEXT NOT NULL CHECK (plateforme IN ('ios', 'android')),
  -- La langue de l'appareil n'est pas rangée : l'application est entièrement
  -- en français, et une colonne qui n'a qu'une valeur possible est une colonne
  -- qui ment sur ce qu'elle décide.
  cree_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vu_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Le nombre d'échecs CONSTATÉS par la fonction serveur. Il ne sert pas à
  -- décider : Expo dit explicitement quand un jeton est mort
  -- (`DeviceNotRegistered`), et c'est ce signal-là qui fait supprimer la ligne.
  -- Ce compteur est là pour comprendre après coup, pas pour trancher.
  echecs INTEGER NOT NULL DEFAULT 0 CHECK (echecs >= 0)
);

CREATE INDEX IF NOT EXISTS appareils_par_compte ON public.appareils (user_id);

ALTER TABLE public.appareils ENABLE ROW LEVEL SECURITY;

-- Chacun ne voit et ne touche que ses propres appareils. La lecture n'est pas
-- ouverte au-delà : un jeton est une adresse à laquelle on peut faire sonner
-- un téléphone, et la liste des jetons d'un autre est un plan d'attaque.
DROP POLICY IF EXISTS "Appareils : les miens" ON public.appareils;
CREATE POLICY "Appareils : les miens" ON public.appareils
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Appareils : j'enregistre le mien" ON public.appareils;
CREATE POLICY "Appareils : j'enregistre le mien" ON public.appareils
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Appareils : je mets a jour le mien" ON public.appareils;
CREATE POLICY "Appareils : je mets a jour le mien" ON public.appareils
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Appareils : je retire le mien" ON public.appareils;
CREATE POLICY "Appareils : je retire le mien" ON public.appareils
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Les préférences
-- ----------------------------------------------------------------------------
--
-- Une ligne par compte, créée à la première modification. Une ligne ABSENTE
-- vaut « tout est activé sauf le masquage », et c'est le défaut qu'il faut :
-- quelqu'un qui n'a jamais ouvert les réglages doit recevoir ses messages.
--
-- Les six interrupteurs de l'écran, et ce que chacun gouverne :
--   - `messages`               : un ami m'a écrit ;
--   - `demandes_amis`          : on me demande en ami, ou l'on accepte ;
--   - `progression_partagee`   : un ami annonce une étape ;
--   - `rappels_apprentissage`  : le rappel de la séance du jour ;
--   - `rappels_revision`       : le rappel des révisions dues ;
--   - `masquer_contenu`        : n'écrire QUE « Vous avez reçu un nouveau
--                                message », jamais le texte reçu.
CREATE TABLE IF NOT EXISTS public.preferences_notifications (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  messages BOOLEAN NOT NULL DEFAULT TRUE,
  demandes_amis BOOLEAN NOT NULL DEFAULT TRUE,
  progression_partagee BOOLEAN NOT NULL DEFAULT TRUE,
  rappels_apprentissage BOOLEAN NOT NULL DEFAULT TRUE,
  rappels_revision BOOLEAN NOT NULL DEFAULT TRUE,
  masquer_contenu BOOLEAN NOT NULL DEFAULT FALSE,
  maj_le TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.preferences_notifications ENABLE ROW LEVEL SECURITY;

-- Mes préférences ne regardent personne d'autre — pas même un ami. Un ami qui
-- saurait que j'ai coupé les notifications saurait que je l'ai lu et que je ne
-- réponds pas.
DROP POLICY IF EXISTS "Preferences : les miennes" ON public.preferences_notifications;
CREATE POLICY "Preferences : les miennes" ON public.preferences_notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Preferences : j'ecris les miennes" ON public.preferences_notifications;
CREATE POLICY "Preferences : j'ecris les miennes" ON public.preferences_notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Preferences : je mets a jour les miennes" ON public.preferences_notifications;
CREATE POLICY "Preferences : je mets a jour les miennes" ON public.preferences_notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- La boîte d'envoi
-- ----------------------------------------------------------------------------
--
-- Aucune politique, et c'est DÉLIBÉRÉ : personne, côté application, ne lit ni
-- n'écrit cette table. Elle est remplie par les déclencheurs — qui sont
-- `SECURITY DEFINER` — et vidée par la fonction serveur, qui emploie la clé de
-- service et ne passe donc pas par les politiques. RLS activée sans aucune
-- politique est exactement « fermée à tout le monde sauf au propriétaire ».
--
-- `conversation_avec` dit QUELLE conversation ouvrir quand on touche la
-- notification. C'est ce qui fait qu'un appui ouvre le bon fil, et pas l'écran
-- d'accueil suivi d'une recherche à la main.
--
-- `traite_le` et `erreur` sont la trace du passage de la fonction serveur :
-- une ligne traitée reste, pour qu'on puisse répondre à « pourquoi je n'ai rien
-- reçu ? » sans deviner.
CREATE TABLE IF NOT EXISTS public.envois_notification (
  id BIGSERIAL PRIMARY KEY,
  destinataire UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  genre TEXT NOT NULL CHECK (genre IN ('message', 'demande_ami', 'demande_acceptee', 'progression')),
  acteur UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_avec UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  corps TEXT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  traite_le TIMESTAMPTZ,
  erreur TEXT
);

-- L'index qui compte : la fonction serveur ne cherche que les lignes en
-- attente, et elle le fait toutes les minutes. Sans lui, chaque passage
-- balaierait tout l'historique.
CREATE INDEX IF NOT EXISTS envois_en_attente
  ON public.envois_notification (cree_le)
  WHERE traite_le IS NULL;

ALTER TABLE public.envois_notification ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Le nom à montrer pour quelqu'un
-- ----------------------------------------------------------------------------
--
-- Le titre d'une notification dit « Mohamed t'a envoyé un message ». Il faut
-- donc un nom. On lit `display_name`, et l'on retombe sur un libellé neutre :
-- une notification dont le titre serait « null t'a envoyé un message » serait
-- pire que pas de notification du tout.
--
-- `SECURITY DEFINER` : le déclencheur doit pouvoir lire un profil que
-- l'appelant n'a pas forcément le droit de lire — et il ne rend QUE le nom,
-- jamais le code d'invitation ni quoi que ce soit d'autre.
CREATE OR REPLACE FUNCTION public.nom_pour_notification(p_user UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(btrim(pr.display_name), ''), 'Un ami')
  FROM public.profiles pr
  WHERE pr.id = p_user;
$$;

-- ----------------------------------------------------------------------------
-- Le déclencheur des messages
-- ----------------------------------------------------------------------------
--
-- Il s'exécute APRÈS l'insertion, sur le serveur, et il ne dépend d'aucune
-- application ouverte. C'est toute la garantie : l'expéditeur peut fermer son
-- téléphone immédiatement, la ligne est déjà écrite.
--
-- `SECURITY DEFINER` : le déclencheur écrit dans `envois_notification`, qui
-- n'a AUCUNE politique, et lit les préférences d'un autre compte. Les deux
-- seraient refusés avec les droits de l'appelant — et c'est bien ce qu'on veut,
-- puisque aucun appelant ne doit pouvoir le faire lui-même.
CREATE OR REPLACE FUNCTION public.preparer_envoi_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_destinataire UUID;
  v_prefs public.preferences_notifications;
  v_a_des_prefs BOOLEAN;
BEGIN
  -- Le destinataire est l'autre membre de la paire. Un message à soi-même
  -- n'existe pas — la table l'interdit — mais la garde est ici aussi, parce
  -- qu'une notification à soi-même serait un défaut visible.
  v_destinataire := CASE WHEN NEW.user_a = NEW.auteur THEN NEW.user_b ELSE NEW.user_a END;
  IF v_destinataire = NEW.auteur THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prefs
  FROM public.preferences_notifications
  WHERE user_id = v_destinataire;
  v_a_des_prefs := FOUND;

  -- Pas de ligne de préférences = jamais passé par les réglages = tout activé.
  -- On ne crée PAS la ligne ici : le déclencheur ne doit pas écrire dans une
  -- table que l'utilisateur possède, et une absence vaut le défaut.
  IF v_a_des_prefs AND NOT v_prefs.messages THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.envois_notification
    (destinataire, genre, acteur, conversation_avec, corps)
  VALUES (
    v_destinataire,
    'message',
    NEW.auteur,
    NEW.auteur,
    -- Le corps n'est écrit QUE si le contenu doit être montré. Ce n'est pas
    -- une précaution de confort : c'est ce qui rend impossible la fuite d'un
    -- texte que la personne a demandé à ne pas voir s'afficher.
    CASE WHEN v_a_des_prefs AND v_prefs.masquer_contenu THEN NULL ELSE NEW.corps END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apres_message ON public.discussion_messages;
CREATE TRIGGER apres_message
  AFTER INSERT ON public.discussion_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.preparer_envoi_message();

-- ----------------------------------------------------------------------------
-- Les déclencheurs des amis
-- ----------------------------------------------------------------------------
--
-- Deux moments méritent une notification, et deux seulement : on me demande en
-- ami, et l'on accepte ma demande. La rupture n'en mérite pas — elle se
-- constate en ouvrant l'application, et une notification pour apprendre qu'on
-- vous a retiré serait une façon d'appuyer.
CREATE OR REPLACE FUNCTION public.preparer_envoi_demande()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs public.preferences_notifications;
  v_a_des_prefs BOOLEAN;
BEGIN
  SELECT * INTO v_prefs
  FROM public.preferences_notifications
  WHERE user_id = NEW.vers;
  v_a_des_prefs := FOUND;

  IF v_a_des_prefs AND NOT v_prefs.demandes_amis THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.envois_notification (destinataire, genre, acteur, corps)
  VALUES (NEW.vers, 'demande_ami', NEW.de, NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apres_demande_ami ON public.demandes_amis;
CREATE TRIGGER apres_demande_ami
  AFTER INSERT ON public.demandes_amis
  FOR EACH ROW
  EXECUTE FUNCTION public.preparer_envoi_demande();

CREATE OR REPLACE FUNCTION public.preparer_envoi_acceptation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accepteur UUID;
  v_destinataire UUID;
  v_prefs public.preferences_notifications;
  v_a_des_prefs BOOLEAN;
BEGIN
  -- QUI A ACCEPTÉ, et pourquoi `auth.uid()` est légitime ICI — la seule fois de
  -- ce fichier. Ailleurs il est interdit de décider d'une autorisation dans un
  -- corps de fonction ; ici on ne décide de rien, on LIT un fait : le
  -- déclencheur s'exécute dans la transaction de celui qui vient de créer
  -- l'amitié, donc `auth.uid()` est l'accepteur.
  --
  -- C'est nécessaire parce que l'amitié ne porte pas de colonne « qui a
  -- accepté » : la paire est ordonnée, les deux membres y sont à égalité, et
  -- rien ne les distingue. Sans cela, on notifierait les DEUX — donc on
  -- enverrait une notification à quelqu'un qui vient lui-même d'appuyer sur
  -- « accepter », ce qui est du bruit, et le genre de bruit qui fait couper
  -- toutes les notifications.
  v_accepteur := auth.uid();
  v_destinataire := CASE
    WHEN NEW.user_a = v_accepteur THEN NEW.user_b
    ELSE NEW.user_a
  END;

  IF v_destinataire IS NULL OR v_destinataire = v_accepteur THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_prefs
  FROM public.preferences_notifications
  WHERE user_id = v_destinataire;
  v_a_des_prefs := FOUND;

  IF v_a_des_prefs AND NOT v_prefs.demandes_amis THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.envois_notification (destinataire, genre, acteur, corps)
  VALUES (v_destinataire, 'demande_acceptee', v_accepteur, NULL);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apres_amitie ON public.amis;
CREATE TRIGGER apres_amitie
  AFTER INSERT ON public.amis
  FOR EACH ROW
  EXECUTE FUNCTION public.preparer_envoi_acceptation();

-- ----------------------------------------------------------------------------
-- Les gestes, vus de l'application
-- ----------------------------------------------------------------------------
--
-- `enregistrer_appareil` est `SECURITY DEFINER`, et ce n'est pas pour
-- contourner une politique mais pour en résoudre une contradiction :
--
--   Le jeton est la clé primaire, donc un appareil qui change de compte doit
--   RÉÉCRIRE la ligne — et la politique de mise à jour exige que la ligne
--   appartienne déjà à l'appelant. Un compte qui se connecte sur un téléphone
--   déjà utilisé par un autre ne pourrait donc jamais enregistrer son jeton,
--   et l'ancien compte continuerait de recevoir des notifications sur un
--   téléphone qui n'est plus le sien. C'est une fuite, et elle est bien plus
--   probable qu'une usurpation de jeton.
--
-- Le geste reste borné : le corps vérifie `auth.uid() = p_moi`, et il n'agit
-- que sur la ligne dont le jeton est fourni — un jeton que seul l'appareil
-- concerné détient.
CREATE OR REPLACE FUNCTION public.enregistrer_appareil(
  p_moi UUID,
  p_jeton TEXT,
  p_plateforme TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RETURN FALSE;
  END IF;

  IF p_jeton IS NULL OR length(btrim(p_jeton)) < 8 THEN
    RETURN FALSE;
  END IF;

  IF p_plateforme NOT IN ('ios', 'android') THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.appareils (jeton, user_id, plateforme, vu_le, echecs)
  VALUES (btrim(p_jeton), p_moi, p_plateforme, NOW(), 0)
  ON CONFLICT (jeton) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        plateforme = EXCLUDED.plateforme,
        vu_le = NOW(),
        -- Un jeton réenregistré repart à zéro : il vient de prouver qu'il
        -- existe encore.
        echecs = 0;

  RETURN TRUE;
END;
$$;

/** Retire un appareil. Le compte ne peut retirer que les siens. */
CREATE OR REPLACE FUNCTION public.oublier_appareil(p_jeton TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_supprimes INTEGER;
BEGIN
  DELETE FROM public.appareils WHERE jeton = p_jeton;
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;
  RETURN v_supprimes > 0;
END;
$$;

/**
 * Les préférences de quelqu'un, avec les défauts posés pour une ligne absente.
 *
 * La fonction existe pour qu'il n'y ait qu'UN endroit qui décide ce que vaut
 * une préférence non écrite. Si l'écran et la fonction serveur décidaient
 * chacun de leur côté, une divergence passerait inaperçue jusqu'à ce que
 * quelqu'un se plaigne de ne plus rien recevoir.
 */
CREATE OR REPLACE FUNCTION public.mes_preferences_notifications(p_moi UUID)
RETURNS TABLE (
  messages BOOLEAN,
  demandes_amis BOOLEAN,
  progression_partagee BOOLEAN,
  rappels_apprentissage BOOLEAN,
  rappels_revision BOOLEAN,
  masquer_contenu BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- La garde est écrite, et non laissée à une politique : cette fonction est
  -- `SECURITY DEFINER` — elle doit l'être pour lire une ligne absente sans que
  -- la politique ne fasse disparaître le `LEFT JOIN` —, donc AUCUNE politique
  -- ne s'applique ici. Ce qui n'est pas vérifié dans le corps n'est vérifié
  -- nulle part. Le fait que les préférences de quelqu'un disent seulement s'il
  -- coupe ses notifications n'est pas une raison de les publier : savoir qu'un
  -- ami a coupé les notifications, c'est savoir qu'il a lu et qu'il ne répond
  -- pas.
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(p.messages, TRUE),
    COALESCE(p.demandes_amis, TRUE),
    COALESCE(p.progression_partagee, TRUE),
    COALESCE(p.rappels_apprentissage, TRUE),
    COALESCE(p.rappels_revision, TRUE),
    COALESCE(p.masquer_contenu, FALSE)
  FROM (SELECT 1) AS une_ligne
  LEFT JOIN public.preferences_notifications p ON p.user_id = p_moi;
END;
$$;

/**
 * Écrit les préférences d'un coup.
 *
 * Toutes ensemble, et non champ par champ : l'écran les montre toutes, il les
 * enregistre toutes, et un enregistrement partiel ferait deux endroits où la
 * même règle s'écrit. `SECURITY DEFINER` pour la même raison que les autres
 * gestes : `auth.uid()` doit être vérifié dans le corps, et une fonction
 * `SECURITY INVOKER` n'a pas `USAGE` sur le schéma `auth`.
 */
CREATE OR REPLACE FUNCTION public.enregistrer_preferences_notifications(
  p_moi UUID,
  p_messages BOOLEAN,
  p_demandes_amis BOOLEAN,
  p_progression_partagee BOOLEAN,
  p_rappels_apprentissage BOOLEAN,
  p_rappels_revision BOOLEAN,
  p_masquer_contenu BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.preferences_notifications AS p (
    user_id, messages, demandes_amis, progression_partagee,
    rappels_apprentissage, rappels_revision, masquer_contenu, maj_le
  )
  VALUES (
    p_moi,
    COALESCE(p_messages, TRUE),
    COALESCE(p_demandes_amis, TRUE),
    COALESCE(p_progression_partagee, TRUE),
    COALESCE(p_rappels_apprentissage, TRUE),
    COALESCE(p_rappels_revision, TRUE),
    COALESCE(p_masquer_contenu, FALSE),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    messages = EXCLUDED.messages,
    demandes_amis = EXCLUDED.demandes_amis,
    progression_partagee = EXCLUDED.progression_partagee,
    rappels_apprentissage = EXCLUDED.rappels_apprentissage,
    rappels_revision = EXCLUDED.rappels_revision,
    masquer_contenu = EXCLUDED.masquer_contenu,
    maj_le = NOW();

  RETURN TRUE;
END;
$$;

/**
 * Annonce volontaire d'une étape à ses amis.
 *
 * C'est la SEULE notification qu'un utilisateur déclenche lui-même, et elle est
 * donc le seul geste qui pourrait servir à inonder quelqu'un. Trois bornes :
 *   - il faut être ami (la fonction ne connaît que `public.amis`) ;
 *   - le texte est borné, et vidé de ses caractères de contrôle ;
 *   - une seule annonce par heure, par personne.
 *
 * Le destinataire garde la main : sa préférence `progression_partagee` décide
 * s'il reçoit quelque chose, et elle est lue ICI, pas par l'expéditeur.
 */
CREATE OR REPLACE FUNCTION public.annoncer_etape(p_moi UUID, p_texte TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_texte TEXT;
  v_amis UUID[];
  v_destinataire UUID;
  v_envoyes INTEGER := 0;
  v_deja INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_moi THEN
    RETURN 0;
  END IF;

  v_texte := btrim(regexp_replace(COALESCE(p_texte, ''), '[[:space:]]+', ' ', 'g'));
  IF length(v_texte) = 0 THEN
    RETURN 0;
  END IF;
  v_texte := left(v_texte, 140);

  -- Une annonce par heure et par personne. Sans cette borne, un bouton
  -- « partager » deviendrait un moyen d'inonder ses amis, et ce serait à eux
  -- de s'en défendre en coupant la catégorie entière.
  SELECT count(*) INTO v_deja
  FROM public.envois_notification
  WHERE acteur = p_moi
    AND genre = 'progression'
    AND cree_le > NOW() - INTERVAL '1 hour';
  IF v_deja > 0 THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(array_agg(CASE WHEN a.user_a = p_moi THEN a.user_b ELSE a.user_a END), ARRAY[]::UUID[])
  INTO v_amis
  FROM public.amis a
  WHERE a.user_a = p_moi OR a.user_b = p_moi;

  FOREACH v_destinataire IN ARRAY v_amis LOOP
    CONTINUE WHEN v_destinataire = p_moi;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.preferences_notifications p
      WHERE p.user_id = v_destinataire AND NOT p.progression_partagee
    );

    INSERT INTO public.envois_notification (destinataire, genre, acteur, corps)
    VALUES (v_destinataire, 'progression', p_moi, v_texte);

    v_envoyes := v_envoyes + 1;
  END LOOP;

  RETURN v_envoyes;
END;
$$;

-- ----------------------------------------------------------------------------
-- La prise des lignes en attente
-- ----------------------------------------------------------------------------
--
-- C'est ce qui empêche d'envoyer DEUX FOIS la même notification, et la
-- propriété est obtenue par la forme de la requête, non par la discipline de
-- l'appelant :
--
--   `FOR UPDATE SKIP LOCKED` fait que deux passages simultanés — un
--   ordonnanceur qui se chevauche, un envoi manuel pendant le passage
--   automatique — ne peuvent pas prendre la même ligne. Le second saute ce que
--   le premier tient, au lieu d'attendre et de le renvoyer.
--
-- La ligne est marquée comme traitée AVANT l'envoi, et c'est un choix : on
-- préfère perdre une notification plutôt que d'en envoyer deux. Une
-- notification manquée se voit en ouvrant l'application, où le message est là ;
-- une notification en double ne se répare pas, et c'est le genre de défaut qui
-- fait couper les notifications pour de bon.
--
-- `service_role` seulement : c'est la fonction serveur qui vide la boîte, et
-- personne d'autre. Aucun `GRANT` à `authenticated` — un utilisateur qui
-- pourrait réclamer des envois pourrait les consommer sans qu'ils partent.
CREATE OR REPLACE FUNCTION public.reclamer_envois(p_limite INTEGER DEFAULT 50)
RETURNS SETOF public.envois_notification
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH pris AS (
    SELECT id
    FROM public.envois_notification
    WHERE traite_le IS NULL
    ORDER BY cree_le
    LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 50), 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.envois_notification e
     SET traite_le = NOW()
    FROM pris
   WHERE e.id = pris.id
  RETURNING e.*;
$$;

-- ----------------------------------------------------------------------------
-- Les droits
-- ----------------------------------------------------------------------------
--
-- Les trois gestes sont accordés à `authenticated` pour qu'un appelant non
-- autorisé reçoive un refus LISIBLE plutôt qu'une erreur de droits — c'est la
-- fonction qui tranche, dans son corps, en comparant `auth.uid()`.
--
-- `preparer_envoi_message`, `preparer_envoi_demande` et
-- `preparer_envoi_acceptation` ne sont accordées à PERSONNE : ce sont des
-- fonctions de déclencheur, et un déclencheur s'exécute avec les droits de son
-- propriétaire. Les accorder ouvrirait la boîte d'envoi à qui voudrait y
-- écrire.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appareils TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.preferences_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_appareil(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oublier_appareil(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mes_preferences_notifications(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enregistrer_preferences_notifications(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annoncer_etape(UUID, TEXT) TO authenticated;

-- La prise des lignes n'est accordée QU'AU rôle de service, et ce n'est pas une
-- précaution de style : un utilisateur qui pourrait réclamer des envois
-- pourrait les consommer sans qu'ils partent, donc éteindre les notifications
-- de n'importe qui en silence.
GRANT EXECUTE ON FUNCTION public.reclamer_envois(INTEGER) TO service_role;

-- La boîte d'envoi est la SEULE table de ce fichier dont les droits de table
-- sont accordés alors qu'aucune politique ne les ouvre. C'est délibéré, et c'est
-- même le cœur de sa protection.
--
-- Chez Supabase, toute table créée dans `public` reçoit les privilèges de table
-- par défaut. Ce qui ferme donc la boîte n'est pas un `GRANT` absent, mais
-- l'absence de POLITIQUE. Écrire ce `GRANT` rend cette phrase vraie, et surtout
-- vérifiable : sans lui, un banc qui ne reproduit pas les privilèges par défaut
-- verrait « permission denied for table » et croirait avoir éprouvé la RLS,
-- alors qu'il aurait éprouvé un droit manquant. Or les deux refus portent le
-- même code SQLSTATE (42501) : seule la phrase les distingue.
--
-- La différence n'est pas théorique. Le jour où quelqu'un ajoute ici une
-- politique permissive — un copier-coller d'une table voisine — un banc privé
-- du `GRANT` continuerait de tout refuser et resterait vert, tandis que le
-- serveur, lui, aurait ouvert la boîte d'envoi à tout le monde.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.envois_notification TO authenticated;

-- Et la SÉQUENCE, sans laquelle ce qui précède ne sert à rien : `id BIGSERIAL`
-- tire son numéro d'une séquence, et un INSERT exige `USAGE` dessus. C'est une
-- TROISIÈME porte, et elle porte le même code SQLSTATE (42501) que les deux
-- autres — « permission denied for sequence envois_notification_id_seq ».
--
-- C'est le banc qui l'a trouvée, et seulement après avoir été renforcé : tant
-- que l'épreuve se contentait de vérifier qu'il y avait un refus, elle passait
-- pour la mauvaise raison. Le même GRANT existe pour discussion_messages, dont
-- l'identifiant est lui aussi engendré par une séquence.
GRANT USAGE, SELECT ON SEQUENCE public.envois_notification_id_seq TO authenticated;

NOTIFY pgrst, 'reload schema';
