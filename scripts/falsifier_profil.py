"""Falsifier les tests du profil et de son interrupteur de revision.

Un test qui n'a jamais rougi ne prouve rien. On defait, une par une, chacune des
proprietes que `tests/profil.test.mjs` et `tests/apprentissage.test.mjs`
pretendent tenir, et on exige que le test TOMBE — sur le test NOMME pour elle,
et pas sur un voisin.

CE QUE CES DEUX FICHIERS GARDENT, ET POURQUOI ILS ONT BESOIN D'ETRE EPROUVES
---------------------------------------------------------------------------
`tests/profil.test.mjs` lit une source : il ne rend rien, il ne traverse aucune
donnee. C'est le genre de controle qui se met a ne plus rien mesurer sans que
rien ne le dise — une expression reguliere qui ne correspond plus rend une liste
VIDE, et une liste vide comparée a une autre liste vide passe. Le temoin qui
compte les tests EXECUTES ne suffit donc pas ici : il faut defaire chaque
propriete et verifier que le test tombe vraiment.

`tests/apprentissage.test.mjs` eprouve, lui, du code reel contre une doublure.
Ses deux defauts — « absent lu comme desactive » et « une ecriture qui remplace
la ligne entiere » — sont silencieux tous les deux : aucun ne se voit a l'ecran
au moment ou il se produit.

Temoin : on exige un nombre de tests EXECUTES non nul. `node --test` sort en 0
quand le motif ne designe aucun test, et un falsificateur qui prendrait ce 0
pour un vert validerait le vide.
"""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or "node"

PROFIL = "app/profil.tsx"
APPRENTISSAGE = "src/lib/apprentissage.ts"

SURVEILLES = [PROFIL, APPRENTISSAGE]

TEST_PROFIL = "tests/profil.test.mjs"
TEST_APPRENTISSAGE = "tests/apprentissage.test.mjs"

# Les noms EXACTS des tests vises, tels que `node --test` les ecrit. Un nom
# approche ferait dire au falsificateur « le test vise n'a pas parle » alors que
# c'est lui qui l'aurait mal nomme.
ORDRE = "les six sections sont là, dans l’ordre demandé"
TITRES = "les six titres se ressemblent : même style de part et d’autre"
INTERRUPTEUR = "l’interrupteur des révisions est réel, et il écrit"

ABSENT_ACTIF = "absent vaut ACTIF : une configuration sans le champ garde la révision"
RIEN_D_AUTRE = "enregistrer le réglage ne touche à RIEN d’autre dans la configuration"
SANS_CONFIG = "sans configuration enregistrée, il n’y a rien à régler"
ECRIT_VRAI = "un enregistrement réussi se distingue d’un refus d’écrire"


def sha(chemin: str) -> str:
    return hashlib.sha256((RACINE / chemin).read_bytes()).hexdigest()


def lancer(test: str) -> tuple[int, str]:
    """Lancer un fichier de test seul, et rendre (code, sortie)."""
    r = subprocess.run(
        [
            NODE,
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            test,
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
    """Le nombre de tests REELLEMENT executes, lu sur la ligne `1..N`."""
    m = re.search(r"^1\.\.(\d+)$", sortie, re.MULTILINE)
    return int(m.group(1)) if m else -1


def ecrire(chemin: str, texte: str, original: bytes):
    """Poser une mutation deja calculee, et rendre de quoi restaurer a l'octet."""
    fichier = RACINE / chemin
    fichier.write_bytes(texte.encode("utf-8"))

    def rendre():
        fichier.write_bytes(original)

    return rendre


def remplacer(chemin: str, motif: str, remplacement: str):
    """Remplacer UNE occurrence, verifiee unique.

    Un motif qui apparait deux fois muterait peut-etre l'autre, et le verdict
    accuserait alors le test pour un defaut qui n'existe pas.
    """
    fichier = RACINE / chemin
    original = fichier.read_bytes()
    texte = original.decode("utf-8")

    occurrences = texte.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{chemin} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )

    return ecrire(chemin, texte.replace(motif, remplacement), original)


def mutation(chemin: str, motif: str, remplacement: str):
    """Une fabrique : la mutation n'est posee qu'au moment de l'eprouver."""
    return lambda: remplacer(chemin, motif, remplacement)


def echanger_deux_sections():
    """Echanger deux titres : l'ordre demande n'est plus respecte.

    C'est la forme la plus directe du defaut que ce test surveille. Les deux
    motifs sont verifies uniques, et la permutation passe par une sentinelle —
    sans elle, le second remplacement defairait le premier.
    """
    fichier = RACINE / PROFIL
    original = fichier.read_bytes()
    texte = original.decode("utf-8")

    premier = "<Text style={styles.sectionTitle}>Connaissances</Text>"
    second = "<Text style={styles.sectionTitle}>Objectif et rythme</Text>"
    for motif in (premier, second):
        if texte.count(motif) != 1:
            raise AssertionError(f"{PROFIL} : {motif!r} n'apparait pas une seule fois")

    permute = (
        texte.replace(premier, "@@SENTINELLE@@")
        .replace(second, premier)
        .replace("@@SENTINELLE@@", second)
    )
    return ecrire(PROFIL, permute, original)


MUTATIONS = [
    # --- L'ordre des six sections -------------------------------------------
    (
        "deux sections sont echangees : l'ordre demande n'est plus suivi",
        TEST_PROFIL,
        ORDRE,
        echanger_deux_sections,
    ),
    (
        "une section garde son ancien nom : « Mes connaissances »",
        TEST_PROFIL,
        ORDRE,
        mutation(
            PROFIL,
            "<Text style={styles.sectionTitle}>Connaissances</Text>",
            "<Text style={styles.sectionTitle}>Mes connaissances</Text>",
        ),
    ),
    (
        "une septieme section est ajoutee",
        TEST_PROFIL,
        ORDRE,
        mutation(
            PROFIL,
            "<Text style={styles.sectionTitle}>Amis et entraide</Text>",
            "<Text style={styles.sectionTitle}>Ma progression</Text>\n"
            "        <Text style={styles.sectionTitle}>Amis et entraide</Text>",
        ),
    ),
    # --- L'accord des six titres --------------------------------------------
    (
        "le titre du profil change de taille : cinq titres d'une forme, un sixieme d'une autre",
        TEST_PROFIL,
        TITRES,
        mutation(PROFIL, "fontSize: fontSizes.lg,", "fontSize: fontSizes.xl,"),
    ),
    # --- L'interrupteur des revisions ---------------------------------------
    (
        "l'interrupteur redevient une vue decorative",
        TEST_PROFIL,
        INTERRUPTEUR,
        mutation(PROFIL, "<Switch", "<View"),
    ),
    (
        "l'interrupteur appelle une fonction qui n'ecrit rien",
        TEST_PROFIL,
        INTERRUPTEUR,
        mutation(
            PROFIL,
            "await enregistrerRevisions(valeur);",
            "await marquerSeulement(valeur);",
        ),
    ),
    # --- La regle « absent vaut actif » -------------------------------------
    (
        "« absent » est lu comme « desactive » : la revision s'eteint pour tout le monde",
        TEST_APPRENTISSAGE,
        ABSENT_ACTIF,
        mutation(
            APPRENTISSAGE,
            "config?.apprentissage?.revisions !== false",
            "config?.apprentissage?.revisions === true",
        ),
    ),
    # --- L'ecriture qui remplace la ligne entiere ---------------------------
    (
        "l'ecriture n'est plus precedee de la relecture : le reste de la configuration part",
        TEST_APPRENTISSAGE,
        RIEN_D_AUTRE,
        mutation(
            APPRENTISSAGE,
            "  await saveUserConfig({\n    ...existante,\n    apprentissage:",
            "  await saveUserConfig({\n    apprentissage:",
        ),
    ),
    (
        "sans configuration, une configuration par defaut est inventee",
        TEST_APPRENTISSAGE,
        SANS_CONFIG,
        mutation(APPRENTISSAGE, "  if (existante === null) return false;\n", "\n"),
    ),
    (
        "un enregistrement reussi ne se distingue plus d'un refus d'ecrire",
        TEST_APPRENTISSAGE,
        ECRIT_VRAI,
        mutation(APPRENTISSAGE, "  return true;", "  return false;"),
    ),
]


def main() -> int:
    # --- le temoin : sur l'arbre reel, tout doit etre vert -------------------
    print("=" * 70)
    print("Temoin : les deux fichiers de test sur l'arbre reel")
    print("=" * 70)

    for test in (TEST_PROFIL, TEST_APPRENTISSAGE):
        code, sortie = lancer(test)
        executes = compter_executes(sortie)
        print(f"  {test:<32} : code {code}, {executes} test(s) execute(s)")
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
    for nom, test, test_vise, fabrique in MUTATIONS:
        try:
            rendre = fabrique()
        except AssertionError as erreur:
            print(f"--- {nom}")
            print(f"    ANCRE  {erreur}")
            continue

        try:
            code, sortie = lancer(test)
        finally:
            rendre()

        tombe = code != 0
        a_parle = test_vise in sortie
        verdict = "DETECTEE" if (tombe and a_parle) else ("HARNAIS" if not tombe else "ANCRE")
        if verdict == "DETECTEE":
            detectees += 1
        print(f"--- {nom}")
        print(f"    {verdict}  (code {code}, test vise nomme : {a_parle})")
        if verdict != "DETECTEE":
            print(sortie[-1500:])

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

    for test in (TEST_PROFIL, TEST_APPRENTISSAGE):
        code, sortie = lancer(test)
        print(f"  {test} sur l'arbre restaure : code {code}")
        if code != 0:
            print(sortie[-1500:])
            identiques = False

    print()
    if not identiques:
        print("RESULTAT : l'arbre n'a PAS ete restaure — a corriger avant tout.")
        return 1
    print(
        f"RESULTAT : {len(MUTATIONS)} mutation(s), {detectees} detectee(s), "
        "arbre restaure."
    )
    return 0 if detectees == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
