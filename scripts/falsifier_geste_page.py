#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur du geste de page et du plein écran du mode moushaf.

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
TESTS = ["tests/geste_page.test.mjs"]
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
    (
        "src/lib/gestePageMoushaf.ts",
        "  const voulue = dx > 0 ? page + 1 : page - 1;",
        "  const voulue = dx > 0 ? page - 1 : page + 1;",
        "le sens du geste est inversé (le moushaf se lirait de gauche à droite)",
    ),
    (
        "src/lib/gestePageMoushaf.ts",
        "export const SEUIL_HORIZONTAL = 60;",
        "export const SEUIL_HORIZONTAL = 0;",
        "le seuil tombe à zéro : le moindre frôlement tourne la page",
    ),
    (
        "src/lib/gestePageMoushaf.ts",
        "  if (Math.abs(dx) <= Math.abs(dy) * DOMINANCE_HORIZONTALE) return null;",
        "",
        "l'axe dominant n'est plus vérifié : un geste vertical tourne la page",
    ),
    (
        "src/lib/gestePageMoushaf.ts",
        "  if (voulue < 1 || voulue > total) return null;",
        "  if (voulue < 0 || voulue > total + 1) return null;",
        "les bornes sont relâchées : on peut sortir des 604 pages",
    ),
    (
        "src/lib/gestePageMoushaf.ts",
        "  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;",
        "",
        "les entrées non finies ne sont plus refusées",
    ),
    (
        "app/_layout.tsx",
        "    <GestureHandlerRootView style={{ flex: 1 }}>\n",
        "",
        "la racine ne monte plus le conteneur de gestes",
    ),
    (
        "app/_layout.tsx",
        "    </GestureHandlerRootView>\n",
        "",
        "le conteneur n'est plus refermé : il n'enveloppe plus la navigation",
    ),
    (
        "app/_layout.tsx",
        "<GestureHandlerRootView style={{ flex: 1 }}>",
        "<GestureHandlerRootView>",
        "la racine perd flex: 1 : l'application s'affiche blanche",
    ),
    # L'ancre porte la ligne PRÉCÉDENTE, et pas seulement `.onEnd(` : depuis que
    # la feuille porte aussi un geste de désignation, le composant a DEUX
    # `.onEnd(` — un pour le balayage, un pour l'appui. Viser `.onEnd(` seul ne
    # désigne plus rien, et le falsificateur s'arrêtait sur « 2 occurrences, une
    # seule attendue » : c'est `.failOffsetY` qui appartient au seul balayage.
    (
        "src/components/LecteurPageMoushaf.tsx",
        "    .failOffsetY([-20, 20])\n    .onEnd((evenement) => {",
        "    .failOffsetY([-20, 20])\n    .onBegin((evenement) => {",
        "le geste se déclenche au toucher au lieu du relâchement",
    ),
    (
        "src/components/LecteurPageMoushaf.tsx",
        "    .failOffsetY([-20, 20])",
        "    .failOffsetY([-2000, 2000])",
        "le geste vertical ne rend plus la main au défilement",
    ),
    (
        "src/components/LecteurPageMoushaf.tsx",
        "    .activeOffsetX([-20, 20])",
        "    .activeOffsetX([-2000, 2000])",
        "le geste revendique tout mouvement horizontal : le défilement meurt",
    ),
    (
        "app/lecteur.tsx",
        "          onPress={() => setPleinEcran(false)}",
        "          onPress={() => setPleinEcran(true)}",
        "la sortie de plein écran ne sort plus",
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
