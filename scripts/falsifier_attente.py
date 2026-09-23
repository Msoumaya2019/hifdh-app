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
    (
        "src/components/SauvegardeSection.tsx",
        "      resultat = await borner(seConnecter(email, motDePasse));\n    } catch (erreur) {\n      resultat = messageDePanique(erreur);\n    } finally {\n      enCoursReference.current = false;\n      setEnCours(false);\n    }",
        "      resultat = await borner(seConnecter(email, motDePasse));\n    } catch (erreur) {\n      resultat = messageDePanique(erreur);\n    }\n    setEnCours(false);",
        "« en cours » n'est plus retiré dans un finally : une exception le laisse tourner",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "      resultat = await borner(creerCompte(email, motDePasse));",
        "      resultat = await creerCompte(email, motDePasse);",
        "la création de compte n'est plus bornée",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "      resultat = await borner(seConnecter(email, motDePasse));",
        "      resultat = await seConnecter(email, motDePasse);",
        "la connexion n'est plus bornée : c'est exactement le défaut signalé",
    ),
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
    (
        "src/components/SauvegardeSection.tsx",
        "    if (enCoursReference.current) return;\n    enCoursReference.current = true;\n    setEnCours(true);\n    setMessage(null);\n    let resultat: ResultatAuth;\n    try {\n      resultat = await borner(creerCompte(email, motDePasse));",
        "    setEnCours(true);\n    setMessage(null);\n    let resultat: ResultatAuth;\n    try {\n      resultat = await borner(creerCompte(email, motDePasse));",
        "le verrou de réentrance disparaît : deux appuis lancent deux attentes en course",
    ),
    (
        "src/components/SauvegardeSection.tsx",
        "      enCoursReference.current = false;\n      setEnCours(false);\n    }\n    setMessage({ texte: resultat.message, ton: resultat.ok ? 'succes' : 'erreur' });\n    if (resultat.ok) {\n      setMotDePasse('');\n      await rafraichirUtilisateur();\n    }\n  };\n\n  const handleConnexion",
        "      setEnCours(false);\n    }\n    setMessage({ texte: resultat.message, ton: resultat.ok ? 'succes' : 'erreur' });\n    if (resultat.ok) {\n      setMotDePasse('');\n      await rafraichirUtilisateur();\n    }\n  };\n\n  const handleConnexion",
        "le verrou n'est jamais relâché : le bouton ne marche plus qu'une fois",
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
        "    if (oui === DELAI_DEPASSE) {\n      setConnecte(false);\n      return;\n    }\n",
        "",
        "le délai dépassé n'est plus traité : l'état reste inconnu, donc un rond",
    ),
    # === L'écran des amis ==================================================
    (
        "app/amis.tsx",
        "    } finally {\n      setChargement(false);\n    }",
        "    }\n    setChargement(false);",
        "« chargement » n'est plus retiré dans un finally",
    ),
    (
        "app/amis.tsx",
        "            ) : chargement ? (\n"
        "              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />\n"
        "            ) : (",
        "            ) : (\n"
        "              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />\n"
        "            ) : (",
        "l'indicateur tourne dès que le code manque : l'échec redevient un rond",
    ),
    (
        "app/amis.tsx",
        "                  accessibilityLabel=\"Réessayer d’obtenir le code\"",
        "                  accessibilityLabel=\"\"",
        "l'échec n'offre plus de moyen d'agir",
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
