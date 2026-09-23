#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur du surlignage de la séance, et de la forme du lecteur.

Deux choses, et elles sont de nature différente :

  - le **surlignage** : quelles lignes portent la plage ? C'est un calcul, donc
    il se teste, et les mutations ci-dessous cassent le calcul ;
  - la **forme du lecteur** : le mode « verset par verset » est retiré, les
    trois phrases ont disparu, la page occupe l'écran. Cela ne se calcule pas :
    on lit la source. Une chaîne présente dans un commentaire satisfaisant un
    `grep`, les contrôles portent sur le **rendu**, pas sur le mot — et les
    mutations le vérifient en RÉINTRODUISANT ce qui a été retiré.

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
TESTS = ["tests/surlignage.test.mjs", "tests/lecteur.test.mjs"]
NODE = shutil.which("node") or "node"

L = "src/lib/surlignagePassage.ts"
C = "src/components/LecteurPageMoushaf.tsx"
E = "app/lecteur.tsx"


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


def muter(chemin, motif, remplacement, exact=1):
    fichier = RACINE / chemin
    source = io.open(fichier, encoding="utf-8").read()
    occurrences = source.count(motif)
    if occurrences != exact:
        raise AssertionError(
            f"{chemin} : {occurrences} occurrence(s) de {motif!r}, {exact} attendue(s)"
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

# === Les mutations de CALCUL ================================================
# Chaque entrée : (fichier, motif, remplacement, description).
MUTATIONS = [
    (
        L,
        "  if (element.surah !== plage.surah) return false;",
        "",
        "la sourate n'est plus comparée : un verset 9:1 marquerait une page de 8",
    ),
    (
        L,
        "  return element.ayah >= plage.startAyah && element.ayah <= plage.endAyah;",
        "  return element.ayah >= plage.startAyah;",
        "seule la borne basse est vérifiée : la bande déborderait après la fin",
    ),
    (
        L,
        "  return element.ayah >= plage.startAyah && element.ayah <= plage.endAyah;",
        "  return element.ayah <= plage.endAyah;",
        "seule la borne haute est vérifiée : la bande commencerait trop tôt",
    ),
    (
        L,
        "  return element.ayah >= plage.startAyah && element.ayah <= plage.endAyah;",
        "  return true;",
        "tout élément de la bonne sourate marque : la page entière serait surlignée",
    ),
    (
        L,
        "  if (plage === null) return [];\n\n  const lignes = getLignesDuMoushaf(page);",
        "  const lignes = getLignesDuMoushaf(page);",
        "une plage absente n'est plus refusée : « feuilleter » ferait lever",
    ),
    (
        L,
        "  const lignes = getLignesDuMoushaf(page);\n  if (lignes === null) return [];\n\n  const retenues: number[] = [];",
        "  const lignes = getLignesDuMoushaf(page) as ElementMoushaf[][];\n\n  const retenues: number[] = [];",
        "une page non décrite n'est plus refusée : le rendu lèverait",
    ),
    (
        L,
        "      retenues.push(index + 1);",
        "      retenues.push(index);",
        "les lignes sont indicées à partir de zéro : toutes les bandes sont décalées d'une ligne",
    ),
    (
        L,
        "    if (!ayahs.has(ayah)) return false;",
        "",
        "un verset manquant au milieu est ignoré : la plage serait dite contenue à tort",
    ),
    (
        L,
        "  for (let ayah = plage.startAyah; ayah <= plage.endAyah; ayah += 1) {",
        "  for (let ayah = plage.startAyah; ayah < plage.endAyah; ayah += 1) {",
        "la borne haute de la plage n'est plus vérifiée",
    ),
    # === La forme du lecteur ===============================================
    (
        E,
        "  const [pleinEcran, setPleinEcran] = useState(true);",
        "  const [pleinEcran, setPleinEcran] = useState(false);",
        "la page ne s'ouvre plus plein écran : l'en-tête reprend la place de la page",
    ),
    (
        E,
        "        passage={passage}\n",
        "",
        "la plage n'est plus transmise : plus rien n'est surligné",
    ),
    (
        C,
        "                  { top: `${((numero - 1) / LIGNES_PAR_PAGE) * 100}%` },",
        "                  { top: 0 },",
        "toutes les bandes se posent sur la première ligne",
    ),
    (
        C,
        "    height: `${(1 / LIGNES_PAR_PAGE) * 100}%`,",
        "    height: '6%',",
        "la bande n'a plus la hauteur d'une ligne : le surlignage serait plus court que le texte",
    ),
    # === Ce que le plein écran doit LAISSER VISIBLE =========================
    #
    # Ces deux mutations REMETTENT ce qui a été retiré : le masquage des
    # commandes en plein écran. C'est la seule façon d'éprouver un contrôle de
    # forme qui exige l'ABSENCE d'une condition — on remet la condition, et le
    # contrôle doit tomber.
    (
        C,
        "<View style={[styles.navigation, pleinEcran && styles.navigationCompacte]}>",
        "{!pleinEcran && (\n        <View style={styles.navigation}>",
        "les flèches de page sont remasquées en plein écran",
    ),
    (
        E,
        "{(sessionId || depuisRenforcement) && (",
        "{(sessionId || depuisRenforcement) && !pleinEcran && (",
        "les boutons de mémorisation sont remasqués en plein écran",
    ),
]

# === Les mutations de FORME par réintroduction ==============================
# Ce qui a été retiré est REMIS en place, dans le rendu. Le contrôle doit
# tomber. On insère juste après la balise d'ouverture de la racine, ce qui est
# un endroit où la phrase serait effectivement rendue.
REINTRODUCTIONS = [
    (C, "Page hors de ta séance du jour.", "« page hors de ta séance » réintroduite dans le rendu"),
    (C, "Cette page porte une partie de ta séance du jour.", "la note de séance réintroduite dans le rendu"),
    (C, "Glisse la page vers la droite ou la gauche pour tourner.", "le repère du geste réintroduit dans le rendu"),
    (E, "Verset par verset", "l'onglet « Verset par verset » réintroduit dans le rendu"),
]

ANCRES = {
    C: "<View style={styles.racine}>",
    E: "<SafeAreaView style={styles.container} edges={['top']}>",
}

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

for chemin, phrase, description in REINTRODUCTIONS:
    initial = io.open(RACINE / chemin, encoding="utf-8").read()
    ancre = ANCRES[chemin]
    if ancre not in initial:
        print(f"ANCRE       {description} : ancre d'insertion introuvable")
        resultats.append((description, None))
        continue
    io.open(RACINE / chemin, "w", encoding="utf-8", newline="\n").write(
        initial.replace(ancre, f"{ancre}\n        <Text>{phrase}</Text>", 1)
    )
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
