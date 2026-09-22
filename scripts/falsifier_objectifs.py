#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur des tests d'ordre des objectifs et de rythme.

Un test vert ne prouve rien tant qu'on ne l'a pas vu refuser. Ce script mute la
source, relance le test, et vérifie que le test **tombe**. Une mutation non
détectée accuse le test, pas la mutation.

Le témoin compte les tests exécutés (TAP « # tests N ») : `node --test` sort en
0 quand un motif ne désigne aucun test, donc un nom mal orthographié ferait
passer une mutation pour « non détectée » alors que rien n'a tourné.
"""

import io
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = ["tests/objectifs_ordre.test.mjs"]

NODE = shutil.which("node") or "node"


def executer_tests():
    """Rend (code_sortie, nombre_de_tests, sortie_complete)."""
    # L'environnement est hérité tel quel. Le reconstruire à la main a fait
    # planter Node sur « Assertion failed: ncrypto::CSPRNG » : privé de son
    # environnement, il ne trouve plus sa source d'aléa et s'arrête avant le
    # moindre test — ce qui ressemble à un harnais cassé, pas à un banc.
    environ = dict(__import__("os").environ)
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
    """Remplace, en exigeant exactement une occurrence. Refuse sinon."""
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


def restaurer(chemin, contenu_initial):
    io.open(RACINE / chemin, "w", encoding="utf-8", newline="\n").write(contenu_initial)


# --- Témoin : le test doit être vert avant toute mutation --------------------

code, nombre, sortie = executer_tests()
if code != 0 or nombre == 0:
    print(f"TÉMOIN ROUGE : {nombre} test(s), code {code}")
    print(sortie[-3000:])
    sys.exit(1)
print(f"témoin : {nombre} test(s), tous verts\n")

TEMOIN_TESTS = nombre

# --- Les mutations ----------------------------------------------------------

MUTATIONS = [
    (
        "src/lib/libelles.ts",
        "  'up_to_yassin',\n  'half_quran',",
        "  'half_quran',\n  'up_to_yassin',",
        "l'ordre de ORDRE_OBJECTIFS est inversé (Yassine après la moitié)",
    ),
    (
        "src/lib/libelles.ts",
        "  'short_surahs',\n  'hizb_sabbih',\n  'juz_amma',",
        "  'short_surahs',\n  'juz_amma',\n  'hizb_sabbih',",
        "Hizb Sabbih est remis après Juzz 'Amma, donc hors de sa taille",
    ),
    (
        "src/types/index.ts",
        "  | 'up_to_yassin'\n",
        "",
        "un type d'objectif disparaît du modèle",
    ),
    (
        "src/types/index.ts",
        "  | 'half_quran'\n",
        "  | 'demi_coran'\n",
        "un type d'objectif est renommé sans que l'ordre suive",
    ),
    (
        "src/lib/programGenerator.ts",
        "      const hizb = getHizb(60);",
        "      const hizb = getHizb(1);",
        "Hizb Sabbih devient le hizb 1 au lieu du hizb 60",
    ),
    (
        "app/onboarding.tsx",
        "{ unit: { type: 'verses', count: 1 }, label: '1 verset par jour', icon: 'ellipse-outline' },\n",
        "",
        "le rythme « 1 verset » est retiré du questionnaire",
    ),
    (
        "app/onboarding.tsx",
        "{ unit: { type: 'verses', count: 3 }, label: '3 versets par jour', icon: 'text' },",
        "{ unit: { type: 'verses', count: 5 }, label: '3 versets par jour', icon: 'text' },",
        "la quantité du 2e rythme passe de 3 à 5",
    ),
    (
        "app/onboarding.tsx",
        "{ unit: { type: 'rub', count: 1 }, label: \"1 rub' par jour\", icon: 'square' },\n",
        "{ unit: { type: 'rub', count: 1 }, label: \"1 rub' par jour\", icon: 'square' },\n  { unit: { type: 'hizb', count: 1 }, label: '1 hizb par jour', icon: 'square' },\n",
        "un 7e rythme est ajouté (le hizb revient)",
    ),
    (
        "src/lib/programGenerator.ts",
        "        .slice(0, 10)",
        "        .slice(0, 9)",
        "on ne retient que neuf sourates au lieu de dix",
    ),
    (
        "src/lib/programGenerator.ts",
        "      const plusCourtes = [...surahs]\n        .sort((a, b) => a.ayahCount - b.ayahCount || a.number - b.number)\n        .slice(0, 10)\n        .sort((a, b) => a.number - b.number);\n\n      return plusCourtes.map((s) => ({\n        surah: s.number,\n        startAyah: 1,\n        endAyah: s.ayahCount,\n      }));",
        "      const plusCourtes = [...surahs].sort((a, b) => a.number - b.number);\n      return rangesDepuisIds(\n        plusCourtes[0].startAyahId,\n        plusCourtes[plusCourtes.length - 1].startAyahId +\n          plusCourtes[plusCourtes.length - 1].ayahCount - 1,\n      );",
        "les dix sourates sont écrasées en une plage unique (le défaut classique)",
    ),
    (
        "src/lib/programGenerator.ts",
        "      const dernier = yassin.startAyahId + yassin.ayahCount - 1;",
        "      const dernier = yassin.startAyahId + yassin.ayahCount;",
        "la borne de Yassine dépasse d'un verset",
    ),
    (
        "src/lib/programGenerator.ts",
        "      return rangesDepuisIds(1, Math.floor(getTotalAyahs() / 2));",
        "      return rangesDepuisIds(1, Math.floor(getTotalAyahs() / 3));",
        "la moitié du Coran devient le tiers",
    ),
    (
        "src/lib/libelles.ts",
        "      return numeros.length === 0 ? 'Hizb à choisir' : `Hizb ${numeros.join(', ')}`;",
        "      return `Hizb ${numeros.join(', ')}`;",
        "un hizb sans numéro n'avertit plus qu'il en manque",
    ),
]

resultats = []
for chemin, motif, remplacement, description in MUTATIONS:
    initial = io.open(RACINE / chemin, encoding="utf-8").read()
    try:
        muter(chemin, motif, remplacement)
    except AssertionError as erreur:
        print(f"ANCRE  {description} : {erreur}")
        resultats.append((description, None))
        continue

    try:
        code, nombre, sortie = executer_tests()
    finally:
        restaurer(chemin, initial)

    if nombre == 0:
        verdict = "HARNAIS"
        detail = "aucun test exécuté — le motif ne désigne rien"
    elif code != 0:
        verdict = "DETECTEE"
        detail = ""
    else:
        verdict = "NON DETECTEE"
        detail = "le test reste vert"

    resultats.append((description, verdict == "DETECTEE"))
    print(f"{verdict:<12} {description}{'  — ' + detail if detail else ''}")

# --- Verdict ----------------------------------------------------------------

detectees = sum(1 for _, ok in resultats if ok is True)
ancrees = sum(1 for _, ok in resultats if ok is None)
non_detectees = sum(1 for _, ok in resultats if ok is False)

print(f"\n{detectees}/{len(resultats)} mutations détectées.")
if ancrees:
    print(f"{ancrees} ancre(s) introuvable(s) : à corriger, ce n'est pas un test qui échoue.")
sys.exit(0 if detectees == len(resultats) else 1)
