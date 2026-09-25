# -*- coding: utf-8 -*-
"""Falsifier les tests de la forme du choix du recitateur.

Un test qui n'a jamais rougi ne prouve rien. On defait, une par une, chacune des
proprietes que `tests/lecteur_recitateur.test.mjs` pretend tenir, et on exige que
le test TOMBE -- sur le test NOMME pour elle, et pas sur un voisin.

CE QUE CE FICHIER GARDE, ET POURQUOI IL A BESOIN D'ETRE EPROUVE
--------------------------------------------------------------
`tests/lecteur_recitateur.test.mjs` lit une source : il ne rend rien, il ne
traverse aucune donnee. C'est le genre de controle qui se met a ne plus rien
mesurer sans que rien ne le dise -- une expression reguliere qui ne correspond
plus rend une chaine vide, et une chaine vide ne se plaint pas.

Les proprietes viennent de la demande :
  - le recitateur courant est « directement visible » ;
  - la liste s'ouvre et se choisit « en un geste » ;
  - les dix recitateurs sont conserves ;
  - et le recitateur ne se change qu'a UN endroit.

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

LECTEUR = "src/components/LecteurAudio.tsx"
SURVEILLES = [LECTEUR]

TEST = "tests/lecteur_recitateur.test.mjs"

# Les noms EXACTS des tests vises, tels que `node --test` les ecrit -- apostrophes
# courbes comprises. Un nom approche ferait dire au falsificateur « le test vise
# n'a pas parle » alors que c'est lui qui l'aurait mal nomme.
LIGNE = "la ligne nomme le récitateur courant, et elle est visible même quand rien ne joue"
GESTE = "un seul geste ouvre la liste des dix, un seul geste applique le choix"
UN_ENDROIT = "le récitateur n’a qu’un endroit où se changer : il a quitté les réglages"

# L'element, sans son indentation : les deux montages ne sont pas indentés pareil
# (huit espaces au repos, six pendant une seance), et une ancre ecrite avec la
# mauvaise indentation ne trouve rien -- mesure, la mutation a ete classee ANCRE.
MONTAGE = "<ChoixRecitateur courant={recitateur} choisir={changerRecitateur} />"


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
    fichier = RACINE / LECTEUR
    original = fichier.read_bytes()
    texte = original.decode("utf-8")

    occurrences = texte.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{LECTEUR} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )

    fichier.write_bytes(texte.replace(motif, remplacement).encode("utf-8"))
    return lambda: fichier.write_bytes(original)


MUTATIONS = [
    # --- La ligne, qui doit NOMMER le recitateur courant ---------------------
    (
        "la ligne ne nomme plus le recitateur courant : « Recitateur » tout court",
        LIGNE,
        lambda: remplacer("Récitateur : {courant.nom}", "Récitateur"),
    ),
    (
        "le libelle vocal perd le nom : un lecteur d'ecran n'annonce plus lequel",
        LIGNE,
        lambda: remplacer(
            "accessibilityLabel={`Récitateur : ${courant.nom}. Appuyer pour changer.`}",
            'accessibilityLabel="Récitateur"',
        ),
    ),
    (
        "au repos, la barre ne montre plus le recitateur : il faut commencer pour savoir",
        LIGNE,
        lambda: remplacer(
            "      <View style={styles.barreRepliee}>\n        " + MONTAGE + "\n",
            "      <View style={styles.barreRepliee}>\n",
        ),
    ),
    (
        "pendant une seance, la barre ne montre plus le recitateur",
        LIGNE,
        lambda: remplacer(
            "      " + MONTAGE + "\n\n      {/* Une panne se dit ici",
            "      {/* Une panne se dit ici",
        ),
    ),
    # --- Le geste, qui doit ouvrir la liste et l'appliquer -------------------
    (
        "la ligne n'ouvre plus la liste : le recitateur est visible mais intouchable",
        GESTE,
        lambda: remplacer(
            "onPress={() => setOuverte((v) => !v)}",
            "onPress={() => {}}",
        ),
    ),
    (
        "la liste est tronquee a trois : les dix ne sont plus proposes",
        GESTE,
        lambda: remplacer(
            "RECITATEURS.map((r) => {",
            "RECITATEURS.slice(0, 3).map((r) => {",
        ),
    ),
    (
        "un nom de la liste n'applique plus le choix : la liste se referme sans rien changer",
        GESTE,
        lambda: remplacer(
            "onPress={() => choisirEtFermer(r.id)}",
            "onPress={() => setOuverte(false)}",
        ),
    ),
    (
        "choisir referme SANS appliquer : le recitateur affiche ne change pas",
        GESTE,
        lambda: remplacer(
            "    choisir(id);\n    setOuverte(false);\n",
            "    setOuverte(false);\n",
        ),
    ),
    # --- Un seul endroit, et un seul --------------------------------------
    (
        "la section « Recitateur » revient dans les reglages : deux commandes pour un reglage",
        UN_ENDROIT,
        lambda: remplacer(
            '          <Section titre="Répétitions">',
            '          <Section titre="Récitateur">\n'
            "            {RECITATEURS.map((r) => (\n"
            "              <Puce\n"
            "                key={r.id}\n"
            "                libelle={r.nom}\n"
            "                choisi={r.id === recitateur.id}\n"
            "                onPress={() => changerRecitateur(r.id)}\n"
            "              />\n"
            "            ))}\n"
            "          </Section>\n"
            "\n"
            '          <Section titre="Répétitions">',
        ),
    ),
    (
        "un second endroit liste les recitateurs, sans le dire",
        UN_ENDROIT,
        lambda: remplacer(
            '          <Section titre="Répétitions">',
            '          <Section titre="Répétitions">\n'
            "            {RECITATEURS.map((r) => (\n"
            "              <Puce key={r.id} libelle={r.nom} choisi={false}"
            " onPress={() => changerRecitateur(r.id)} />\n"
            "            ))}",
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
    print(f"  {TEST:<40} : code {code}, {executes} test(s) execute(s)")
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
