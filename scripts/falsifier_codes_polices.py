"""Prouve que le controle des codes de police detecte reellement un defaut.

Un controle qui n'a jamais echoue ne prouve rien : il peut regarder a cote. Ce
script mutile la donnee, lance le controle, et exige qu'il tombe **sur le
controle nomme pour la mutation**. Puis il restaure et verifie la restauration
par empreinte SHA-256 — jamais par `git diff`, qui depend de la configuration de
fin de ligne.

Ce qui est mutile, et ce que cela doit declencher :

  1. un code remplace par un pave      -> « s'imprimeraient en pave » ;
  2. un code remplace par un ornement  -> « que rien n'emploie » ;
  3. la couche de glyphes d'une page
     videe                             -> « aucun code employe » ;
  4. un octet change dans une police   -> « inattendue » (contre le manifeste).

La quatrieme mutation porte sur un fichier de police, pas sur la mise en page :
c'est le seul moyen d'eprouver le controle d'identite des polices. Les deux
fichiers sont rendus a l'identique dans tous les cas, y compris en cas
d'exception, et la restauration est mesuree.

Usage :
    python scripts/falsifier_codes_polices.py
"""

from __future__ import annotations

import hashlib
import io
import json
import pathlib
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import lire_police as lp  # noqa: E402
from recuperer_polices_pages import DESTINATION  # noqa: E402

MISE_EN_PAGE = RACINE / "data" / "quran" / "moushaf_layout.json"
CONTROLE = RACINE / "scripts" / "verifier_codes_polices.py"

PAGE_DU_PAVE = 502
PAGE_DE_L_ORNEMENT = 155
PAGE_VIDEE = 300
PAGE_DE_LA_POLICE = 2

# Un ornement : present dans la police, jamais employe par la mise en page.
ORNEMENT = chr(0xFC6A)


def empreinte(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def lire_mise_en_page() -> dict:
    return json.loads(MISE_EN_PAGE.read_text(encoding="utf-8"))


def ecrire_mise_en_page(donnees: dict) -> None:
    # Meme mise en forme que le generateur : la mutation est donc exactement
    # reversible, et la restauration par empreinte le confirme.
    MISE_EN_PAGE.write_text(
        json.dumps(donnees, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def lancer_controle() -> tuple[int, str]:
    resultat = subprocess.run(
        [sys.executable, str(CONTROLE)],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def premier_element_porteur(donnees: dict, page: int) -> list:
    """Le premier element de la page qui porte un code."""
    for ligne in donnees["glyphes"][str(page)]:
        for element in ligne:
            if element[0] in ("v", "m", "b"):
                return element
    raise RuntimeError(f"page {page} : aucun element porteur de code")


def codes_de(element: list) -> list[str]:
    return [element[3]] if element[0] == "m" else list(element[3])


def poser_codes(element: list, codes: list[str]) -> None:
    element[3] = codes[0] if element[0] == "m" else codes


def trouver_un_pave(page: int) -> str:
    """Un point de code que la police de cette page dessine en pave."""
    octets = (DESTINATION / f"p{page:03d}.ttf").read_bytes()
    formes = lp.formes(octets)
    correspondance = lp.points_de_code(octets)
    for point in sorted(correspondance):
        if point >= 0xFB50 and formes[correspondance[point]] == lp.FORME_DU_PAVE:
            return chr(point)
    raise RuntimeError(f"page {page} : aucun pave dans la police")


def mutations():
    """Rend (nom, description, mutation, fragment du controle attendu)."""

    def ajouter_un_pave(donnees: dict) -> None:
        # Ajouter, et non remplacer : remplacer ferait aussi tomber le controle
        # des dessins orphelins, et la mutation ne prouverait plus qu'elle est
        # vue par le controle du pave.
        element = premier_element_porteur(donnees, PAGE_DU_PAVE)
        poser_codes(element, codes_de(element) + [trouver_un_pave(PAGE_DU_PAVE)])

    def remplacer_par_un_ornement(donnees: dict) -> None:
        # Remplacer : l'ancien code devient un dessin que plus rien n'emploie.
        element = premier_element_porteur(donnees, PAGE_DE_L_ORNEMENT)
        codes = codes_de(element)
        codes[0] = ORNEMENT
        poser_codes(element, codes)

    def page_videe(donnees: dict) -> None:
        for ligne in donnees["glyphes"][str(PAGE_VIDEE)]:
            ligne.clear()

    def octet_de_police(donnees: dict) -> None:
        # La mise en page n'est pas touchee : c'est la police qui change.
        chemin = DESTINATION / f"p{PAGE_DE_LA_POLICE:03d}.ttf"
        octets = bytearray(chemin.read_bytes())
        # Le milieu du fichier : ni l'en-tete, ni la fin. La taille ne change
        # pas, donc c'est bien le controle d'empreinte qui doit tomber.
        octets[len(octets) // 2] ^= 0xFF
        chemin.write_bytes(bytes(octets))

    return [
        ("code remplace par un pave",
         f"un mot de la page {PAGE_DU_PAVE} prend un code que sa police dessine en pave",
         ajouter_un_pave, "s'imprimeraient en pave"),
        ("code remplace par un ornement",
         f"un mot de la page {PAGE_DE_L_ORNEMENT} prend un ornement",
         remplacer_par_un_ornement, "que rien n'emploie"),
        ("couche de glyphes videe",
         f"la page {PAGE_VIDEE} ne porte plus aucun code",
         page_videe, "aucun code employe"),
        ("police alteree",
         f"un octet de p{PAGE_DE_LA_POLICE:03d}.ttf est retourne",
         octet_de_police, "inattendue"),
    ]


def main() -> None:
    if not MISE_EN_PAGE.exists():
        sys.exit(f"ERREUR : {MISE_EN_PAGE} est absent")
    if not CONTROLE.exists():
        sys.exit(f"ERREUR : {CONTROLE} est absent")

    octets_mise_en_page = MISE_EN_PAGE.read_bytes()
    empreinte_mise_en_page = empreinte(octets_mise_en_page)
    police = DESTINATION / f"p{PAGE_DE_LA_POLICE:03d}.ttf"
    octets_police = police.read_bytes()
    empreinte_police = empreinte(octets_police)

    print(
        f"reference : mise en page {len(octets_mise_en_page)} octets, "
        f"sha256 {empreinte_mise_en_page[:16]}…"
    )
    print(f"            {police.name} {len(octets_police)} octets, "
          f"sha256 {empreinte_police[:16]}…")

    code, sortie = lancer_controle()
    if code != 0:
        print("Le controle est deja en echec avant toute mutation :")
        print(sortie[-2000:])
        sys.exit(1)
    print("controle vert avant mutation : oui\n")

    echecs: list[str] = []
    try:
        for nom, description, muter, attendu in mutations():
            # Chaque mutation part des fichiers d'origine : sans cette remise a
            # zero, elles s'empileraient et une mutation pourrait etre
            # « detectee » par l'effet de la precedente.
            MISE_EN_PAGE.write_bytes(octets_mise_en_page)
            police.write_bytes(octets_police)

            donnees = lire_mise_en_page()
            muter(donnees)
            ecrire_mise_en_page(donnees)

            code, sortie = lancer_controle()
            detecte = code != 0
            par_le_bon = attendu in sortie

            if detecte and par_le_bon:
                print(f"OK     {nom}  — {description}")
                for ligne in sortie.splitlines():
                    if attendu in ligne:
                        print(f"         {ligne.strip()}")
                        break
            elif detecte:
                print(f"ECHEC  {nom}  — {description}")
                print(f"         detecte, mais pas par le controle attendu "
                      f"« {attendu} » :")
                print("         " + sortie.strip().splitlines()[-1])
                echecs.append(f"{nom} (mauvais controle)")
            else:
                print(f"ECHEC  {nom}  — {description}")
                print("         AUCUN controle n'est tombe")
                echecs.append(f"{nom} (non detectee)")
    finally:
        MISE_EN_PAGE.write_bytes(octets_mise_en_page)
        police.write_bytes(octets_police)
        restauree_mise_en_page = empreinte(MISE_EN_PAGE.read_bytes())
        restauree_police = empreinte(police.read_bytes())
        print(f"\nrestauration : mise en page sha256 {restauree_mise_en_page[:16]}…")
        print(f"               {police.name} sha256 {restauree_police[:16]}…")
        if (restauree_mise_en_page != empreinte_mise_en_page
                or restauree_police != empreinte_police):
            print("ECHEC  la restauration ne rend pas les fichiers d'origine")
            sys.exit(1)
        print("OK     les fichiers sont rendus a l'identique")

    code, _ = lancer_controle()
    if code != 0:
        print("ECHEC  le controle reste en echec apres restauration")
        sys.exit(1)
    print("OK     le controle repasse au vert")

    if echecs:
        print(f"\nECHEC  {len(echecs)} mutation(s) non detectee(s) : "
              + " ; ".join(echecs))
        sys.exit(1)
    print(f"\nOK     les {len(mutations())} mutations sont detectees")


if __name__ == "__main__":
    main()
