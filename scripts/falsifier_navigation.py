"""Falsifier le test de la navigation par onglets.

Un test qui n'a jamais rougi ne prouve rien. On defait, une par une, chacune des
proprietes que `tests/navigation.test.mjs` pretend tenir, et on exige qu'il
TOMBE — sur le test NOMME pour elle, et pas sur un voisin.

CE QUE CE FALSIFICATEUR DOIT PROUVER, ET QUI N'EST PAS EVIDENT
--------------------------------------------------------------
Une mutation de FORME ne casse rien : l'application demarrerait encore. Le seul
juge est donc le test de forme lui-meme, et un falsificateur qui se contente de
« le test a echoue » ne dit pas que c'est le BON test qui a parle. Chaque
mutation porte donc le nom du test qu'elle vise, et le verdict n'est DETECTEE
que si ce nom apparait dans la sortie.

DEUX FORMES DE MUTATION
-----------------------
1. **remplacer** : un motif unique est remplace dans un fichier, restaure a
   l'octet par empreinte. L'unicite du motif est verifiee : un motif qui
   apparait deux fois muterait peut-etre l'autre, et le verdict accuserait le
   test.
2. **renommer** : un ecran est deplace, pour eprouver les controles d'existence.
   La restauration est un renommage inverse, jamais une suppression.

Temoin : on exige un nombre de tests EXECUTES non nul. `node --test` sort en 0
quand le motif ne designe aucun test — un « succes » vide serait une anomalie,
et le falsificateur annoncerait alors « tout detecte » sur un harnais qui n'a
rien mesure.
"""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or "node"
TEST = "tests/navigation.test.mjs"

DISPOSITION = "app/(tabs)/_layout.tsx"
BARRE = "src/components/BarreOngletsHaut.tsx"
PILE = "app/_layout.tsx"
PROFIL = "app/profil.tsx"
CORAN = "app/(tabs)/coran.tsx"

# Les fichiers que ce falsificateur touche, pour le rapport de restauration.
SURVEILLES = [DISPOSITION, BARRE, PILE, PROFIL, CORAN]


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
        timeout=180,
    )
    return r.returncode, r.stdout + r.stderr


def compter_executes(sortie: str) -> int:
    """Le nombre de tests REELLEMENT executes.

    On lit la ligne `1..N` du plan, que le coureur ecrit meme quand tout echoue.
    Un motif qui ne designe rien produit un plan a 0, et c'est ce qu'on refuse.
    """
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


def renommer_profil():
    """Deplacer l'ecran du profil dans le groupe des onglets."""
    depart = RACINE / PROFIL
    arrivee = RACINE / "app/(tabs)/profil.tsx"
    depart.rename(arrivee)

    def rendre():
        arrivee.rename(depart)

    return rendre


MUTATIONS = [
    (
        "la barre est remise en bas",
        "la barre d’onglets est en haut",
        mutation(DISPOSITION, "tabBarPosition: 'top'", "tabBarPosition: 'bottom'"),
    ),
    (
        "il n'y a plus que quatre onglets",
        "la barre porte exactement cinq onglets",
        mutation(DISPOSITION, "  { name: 'progres', title: 'Progrès' },\n", ""),
    ),
    (
        "Profil reprend sa place dans la barre, et Amis la perd",
        "Amis est un onglet, et Profil n’en est plus un",
        mutation(
            DISPOSITION,
            "{ name: 'amis', title: 'Amis' }",
            "{ name: 'profil', title: 'Profil' }",
        ),
    ),
    (
        "l'ecran du profil retourne dans le groupe des onglets",
        "les fichiers d’écran suivent la barre",
        renommer_profil,
    ),
    (
        "la pile racine declare de nouveau Amis, et plus Profil",
        "la pile racine déclare Profil et ne déclare plus Amis",
        mutation(PILE, 'name="profil"', 'name="amis"'),
    ),
    (
        "l'avatar ne mene plus au profil",
        "la barre rend le profil atteignable",
        mutation(BARRE, "router.push('/profil')", "router.push('/notifications')"),
    ),
    (
        "la barre ne prend plus la marge du haut",
        "la marge du haut est prise une seule fois",
        mutation(BARRE, "paddingTop: insets.top", "paddingTop: 0"),
    ),
    (
        "un ecran d'onglet reprend la marge du haut",
        "la marge du haut est prise une seule fois",
        mutation(CORAN, "edges={['bottom']}", "edges={['top']}"),
    ),
    (
        "l'appui ne peut plus etre retenu par un ecran",
        "l’appui est émis avant de naviguer, et son refus est respecté",
        mutation(BARRE, "canPreventDefault: true", "canPreventDefault: false"),
    ),
    (
        "le refus d'un ecran est ignore",
        "l’appui est émis avant de naviguer, et son refus est respecté",
        mutation(
            BARRE,
            "if (!actif && !evenement.defaultPrevented) {",
            "if (!actif) {",
        ),
    ),
    (
        "la navigation precede l'emission de l'evenement",
        "l’appui est émis avant de naviguer, et son refus est respecté",
        mutation(
            BARRE,
            "                const evenement = navigation.emit({\n"
            "                  type: 'tabPress',\n"
            "                  target: route.key,\n"
            "                  canPreventDefault: true,\n"
            "                });\n"
            "                if (!actif && !evenement.defaultPrevented) {\n"
            "                  navigation.navigate(route.name, route.params);\n"
            "                }",
            "                navigation.navigate(route.name, route.params);\n"
            "                const evenement = navigation.emit({\n"
            "                  type: 'tabPress',\n"
            "                  target: route.key,\n"
            "                  canPreventDefault: true,\n"
            "                });\n"
            "                if (!actif && !evenement.defaultPrevented) {\n"
            "                }",
        ),
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
        # Le test vise a-t-il parle ? On le cherche par son nom dans la sortie.
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
        print(f"  {chemin:<34} : {'identique' if meme else 'DIFFERENT'}")
    profil_ecarte = (RACINE / "app/(tabs)/profil.tsx").exists()
    print(f"  app/(tabs)/profil.tsx encore present : {profil_ecarte}")

    code, sortie = lancer()
    print(f"  test sur l'arbre restaure : code {code}")
    if code != 0:
        print(sortie[-1500:])

    print()
    if not identiques or profil_ecarte:
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
