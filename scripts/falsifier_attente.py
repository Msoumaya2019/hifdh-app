#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur de l'attente bornée.

Ce qu'il défend : un rond qui tourne sans fin. Le défaut a été signalé deux fois
depuis un téléphone — après la création d'un compte, et à la place du code
d'invitation — et il a la même forme chaque fois : un `await` dont la promesse
peut ne jamais rendre, sur un écran qui n'affiche « en cours » que tant qu'il
attend.

Les mutations ci-dessous remettent donc en place, une par une, chacune des
manières de refaire le défaut. Elles ne vérifient pas que le correctif « est
là » : elles vérifient qu'un test tombe quand on l'enlève.

Même exigence que les autres falsificateurs du dépôt : une mutation qui n'est
pas détectée accuse le test, pas la mutation. Et le témoin compte les tests
exécutés, parce que `node --test` sort en 0 quand un motif ne désigne rien.
"""

import io
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = ["tests/attente.test.mjs"]
NODE = shutil.which("node") or "node"


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
    sortie = resultat.stdout + resultat.stderr
    correspondance = re.search(r"^# tests (\d+)", sortie, re.MULTILINE)
    nombre = int(correspondance.group(1)) if correspondance else 0
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
    # === L'écran de sauvegarde =============================================
    #
    # Les gestes d'authentification sont passés de quatre copies à UN lanceur
    # partagé. Les garanties n'ont pas changé, mais elles sont devenues
    # structurelles : il suffit que le lanceur soit juste, et qu'aucun geste ne
    # le contourne. Les mutations ci-dessous attaquent donc le lanceur lui-même,
    # plus une qui vérifie qu'on ne peut pas le contourner en silence.
    (
        "src/components/SauvegardeSection.tsx",
        "    } catch (erreur) {\n      resultat = messageDePanique(erreur);\n    } finally {\n      enCoursReference.current = false;\n      setEnCours(false);\n    }",
        "    } catch (erreur) {\n      resultat = messageDePanique(erreur);\n    }\n    enCoursReference.current = false;\n    setEnCours(false);",
        "« en cours » n'est plus retiré dans un finally : une sortie anormale le laisse tourner",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "      resultat = await borner(action());",
        "      resultat = await action();",
        "le lanceur ne borne plus l'attente : les quatre gestes perdent leur borne d'un coup",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "    if (enCoursReference.current) {\n      return { ok: false, message: '' };\n    }\n",
        "",
        "le verrou de réentrance disparaît : deux appuis lancent deux attentes en course",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "      enCoursReference.current = false;\n      setEnCours(false);\n    }",
        "      setEnCours(false);\n    }",
        "le verrou n'est jamais relâché : le bouton ne marche plus qu'une fois",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "  const handleMotDePasseOublie = () => lancer(() => reinitialiserMotDePasse(email));",
        "  const handleMotDePasseOublie = () => reinitialiserMotDePasse(email);",
        "un geste contourne le lanceur : il échappe au verrou et à la borne sans que rien ne le dise",
    ),
    # === La lecture de session, qui n'est pas un geste d'authentification ===
    (
        "src/components/SauvegardeSection.tsx",
        "    const resultat = await withTimeout(utilisateurCourant());",
        "    const resultat = await utilisateurCourant();",
        "la lecture de session n'est plus bornée",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "    setUtilisateur(resultat === TIMEOUT ? null : resultat);",
        "    setUtilisateur(resultat as Utilisateur | null);",
        "un délai dépassé est présenté comme une session valide",
    ),
    # === La section des amis ===============================================
    (
        "src/components/AmisSection.tsx",
        "const oui = await repondreDans(utilisateurCourant(), DELAI_SESSION_MS);",
        "const oui = await utilisateurCourant();",
        "la section des amis attend la session sans borne : « connecte » reste null",
    ),
    (
        "src/components/AmisSection.tsx",
        "      if (oui === DELAI_DEPASSE) {\n        setConnecte(false);\n        return;\n      }\n",
        "",
        "le délai dépassé n'est plus traité : l'état reste inconnu, donc un rond",
    ),
    # La borne ne couvre pas le rejet : `Promise.race` rend la première promesse
    # qui s'achève, et un rejet est un achèvement. Mesuré : `getSession()`
    # rejette quand le stockage refuse une clé — d'où un rond sans fin sur
    # « Mes amis », alors que le délai, lui, était bien posé.
    (
        "src/components/AmisSection.tsx",
        "    } catch {\n",
        "    } finally {\n",
        "le rejet de la lecture n'est plus rattrapé : « connecte » reste null, donc un rond",
    ),
    (
        "src/components/AmisSection.tsx",
        "  if (panne !== null) {",
        "  if (false) {",
        "l'état de panne n'est plus rendu : le rejet n'a plus de sortie affichable",
    ),
    # === L'écran des amis ==================================================
    (
        "app/(tabs)/amis.tsx",
        "    } finally {\n      setChargement(false);\n    }",
        "    }\n    setChargement(false);",
        "« chargement » n'est plus retiré dans un finally",
    ),
    (
        "app/(tabs)/amis.tsx",
        "            ) : chargement ? (\n"
        "              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />\n"
        "            ) : (",
        "            ) : (\n"
        "              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />\n"
        "            ) : (",
        "l'indicateur tourne dès que le code manque : l'échec redevient un rond",
    ),
    (
        "app/(tabs)/amis.tsx",
        "                  accessibilityLabel=\"Réessayer d’obtenir le code\"",
        "                  accessibilityLabel=\"\"",
        "l'échec n'offre plus de moyen d'agir",
    ),
    # Le `finally` ferme les trois issues, mais il ne les NOMME pas : un rejet
    # qui remonte part en rejet non traité, et l'écran se referme sans rien dire.
    #
    # L'ancre a été REPRISE le jour où ce bloc a été réécrit : le commentaire a
    # été raccourci et le `setErreur(...)` ramené sur une ligne. La version
    # précédente citait « La progression n'a pas pu être lue » et un appel sur
    # trois lignes, qui n'existaient plus — le banc annonçait alors « ANCRE ...
    # 0 occurrence(s) », c'est-à-dire qu'il ne mesurait plus rien. Une ancre se
    # relit dans le fichier, jamais de mémoire.
    (
        "app/(tabs)/amis.tsx",
        "    } catch {\n"
        "      // Un REJET, lui, n'était rattrapé par rien : il partait en rejet non\n"
        "      // traité, aucune phrase n'était posée, et l'écran se refermait sans rien\n"
        "      // dire.\n"
        "      setErreur(\"La liste n'a pas pu être lue. Vérifiez votre connexion, puis réessayez.\");\n"
        "    } finally {",
        "    } finally {",
        "le rejet de la lecture n'est plus rattrapé sur l'écran des amis",
    ),
    (
        "app/(tabs)/amis.tsx",
        "          {!chargement && amis === null && (",
        "          {false && (",
        "la liste n'a plus de sortie quand elle n'a pas pu être lue",
    ),
    # === L'écran du lien de courriel =======================================
    #
    # Signalé depuis un téléphone, et sous une troisième forme : le lien ouvre
    # l'application, l'écran s'affiche, et « Ouverture du lien… » reste là —
    # sans bouton, sans erreur, sans fin. Deux causes, deux garde-fous.
    (
        "app/lien.tsx",
        "    } catch (erreur) {\n      // `ouvrirSessionDepuisLien` peut REJETER",
        "    } finally {\n      // Mutation : le rejet n'est plus rattrapé.",
        "le rejet de l'échange n'est plus rattrapé : l'écran reste sur « Vérification du lien… »",
    ),
    (
        "app/lien.tsx",
        "      setEtat((precedent) =>\n"
        "        precedent.nom === attendu\n"
        "          ? { nom: 'probleme', message: MESSAGE_SANS_SORTIE[attendu] }\n"
        "          : precedent\n"
        "      );",
        "      // Mutation : l'échéance ne mène nulle part.",
        "l'échéance ne mène plus à un état affichable : l'attente redevient sans fin",
    ),
    (
        "app/lien.tsx",
        "    const attendu = etat.nom;",
        "    const attendu = 'attente';",
        "l'état observé n'est plus figé : l'échéance ne compare plus rien",
    ),
    (
        "app/lien.tsx",
        "        precedent.nom === attendu",
        "        true",
        "l'échéance écrase un état déjà avancé : une session ouverte serait effacée",
    ),
    # --- La RÉCEPTION de l'adresse ------------------------------------------
    #
    # Le même symptôme — « Ouverture du lien… » sans fin —, mais une autre
    # cause, mesurée sur un téléphone : l'échange des jetons n'était jamais
    # atteint, parce qu'AUCUNE adresse ne parvenait à l'écran. Les deux lectures
    # d'adresse ne couvrent pas les mêmes cas (`expo-linking/ios/`) : celle de
    # React Native ne rend rien à l'ouverture à chaud — l'application tournait
    # déjà —, et celle du registre natif d'Expo est vide au lancement à froid.
    # Les quatre mutations ci-dessous font chacune disparaître l'une des deux,
    # ou les confondent.
    (
        "app/lien.tsx",
        "  const urlExpo = Linking.useLinkingURL();",
        "  const urlExpo = Linking.useURL();",
        "les deux lectures interrogent la même source : une ouverture à chaud ne donne rien",
    ),
    (
        "app/lien.tsx",
        "  const urlNative = Linking.useURL();",
        "  const urlNative = Linking.useLinkingURL();",
        "les deux lectures interrogent le registre natif : un lancement à froid ne donne rien",
    ),
    (
        "app/lien.tsx",
        "    const candidates = [urlNative, urlExpo].filter(",
        "    const candidates = [urlNative].filter(",
        "une seule source alimente le traitement : l'autre est lue et jamais utilisée",
    ),
    (
        "app/lien.tsx",
        "      if (dejaTraitees.current.has(adresse)) continue;",
        "      if (false) continue;",
        "la même adresse est traitée deux fois : les jetons sont consommés deux fois",
    ),
    # === La couche des amis ================================================
    (
        "src/lib/sync/amis.ts",
        "  const utilisateur = await borner(utilisateurCourant());",
        "  const utilisateur = await utilisateurCourant();",
        "contexte() attend la session sans borne : les cinq appels héritent du défaut",
    ),
    (
        "src/lib/sync/amis.ts",
        "  if (utilisateur === DELAI_DEPASSE) return { refus: 'delai' };",
        "",
        "le délai dépassé devient « pas connecté » — un mensonge silencieux",
    ),
    (
        "src/lib/sync/amis.ts",
        "  const reponse = await borner(client.rpc(fonction, parametres));",
        "  const reponse = await client.rpc(fonction, parametres);",
        "le helper RPC n'est plus borné : les quatre appels RPC héritent du défaut",
    ),
    (
        "src/lib/sync/amis.ts",
        "  const reponse = await borner(client.from('amis').delete().eq('user_a', a).eq('user_b', b));",
        "  const reponse = await client.from('amis').delete().eq('user_a', a).eq('user_b', b);",
        "la suppression n'est plus bornée",
    ),
    (
        "src/lib/sync/amis.ts",
        "    if (appel.erreur === MESSAGE_DELAI) return { statut: 'erreur', message: appel.erreur };\n",
        "",
        "un délai dépassé est présenté comme un refus de la base",
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
