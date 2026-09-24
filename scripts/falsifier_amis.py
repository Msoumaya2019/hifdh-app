#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur du suivi entre amis.

Même exigence que les autres falsificateurs du dépôt : une mutation qui n'est pas
détectée accuse le test, pas la mutation. Et le témoin compte les tests exécutés,
parce que `node --test` sort en 0 quand un motif ne désigne rien.

Ce que ce fichier vise, ce sont les défauts qui ne se voient PAS sur un
téléphone : un nombre arrivé en chaîne, une valeur aberrante affichée « NaN », un
compteur négatif, une phrase qui compare deux personnes, un code présenté comme
valide alors qu'il contient un signe que la base n'emploie pas, un « code
inconnu » confondu avec une « saisie invalide ». Tous se lisent comme une ligne
à peine bizarre, et aucun ne lève d'erreur.
"""

import io
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = ["tests/amis.test.mjs"]
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
    # --- La lecture des nombres ---------------------------------------------
    (
        "src/lib/amis.ts",
        "  if (!Number.isFinite(n)) return 0;\n  // Une valeur négative n'a pas de sens pour un compteur : on la ramène à 0",
        "  if (Number.isNaN(n)) return 0;\n  // Une valeur négative n'a pas de sens pour un compteur : on la ramène à 0",
        "« Infinity » n'est plus refusé : `Math.round(Infinity)` sort « Infinity » à l'écran",
    ),
    (
        "src/lib/amis.ts",
        "  const n = typeof valeur === 'number' ? valeur : Number(valeur);\n  if (!Number.isFinite(n)) return 0;\n  return Math.max(0, Math.round(n * 10) / 10);",
        "  return Number(valeur);",
        "les pages ne passent plus par la conversion : les décimales sautent",
    ),
    (
        "src/lib/amis.ts",
        "  return Math.max(0, Math.round(n));",
        "  return n;",
        "un compteur négatif n'est plus ramené à zéro : « -5 versets » s'affiche",
    ),
    # --- La forme des lignes -------------------------------------------------
    (
        "src/lib/amis.ts",
        # L'ancre porte la LIGNE DE SIGNATURE, et pas seulement la garde : depuis
        # que `lireProfilTrouve` lit elle aussi un `user_id`, la garde seule
        # existe en DEUX exemplaires et ne désigne plus rien. La signature, elle,
        # n'appartient qu'à cette fonction.
        "export function lirePointAmi(ligne: LigneAmiBrute): PointAmi | null {\n  if (typeof ligne.user_id !== 'string' || ligne.user_id.length === 0) return null;",
        "export function lirePointAmi(ligne: LigneAmiBrute): PointAmi | null {",
        "une ligne sans identifiant devient un ami : on ne peut plus la retirer",
    ),
    (
        "src/lib/amis.ts",
        "  if (typeof valeur !== 'string' || valeur.length < 10) return null;\n  return valeur.slice(0, 10);",
        "  return typeof valeur === 'string' ? valeur : null;",
        "l'horodatage garde son heure : la date affichée n'est plus celle du jour",
    ),
    (
        "src/lib/amis.ts",
        "  return propre.length === 0 ? 'Un apprenant' : propre;",
        "  return propre;",
        "un ami sans nom apparaît comme une ligne blanche",
    ),
    # --- Les phrases ---------------------------------------------------------
    (
        "src/lib/amis.ts",
        "    return \"N'a pas encore commencé\";",
        "    return 'En retard';",
        "un ami qui n'a rien fait est présenté comme en retard",
    ),
    (
        "src/lib/amis.ts",
        "  const versets = `${point.versetsCetteSemaine} verset${point.versetsCetteSemaine > 1 ? 's' : ''}`;",
        "  const versets = `${point.versetsCetteSemaine} versets`;",
        "le pluriel n'est plus accordé : « 1 versets cette semaine »",
    ),
    (
        "src/lib/amis.ts",
        "  if (point.derniereSourate === null) return 'Aucune séance enregistrée';",
        "  if (point.derniereSourate === null) return 'En avance sur toi';",
        "l'absence de séance devient une comparaison avec l'utilisateur",
    ),
    # --- Le code d'invitation ------------------------------------------------
    (
        "src/lib/amis.ts",
        "  return /^[A-HJ-KM-NP-Z1-9]{10}$/.test(nettoyerCodeSaisi(saisie));",
        "  return /^[A-Z0-9]{10}$/.test(nettoyerCodeSaisi(saisie));",
        "les signes ambigus (I, L, O, 0) passent : l'appli accepte un code impossible",
    ),
    (
        "src/lib/amis.ts",
        "  return `${propre.slice(0, 5)} ${propre.slice(5)}`;",
        "  return propre;",
        "le code n'est plus groupé par cinq : il ne se dicte plus",
    ),
    (
        "src/lib/amis.ts",
        "  return saisie.replace(/[\\s-]/g, '').toUpperCase();",
        "  return saisie;",
        "espaces et casse ne sont plus tolérés : un code dicté est refusé",
    ),
    # --- Les messages d'erreur ----------------------------------------------
    (
        "src/lib/amis.ts",
        "  if (code === 'P0002') return \"Aucun compte ne porte ce code. Vérifiez-le auprès de votre ami.\";\n  if (code === '22023') return 'Ce code n’est pas valide.';",
        "  if (code === 'P0002') return 'Ce code n’est pas valide.';\n  if (code === '22023') return 'Ce code n’est pas valide.';",
        "« code inconnu » et « saisie invalide » se confondent",
    ),
    (
        "src/lib/amis.ts",
        "  const propre = (message ?? '').trim();\n  return propre.length > 0 ? propre : \"L'ajout n'a pas pu aboutir. Réessayez.\";",
        "  return '';",
        "un code d'erreur inconnu laisse l'utilisateur sans phrase",
    ),
    # --- Le profil public ----------------------------------------------------
    (
        "src/lib/amis.ts",
        "    partage: ligne.partage !== false,",
        "    partage: ligne.partage === true,",
        "un champ « partage » absent eteint l'affichage : l'ami passe pour inactif",
    ),
    (
        "src/lib/amis.ts",
        "  if (!point.partage) return 'Ne partage pas sa progression';\n",
        "",
        "un ami qui ne partage pas est decrit par des zeros : « n'a pas encore commence »",
    ),
    (
        "src/lib/amis.ts",
        "  return estCouleurAvatar(valeur) ? valeur : COULEURS_AVATAR[0];",
        "  return valeur as CouleurAvatar;",
        "une teinte inconnue passe telle quelle : l'avatar n'a plus de couleur",
    ),
    (
        "src/lib/amis.ts",
        "    .map((mot) => Array.from(mot)[0] ?? '')",
        "    .map((mot) => mot[0] ?? '')",
        "un signe hors du plan de base est coupe en deux : l'initiale devient un caractere de remplacement",
    ),
    (
        "src/lib/amis.ts",
        "    .replace(/\\s+/g, '_');",
        "    .replace(/\\s+/g, '');",
        "les espaces d'un identifiant sont supprimes au lieu d'etre lies : deux personnes se confondent",
    ),
    (
        "src/lib/amis.ts",
        "  return /^[a-z][a-z0-9_]{2,29}$/.test(nettoyerIdentifiantPublic(saisie));",
        "  return /^[a-z0-9_]{3,30}$/.test(nettoyerIdentifiantPublic(saisie));",
        "un identifiant commencant par un chiffre passe : il se confond avec un nombre",
    ),
    (
        "src/lib/amis.ts",
        "  return demande.recue ? demande.demandeur : demande.destinataire;",
        "  return demande.recue ? demande.destinataire : demande.demandeur;",
        "l'autre partie d'une demande est prise a l'envers : l'ecran nomme la mauvaise personne",
    ),
    (
        "src/lib/amis.ts",
        "  if (profil.dejaAmi) return 'deja_ami';\n  if (profil.demandeEnvoyee) return 'demande_envoyee';",
        "  if (profil.demandeEnvoyee) return 'demande_envoyee';\n  if (profil.dejaAmi) return 'deja_ami';",
        "l'amitie passe apres la demande : on propose d'ajouter quelqu'un qui l'est deja",
    ),
    # --- La garde du modele, dans le SQL ------------------------------------
    (
        "supabase/amis.sql",
        "    IF NOT EXISTS (\n      SELECT 1 FROM public.demandes_amis WHERE de = p_de AND vers = p_moi\n    ) THEN\n      RETURN FALSE;\n    END IF;\n\n",
        "",
        "accepter ne verifie plus qu'une demande existe : on se lie a un inconnu sans rien avoir demande",
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
