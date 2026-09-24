#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur du lecteur audio : la géométrie, le toucher, les plages, l'état.

CE QU'ON ÉPROUVE ICI, ET POURQUOI CE FICHIER EXISTE
---------------------------------------------------
Le lecteur audio repose sur quatre décisions dont **aucune ne se voit quand elle
est fausse** :

  - la **géométrie** du surlignage : une bande en miroir est de la bonne taille,
    de la bonne couleur, et posée sur le verset voisin ;
  - le **toucher** : un appui qui ne désigne rien ressemble à un appui manqué, et
    l'utilisateur recommence au lieu de signaler ;
  - les **plages** : un verset oublié au milieu d'une plage donne une écoute qui
    paraît complète ;
  - l'**état** : un suivi qui se déplace pendant une pause, ou une vitesse
    refusée qui écrase celle qui joue.

Les tests qui gardent ces décisions sont dans `tests/audio.test.mjs` et
`tests/lecteur.test.mjs`. Ce fichier vérifie qu'ils **tombent** quand on casse la
décision — et qu'ils tombent, pas qu'ils s'agitent : une mutation non détectée
accuse le test, pas la mutation.

Même exigence que les autres falsificateurs du dépôt : le témoin compte les tests
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
TESTS = ["tests/audio.test.mjs", "tests/lecteur.test.mjs"]
NODE = shutil.which("node") or "node"

Z = "src/lib/zonesMoushaf.ts"
P = "src/lib/audio/plan.ts"
E = "src/lib/audio/etatLecture.ts"
S = "src/lib/audio/suiviRecitation.ts"
C = "src/components/LecteurPageMoushaf.tsx"
L = "app/lecteur.tsx"
R = "src/lib/audio/repetitions.ts"


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


def deplacer(chemin, bloc, ancre):
    """Retire `bloc` de la source et le réinsère juste APRÈS `ancre`.

    POURQUOI CE N'EST PAS UNE SIMPLE SUBSTITUTION
    ---------------------------------------------
    L'ordre de deux blocs ne se casse pas par un remplacement de texte : il faut
    les échanger. Le contrôle de forme qui exige que le surlignage soit posé
    AVANT l'image ne peut donc être éprouvé qu'en **déplaçant réellement** le
    bloc — et c'est exactement ce qu'un développement distrait ferait : couper le
    bloc, le recoller plus bas.
    """
    fichier = RACINE / chemin
    source = io.open(fichier, encoding="utf-8").read()
    for morceau, nom in ((bloc, "bloc"), (ancre, "ancre")):
        occurrences = source.count(morceau)
        if occurrences != 1:
            raise AssertionError(f"{chemin} : {occurrences} occurrence(s) du {nom}, 1 attendue")
    source = source.replace(bloc, "", 1)
    source = source.replace(ancre, ancre + "\n" + bloc, 1)
    io.open(fichier, "w", encoding="utf-8", newline="\n").write(source)


code, nombre, sortie = executer_tests()
if code != 0 or nombre == 0:
    print(f"TÉMOIN ROUGE : {nombre} test(s), code {code}")
    print(sortie[-2500:])
    sys.exit(1)
print(f"témoin : {nombre} test(s), tous verts\n")

# === Les mutations ==========================================================
# Chaque entrée : (fichier, motif, remplacement, description).
MUTATIONS = [
    # --- La géométrie du surlignage -----------------------------------------
    (
        Z,
        "    left: `${zone.gauche * 100}%`,",
        "    left: `${(1 - zone.droite) * 100}%`,",
        "la zone est placée en MIROIR : de la bonne taille, sur le verset voisin",
    ),
    (
        Z,
        "    width: `${Math.max(0, zone.droite - zone.gauche) * 100}%`,",
        "    width: `${Math.max(0, zone.droite - zone.gauche) * 50}%`,",
        "la zone fait la moitié de sa largeur : elle ne couvre plus ses mots",
    ),
    (
        Z,
        "    height: `${Math.max(0, zone.bas - zone.haut) * 100}%`,",
        "    height: `${Math.max(0, zone.bas - zone.haut) * 50}%`,",
        "la zone fait la moitié de la hauteur de sa ligne",
    ),
    # --- Le toucher ----------------------------------------------------------
    (
        Z,
        "      if (y < zone.haut || y > zone.bas) continue;",
        "      if (y < 0 || y > 1) continue;",
        "toutes les lignes sont candidates : un appui désigne un verset d'une autre ligne",
    ),
    (
        Z,
        "      const distance = x < zone.gauche ? zone.gauche - x : x - zone.droite;",
        "      const distance = 0;",
        "le premier candidat l'emporte : un appui dans le blanc désigne toujours le verset du haut",
    ),
    (
        Z,
        "  if (x < 0 || x > 1 || y < 0 || y > 1) return null;",
        "",
        "une position hors de la page n'est plus refusée : un défaut de calcul désigne un verset au hasard",
    ),
    (
        Z,
        "  const [bas, haut] = debut <= fin ? [debut, fin] : [fin, debut];",
        "  const [bas, haut] = [debut, fin];",
        "la plage n'est plus remise dans l'ordre : désigner de bas en haut ne sélectionne rien",
    ),
    (
        Z,
        "  const debut = rang(a);\n  const fin = rang(b);\n  if (debut < 0 || fin < 0) return [];",
        "  const debut = Math.max(0, rang(a));\n  const fin = Math.max(0, rang(b));",
        "un verset absent de la page est ramené au premier : on sélectionnerait 1:1",
    ),
    # --- Les plages ----------------------------------------------------------
    (
        P,
        "  const [bas, haut] = premier <= fin ? [premier, fin] : [fin, premier];",
        "  const [bas, haut] = [premier, fin];",
        "une plage inversée rend un vide au lieu d'être remise dans l'ordre",
    ),
    (
        P,
        "  for (let ayah = bas; ayah <= haut; ayah += 1) versets.push({ surah, ayah });",
        "  for (let ayah = bas; ayah < haut; ayah += 1) versets.push({ surah, ayah });",
        "le dernier verset de la plage est oublié",
    ),
    (
        P,
        "  return versets;",
        "  return [...versets];",
        "sentinelle : mutation sans effet, qui doit être signalée NON DÉTECTÉE",
        False,
    ),
    # --- L'état du lecteur ---------------------------------------------------
    (
        E,
        "  if (etat.statut === 'arret') return null;\n  const etape = etapeCourante(etat);",
        "  const etape = etapeCourante(etat);",
        "le verset actif survit à l'arrêt : la bande resterait après la fin de la séance",
    ),
    (
        E,
        "      if (!estVitesse(action.vitesse)) return etat;",
        "",
        "une vitesse refusée écrase celle qui joue : la lecture s'accélère sans qu'on l'ait demandé",
    ),
    (
        E,
        "  return estVitesse(valeur) ? valeur : VITESSE_PAR_DEFAUT;",
        "  return valeur as number;",
        "une vitesse inconnue passe telle quelle : le réglage enregistré n'est plus borné",
    ),
    # --- Le suivi de page ----------------------------------------------------
    (
        S,
        "  if (!demande.suiviAuto) return null;",
        "",
        "le suivi coupé continue de tourner les pages",
    ),
    (
        S,
        "  if (page === demande.pageAffichee) return null;",
        "",
        "la page est renvoyée même quand c'est la même : un feuilletage est ramené de force",
    ),
    # --- La forme du lecteur -------------------------------------------------
    (
        C,
        "    .enabled(onToucherVerset !== undefined)",
        "    .enabled(true)",
        "le toucher reste actif hors du mode : un appui sélectionne un verset sans prévenir",
    ),
    (
        L,
        "        onToucherVerset={modeSelection ? toucherVerset : undefined}",
        "        onToucherVerset={toucherVerset}",
        "l'écran transmet toujours le geste : le mode ne sert plus à rien",
    ),
    # --- Les valeurs offertes à l'écran --------------------------------------
    # Ces trois mutations ne cassent aucun calcul : elles retirent un choix de la
    # liste que l'écran parcourt. Rien ne lève, rien ne rougit — l'apprenant qui
    # cherche « 2 répétitions » ou « 2 secondes de pause » ne les trouve pas, et
    # c'est tout. C'est le défaut le plus silencieux de cette fonctionnalité.
    (
        R,
        "export const NOMBRES_REPETITION = [1, 2, 3, 5, 10] as const;",
        "export const NOMBRES_REPETITION = [1, 3, 5, 10] as const;",
        "un nombre offert disparaît : « 2 répétitions » n'est plus proposé",
    ),
    (
        R,
        "export const PAUSES_SECONDES = [0, 2, 5, 10] as const;",
        "export const PAUSES_SECONDES = [0, 5, 10] as const;",
        "la pause de 2 secondes disparaît de l'écran",
    ),
    (
        R,
        "export const REPETITION_MAX = 100;",
        "export const REPETITION_MAX = 10;",
        "la borne de saisie refuse l'exemple « 20 » de la spécification",
    ),
]

resultats = []
for entree in MUTATIONS:
    chemin, motif, remplacement, description = entree[:4]
    attendu_detecte = entree[4] if len(entree) > 4 else True

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

    if attendu_detecte:
        resultats.append((description, verdict == "DETECTEE"))
    else:
        # Une mutation-témoin qui n'est PAS censée être détectée : elle vérifie
        # que « non détectée » est bien prononcé, et non confondu avec un succès.
        resultats.append((description, verdict == "NON DETECTEE"))
        verdict = f"TEMOIN {verdict}"

    print(f"{verdict:<18} {description}{'  — ' + detail if detail else ''}")

# === Le déplacement du surlignage ===========================================
#
# Le contrôle de forme exige que le surlignage soit posé AVANT l'image : c'est ce
# qui le fait passer SOUS l'encre, donc ce qui laisse les diacritiques intactes.
# On éprouve ce contrôle en **déplaçant réellement** le bloc après l'image, ce
# qu'un développement distrait ferait en coupant et recollant.
BLOC_ZONE = """          {largeurAffichee > 0 &&
            zonesActives.map((zone, index) => (
              <View
                key={`${zone.ligne}-${index}`}
                pointerEvents="none"
                style={[styles.zoneVerset, positionEnPourcent(zone)]}
              />
            ))}"""

ANCRE_IMAGE = """            <Image
              source={{ uri: etat.chemin }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={`Page ${page} du moushaf`}
            />"""

initial = io.open(RACINE / C, encoding="utf-8").read()
try:
    deplacer(C, BLOC_ZONE, ANCRE_IMAGE)
except AssertionError as erreur:
    print(f"ANCRE              le surlignage est déplacé après l'image : {erreur}")
    resultats.append(("le surlignage est déplacé après l'image", None))
else:
    try:
        code, nombre, sortie = executer_tests()
    finally:
        io.open(RACINE / C, "w", encoding="utf-8", newline="\n").write(initial)

    if nombre == 0:
        verdict, detail = "HARNAIS", "aucun test exécuté"
    elif code != 0:
        verdict, detail = "DETECTEE", ""
    else:
        verdict, detail = "NON DETECTEE", "le test reste vert"
    resultats.append(("le surlignage est déplacé après l'image", verdict == "DETECTEE"))
    print(f"{verdict:<18} le surlignage est déplacé après l'image{'  — ' + detail if detail else ''}")

# Le fichier doit être revenu exactement à son état initial : une restauration
# approximative laisserait le surlignage après l'image, et le falsificateur
# accuserait ensuite le code pour un défaut qu'il a lui-même introduit.
apres = io.open(RACINE / C, encoding="utf-8").read()
if apres != initial:
    print("RESTAURATION       la source n'est pas revenue à son état initial")
    resultats.append(("la source est restaurée après le déplacement", False))
else:
    resultats.append(("la source est restaurée après le déplacement", True))
    print(f"{'RESTAUREE':<18} la source est revenue à son état initial")

reussis = sum(1 for _, ok in resultats if ok is True)
ancrees = sum(1 for _, ok in resultats if ok is None)
print(f"\n{reussis}/{len(resultats)} mutations conformes.")
if ancrees:
    print(f"{ancrees} ancre(s) introuvable(s) : à corriger.")
sys.exit(0 if reussis == len(resultats) else 1)