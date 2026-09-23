"""Mesurer la largeur naturelle des quinze lignes de chaque page du moushaf.

POURQUOI CETTE MESURE EXISTE
----------------------------
La page du moushaf est alignee des deux bords. Or une police de page ne se
justifie pas d'elle-meme : ses avances sont celles de l'imprimeur a moins de un
pour cent pres. Mesure sur les pages 14, 100, 200, 300, 400 et 500 : la somme
des avances d'une ligne pleine vaut 28 448 a 29 486 unites, soit 0,57 % a 1,09 %
d'ecart d'une ligne a l'autre.

Le rendu n'a donc pas a justifier ligne par ligne : il lui suffit de **une**
taille pour toute la page, celle qui fait tenir la largeur de reference, et les
quinze lignes tombent d'elles-memes au bord. C'est ce que cette table fournit.

CE QUE LA MESURE COMPTE
-----------------------
Pour chaque page : la somme des avances des glyphes de chacune de ses quinze
lignes, dans l'unite de la police (`unitesParEm` vaut 2048 pour les 604 polices,
ce que ce script verifie), la **largeur de reference** de la page — la mediane
de ses huit lignes les plus larges — et si la page est alignee des deux bords.

La reference se prend sur huit lignes et non sur la plus large : sur une page
dont une coupure est fausse, c'est justement la ligne fausse qui est la plus
large, et le maximum monterait jusqu'a elle. Voir la correction des coupures
dans data/quran/generer_layout_moushaf.py.

Trois cas ne se mesurent pas dans la police de la page :

  - **La ligne d'en-tete de sourate.** Le bandeau qui porte le nom de la sourate
    n'est pas dessine par la police de page — l'element `e` ne porte aucun code
    — mais compose avec une police de texte. Sa largeur est donc `null`.
  - **La ligne de basmala.** Ses quatre codes sont ceux de la page 1, dont la
    police est la seule a dessiner la basmala : sur les autres pages, ces quatre
    points de code dessinent d'autres mots, et leurs avances n'ont rien a voir.
    Sa largeur se mesure donc dans la police de la **page 1**.
  - **Les pages 1 et 2**, composees en grand corps, chaque verset sur sa ligne :
    elles ne sont pas alignees des deux bords, et leur reference vaut alors leur
    plus large ligne, pour qu'aucune ne deborde.

CE QUE LA TABLE PORTE EN PLUS DES LARGEURS
------------------------------------------
L'empreinte SHA-256 de `moushaf_layout.json` au moment de la mesure. Les deux
fichiers sont lus par l'application — l'un pour les coupures de ligne, l'autre
pour la taille a laquelle la page se dessine — et ils se regenerent par des
scripts differents. L'empreinte est ce qui rend leur accord VERIFIABLE :
`generer_layout_moushaf.py --verifier` refuse une table qui ne decrit plus la
mise en page courante. Ce controle est d'autant plus necessaire que les 604
polices ne sont plus dans le depot : sans elles, on ne peut plus remesurer pour
s'assurer que la table est a jour.

LES POLICES NE SONT PLUS DANS LE DEPOT
--------------------------------------
Elles pesaient 92 Mo et faisaient depasser la limite de 150 Mo du CDN qui sert
les pages du moushaf, alors qu'aucun code ne les emploie. Ce script les exige :
il faut donc les retablir d'abord, hors du depot et sans le polluer —
`python scripts/recuperer_polices_pages.py`, puis
`python scripts/recuperer_polices_pages.py --verifier` pour confronter les
fichiers obtenus au manifeste.

Usage :
    python scripts/mesurer_largeurs_pages.py             # mesure et ecrit
    python scripts/mesurer_largeurs_pages.py --verifier   # controle hors ligne
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import pathlib
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "data" / "quran"))

import generer_layout_moushaf as glm  # noqa: E402
import lire_police as lp  # noqa: E402

MISE_EN_PAGE = RACINE / "data" / "quran" / "moushaf_layout.json"
SORTIE = RACINE / "data" / "quran" / "largeurs_pages.json"

PAGES = 604
LIGNES_PAR_PAGE = 15
UNITES_PAR_EM_ATTENDU = 2048

# La page dont la police dessine la basmala.
PAGE_DE_LA_BASMALA = 1

# La part de la largeur d'une ligne pleine qu'occupe la basmala.
#
# Mesuree sur cinq pages imprimees — 77, 128, 177, 208, 249 — ou la basmala
# occupe toujours le meme rectangle : encre de x 221 a 586, soit 365 pixels,
# pour une ligne pleine de 638 a 642 pixels. Les cinq rapports valent 0,5685,
# 0,5694, 0,5712, 0,5721 et 0,5721 : 0,572 a 0,6 % pres. La basmala est un
# ornement a position et a taille fixes, identique sur toutes les pages.
#
# Sans cette part, la basmala sortirait a 32 % de la ligne : la police de la
# page 1 dessine la basmala dans le grand corps, ou elle est le premier verset
# d'Al-Fatiha, alors que l'ornement imprime est plus large et plus plat.
#
# ECART CONNU, ET MESURE : le trace de la page 1 a un rapport largeur/hauteur
# d'encre de 4,80 ; l'ornement imprime, de 7,77. Ce n'est donc pas le meme
# dessin — l'ornement imprime n'est dans aucune des 604 polices, et quran.com le
# remplace par un trace SVG. La page 1 est le seul dessin authentique de la
# basmala dont on dispose ; rendue a la largeur imprimee, elle est plus haute
# que l'ornement de 8,6 %. La largeur est reproduite, la hauteur ne l'est pas.
PART_DE_LA_BASMALA = 0.572

# La hauteur du bloc des quinze lignes, rapportee a sa largeur.
#
# Mesuree sur sept pages imprimees : le pas des lignes y vaut 70,1 a 70,9 pixels
# pour une ligne pleine de 635 a 642, et le bloc de quinze lignes fait donc de
# 1,640 a 1,670 fois sa largeur. La mediane vaut 1,664.
HAUTEUR_DU_BLOC = 1.664

# La hauteur de l'encre de la basmala, rapportee a la largeur d'une ligne pleine.
#
# 47 pixels pour 638, sur les cinq pages mesurees. Elle sert a verifier que la
# basmala tient dans sa ligne, pas a la dimensionner.
HAUTEUR_DE_LA_BASMALA = 0.0737


def unites_par_em(octets: bytes) -> int:
    """La resolution de la police : le nombre d'unites par cadratin."""
    debut, _ = lp.tables(octets)["head"]
    return lp._u16(octets, debut + 18)


def largeur_de_basmala(octets_basmala: bytes) -> int:
    """La somme des avances des quatre codes de la basmala, page 1."""
    avances = lp.largeurs(octets_basmala)
    correspondance = lp.points_de_code(octets_basmala)
    return sum(
        avances[correspondance[ord(caractere)]]
        for code in CODES_DE_LA_BASMALA
        for caractere in code
        if ord(caractere) in correspondance
    )


def codes_de_la_basmala(glyphes: dict) -> list:
    """Les quatre codes de la basmala, lus sur la premiere page qui en porte.

    L'API ne donne la basmala comme mots que pour 1:1, ou elle EST le premier
    verset ; partout ailleurs elle n'est pas un verset. Les quatre codes sont
    donc ceux de 1:1, et c'est la police de la page 1 qui les dessine. Les
    retrouver ici, dans la mise en page engendree, evite de dependre du cache de
    l'API.
    """
    for page in range(1, PAGES + 1):
        for ligne in glyphes.get(page) or []:
            for element in ligne:
                if element[0] == "b":
                    return list(element[3])
    raise SystemExit("aucune basmala dans la mise en page : les codes sont introuvables")


def par_page(glyphes: dict) -> dict:
    """Les codes de chaque page, sous cle entiere.

    Le fichier engendre porte les pages en chaines — c'est du JSON — alors que
    tout le reste du code les manipule en entiers.
    """
    return {int(cle): valeur for cle, valeur in glyphes.items()}


CODES_DE_LA_BASMALA: list = []


def empreinte_de_la_mise_en_page() -> str:
    """L'empreinte SHA-256 de `moushaf_layout.json`, en hexadecimal.

    C'est le seul lien MECANIQUE entre les deux fichiers que l'application lit
    tous les deux : `moushaf_layout.json` porte les coupures de ligne — donc ou
    tombe chaque mot — et cette table-ci porte la largeur de chaque ligne, donc
    la taille a laquelle la page se dessine. Les deux se regenerent par des
    scripts differents, et rien n'obligeait jusqu'ici a regenerer l'un quand
    l'autre changeait.

    Le defaut serait muet : une coupure deplacee d'un mot laisse la table
    decrire une ligne qui n'existe plus, et la page se dessinerait a une taille
    legerement fausse, ou une bande de surlignage tomberait a cote du mot. Ni
    l'un ni l'autre ne leve.

    Depuis que les 604 polices ne sont plus dans le depot, cette empreinte est
    en outre le seul moyen de savoir que la table decrit bien la mise en page
    courante : sans les polices, on ne peut plus remesurer pour s'en assurer.
    """
    return hashlib.sha256(MISE_EN_PAGE.read_bytes()).hexdigest()


def mesurer() -> dict:
    if not MISE_EN_PAGE.exists():
        raise SystemExit(
            f"{MISE_EN_PAGE.relative_to(RACINE)} est absent : "
            "lancer d'abord « npm run engendre:layout »."
        )
    mise_en_page = json.loads(MISE_EN_PAGE.read_text(encoding="utf-8"))
    glyphes = mise_en_page.get("glyphes")
    if not glyphes:
        raise SystemExit(
            "la mise en page ne porte pas de codes de police : "
            "relancer « npm run engendre:layout »."
        )
    glyphes = par_page(glyphes)

    polices = glm.charger_polices()
    avances_basmala, correspondance_basmala = polices[PAGE_DE_LA_BASMALA]
    unites_basmala = largeur_de_basmala(
        (glm.POLICES_DES_PAGES / "p001.ttf").read_bytes()
    )

    pages = {}
    sans_mesure = 0
    justifiees = 0
    for page in range(1, PAGES + 1):
        largeurs = glm.largeurs_de_page(page, glyphes, polices)
        sans_mesure += sum(1 for largeur in largeurs if largeur is None)
        reference = glm.reference_de_page(largeurs)
        justifiee = glm.page_justifiee(largeurs, reference)
        if justifiee:
            justifiees += 1
        else:
            # Une page non alignee des deux bords — les pages 1 et 2, et les
            # trois dernieres, ou les sourates sont courtes : la reference est
            # alors la plus large ligne, pour qu'aucune ne deborde du cadre.
            reference = max(largeur for largeur in largeurs if largeur)
        pages[str(page)] = {
            "lignes": largeurs,
            "reference": reference,
            "justifiee": justifiee,
        }

    return {
        "titre": "Largeur naturelle des quinze lignes de chaque page du moushaf",
        "nature": (
            "Somme des avances des glyphes de chaque ligne, dans l'unite de la "
            "police de sa page, et largeur de reference de la page. Aucun texte "
            "coranique ici : ce sont des mesures, pas des lettres."
        ),
        "methode": (
            "Les avances sont lues dans la table `hmtx` de la police de la page, "
            "et les codes dans `glyphes` de moushaf_layout.json. La reference "
            "d'une page alignee est la mediane de ses huit lignes les plus "
            "larges ; celle d'une page qui ne l'est pas est sa plus large ligne. "
            "La ligne d'en-tete de sourate vaut `null` : elle est composee en "
            "police de texte, pas dessinee par la police de page. La ligne de "
            "basmala se mesure dans la police de la page 1, la seule a dessiner "
            "la basmala."
        ),
        "provenance": {
            "polices": "assets/polices-pages/pNNN.ttf (QCF v1, KFGQPC)",
            "miseEnPage": "data/quran/moushaf_layout.json",
            "empreinteMiseEnPage": empreinte_de_la_mise_en_page(),
            "pourquoiUneEmpreinte": (
                "La table decrit la mise en page telle qu'elle etait au moment de "
                "la mesure. L'empreinte de `moushaf_layout.json` est enregistree "
                "ici pour que ce lien se VERIFIE au lieu de se supposer : "
                "`generer_layout_moushaf.py --verifier` refuse une table qui ne "
                "decrit plus la mise en page courante. Sans elle, une coupure "
                "deplacee d'un mot laisserait la table decrire une ligne qui "
                "n'existe plus — la page se dessinerait a une taille fausse, et "
                "rien ne le dirait. Depuis que les polices ne sont plus dans le "
                "depot, on ne peut plus remesurer sans les retablir : l'empreinte "
                "est ce qui reste quand la mesure n'est plus rejouable."
            ),
            "mesure": "table `hmtx` de chaque police, lue par scripts/lire_police.py",
            "pagesImprimees": (
                "https://raw.githubusercontent.com/QuranHub/quran-pages-images/"
                "main/kfgqpc/hafs-wasat/N.jpg — pages 77, 128, 177, 208, 249"
            ),
            "partDeLaBasmala": (
                "57,2 % de la largeur d'une ligne pleine. La basmala occupe le "
                "meme rectangle sur les cinq pages mesurees (encre x 221..586, "
                "y 160..207 pour une image de 807x1205), et les cinq rapports "
                "s'ecartent de 0,6 %. La basmala se dessine avec la police de la "
                "page 1, la seule des 604 qui la dessine."
            ),
            "hauteurDuBloc": (
                "1,664 : la mediane, sur les cinq pages, du rapport entre la "
                "hauteur du bloc des quinze lignes et sa largeur. Le pas des "
                "lignes s'y lit de 70,1 a 70,9 pixels pour une ligne pleine de "
                "635 a 642."
            ),
            "hauteurDeLaBasmala": (
                "7,37 % de la largeur d'une ligne pleine : l'encre de la basmala "
                "imprimee fait 47 pixels de haut pour une ligne pleine de 638."
            ),
            "ecartConnuDeLaBasmala": (
                "Le trace de la page 1 a un rapport largeur/hauteur d'encre de "
                "4,80 ; l'ornement imprime, de 7,77. Ce n'est pas le meme dessin, "
                "et l'ornement n'est dans aucune des 604 polices. Rendue a la "
                "largeur imprimee, la basmala de la page 1 est 8,6 % plus haute."
            ),
        },
        "unitesParEm": UNITES_PAR_EM_ATTENDU,
        "lignesParPage": LIGNES_PAR_PAGE,
        "lignesSansMesure": sans_mesure,
        "unitesDeLaBasmala": unites_basmala,
        "partDeLaBasmala": PART_DE_LA_BASMALA,
        "hauteurDuBloc": HAUTEUR_DU_BLOC,
        "hauteurDeLaBasmala": HAUTEUR_DE_LA_BASMALA,
        "pagesJustifiees": justifiees,
        "pages": pages,
    }


def ecrire(donnees: dict) -> None:
    # `newline="\n"` : sans lui, CRLF sous Windows contre LF ailleurs, et le
    # fichier se lit comme entierement modifie apres une simple regeneration.
    SORTIE.write_text(
        json.dumps(donnees, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def verifier() -> int:
    """Recalcule les largeurs et les compare a celles du fichier ecrit."""
    if not SORTIE.exists():
        print(f"Absent : {SORTIE.relative_to(RACINE)} — lancer sans --verifier.")
        return 1

    ecrit = json.loads(SORTIE.read_text(encoding="utf-8"))
    mesure = mesurer()
    problemes = []

    for cle in (
        "unitesParEm",
        "lignesParPage",
        "unitesDeLaBasmala",
        "partDeLaBasmala",
        "hauteurDuBloc",
        "hauteurDeLaBasmala",
    ):
        if ecrit.get(cle) != mesure[cle]:
            problemes.append(f"{cle} : {ecrit.get(cle)} au lieu de {mesure[cle]}")

    # L'empreinte de la mise en page mesuree. C'est la seule chose que ce
    # controle-ci puisse dire de la mise en page sans rouvrir les polices : que
    # la table decrit bien celle qui est dans le depot. Sans elle, une table
    # laissee en arriere apres une regeneration passerait, et les largeurs
    # decriraient des lignes qui n'existent plus.
    ecrite = (ecrit.get("provenance") or {}).get("empreinteMiseEnPage")
    courante = mesure["provenance"]["empreinteMiseEnPage"]
    if ecrite != courante:
        problemes.append(
            "la table ne decrit plus la mise en page courante : "
            f"empreinte {ecrite or 'absente'} au lieu de {courante} — "
            "relancer sans --verifier, polices retablies"
        )

    pages_ecrites = ecrit.get("pages") or {}
    if len(pages_ecrites) != PAGES:
        problemes.append(f"{len(pages_ecrites)} pages au lieu de {PAGES}")

    for page in range(1, PAGES + 1):
        attendue = mesure["pages"][str(page)]
        obtenue = pages_ecrites.get(str(page))
        if obtenue is None:
            problemes.append(f"page {page} : absente")
            continue
        if len(obtenue.get("lignes") or []) != LIGNES_PAR_PAGE:
            problemes.append(
                f"page {page} : {len(obtenue.get('lignes') or [])} lignes au lieu "
                f"de {LIGNES_PAR_PAGE}"
            )
            continue
        for indice, (a, b) in enumerate(
            zip(attendue["lignes"], obtenue["lignes"]), start=1
        ):
            if a != b:
                problemes.append(f"page {page} ligne {indice} : {b} au lieu de {a}")
        if obtenue.get("reference") != attendue["reference"]:
            problemes.append(
                f"page {page} : reference {obtenue.get('reference')} au lieu de "
                f"{attendue['reference']}"
            )
        if obtenue.get("justifiee") != attendue["justifiee"]:
            problemes.append(
                f"page {page} : justifiee {obtenue.get('justifiee')} au lieu de "
                f"{attendue['justifiee']}"
            )

    if problemes:
        print(f"Largeurs des pages : ECHEC ({len(problemes)} probleme(s))\n")
        for probleme in problemes[:30]:
            print(f"  - {probleme}")
        return 1

    lignes = sum(
        1
        for page in mesure["pages"].values()
        for largeur in page["lignes"]
        if largeur is not None
    )
    references = [page["reference"] for page in mesure["pages"].values()]
    print("Largeurs des pages : OK")
    print(f"  {PAGES} pages, {LIGNES_PAR_PAGE} lignes chacune, {lignes} mesurees")
    print(
        f"  {mesure['lignesSansMesure']} ligne(s) d'en-tete de sourate, "
        "composees en police de texte"
    )
    print(
        f"  {mesure['pagesJustifiees']} page(s) alignee(s) des deux bords, "
        f"reference de {min(references)} a {max(references)} unites"
    )
    print(
        f"  basmala : {mesure['unitesDeLaBasmala']} unites dans la police de la "
        f"page 1, rendue a {mesure['partDeLaBasmala']:.1%} d'une ligne pleine"
    )
    print(
        f"  bloc des quinze lignes : {mesure['hauteurDuBloc']:.3f} fois sa "
        f"largeur ; encre de la basmala {mesure['hauteurDeLaBasmala']:.2%} "
        "d'une ligne pleine"
    )
    print(
        "  la table decrit la mise en page courante : empreinte "
        f"{mesure['provenance']['empreinteMiseEnPage'][:16]}…"
    )
    return 0


def main() -> int:
    global CODES_DE_LA_BASMALA
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument(
        "--verifier", action="store_true", help="recalculer et comparer, sans ecrire"
    )
    arguments = analyseur.parse_args()

    mise_en_page = json.loads(MISE_EN_PAGE.read_text(encoding="utf-8"))
    CODES_DE_LA_BASMALA = codes_de_la_basmala(par_page(mise_en_page.get("glyphes") or {}))

    if arguments.verifier:
        return verifier()

    donnees = mesurer()
    ecrire(donnees)

    print(f"Ecrit : {SORTIE.relative_to(RACINE)} ({SORTIE.stat().st_size} octets)")
    print(f"  {PAGES} pages, {donnees['pagesJustifiees']} alignees des deux bords")
    print(
        f"  basmala : {donnees['unitesDeLaBasmala']} unites dans la police de la "
        f"page 1, rendue a {donnees['partDeLaBasmala']:.1%} d'une ligne pleine"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
