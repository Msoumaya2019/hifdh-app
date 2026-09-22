"""Prouve que les garde-fous de l'acces au texte detectent reellement un defaut.

`src/data/quranData.ts` est le module le plus traverse de l'application : c'est
lui qui rend le texte, les jetons et la mise en page du moushaf. Il n'avait
aucun falsificateur — et un defaut y a vecu sans etre vu. Le rang du verset
n'etait pas verifie avant la lecture du cache, si bien que `getAyahText(29, 70)`
rendait 30:1, basmala comprise, et `getAyahText(29, 0)` rendait 28:88.

Ce script reintroduit chaque defaut, lance le test nomme qui pretend le couvrir,
et exige que ce test tombe. Une mutation non detectee signifie que le test ne
prouve rien. Le fichier est rendu a l'octet pres apres chaque mutation, et la
restauration se prouve par empreinte SHA-256 — jamais par `git diff`, qui depend
de la configuration de fin de ligne.

Avant toute mutation, chaque test nomme est lance et doit passer : sans ce
temoin, un nom mal orthographie ne serait jamais trouve, l'executeur sortirait en
0, et la mutation serait declaree « non detectee » alors que c'est l'ancre qui
est fausse.

Ce qui est mutile, et le test qui doit tomber :

  1. le rang du verset n'est plus verifie    -> « un rang de verset hors de la sourate n'est pas lu » ;
  2. les bornes d'une plage disparaissent    -> « une plage de jetons hors du verset n'est pas rendue » ;
  3. l'absence d'en-tete rend 0, non null    -> « les en-tetes renvoyes en marge sont exactement les 21 pages attendues ».

Usage :
    python scripts/falsifier_acces_texte.py
"""

import hashlib
import io
import re
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = Path(__file__).resolve().parent.parent
FICHIER = RACINE / "src" / "data" / "quranData.ts"
TEST = "tests/layout.test.mjs"

# Les ancres sont en ASCII pur : une ancre qui traverserait un accent
# dependrait de l'encodage du fichier, et un remplacement qui ne trouve rien ne
# leve aucune erreur — il rend un fichier inchange, et la mutation passe pour
# non detectee.
MUTATIONS = [
    {
        "nom": "le rang du verset n'est plus verifie",
        "description": "getAyahText(29, 70) lit de nouveau 30:1",
        "avant": "if (!Number.isInteger(ayah) || ayah < 1 || ayah > surahData.ayahCount) return null;",
        "apres": "if (false) return null;",
        "test": "un rang de verset hors de la sourate n’est pas lu",
    },
    {
        "nom": "les bornes d'une plage disparaissent",
        "description": "getTexteJetons rend un mot hors du verset au lieu de refuser",
        "avant": "if (premier < 0 || dernier < premier || dernier >= jetons.length) return null;",
        "apres": "if (false) return null;",
        "test": "une plage de jetons hors du verset n’est pas rendue",
    },
    {
        "nom": "l'absence d'en-tete rend 0, non null",
        "description": "une page sans en-tete en marge annonce une sourate",
        "avant": "return miseEnPage.entetesEnMarge?.[String(page)] ?? null;",
        "apres": "return miseEnPage.entetesEnMarge?.[String(page)] ?? 0;",
        "test": "les en-têtes renvoyés en marge sont exactement les 21 pages attendues",
    },
]


def empreinte(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def lancer_test(nom_test: str | None):
    """Rend (code de sortie, sortie). Sans nom, lance le fichier entier."""
    commande = [
        "node",
        "--import",
        "./scripts/register-alias.mjs",
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--test",
    ]
    if nom_test is not None:
        commande += ["--test-name-pattern", nom_test]
    commande.append(TEST)

    resultat = subprocess.run(
        commande,
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def nombre_de_tests_passes(sortie: str) -> int:
    trouve = re.search(r"^# pass (\d+)$", sortie, re.MULTILINE)
    return int(trouve.group(1)) if trouve else 0


def appliquer(chemin: Path, avant: str, apres: str) -> None:
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


def main() -> None:
    if not FICHIER.exists():
        sys.exit(f"ERREUR : {FICHIER} est absent")
    if not (RACINE / TEST).exists():
        sys.exit(f"ERREUR : {TEST} est absent")

    octets = FICHIER.read_bytes()
    reference = hashlib.sha256(octets).hexdigest()
    print(f"reference : {len(octets)} octets, sha256 {reference}")

    # Temoin. Chaque ancre doit etre unique et chaque test doit exister et passer
    # avant qu'on y touche.
    for mutation in MUTATIONS:
        contenu = FICHIER.read_bytes()
        occurrences = contenu.count(mutation["avant"].encode("utf-8"))
        if occurrences != 1:
            sys.exit(
                f"ERREUR : l'ancre de « {mutation['nom']} » apparait {occurrences} fois "
                "— le code a bouge, la mutation ne vise plus rien"
            )

        code, sortie = lancer_test(mutation["test"])
        passes = nombre_de_tests_passes(sortie)
        if code != 0 or passes < 1:
            print(f"Le test « {mutation['test']} » ne passe pas avant mutation :")
            print(sortie[-1500:])
            sys.exit(1)

    print(f"temoin : les {len(MUTATIONS)} tests nommes passent avant mutation\n")

    echecs = []
    try:
        for mutation in MUTATIONS:
            # Chaque mutation part du fichier d'origine : sans cette remise a
            # zero, elles s'empileraient.
            FICHIER.write_bytes(octets)
            appliquer(FICHIER, mutation["avant"], mutation["apres"])

            code, sortie = lancer_test(mutation["test"])
            tombes = [
                ligne.strip()
                for ligne in sortie.splitlines()
                if ligne.strip().startswith("not ok")
            ]
            detecte = code != 0 and len(tombes) > 0

            if detecte:
                print(f"OK     {mutation['nom']}  — {mutation['description']}")
                for ligne in tombes[:1]:
                    print(f"         {ligne}")
            else:
                print(f"ECHEC  {mutation['nom']}  — {mutation['description']}")
                print("         AUCUN test n'est tombe")
                echecs.append(mutation["nom"])
    finally:
        FICHIER.write_bytes(octets)
        restauree = empreinte(FICHIER)
        print(f"\nrestauration : sha256 {restauree}")
        if restauree != reference:
            print("ECHEC  la restauration ne rend pas le fichier d'origine")
            sys.exit(1)
        print("OK     le fichier est rendu a l'identique")

    code, sortie = lancer_test(None)
    if code != 0:
        print("ECHEC  le fichier de tests reste en echec apres restauration")
        print(sortie[-2000:])
        sys.exit(1)
    print(f"OK     le fichier de tests repasse au vert ({nombre_de_tests_passes(sortie)} tests)")

    if echecs:
        print(f"\nECHEC  {len(echecs)} mutation(s) non detectee(s) : " + " ; ".join(echecs))
        sys.exit(1)
    print(f"\nOK     les {len(MUTATIONS)} mutations sont detectees")


if __name__ == "__main__":
    main()
