# -*- coding: utf-8 -*-
"""Falsifier les tests de la forme de l'ecran Programme.

Un test qui n'a jamais rougi ne prouve rien. On defait, une par une, chacune des
proprietes que `tests/programme_ecran.test.mjs` pretend tenir, et on exige que le
test TOMBE -- sur le test NOMME pour elle, et pas sur un voisin.

CE QUE CE FICHIER GARDE, ET POURQUOI IL A BESOIN D'ETRE EPROUVE
--------------------------------------------------------------
`tests/programme_ecran.test.mjs` lit une source : il ne rend rien, il ne
traverse aucune donnee. C'est le genre de controle qui se met a ne plus rien
mesurer sans que rien ne le dise -- une expression reguliere qui ne correspond
plus rend une chaine vide, et une chaine vide ne se plaint pas.

Les deux proprietes viennent de la demande, mot pour mot :
  - « deux entrees distinctes », Apprentissage (livre ouvert) et Revision (deux
    fleches circulaires) ;
  - « si Revisions est desactive dans le Profil, adapter l'affichage sans
    supprimer les donnees de revision ».

Temoin : on exige un nombre de tests EXECUTES non nul. `node --test` sort en 0
quand le motif ne designe aucun test, et un falsificateur qui prendrait ce 0 pour
un vert validerait le vide.
"""
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
NODE = shutil.which("node") or "node"

PROGRAMME = "app/(tabs)/programme.tsx"
SURVEILLES = [PROGRAMME]

TEST = "tests/programme_ecran.test.mjs"

# Les noms EXACTS des tests vises, tels que `node --test` les ecrit. Un nom
# approche ferait dire au falsificateur « le test vise n'a pas parle » alors que
# c'est lui qui l'aurait mal nomme.
ENTREES = "les deux entrées se distinguent par leur icône ET par leur mot"
BANDEAU = "les révisions éteintes se DISENT : l’écran lit le réglage et l’annonce"
NOMBRE = "le nombre n’est annoncé que si les révisions sont proposées"


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


def remplacer(motif: str, remplacement: str):
    """Remplacer UNE occurrence, verifiee unique.

    Un motif qui apparait deux fois muterait peut-etre l'autre, et le verdict
    accuserait alors le test pour un defaut qui n'existe pas.
    """
    fichier = RACINE / PROGRAMME
    original = fichier.read_bytes()
    texte = original.decode("utf-8")

    occurrences = texte.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{PROGRAMME} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )

    fichier.write_bytes(texte.replace(motif, remplacement).encode("utf-8"))
    return lambda: fichier.write_bytes(original)


MUTATIONS = [
    # --- Deux entrees distinctes --------------------------------------------
    (
        "les deux icones sont echangees : les entrees se ressemblent a nouveau",
        ENTREES,
        lambda: remplacer('            name="book-outline"\n', '            name="sync-outline"\n'),
    ),
    (
        "l'entree d'apprentissage perd son mot",
        ENTREES,
        lambda: remplacer("            Apprentissage\n", "            À apprendre\n"),
    ),
    (
        "l'entree de revision reprend l'ancien nom : « A renforcer »",
        ENTREES,
        lambda: remplacer(
            "            Révision\n            {revisionsOuvertes",
            "            À renforcer\n            {revisionsOuvertes",
        ),
    ),
    # --- L'etat eteint, qui doit se DIRE ------------------------------------
    (
        "l'ecran ne lit plus le reglage : il le remplace par une constante",
        BANDEAU,
        lambda: remplacer(
            "const revisionsOuvertes = revisionsActives(config);",
            "const revisionsOuvertes = true;",
        ),
    ),
    (
        "le bandeau s'affiche a contretemps : quand les revisions sont ALLUMEES",
        BANDEAU,
        lambda: remplacer(
            "              {!revisionsOuvertes && (",
            "              {revisionsOuvertes && (",
        ),
    ),
    (
        "le bandeau annonce l'etat sans dire que rien n'est perdu",
        BANDEAU,
        lambda: remplacer(
            "                    Vos passages à renforcer sont conservés : rien n’est supprimé, et la liste\n"
            "                    reste consultable ci-dessous. Ils ne sont simplement plus mis en avant.\n",
            "                    Ces passages ne sont plus mis en avant.\n",
        ),
    ),
    # --- Le nombre, qui ne s'annonce plus quand la revision est eteinte ------
    (
        "le nombre s'affiche meme quand les revisions sont eteintes",
        NOMBRE,
        lambda: remplacer(
            "{revisionsOuvertes && aRenforcer.length > 0 ? ` (${aRenforcer.length})` : ''}",
            "{aRenforcer.length > 0 ? ` (${aRenforcer.length})` : ''}",
        ),
    ),
]


def main() -> int:
    # --- le temoin : sur l'arbre reel, tout doit etre vert -------------------
    print("=" * 70)
    print("Temoin : le fichier de test sur l'arbre reel")
    print("=" * 70)

    code, sortie = lancer(TEST)
    executes = compter_executes(sortie)
    print(f"  {TEST:<32} : code {code}, {executes} test(s) execute(s)")
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
            code, sortie = lancer(TEST)
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

    code, sortie = lancer(TEST)
    print(f"  {TEST} sur l'arbre restaure : code {code}")
    if code != 0:
        print(sortie[-1500:])
        identiques = False

    print()
    if not identiques:
        print("RESULTAT : l'arbre n'a PAS ete restaure -- a corriger avant tout.")
        return 1
    print(
        f"RESULTAT : {len(MUTATIONS)} mutation(s), {detectees} detectee(s), "
        "arbre restaure."
    )
    return 0 if detectees == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
