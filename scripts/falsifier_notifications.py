#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur des décisions de notification.

Même exigence que les autres falsificateurs du dépôt : une mutation qui n'est
pas détectée accuse le test, pas la mutation. Et le témoin compte les tests
exécutés, parce que `node --test` sort en 0 quand un motif ne désigne rien.

Ce que ce fichier vise, ce sont les défauts qui ne se voient PAS sur un
téléphone :

  - une préférence absente lue comme « non » — et donc six interrupteurs qui
    s'éteignent tout seuls le jour où une colonne manque dans la réponse ;
  - `masquer_contenu` dont le défaut part du mauvais côté, et qui fait
    disparaître le texte que la personne attend ;
  - une cible d'appui construite sur un identifiant vide, qui mènerait à un fil
    sans participant — donc à une erreur de base pour une donnée jamais reçue ;
  - et l'import qui ne doit PAS être là : ce module est éprouvable parce qu'il
    n'importe rien, et une seule ligne d'import le ferait tomber en bloc.

IL VISE AUSSI LA FONCTION SERVEUR, ET C'EST LE POINT LE PLUS GRAVE
-----------------------------------------------------------------
`supabase/functions/envoyer-notifications/index.ts` est du Deno, et il n'y a pas
de Deno dans `ci.yml` : ce fichier n'est exécuté par AUCUNE étape. Sa porte — le
contrôle du secret — pourrait donc disparaître sans qu'un seul contrôle ne
bronche, et une fonction d'envoi sans porte laisse n'importe qui faire sonner
les téléphones de tous les utilisateurs. Rien dans les journaux ne le dirait :
les appels refusés n'y apparaissent que si le code les refuse.

Ce que ces mutations éprouvent n'est donc pas le COMPORTEMENT de la fonction —
personne ne l'exécute — mais la présence des invariants que
`tests/notifications_envoi.test.mjs` lit dans la source. C'est une garantie plus
faible, et elle est dite comme telle : le jour où la fonction tournera pour de
vrai, ce sont les appels réels qu'il faudra mesurer.

CE QUE CE FICHIER DOIT AU FALSIFICATEUR DE LA DISCUSSION
--------------------------------------------------------
La même leçon, apprise là-bas et réemployée ici : une ancre qui ne trouve pas sa
cible n'est pas un défaut du falsificateur, c'est la source qui a dérivé de ce
que le falsificateur décrit. Quand une ancre tombe à 0 occurrence, comparer la
ligne visée à la ligne attendue avant de réparer l'ancre.
"""

import io
import os
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = ["tests/notifications.test.mjs", "tests/notifications_envoi.test.mjs"]
NODE = shutil.which("node") or "node"

N = "src/lib/notifications.ts"
F = "supabase/functions/envoyer-notifications/index.ts"
W = ".github/workflows/notifications.yml"
Q = "supabase/notifications.sql"
S = "src/lib/sessionAppareil.ts"
A = "src/components/SauvegardeSection.tsx"
P = "src/lib/push.ts"


def executer_tests():
    environ = dict(os.environ)
    environ["NODE_OPTIONS"] = ""
    resultat = subprocess.run(
        [
            NODE,
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            *TESTS,
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environ,
    )
    sortie = (resultat.stdout or "") + (resultat.stderr or "")
    # Le NOMBRE de tests exécutés, et non le code de sortie seul : `node --test`
    # rend 0 quand aucun test ne correspond au motif, et un falsificateur qui
    # prendrait ce zéro pour un succès validerait une suite vide.
    nombre = 0
    for ligne in sortie.splitlines():
        if ligne.startswith("# tests "):
            nombre = int(ligne.split()[-1])
    return resultat.returncode, nombre, sortie


def muter(chemin, motif, remplacement):
    fichier = RACINE / chemin
    source = io.open(fichier, encoding="utf-8").read()
    occurrences = source.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{chemin} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )
    io.open(fichier, "w", encoding="utf-8", newline="\n").write(
        source.replace(motif, remplacement)
    )


code, nombre, sortie = executer_tests()
if code != 0 or nombre == 0:
    print(f"TÉMOIN ROUGE : {nombre} test(s), code {code}")
    print(sortie[-2500:])
    sys.exit(1)
print(f"témoin : {nombre} test(s), tous verts\n")

MUTATIONS = [
    # --- La lecture des préférences -----------------------------------------
    (
        N,
        "    messages: ligne.messages !== false,",
        "    messages: ligne.messages === true,",
        "une préférence absente s'éteint : une colonne manquante coupe tout",
    ),
    (
        N,
        "    demandes_amis: ligne.demandes_amis !== false,",
        "    demandes_amis: ligne.demandes_amis === true,",
        "les demandes d'amis s'éteignent quand la colonne n'est pas lue",
    ),
    (
        N,
        "    progression_partagee: ligne.progression_partagee !== false,",
        "    progression_partagee: ligne.progression_partagee === true,",
        "les étapes partagées s'éteignent quand la colonne n'est pas lue",
    ),
    (
        N,
        "    rappels_apprentissage: ligne.rappels_apprentissage !== false,",
        "    rappels_apprentissage: ligne.rappels_apprentissage === true,",
        "le rappel d'apprentissage s'éteint quand la colonne n'est pas lue",
    ),
    (
        N,
        "    rappels_revision: ligne.rappels_revision !== false,",
        "    rappels_revision: ligne.rappels_revision === true,",
        "le rappel de révision s'éteint quand la colonne n'est pas lue",
    ),
    (
        N,
        "    masquer_contenu: ligne.masquer_contenu === true,",
        "    masquer_contenu: ligne.masquer_contenu !== false,",
        "le masquage s'active tout seul : le texte attendu disparaît",
    ),
    (
        N,
        "  if (ligne === null || ligne === undefined) return { ...PREFERENCES_PAR_DEFAUT };",
        "  if (false) return { ...PREFERENCES_PAR_DEFAUT };",
        "sans aucune ligne, tout s'éteint au lieu de garder les défauts",
    ),
    (
        N,
        "  return { ...preferences, [cle]: !preferences[cle] };",
        "  return { ...preferences, [cle]: preferences[cle] };",
        "un interrupteur bascule sans changer d'état",
    ),
    (
        N,
        "    (entree) => !entree.bientot && entree.cle !== 'masquer_contenu'",
        "    (entree) => !entree.bientot",
        "le masquage compte parmi les types qui envoient : le résumé annonce tout activé à tort",
    ),
    (
        N,
        "    (entree) => !entree.bientot && entree.cle !== 'masquer_contenu'",
        "    (entree) => entree.cle !== 'masquer_contenu'",
        "les rappels comptent comme s'ils envoyaient : le résumé promet un rappel qui n'existe pas",
    ),
    (
        N,
        "    cle: 'rappels_apprentissage',\n    titre: 'Rappels d’apprentissage',\n    aide: 'Bientôt : aucun rappel n’est encore posé, mais ton choix est gardé.',\n    bientot: true,",
        "    cle: 'rappels_apprentissage',\n    titre: 'Rappels d’apprentissage',\n    aide: 'Bientôt : aucun rappel n’est encore posé, mais ton choix est gardé.',\n    bientot: false,",
        "un rappel n'est plus marqué « à venir » : l'écran le présente comme actif",
    ),
    (
        N,
        "    cle: 'rappels_revision',\n    titre: 'Rappels de révision',\n    aide: 'Bientôt : aucun rappel n’est encore posé, mais ton choix est gardé.',\n    bientot: true,",
        "    cle: 'rappels_revision',\n    titre: 'Rappels de révision',\n    aide: 'Un rappel quand des révisions sont arrivées à échéance.',\n    bientot: true,",
        "la ligne marquée « bientôt » promet de nouveau un rappel qui n'existe pas",
    ),
    (
        N,
        "  if (actifs === envoient.length) {",
        "  if (actifs === 5) {",
        "le résumé n'annonce plus que tout est activé",
    ),
    (
        N,
        "  if (actifs === 0) return 'Aucune notification ne sera envoyée.';",
        "  if (false) return 'Aucune notification ne sera envoyée.';",
        "l'écran ne dit plus que plus rien ne partira",
    ),
    # --- La cible d'un appui ------------------------------------------------
    (
        N,
        "  const conversation = charge.conversationAvec ?? charge.acteur;",
        "  const conversation = charge.conversationAvec;",
        "une demande acceptée n'ouvre plus la conversation de qui a accepté",
    ),
    (
        N,
        "  if (!(GENRES as readonly string[]).includes(genre)) return { type: 'accueil' };",
        "  if (false) return { type: 'accueil' };",
        "un genre inconnu mène aux amis au lieu de l'accueil",
    ),
    (
        N,
        "  return typeof valeur === 'string' && valeur.trim().length >= 8;",
        "  return typeof valeur === 'string';",
        "un identifiant trop court ou vide mène à une conversation inexistante",
    ),
    (
        N,
        "    if (identifiantPlausible(conversation)) {\n      return { type: 'discussion', amiId: conversation.trim() };\n    }\n    return { type: 'amis' };",
        "    if (identifiantPlausible(conversation)) {\n      return { type: 'discussion', amiId: conversation.trim() };\n    }\n    return { type: 'accueil' };",
        "un message sans conversation lisible mène à l'accueil au lieu des amis",
    ),
    (
        N,
        "  if (donnees === null || typeof donnees !== 'object') return { type: 'accueil' };",
        "  if (false) return { type: 'accueil' };",
        "une charge utile qui n'est pas un objet est lue quand même",
    ),
    # --- La promesse de forme ----------------------------------------------
    (
        N,
        "export type PreferenceNotification =",
        "import { Platform } from 'react-native';\n\nexport type PreferenceNotification =",
        "un import entre dans le module des décisions : il devient inéprouvable",
    ),
    # --- La porte de la fonction serveur ------------------------------------
    #
    # Ces mutations visent un fichier que RIEN n'exécute : la fonction est du
    # Deno, et la chaîne de vérification n'a pas de Deno. Sans le contrôle de
    # forme de `tests/notifications_envoi.test.mjs`, la porte pourrait
    # disparaître sans que personne ne le voie — et une fonction d'envoi sans
    # porte laisse n'importe qui faire sonner les téléphones de tous les
    # utilisateurs, sans que rien ne le dise dans les journaux.
    (
        F,
        "  if (secret.length < 16) {",
        "  if (secret.length < 1) {",
        "un secret d'un caractère ouvre la fonction d'envoi à tout le monde",
    ),
    (
        F,
        "  if (requete.headers.get('x-notifications-secret') !== secret) {",
        "  if (false) {",
        "l'en-tête n'est plus vérifié : n'importe qui peut faire sonner les téléphones",
    ),
    (
        F,
        "  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');",
        "  const cleService = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.faux.faux';",
        "la clé de service est recopiée dans le source, sur un dépôt public",
    ),
    (
        F,
        "await base.rpc('reclamer_envois', {",
        "await base.rpc('autre_chose', {",
        "la prise ne passe plus par la réclamation : les envois partiraient en double",
    ),
    (
        F,
        "const MAX_PAR_REQUETE = 100;",
        "const MAX_PAR_REQUETE = 500;",
        "au-delà de cent, le service tronque en silence : des notifications se perdent",
    ),
    (
        F,
        "      if (code === 'DeviceNotRegistered') {",
        "      if (true) {",
        "tout échec retire le jeton : un incident réseau désabonne les gens",
    ),
    (
        F,
        "        body: envoi.corps ?? 'Vous avez reçu un nouveau message',",
        "        body: envoi.corps ?? '',",
        "le message masqué part sans texte : une notification vide",
    ),
    (
        F,
        "        channelId: 'messages',",
        "        channelId: 'default',",
        "le canal Android du serveur ne correspond plus à celui de l'application",
    ),
    # --- L'ordonnanceur -----------------------------------------------------
    (
        W,
        "x-notifications-secret: ${NOTIFICATIONS_SECRET}",
        "x-notifications-secret: desactive",
        "l'ordonnanceur appelle la fonction sans le secret : rien ne partira",
    ),
    (
        W,
        "            --fail-with-body \\\n",
        "",
        "un refus de la fonction ne rend plus le flux rouge : « vert » sans envoi",
    ),
    (
        W,
        "    - cron: '*/5 * * * *'",
        "    - cron: '0 * * * *'",
        "l'ordonnanceur n'est plus appelé toutes les cinq minutes",
    ),
    # --- La boîte d'envoi ---------------------------------------------------
    (
        Q,
        "ALTER TABLE public.envois_notification ENABLE ROW LEVEL SECURITY;",
        'ALTER TABLE public.envois_notification ENABLE ROW LEVEL SECURITY;\n'
        'CREATE POLICY "lecture" ON public.envois_notification FOR SELECT TO authenticated USING (true);',
        "une politique ouvre la file : les messages à venir deviennent lisibles",
    ),
    (
        Q,
        "GRANT EXECUTE ON FUNCTION public.reclamer_envois(INTEGER) TO service_role;",
        "GRANT EXECUTE ON FUNCTION public.reclamer_envois(INTEGER) TO authenticated;",
        "un utilisateur peut consommer les envois : il éteint les notifications des autres",
    ),
    # --- La déconnexion -----------------------------------------------------
    #
    # La fuite que ces mutations visent est invisible sur l'appareil qu'on
    # quitte : elle se produit sur CELUI QUI RESTE. Un téléphone prêté, revendu
    # ou simplement laissé à un proche continuerait de recevoir les
    # notifications du compte déconnecté, et de les afficher.
    (
        S,
        "  await oublierLeJeton();\n  await seDeconnecter();",
        "  await seDeconnecter();",
        "la déconnexion n'oublie plus l'appareil : le compte quitté garde ce téléphone",
    ),
    (
        S,
        "    await oublierAppareil(jeton);",
        "    void jeton;",
        "le jeton n'est plus retiré du compte : il reste joignable après la déconnexion",
    ),
    (
        A,
        "            await quitterLeCompte();",
        "            await seDeconnecter();",
        "l'écran de sauvegarde se déconnecte en gardant le téléphone joignable",
    ),
    # --- L'affichage au premier plan -----------------------------------------
    # Cette mutation remplace la clé que le module natif LIT par celle du SDK
    # suivant. Elle ne casse rien, elle ne lève pas, et le contrôle de types ne
    # la voit pas : `expo-notifications` 0.29 n'a pas d'excès de propriétés à
    # signaler sur un objet rendu par une fonction. Le seul symptôme serait une
    # notification reçue au premier plan qui ne s'affiche pas.
    (
        P,
        "        shouldShowAlert: true,",
        "        shouldShowBanner: true,",
        "l'affichage emploie la clé du SDK suivant : la notification reçue au premier plan ne s'affiche plus",
    ),
]

resultats = []
for chemin, motif, remplacement, description in MUTATIONS:
    initial = io.open(RACINE / chemin, encoding="utf-8").read()
    try:
        muter(chemin, motif, remplacement)
    except AssertionError as erreur:
        print(f"ANCRE       {description} : {erreur}")
        resultats.append((description, None))
        continue

    try:
        code, nombre, sortie = executer_tests()
    finally:
        io.open(RACINE / chemin, "w", encoding="utf-8", newline="\n").write(initial)

    if nombre == 0:
        verdict, detail = "HARNAIS", "aucun test exécuté"
    elif code != 0:
        verdict, detail = "DETECTEE", ""
    else:
        verdict, detail = "NON DETECTEE", "le test reste vert"

    resultats.append((description, verdict == "DETECTEE"))
    print(f"{verdict:<12} {description}{'  — ' + detail if detail else ''}")

detectees = sum(1 for _, ok in resultats if ok is True)
ancrees = sum(1 for _, ok in resultats if ok is None)
print(f"\n{detectees}/{len(resultats)} mutations détectées.")
if ancrees:
    print(f"{ancrees} ancre(s) introuvable(s) : à corriger.")
sys.exit(0 if detectees == len(resultats) else 1)
