"""Falsifier le test des routes.

Un test qui n'a jamais rougi ne prouve rien. On defait, une par une, chacune des
proprietes que `tests/routes.test.mjs` pretend tenir, et on exige qu'il TOMBE —
sur le test NOMME pour elle, et pas sur un voisin.

CE QUE CE FALSIFICATEUR DOIT PROUVER, ET QUI N'EST PAS EVIDENT
--------------------------------------------------------------
Ce test remplace une garantie qu'on CROYAIT tenir : `experiments.typedRoutes`
est actif, mais les types engendres vivent dans `.expo/`, exclu par `.gitignore`,
et l'integration continue ne les engendre jamais. Le test ecrit ici est donc le
SEUL controle des routes qui tourne partout — et un controle qui n'a jamais
rougi ne vaut pas mieux qu'une croyance.

DEUX FORMES DE MUTATION
-----------------------
1. **remplacer** : une chaine de route est abimee, ou une justification retiree.
   L'unicite du motif est verifiee : un motif qui apparait deux fois muterait
   peut-etre l'autre, et le verdict accuserait le test.
2. **renommer** : un fichier de route est deplace, pour eprouver l'autre cote du
   controle — celui qui enumere les fichiers. La restauration est un renommage
   inverse, jamais une suppression.

Temoin : on exige un nombre de tests EXECUTES non nul. `node --test` sort en 0
quand le motif ne designe aucun test.
"""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or "node"
TEST = "tests/routes.test.mjs"

PROFIL = "app/profil.tsx"
SOURCES = "app/sources.tsx"
COMPTE = "src/components/ReglagesCompteSection.tsx"

SURVEILLES = [PROFIL, SOURCES, COMPTE]


def sha(chemin: str) -> str:
    return hashlib.sha256((RACINE / chemin).read_bytes()).hexdigest()


def lancer() -> tuple[int, str]:
    """Lancer le test seul, et rendre (code, sortie)."""
    r = subprocess.run(
        [
            NODE,
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            TEST,
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
    )
    return r.returncode, r.stdout + r.stderr


def compter_executes(sortie: str) -> int:
    """Le nombre de tests REELLEMENT executes, lu sur la ligne `1..N`."""
    m = re.search(r"^1\.\.(\d+)$", sortie, re.MULTILINE)
    return int(m.group(1)) if m else -1


def remplacer(chemin: str, motif: str, remplacement: str):
    """Poser la mutation, et rendre de quoi restaurer a l'octet."""
    fichier = RACINE / chemin
    original = fichier.read_bytes()
    texte = original.decode("utf-8")

    occurrences = texte.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{chemin} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )

    fichier.write_bytes(texte.replace(motif, remplacement).encode("utf-8"))

    def rendre():
        fichier.write_bytes(original)

    return rendre


def mutation(chemin: str, motif: str, remplacement: str):
    """Une fabrique : la mutation n'est posee qu'au moment de l'eprouver."""
    return lambda: remplacer(chemin, motif, remplacement)


def renommer_sources():
    """Deplacer un ecran, pour que la route reclamee n'existe plus."""
    depart = RACINE / SOURCES
    arrivee = RACINE / "app/source.tsx"
    depart.rename(arrivee)

    def rendre():
        arrivee.rename(depart)

    return rendre


MUTATIONS = [
    (
        "une chaine de route porte une faute de frappe",
        "les routes réclamées par le code existent toutes",
        mutation(PROFIL, "router.push('/reglages')", "router.push('/reglage')"),
    ),
    (
        "l'ecran des sources est renomme, et sa route n'existe plus",
        "les routes réclamées par le code existent toutes",
        renommer_sources,
    ),
    (
        "la justification d'une route atteinte autrement est retiree",
        "aucun écran n’est laissé sans chemin pour l’ouvrir",
        mutation(COMPTE, 'destination="/profil-public"', 'destination="/profil"'),
    ),
]


def main() -> int:
    # --- le temoin : sur l'arbre reel, tout doit etre vert -------------------
    code, sortie = lancer()
    executes = compter_executes(sortie)
    print("=" * 70)
    print("Temoin : le test sur l'arbre reel")
    print("=" * 70)
    print(f"  code {code}, {executes} test(s) execute(s)")
    if code != 0:
        print("[ERR] le test est DEJA en echec : on ne peut rien falsifier")
        print(sortie[-2000:])
        return 1
    if executes <= 0:
        print("[ERR] aucun test n'a ete execute : le harnais ne prouve rien")
        return 1

    empreintes = {chemin: sha(chemin) for chemin in SURVEILLES}

    print()
    print("=" * 70)
    print(f"{len(MUTATIONS)} mutation(s) a eprouver")
    print("=" * 70)

    detectees = 0
    for nom, test_vise, fabrique in MUTATIONS:
        try:
            rendre = fabrique()
        except AssertionError as erreur:
            print(f"--- {nom}")
            print(f"    ANCRE  {erreur}")
            continue

        try:
            code, sortie = lancer()
        finally:
            rendre()

        tombe = code != 0
        a_parle = test_vise in sortie
        verdict = (
            "DETECTEE"
            if (tombe and a_parle)
            else ("HARNAIS" if not tombe else "ANCRE")
        )
        if verdict == "DETECTEE":
            detectees += 1
        print(f"--- {nom}")
        print(f"    {verdict}  (code {code}, test vise nomme : {a_parle})")
        if verdict != "DETECTEE":
            print(sortie[-1200:])

    # --- l'arbre est-il rendu tel qu'il etait ? -----------------------------
    print()
    print("=" * 70)
    print("Restauration")
    print("=" * 70)
    identiques = True
    for chemin in SURVEILLES:
        meme = sha(chemin) == empreintes[chemin]
        identiques = identiques and meme
        print(f"  {chemin:<40} : {'identique' if meme else 'DIFFERENT'}")
    ecarte = (RACINE / "app/source.tsx").exists()
    print(f"  app/source.tsx encore present : {ecarte}")

    code, sortie = lancer()
    print(f"  test sur l'arbre restaure : code {code}")
    if code != 0:
        print(sortie[-1500:])

    print()
    if not identiques or ecarte:
        print("RESULTAT : l'arbre n'a PAS ete restaure — a corriger avant tout.")
        return 1
    if code != 0:
        print("RESULTAT : le test echoue apres restauration — l'arbre est suspect.")
        return 1
    print(
        f"RESULTAT : {len(MUTATIONS)} mutation(s), {detectees} detectee(s), "
        "arbre restaure."
    )
    return 0 if detectees == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
