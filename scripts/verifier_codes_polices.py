"""Verifier que chaque code de la mise en page est dessine par sa police de page.

CE QUI PEUT MAL TOURNER, ET QUE CE CONTROLE ATTRAPE
---------------------------------------------------
La mise en page ne range pas de texte : elle range, pour chaque mot du moushaf,
le **point de code** que la police de la page dessine. Si un seul de ces codes
n'etait pas dessine par la police de sa page, le mot s'imprimerait en pave — un
rectangle de remplissage — et la page paraitrait complete tout en etant fausse.

Le piege est que la table des caracteres ne le dit pas. Les 604 polices portent
les memes 720 points de code et les memes 608 emplacements : « ce code est dans
la police » est vrai partout et ne prouve rien. Ce qui change d'une page a
l'autre, c'est le **dessin**.

CE QUE LA MESURE A ETABLI
-------------------------
Sur les 604 pages :

  - **aucun** code employe n'est absent de sa police ;
  - chaque police dessine en plus **exactement seize ornements**, U+FC6A a
    U+FC79, que la mise en page n'emploie pas ;
  - la police de la page 1 est la seule exception : elle ne porte que les
    36 mots d'Al-Fatiha, un pave et un emplacement vide, sans ornement ;
  - hors de la plage du moushaf, chaque police trace aussi sa couverture
    ordinaire — latin, ponctuation, supplement latin-1, de U+0021 a U+00D0 sur
    la page 32. Cela n'appartient pas au moushaf et ne compte donc pas.

C'est cette loi, exacte et stable, qui sert de temoin. Un controle qui n'a
jamais echoue ne prouve rien : exiger que le dessin **egale** l'emploi plus les
seize ornements, c'est exiger du lecteur qu'il voie la structure reelle, et non
qu'il reponde « oui » a tout. Le controle attrape ainsi trois choses d'un coup —
le mot qui s'imprimerait en pave, le mot que la mise en page aurait oublie de
placer, et l'ornement qui manquerait a la police.

CE QUI A ETE ECARTE, ET POURQUOI
--------------------------------
Trois formes plus simples ont ete essayees, mesurees, puis rejetees.

  - **La presence dans la table des caracteres.** Vraie pour les 720 points de
    code de toutes les polices : ne distingue rien.
  - **La largeur d'avance du pave, 992 unites.** La largeur la plus frequente
    de chaque police, mais qui tombe parfois sur un vrai mot : trois pages
    (155, 378, 502) ont ainsi ete declarees fautives a tort, avec 83 points de
    trace au lieu des 8 d'un rectangle. Le verdict se prend donc sur la
    **forme** du glyphe — deux contours, huit points. Voir `lire_police.py`.
  - **Filtrer la liste des codes attendus** au lieu de demander a la police ce
    qu'elle trace. La branche des orphelins etait alors vide par construction :
    elle ne pouvait rien voir. Le falsificateur l'a montre — la mutation
    « code remplace par un ornement » passait inapercue.

CE QUE CE CONTROLE NE PEUT PAS VOIR
-----------------------------------
Il etablit que le code est dessine par la bonne police. Il n'etablit pas que le
dessin est **le bon mot** : rien ici ne sait lire un mot du calligraphe. Cette
partie se tient autrement — les codes viennent de la meme source que la mise en
page (API quran.com v4, `mushaf=1`), et `generer_layout_moushaf.py` verifie que
chaque mot du texte de Tanzil recoit un code, une fois et une seule.

Le falsificateur `scripts/falsifier_codes_polices.py` mutile la donnee et exige
que ce controle-ci tombe.

Usage :
    python scripts/verifier_codes_polices.py
"""

from __future__ import annotations

import io
import json
import pathlib
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import lire_police as lp  # noqa: E402
from recuperer_polices_pages import DESTINATION, empreinte, lire_manifeste  # noqa: E402

MISE_EN_PAGE = RACINE / "data" / "quran" / "moushaf_layout.json"
NOMBRE_DE_PAGES = 604

# La plage que le moushaf emploie : les formes de presentation arabes A, de
# U+FB50 a U+FC7F. En dehors, la police porte sa couverture ordinaire — latin,
# ponctuation, supplement latin-1, soit U+0021 a U+00D0 mesures sur la page 32 —
# qui n'appartient pas au moushaf. La compter ferait de chaque page une page
# fautive, avec 133 a 205 dessins « que rien n'emploie ».
PLAGE_DU_MOUSHAF = frozenset(range(0xFB50, 0xFC80))

# Les seize ornements que porte chaque police de page : U+FC6A a U+FC79, bornes
# comprises. Mesure : sur les 603 polices autres que celle de la page 1, le
# dessin moins l'emploi vaut exactement cet ensemble, ni plus ni moins.
ORNEMENTS = frozenset(range(0xFC6A, 0xFC7A))

# La police de la page 1 est la seule a ne porter aucun ornement : 38
# emplacements, soit les 36 mots d'Al-Fatiha, un pave et un emplacement vide.
PAGES_SANS_ORNEMENTS = frozenset({1})

# L'espace, a l'interieur d'un code qui porte la marque de rub' : quran.com
# ecrit le glyphe de la marque, puis une espace, puis le glyphe du mot. Cette
# espace a un emplacement dans la police, et cet emplacement est **vide** —
# c'est ce qui separe la marque du mot. Un emplacement vide n'est pas un
# defaut : on ne le compte donc pas parmi les codes a dessiner.
ESPACE = 0x0020


def codes_employes(ligne_de_glyphes: list) -> set[int]:
    """Les points de code que la mise en page emploie sur cette page.

    L'element `e` — l'en-tete de sourate — est **ecarte a dessein** : sur la
    page imprimee, le bandeau qui porte le nom de la sourate n'est pas dessine
    par la police de page mais par un ornement, hors de ce controle.
    """
    employes: set[int] = set()
    for ligne in ligne_de_glyphes:
        for element in ligne:
            genre = element[0]
            if genre == "e":
                continue
            if genre in ("v", "b"):
                _, sourate, verset, codes = element
            elif genre == "m":
                _, sourate, verset, code = element
                codes = [code]
            else:
                raise ValueError(f"genre d'element inconnu : {genre!r}")
            for code in codes:
                if not code:
                    raise ValueError(f"{sourate}:{verset} : code vide")
                for caractere in code:
                    if ord(caractere) != ESPACE:
                        employes.add(ord(caractere))
    return employes


def charger_police(page: int, entree: dict) -> bytes:
    """Les octets de la police de cette page, s'ils sont bien ceux du manifeste."""
    chemin = DESTINATION / entree["fichier"]
    if not chemin.exists():
        raise FileNotFoundError(f"page {page} : {chemin.name} est absent")
    octets = chemin.read_bytes()
    if len(octets) != entree["octets"]:
        raise ValueError(
            f"page {page} : {len(octets)} octets, le manifeste en attend "
            f"{entree['octets']}"
        )
    mesuree = empreinte(octets)
    if mesuree != entree["sha256"]:
        raise ValueError(f"page {page} : empreinte {mesuree[:12]}… inattendue")
    return octets


def controler() -> int:
    manifeste = lire_manifeste()
    pages_du_manifeste = manifeste["pages"]

    if not MISE_EN_PAGE.exists():
        sys.exit(
            f"ERREUR : {MISE_EN_PAGE.relative_to(RACINE)} est absent.\n"
            "Lancer d'abord « npm run engendrer:layout »."
        )
    mise_en_page = json.loads(MISE_EN_PAGE.read_text(encoding="utf-8"))
    glyphes = mise_en_page.get("glyphes")
    if not glyphes:
        sys.exit(
            "ERREUR : la mise en page ne porte pas de codes de police.\n"
            "Elle a ete engendree avant que les codes n'y entrent : "
            "relancer « npm run engendrer:layout »."
        )

    defauts: list[str] = []
    total_codes = 0
    total_pages = 0
    sans_pave: list[int] = []

    for page in range(1, NOMBRE_DE_PAGES + 1):
        entree = pages_du_manifeste.get(str(page))
        if entree is None:
            defauts.append(f"page {page} : absente du manifeste des polices")
            continue

        page_de_glyphes = glyphes.get(str(page))
        if not page_de_glyphes:
            defauts.append(f"page {page} : aucune ligne dans la mise en page")
            continue

        try:
            octets = charger_police(page, entree)
        except (FileNotFoundError, ValueError) as erreur:
            defauts.append(str(erreur))
            continue

        try:
            if lp.largeur_du_pave(octets) is None:
                sans_pave.append(page)
        except ValueError as erreur:
            defauts.append(f"page {page} : {erreur}")
            continue

        employes = codes_employes(page_de_glyphes)
        total_codes += len(employes)
        total_pages += 1

        if not employes:
            defauts.append(f"page {page} : aucun code employe")
            continue

        hors_plage = sorted(employes - PLAGE_DU_MOUSHAF)
        if hors_plage:
            defauts.append(
                f"page {page} : {len(hors_plage)} code(s) employe(s) hors de la "
                "plage du moushaf — "
                + ", ".join(f"U+{point:04X}" for point in hors_plage[:8])
            )
        employes &= PLAGE_DU_MOUSHAF
        if not employes:
            continue

        attendus = employes | (
            frozenset() if page in PAGES_SANS_ORNEMENTS else ORNEMENTS
        )
        # Ce que la police trace dans la plage du moushaf, demande a la police
        # elle-meme. Filtrer la liste attendue a la place rendrait la branche
        # des orphelins vide par construction : c'est le falsificateur qui l'a
        # montre.
        dessines = lp.codes_dessines_par(octets) & PLAGE_DU_MOUSHAF

        manquants = attendus - dessines
        if manquants:
            etats = lp.etat_des_codes(octets, manquants)
            en_pave = sorted(p for p, e in etats.items() if e == lp.PAVE)
            vides = sorted(p for p, e in etats.items() if e == lp.VIDE)
            introuvables = sorted(p for p, e in etats.items() if e == lp.ABSENT)
            if en_pave:
                defauts.append(
                    f"page {page} : {len(en_pave)} code(s) employe(s) "
                    "s'imprimeraient en pave — "
                    + ", ".join(f"U+{point:04X}" for point in en_pave[:8])
                )
            if vides:
                defauts.append(
                    f"page {page} : {len(vides)} code(s) employe(s) ne "
                    "dessineraient rien du tout — "
                    + ", ".join(f"U+{point:04X}" for point in vides[:8])
                )
            if introuvables:
                defauts.append(
                    f"page {page} : {len(introuvables)} code(s) attendu(s) ne "
                    "sont pas dans la table des caracteres de la police — "
                    + ", ".join(f"U+{point:04X}" for point in introuvables[:8])
                )

        orphelins = sorted(dessines - attendus)
        if orphelins:
            defauts.append(
                f"page {page} : {len(orphelins)} dessin(s) que rien n'emploie — "
                + ", ".join(f"U+{point:04X}" for point in orphelins[:8])
            )

    print(f"{total_pages} pages confrontees a leur police")
    print(f"{total_codes} codes employes, chacun devant etre dessine")
    print(
        f"temoin : chaque police doit dessiner en plus les {len(ORNEMENTS)} "
        f"ornements U+{min(ORNEMENTS):04X}..U+{max(ORNEMENTS):04X}"
    )
    if sans_pave:
        print(f"polices sans pave (famille non confirmee) : {sans_pave}")

    if defauts:
        print()
        for defaut in defauts[:40]:
            print(f"  {defaut}")
        if len(defauts) > 40:
            print(f"  … et {len(defauts) - 40} autre(s)")
        print(
            f"\n{len(defauts)} defaut(s) : la page ne serait pas celle du "
            "moushaf imprime."
        )
        return 1

    print("chaque code est dessine par la police de sa page.")
    return 0


if __name__ == "__main__":
    sys.exit(controler())
