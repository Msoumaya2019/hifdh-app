"""Falsification des garde-fous de la sauvegarde.

Pour chaque mutation, on réintroduit volontairement le défaut que le test
prétend couvrir, on vérifie que le test échoue, puis on restaure le fichier
d'origine et on prouve la restauration par empreinte SHA-256.

Une mutation non détectée signifie que le test ne prouve rien.
"""

import hashlib
import json
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SYNC = RACINE / "src" / "lib" / "sync"
SNAP = SYNC / "snapshot.ts"
SYNCHRO = SYNC / "synchronisation.ts"

MUTATIONS = [
    {
        "nom": "restaurer : le garde-fou d'écrasement disparaît",
        "fichier": SYNCHRO,
        "avant": "if (!confirmerEcrasement && !(await local.estVide())) {",
        "apres": "if (false) {",
        "test": "restaurer refuse d’écraser une progression locale sans confirmation",
    },
    {
        "nom": "sauvegarder : le refus d'un appareil vide disparaît",
        "fichier": SYNCHRO,
        "avant": "if (estVide(snapshot)) {",
        "apres": "if (false) {",
        "test": "sauvegarder refuse un appareil vide, même connecté",
    },
    {
        "nom": "restaurer : la validation de la charge disparaît",
        "fichier": SYNCHRO,
        "avant": "if (!validation.ok) {",
        "apres": "if (false) {",
        "test": "restaurer refuse un instantané illisible et laisse l’appareil intact",
    },
    {
        "nom": "validation : toute version est acceptée",
        "fichier": SNAP,
        "avant": "if (valeur.version !== VERSION_INSTANTANE) {",
        "apres": "if (false) {",
        "test": "une version inconnue est refusée en bloc",
    },
    {
        "nom": "validation : la date n'est plus vérifiée au calendrier",
        "fichier": SNAP,
        "avant": "  return versDateLocale(analyserDateLocale(valeur)) === valeur;",
        "apres": "  return true;",
        "test": "une date qui n’existe pas au calendrier est refusée",
    },
    {
        "nom": "validation : une fin avant le début passe",
        "fichier": SNAP,
        "avant": "  if (endAyah < startAyah) {",
        "apres": "  if (false) {",
        "test": "une fin avant le début est refusée",
    },
    {
        "nom": "validation : les identifiants dupliqués passent",
        "fichier": SNAP,
        "avant": "    if (vus.has(id)) {",
        "apres": "    if (false) {",
        "test": "deux séances portant le même identifiant sont refusées",
    },
    {
        "nom": "validation : un verset hors de la sourate passe",
        "fichier": SNAP,
        "avant": "  if (!estEntier(endAyah, 1, total)) {",
        "apres": "  if (false) {",
        "test": "un verset au-delà de la fin de la sourate est refusé",
    },
]


def empreinte(chemin):
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def lancer_test(nom_test):
    """Rend True si le test passe, False s'il échoue."""
    resultat = subprocess.run(
        [
            "node",
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            "--test-name-pattern",
            nom_test,
            "tests/synchronisation.test.mjs",
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode == 0


def appliquer(chemin, avant, apres):
    """Remplace `avant` par `apres` au niveau octet. Refuse si ce n'est pas unique."""
    contenu = chemin.read_bytes()
    motif = avant.encode("utf-8")
    occurrences = contenu.count(motif)
    if occurrences != 1:
        raise SystemExit(
            f"  ancre non unique dans {chemin.name} : {occurrences} occurrence(s) "
            f"pour {avant!r} — refus d'écrire"
        )
    chemin.write_bytes(contenu.replace(motif, apres.encode("utf-8")))


def main():
    originaux = {chemin: chemin.read_bytes() for chemin in {m["fichier"] for m in MUTATIONS}}
    empreintes = {chemin: empreinte(chemin) for chemin in originaux}

    resultats = []
    try:
        for mutation in MUTATIONS:
            chemin = mutation["fichier"]
            appliquer(chemin, mutation["avant"], mutation["apres"])
            detecte = not lancer_test(mutation["test"])
            chemin.write_bytes(originaux[chemin])
            resultats.append((mutation["nom"], mutation["test"], detecte))
            print(f"{'DÉTECTÉ ' if detecte else 'NON DÉTECTÉ'}  {mutation['nom']}")
    finally:
        for chemin, contenu in originaux.items():
            chemin.write_bytes(contenu)

    print("\n=== restauration ===")
    restauration_ok = True
    for chemin, attendue in empreintes.items():
        obtenue = empreinte(chemin)
        etat = "identique" if obtenue == attendue else "DIFFÉRENTE"
        if obtenue != attendue:
            restauration_ok = False
        print(f"{chemin.name}: {etat} ({obtenue[:16]})")

    non_detectees = [nom for nom, _, detecte in resultats if not detecte]
    print(f"\n{len(resultats) - len(non_detectees)}/{len(resultats)} mutations détectées")
    if non_detectees:
        print("Non détectées : " + ", ".join(non_detectees))
    if not restauration_ok:
        print("ÉCHEC : un fichier n'a pas été restauré à l'identique")
    return 1 if (non_detectees or not restauration_ok) else 0


if __name__ == "__main__":
    sys.exit(main())
