#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur du stockage morcelé.

Ce qu'il défend : la session d'un utilisateur. Le module découpe une session
Supabase en morceaux, parce que `expo-secure-store` plafonne chaque valeur à
2048 octets et que le dépassement est silencieux. Deux manières de tout perdre,
et une seule était couverte.

La première est connue de longue date : une lecture incomplète doit rendre
`null`, jamais une valeur tronquée.

La seconde a survécu jusqu'à ce qu'un téléphone la signale, parce que le banc
employait un dépôt EN MÉMOIRE qui acceptait n'importe quelle clé — il écrivait
même `'session::nb'` en toutes lettres. Or `expo-secure-store` refuse toute clé
hors de `[A-Za-z0-9._-]`, et il refuse en LEVANT. Les clés composées portaient
un `::`, donc chaque lecture et chaque écriture de session levait :

  - la connexion échouait alors que les identifiants étaient bons ;
  - `getSession()` rejetait au lieu de rendre `null`, ce qui laissait « Mes
    amis » sur un rond sans fin, `connecte` n'étant jamais posé.

Le banc confronte désormais chaque clé à la règle RÉELLE, lue dans le paquet
installé. Ce falsificateur vérifie que cette confrontation détecte bien les
mutations — sans quoi elle ne vaudrait pas mieux qu'un `grep`.

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
TESTS = ["tests/stockageSecurise.test.mjs"]
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
    # === Les clés : ce que la plateforme refuse =============================
    #
    # Une seule de ces deux mutations suffirait à perdre toutes les sessions.
    # Elles sont séparées parce qu'elles se réintroduisent séparément.
    (
        "src/lib/stockageSecurise.ts",
        "const suffixeNombre = (cle: string) => `${cle}_nb`;",
        "const suffixeNombre = (cle: string) => `${cle}::nb`;",
        "le compteur reprend un séparateur que la plateforme refuse : toute session est perdue",
    ),
    (
        "src/lib/stockageSecurise.ts",
        "const suffixeMorceau = (cle: string, index: number) => `${cle}_${index}`;",
        "const suffixeMorceau = (cle: string, index: number) => `${cle}::${index}`;",
        "un morceau reprend un séparateur que la plateforme refuse",
    ),
    (
        "src/lib/stockageSecurise.ts",
        "  return cle.replace(/[^\\w.-]/g, '_');",
        "  return cle;",
        "une clé de base hostile n'est plus rendue acceptable pour la plateforme",
    ),
    # === Les échecs partiels ================================================
    (
        "src/lib/stockageSecurise.ts",
        "        if (morceau === null) return null;",
        "        if (morceau === null) continue;",
        "un morceau manquant rend une valeur tronquée au lieu de rien",
    ),
    (
        "src/lib/stockageSecurise.ts",
        "      if (Number.isInteger(ancienNombre) && ancienNombre > morceaux.length) {",
        "      if (false) {",
        "les morceaux orphelins ne sont plus retirés : écraser une valeur longue laisse des restes",
    ),
    (
        "src/lib/stockageSecurise.ts",
        "      if (!Number.isInteger(nombre) || nombre <= 0) return null;",
        "      if (!Number.isInteger(nombre)) return null;",
        "un compteur nul ou négatif est relu comme une valeur vide",
    ),
    # === Le découpage =======================================================
    (
        "src/lib/stockageSecurise.ts",
        "  for (const caractere of valeur) {\n"
        "    const octets = tailleUtf8(caractere);\n"
        "    if (taille + octets > limite && courant !== '') {",
        "  for (let index = 0; index < valeur.length; index += 1) {\n"
        "    const caractere = valeur[index];\n"
        "    const octets = tailleUtf8(caractere);\n"
        "    if (taille + octets > limite && courant !== '') {",
        "le découpage repasse par unités de code : une paire de substitution peut être coupée",
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
