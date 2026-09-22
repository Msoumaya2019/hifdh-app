"""Prouve que le controle de mise en page detecte reellement un defaut.

Un controle qui n'a jamais echoue ne prouve rien : il peut regarder a cote. Ce
script mutile `data/quran/moushaf_layout.json`, lance
`generer_layout_moushaf.py --verifier`, et exige que le controle tombe — et
tombe **par le controle attendu**, nomme pour chaque mutation. Sans cela, une
mutation pourrait etre « detectee » par un controle sans rapport, et on croirait
verifie ce qui ne l'est pas.

Le fichier est rendu a l'octet pres apres chaque mutation, et la restauration se
prouve par empreinte SHA-256 — jamais par `git diff`, qui depend de la
configuration de fin de ligne.

Ce qui est mutile, et le controle qui doit tomber :

  1. une seizième ligne           -> « 16 lignes » ;
  2. un verset passe a la page suivante -> « alors que la pagination annonce » ;
  3. un intervalle de jetons etendu     -> « reprend au jeton » ;
  4. un verset efface                   -> « jamais places » ;
  5. un verset recopie ailleurs          -> « sur plusieurs pages » ;
  6. la basmala d'une ouverture retiree  -> « au lieu de l'en-tete puis la basmala » ;
  7. une page ajoutee aux en-tetes en marge -> « en-tetes en marge » ;
  8. l'intervalle d'une basmala retreci  -> « attendu 0-3 ».

Usage :
    python scripts/falsifier_layout.py
"""

import hashlib
import io
import json
import pathlib
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = RACINE / "data" / "quran" / "generer_layout_moushaf.py"
FICHIER = RACINE / "data" / "quran" / "moushaf_layout.json"
SEPARATEURS = (",", ":")


def lancer_controle():
    resultat = subprocess.run(
        [sys.executable, str(SCRIPT), "--verifier"],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def lignes_de(fichier, page):
    return fichier["pages"][str(page)]


def chercher_page_avec(fichier, predicat):
    for numero in range(1, 605):
        if str(numero) in fichier["pages"] and predicat(lignes_de(fichier, numero)):
            return numero
    raise LookupError("aucune page ne repond au predicat")


def chercher_verset(fichier):
    """(page, indice de ligne, indice d'element) du premier element « v »."""
    for numero in range(1, 605):
        for i, ligne in enumerate(lignes_de(fichier, numero)):
            for j, element in enumerate(ligne):
                if element[0] == "v":
                    return numero, i, j
    raise LookupError("aucun element « v »")


def chercher_plage_a_etendre(fichier):
    """La premiere plage d'un verset qui en porte plusieurs.

    Un verset etale sur deux lignes a deux plages ; etendre la premiere d'un
    cran reste dans les jetons du verset, et fait donc mordre la seconde. Un
    verset d'une seule plage ne conviendrait pas : l'etendre sortirait du
    verset, et c'est le controle de bornes qui tomberait — pas celui de
    continuite, qu'on veut eprouver ici. Le verset 1 est ecarte pour la meme
    raison : la basmala mise de cote, ses jetons commencent au quatrieme.
    """
    plages = {}
    for numero in range(1, 605):
        for i, ligne in enumerate(lignes_de(fichier, numero)):
            for j, element in enumerate(ligne):
                if element[0] == "v" and element[2] != 1:
                    plages.setdefault((element[1], element[2]), []).append((numero, i, j))
    for cle, positions in plages.items():
        if len(positions) >= 2:
            return positions[0]
    raise LookupError("aucun verset etale sur plusieurs lignes")


def mutations():
    """Rend (nom, description, mutation, fragment du controle attendu)."""

    def ligne_en_trop(fichier):
        lignes_de(fichier, 5).append([])

    def verset_sur_la_mauvaise_page(fichier):
        page, i, j = chercher_verset(fichier)
        element = lignes_de(fichier, page)[i].pop(j)
        lignes_de(fichier, page + 1)[0].append(element)

    def intervalle_troue(fichier):
        page, i, j = chercher_plage_a_etendre(fichier)
        # Le dernier jeton de la premiere plage est repousse d'un cran : la
        # seconde ne reprend plus ou la premiere s'arrete.
        lignes_de(fichier, page)[i][j][4] += 1

    def verset_efface(fichier):
        page, i, j = chercher_verset(fichier)
        lignes_de(fichier, page)[i].pop(j)

    def verset_duplique(fichier):
        page, i, j = chercher_verset(fichier)
        copie = list(lignes_de(fichier, page)[i][j])
        lignes_de(fichier, page + 1)[0].append(copie)

    def basmala_retiree(fichier):
        # Une page dont la ligne 1 porte l'en-tete et la ligne 2 la basmala.
        page = chercher_page_avec(
            fichier,
            lambda lignes: any(e[0] == "e" for e in lignes[0])
            and any(e[0] == "b" for e in lignes[1]),
        )
        lignes = lignes_de(fichier, page)
        lignes[1] = [e for e in lignes[1] if e[0] != "b"]

    def marge_inventee(fichier):
        fichier["entetesEnMarge"]["3"] = 2

    def basmala_retrecie(fichier):
        page = chercher_page_avec(
            fichier, lambda lignes: any(e[0] == "b" for ligne in lignes for e in ligne)
        )
        for ligne in lignes_de(fichier, page):
            for element in ligne:
                if element[0] == "b":
                    element[4] = 2
                    return

    return [
        (
            "ligne en trop",
            "la page 5 porte 16 lignes",
            ligne_en_trop,
            "16 lignes",
        ),
        (
            "verset sur la mauvaise page",
            "le premier verset decrit est renvoye a la page suivante",
            verset_sur_la_mauvaise_page,
            "alors que la pagination annonce",
        ),
        (
            "intervalle troue",
            "un intervalle de jetons est etendu d'un cran",
            intervalle_troue,
            "reprend au jeton",
        ),
        (
            "verset efface",
            "un verset disparait de la mise en page",
            verset_efface,
            "jamais places",
        ),
        (
            "verset duplique",
            "un verset est recopie sur la page suivante",
            verset_duplique,
            "sur plusieurs pages",
        ),
        (
            "basmala retiree",
            "l'ouverture d'une sourate perd sa basmala",
            basmala_retiree,
            "au lieu de l'en-tete puis la basmala",
        ),
        (
            "marge inventee",
            "la page 3 est declaree porter son en-tete en marge",
            marge_inventee,
            "en-tetes en marge",
        ),
        (
            "basmala retrecie",
            "l'intervalle d'une basmala passe de 0-3 a 0-2",
            basmala_retrecie,
            "attendu 0-3",
        ),
    ]


def main() -> None:
    if not FICHIER.exists():
        sys.exit(f"ERREUR : {FICHIER} est absent — lancer d'abord le generateur")
    if not SCRIPT.exists():
        sys.exit(f"ERREUR : {SCRIPT} est absent")

    octets = FICHIER.read_bytes()
    empreinte = hashlib.sha256(octets).hexdigest()
    print(f"reference : {len(octets)} octets, sha256 {empreinte}")

    code, sortie = lancer_controle()
    if code != 0:
        print("Le controle est deja en echec avant toute mutation :")
        print(sortie[-2000:])
        sys.exit(1)
    print("controle vert avant mutation : oui\n")

    echecs = []
    try:
        for nom, description, muter, attendu in mutations():
            # Chaque mutation part du fichier d'origine : sans cette remise a
            # zero, elles s'empileraient et une mutation pourrait etre
            # « detectee » par l'effet de la precedente.
            FICHIER.write_bytes(octets)

            fichier = json.loads(FICHIER.read_text(encoding="utf-8"))
            muter(fichier)
            FICHIER.write_text(
                json.dumps(fichier, ensure_ascii=False, separators=SEPARATEURS) + "\n",
                encoding="utf-8",
            )

            code, sortie = lancer_controle()
            tombes = [
                ligne.strip()
                for ligne in sortie.splitlines()
                if ligne.strip().startswith("- ")
            ]
            detecte = code != 0
            par_le_bon = any(attendu in ligne for ligne in tombes)

            if detecte and par_le_bon:
                print(f"OK     {nom}  — {description}")
                for ligne in tombes[:2]:
                    print(f"         {ligne}")
            elif detecte:
                print(f"ECHEC  {nom}  — {description}")
                print(f"         detecte, mais pas par le controle attendu « {attendu} » :")
                for ligne in tombes[:3]:
                    print(f"         {ligne}")
                echecs.append(f"{nom} (mauvais controle)")
            else:
                print(f"ECHEC  {nom}  — {description}")
                print("         AUCUN controle n'est tombe")
                echecs.append(f"{nom} (non detectee)")
    finally:
        FICHIER.write_bytes(octets)
        restauree = hashlib.sha256(FICHIER.read_bytes()).hexdigest()
        print(f"\nrestauration : sha256 {restauree}")
        if restauree != empreinte:
            print("ECHEC  la restauration ne rend pas le fichier d'origine")
            sys.exit(1)
        print("OK     le fichier est rendu a l'identique")

    code, _ = lancer_controle()
    if code != 0:
        print("ECHEC  le controle reste en echec apres restauration")
        sys.exit(1)
    print("OK     le controle repasse au vert")

    if echecs:
        print(f"\nECHEC  {len(echecs)} mutation(s) non detectee(s) : " + " ; ".join(echecs))
        sys.exit(1)
    print(f"\nOK     les {len(mutations())} mutations sont detectees")


if __name__ == "__main__":
    main()
