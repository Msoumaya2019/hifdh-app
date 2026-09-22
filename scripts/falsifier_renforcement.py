"""Falsification des controles de « A renforcer ».

Pour chaque mutation, on reintroduit volontairement le defaut que le test
pretend couvrir, on verifie que le test echoue, puis on restaure le fichier
d'origine et on prouve la restauration par empreinte SHA-256.

Une mutation non detectee signifie que le test ne prouve rien.

Trois defauts sont invisibles a l'oeil sur un telephone, et c'est ce qui rend ce
fichier necessaire :

  - un passage marque « a retravailler » qui n'entre pas dans la liste ;
  - un passage qui y entre deux fois, parce qu'il est marque *et* du ;
  - une revision en retard qui disparait, parce que la comparaison de dates est
    une egalite au lieu d'un ordre.
"""

import hashlib
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
RENFORCEMENT = RACINE / "src" / "lib" / "renforcement.ts"
FICHIER_TEST = "tests/renforcement.test.mjs"

MUTATIONS = [
    {
        "nom": "le marquage explicite ne l'emporte plus sur la revision due",
        "avant": "    if (passage.level !== 'needs_review') continue;",
        "apres": "    if (false) continue;",
        "test": "un passage parfaitement su n’y entre pas",
    },
    {
        "nom": "une revision en retard est ignoree (egalite au lieu d'un ordre)",
        "avant": "    if (review.nextReviewDate > aujourdHui) continue;",
        "apres": "    if (review.nextReviewDate !== aujourdHui) continue;",
        "test": "une révision en retard y entre",
    },
    {
        "nom": "un passage marque et du perd son item de revision",
        "avant": "      reviewId: existant?.reviewId,",
        "apres": "      reviewId: undefined,",
        "test": "un passage marqué et dû ne figure qu’une fois, et garde sa révision",
    },
    {
        "nom": "l'ordre du moushaf disparait",
        "avant": (
            "  return [...parCle.values()].sort(\n"
            "    (a, b) => a.surah - b.surah || a.startAyah - b.startAyah\n"
            "  );"
        ),
        "apres": "  return [...parCle.values()];",
        "test": "l’ordre suit le moushaf, et non l’ordre d’arrivée",
    },
    {
        "nom": "« Pas encore » retire le passage de la liste",
        "avant": "    : { niveau: 'needs_review', note: 'errors' };",
        "apres": "    : { niveau: 'perfect', note: 'errors' };",
        "test": "« Pas encore » le laisse dans la liste, et le ramène à demain",
    },
    {
        "nom": "« Pas encore » espace la revision au lieu de la rapprocher",
        "avant": "    : { niveau: 'needs_review', note: 'errors' };",
        "apres": "    : { niveau: 'needs_review', note: 'perfect' };",
        "test": "« Pas encore » le laisse dans la liste, et le ramène à demain",
    },
]


def empreinte(chemin):
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def lancer_test(nom_test):
    """Rend True si le test passe, False s'il echoue."""
    resultat = subprocess.run(
        [
            "node",
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            "--test-name-pattern",
            nom_test,
            FICHIER_TEST,
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
            f"pour {avant!r} — refus d'ecrire"
        )
    chemin.write_bytes(contenu.replace(motif, apres.encode("utf-8")))


def main():
    original = RENFORCEMENT.read_bytes()
    attendue = empreinte(RENFORCEMENT)

    # Un test doit d'abord passer avant qu'on mute quoi que ce soit : sinon un
    # echec du a un fichier deja casse serait compte comme une detection.
    print("=== temoin ===")
    for mutation in MUTATIONS:
        if not lancer_test(mutation["test"]):
            print(f"ECHEC : le test « {mutation['test']} » ne passe pas sur le fichier intact")
            return 1
    print(f"les {len(MUTATIONS)} tests vises passent sur le fichier intact")

    resultats = []
    try:
        for mutation in MUTATIONS:
            # Restaurer avant chaque mutation : sans cela les mutations
            # s'empilent, et l'une est « detectee » par l'effet d'une autre.
            RENFORCEMENT.write_bytes(original)
            appliquer(RENFORCEMENT, mutation["avant"], mutation["apres"])
            detecte = not lancer_test(mutation["test"])
            resultats.append((mutation["nom"], mutation["test"], detecte))
            print(f"{'DETECTE ' if detecte else 'NON DETECTE'}  {mutation['nom']}")
    finally:
        RENFORCEMENT.write_bytes(original)

    print("\n=== restauration ===")
    obtenue = empreinte(RENFORCEMENT)
    restauration_ok = obtenue == attendue
    print(f"renforcement.ts: {'identique' if restauration_ok else 'DIFFERENTE'} ({obtenue[:16]})")

    # Les controles doivent repasser au vert sur le fichier restaure : une
    # restauration qui laisse le fichier dans un etat intermediaire se verrait
    # ici, et non dans l'empreinte seule.
    print("\n=== les controles repassent au vert ===")
    for mutation in MUTATIONS:
        if not lancer_test(mutation["test"]):
            print(f"ECHEC : « {mutation['test']} » ne repasse pas apres restauration")
            restauration_ok = False
    if restauration_ok:
        print("OK     tous les controles vises repassent")

    non_detectees = [nom for nom, _, detecte in resultats if not detecte]
    print(f"\n{len(resultats) - len(non_detectees)}/{len(resultats)} mutations detectees")
    if non_detectees:
        print("Non detectees : " + ", ".join(non_detectees))
    return 1 if (non_detectees or not restauration_ok) else 0


if __name__ == "__main__":
    sys.exit(main())
