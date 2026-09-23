"""Engendre les zones de surlignage du moushaf : ou tombe chaque verset, en pixels.

POURQUOI CE FICHIER EXISTE
--------------------------
Le lecteur affiche l'**image** de la page imprimee, et il doit surligner le
verset en cours de recitation. Une image ne se colore pas : il faut savoir ou
le verset se trouve, et le savoir par la mesure.

Jusqu'ici, l'application ne savait le dire qu'a la **ligne** : la mise en page
(`moushaf_layout.json`) attribue a chaque ligne les versets qu'elle porte. Cela
suffit a marquer « la seance est ici », mais pas a suivre une recitation : une
ligne qui porte trois versets courts les surligne tous les trois, et le verset
qu'on ecoute ne se distingue pas de ses voisins.

D'OU VIENNENT LES ZONES
-----------------------
De la table `glyphs` de la base `ayahinfo_1920.db`, celle qui accompagne les
images dans l'archive du moushaf fourni. C'est la source des pages elles-memes :
elle donne, pour **chaque mot du Coran**, sa page, sa ligne, son rang dans le
verset, et la boite exacte de son trace — `min_x`, `max_x`, `min_y`, `max_y`.

Aucune coordonnee n'est donc devinee, estimee ni interpolee : toutes sont lues.

CE QUE LE SCRIPT PRODUIT, ET CE QU'IL NE PRODUIT PAS
----------------------------------------------------
Il produit un **index geometrique**, jamais un texte. Le fichier engendre ne
contient aucune lettre coranique : que des entiers. Le texte affiche reste celui
de Tanzil, une seule fois dans l'application.

DEUX CONVENTIONS DE LA TABLE, MESUREES PUIS NEUTRALISEES
--------------------------------------------------------
La table ne compte pas les glyphes comme l'application compte les jetons, et le
modele se verifie sur les 6 236 versets, sans exception :

    glyphes = jetons + 1 - (4 si le verset porte la basmala)

  1. **le marqueur de verset.** Le glyphe en trop, present partout, est le numero
     du verset inscrit dans son ornement, place **en dernier**. Il est donc
     ecarte — voir plus bas pourquoi ;
  2. **la basmala.** Pour 112 versets — le premier de chaque sourate, sauf
     Al-Fatiha ou elle est le premier verset et At-Tawbah qui n'en a pas —,
     l'application porte la basmala en tete, soit quatre jetons que la table ne
     connait pas : elle la range dans le bandeau d'ouverture, hors des lignes
     numerotees. Ces versets ont donc trois glyphes de moins que de jetons.

Un seul verset, sur 6 236, fait exception : **13:37**. Il porte 21 jetons et 21
glyphes, quand le modele en attendrait 22. La comparaison rang par rang tranche
la question : son jeton 5 est le signe de waqf isole « ۚ », et la table porte bien
une petite marque a cette position. Ses 21 glyphes sont donc ses 21 jetons, et
c'est le **marqueur qui manque** — non le dernier mot. Ecarter son dernier glyphe
retirerait du surlignage le mot « وَاقٍ », qui est le dernier du verset.

La regle est donc : le dernier glyphe est un marqueur **si et seulement si** le
compte de glyphes depasse le compte de jetons — soit 6 235 versets sur 6 236. Le
modele entier est verifie avant d'ecrire, et le script refuse s'il cesse de tenir
sur un seul verset.

POURQUOI LE MARQUEUR EST ECARTE
-------------------------------
Il appartient au verset, mais il ne tombe pas toujours sur une de ses lignes :
pour **566 versets**, le medaillon passe a la ligne suivante. L'inclure ferait
apparaitre, sur cette ligne-la, une bande qui ne porte aucun mot du verset — un
petit trait orphelin, que rien n'expliquerait a l'ecran. Les zones couvrent donc
les mots du verset ; le medaillon qui le clot n'est pas couvert.

Le marqueur manquant de 13:37 explique le seul recouvrement du Coran : prive du
medaillon qui les separerait, le dernier mot de 13:37 et le premier de 13:38 se
touchent d'**un pixel**, page 254 ligne 7. C'est le seul couple de tout le Coran
dont les zones se recouvrent, et il est nomme dans le controle plutot que tolere
en silence.

LES BOITES DONT LES DEUX BORNES HORIZONTALES SONT TRANSPOSEES
--------------------------------------------------------------
Pour **2 971 glyphes** sur 88 246, `max_x` est plus PETIT que `min_x` : la boite
serait vide. La table ne se trompe pourtant que sur l'ordre des deux champs, et
cela se mesure :

  - `max_y` n'est **jamais** plus petit que `min_y`, sur aucun des 88 246
    glyphes : seule la paire horizontale est transposee ;
  - ces glyphes sont petits — 36,2 pixels de haut en moyenne, contre 128,7 pour
    les autres : ce sont des marques, harakat et signes de waqf, que la table
    range comme des glyphes a part ;
  - remises dans l'ordre, leurs boites tombent **exactement** contre le mot
    voisin, dans le blanc qui le suit — jamais ailleurs.

Les bornes sont donc remises dans l'ordre, et le compte est reporte dans la
provenance. L'effet est mesure : 204 zones sur 13 201 changent, de 9,5 pixels en
moyenne, et **toujours sur le bord gauche** — la marque s'ajoute apres le mot.

CE QUI N'A PAS DE ZONE, ET POURQUOI
------------------------------------
La basmala, pour la raison dite plus haut : la table ne lui donne aucune boite.
Inventer une zone pour elle serait deviner. Quand le verset actif est le premier
d'une sourate, le surlignage couvre donc ses mots, et pas la basmala qui les
precede.

LA BANDE VERTICALE EST CELLE DE LA LIGNE, PAS CELLE DU MOT
-----------------------------------------------------------
L'etendue verticale d'un mot depend de ses lettres : un mot sans hamza monte
moins haut qu'un mot qui en porte une. Donner a chaque zone la hauteur de son
encre ferait clignoter les bandes d'une meme ligne, et le lecteur verrait une
geometrie qui bouge au lieu d'un repere stable. La bande verticale est donc
celle de **toute la ligne** — `min_y` et `max_y` de l'ensemble de ses glyphes —
et seule l'etendue **horizontale** est propre au verset. C'est ce qui rend le
surlignage precis sans le rendre instable.

CE QUE LE SCRIPT VERIFIE AVANT D'ECRIRE
----------------------------------------
Il refuse d'ecrire si :

  - un verset du Coran n'a aucune zone ;
  - une boite sort de la page, ou est vide ;
  - deux versets se recouvrent sur une meme ligne — un chevauchement voudrait
    dire que la table attribue un mot a deux versets ;
  - un verset tombe sur une ligne que `moushaf_layout.json` ne lui donne pas.
    C'est le controle le plus fort : il confronte la donnee nouvelle a celle qui
    est deja verifiee. Mesure : 6 235 versets sur 6 236 s'accordent, et l'ecart
    unique — 38:24, page 454 — est celui que `docs/mise-en-page-moushaf.md`
    nommait deja. Ici, c'est la table `glyphs` qui a raison : elle vient de
    l'image.

USAGE
    python data/quran/generer_zones_surlignage.py
    python data/quran/generer_zones_surlignage.py --verifier
    python data/quran/generer_zones_surlignage.py --base <chemin de ayahinfo_1920.db>

La base n'est pas versionnee : elle se tire de l'archive du moushaf par
`scripts/extraire_base_ipa.py`, qui en verifie l'empreinte.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent

SORTIE = RACINE / "data" / "quran" / "zones_surlignage.json"
MISE_EN_PAGE = RACINE / "data" / "quran" / "moushaf_layout.json"
TEXTE = RACINE / "data" / "quran" / "quran_text_uthmani.json"

# L'emplacement ou `scripts/extraire_base_ipa.py` depose la base. Non versionne.
BASE_PAR_DEFAUT = RACINE / "data" / "quran" / "ayahinfo_1920.db"

# Les dimensions des images, mesurees sur les 604 fichiers (voir
# `src/lib/pagesMoushaf.ts`). Les coordonnees de la table sont dans cet espace :
# la plus grande abscisse observee est 1 887, la plus grande ordonnee 3 068, et
# la plus petite 25 et 42 — la marge de l'imprime.
LARGEUR_PAGE = 1920
HAUTEUR_PAGE = 3106

TOTAL_PAGES = 604
TOTAL_VERSETS = 6236

# Le seul verset dont la ligne differe entre les deux sources. Nomme, et non
# tolere en silence : un ecart qu'on accepte sans le dire est un ecart qui
# grandit.
ECART_CONNU = (38, 24)

# Le seul verset a qui la table ne donne pas de marqueur, et la seule paire de
# zones qui se recouvrent dans tout le Coran — d'un pixel. Les deux se tiennent :
# prive du medaillon qui les separerait, le dernier mot de 13:37 et le premier de
# 13:38 se touchent. Le controle exige que la liste des recouvrements soit
# EXACTEMENT celle-ci : ni un de plus, ni un pixel de plus.
VERSET_SANS_MARQUEUR = (13, 37)
RECOUVREMENT_CONNU = (254, 7, (13, 37), (13, 38), 1)

# Le premier verset de chaque sourate, sauf Al-Fatiha — ou la basmala EST le
# premier verset — et At-Tawbah, qui n'en a pas. Ces versets portent quatre
# jetons de plus que la table n'a de glyphes pour eux.
VERSETS_A_BASMALA = {(s, 1) for s in range(1, 115)} - {(1, 1), (9, 1)}


def empreinte(chemin: Path) -> str:
    h = hashlib.sha256()
    with chemin.open("rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def charger_mots_du_verset() -> dict[tuple[int, int], int]:
    """Le nombre de jetons de chaque verset, decoupe comme l'application.

    La decoupe doit etre celle de `getJetonsAyah` : coupure sur toute suite
    d'espaces, jetons vides ecartes. Elle sert uniquement au controle des
    conventions ; aucune lettre ne sort d'ici.
    """
    with TEXTE.open(encoding="utf-8") as f:
        versets = json.load(f)
    return {
        (v["surah"], v["ayah"]): len([t for t in v["text"].split() if t])
        for v in versets
    }


def lire_glyphes(base: Path):
    """Rend les glyphes tries par page, ligne, abscisse decroissante.

    Le tri par abscisse DECROISSANTE suit le sens de lecture arabe : dans une
    ligne, le premier mot lu est le plus a droite, donc celui de plus grande
    abscisse. C'est l'ordre du moushaf, et c'est celui dans lequel un lecteur
    parcourt la bande.
    """
    connexion = sqlite3.connect(f"file:{base}?mode=ro", uri=True)
    try:
        return list(
            connexion.execute(
                "select page_number, line_number, sura_number, ayah_number, "
                "       position, min_x, max_x, min_y, max_y "
                "from glyphs "
                "order by page_number, line_number, max_x desc"
            )
        )
    finally:
        connexion.close()


def construire(glyphes, mots: dict[tuple[int, int], int]) -> tuple[dict, dict]:
    """Rend `(pages, statistiques)`, ou `pages` porte les bandes et les zones.

    Une zone est `[sourate, verset, ligne, min_x, max_x]` — l'entier de la ligne
    est celui de la table, de 1 a 15, et non un indice de tableau : le lecteur
    doit pouvoir le rapprocher de `moushaf_layout.json` sans conversion.
    """
    # 1. Le nombre de glyphes par verset, et le rang de son dernier glyphe.
    compte: dict[tuple[int, int], int] = {}
    dernier: dict[tuple[int, int], int] = {}
    for page, ligne, surah, ayah, position, *_ in glyphes:
        cle = (surah, ayah)
        compte[cle] = compte.get(cle, 0) + 1
        if position > dernier.get(cle, 0):
            dernier[cle] = position

    # 2. Le verset a-t-il un marqueur ? Sa presence se lit sur le compte, et non
    #    sur une regle : 6 235 versets ont un glyphe de plus ou de moins que de
    #    mots, un seul en a exactement autant — et celui-la n'en a pas.
    a_marqueur = {cle: compte[cle] != mots.get(cle, 0) for cle in compte}

    bandes: dict[int, dict[int, list[int]]] = {}
    zones: dict[int, list[list[int]]] = {}
    marqueurs = 0
    transposees = 0

    for page, ligne, surah, ayah, position, min_x, max_x, min_y, max_y in glyphes:
        # 3. Les deux bornes horizontales sont transposees sur 2 971 glyphes :
        #    `max_x` y est plus petit que `min_x`. On les remet dans l'ordre —
        #    les bornes verticales, elles, ne sont jamais transposees.
        if max_x < min_x:
            min_x, max_x = max_x, min_x
            transposees += 1

        # 4. La bande verticale de la ligne : tous ses glyphes, marqueur compris.
        #    Le medaillon est de l'encre de la ligne, meme s'il n'appartient pas
        #    aux mots qu'on surligne.
        bande = bandes.setdefault(page, {}).setdefault(ligne, [min_y, max_y])
        if min_y < bande[0]:
            bande[0] = min_y
        if max_y > bande[1]:
            bande[1] = max_y

        # 5. La zone du verset : ses mots seulement.
        if a_marqueur[(surah, ayah)] and position == dernier[(surah, ayah)]:
            marqueurs += 1
            continue

        zones.setdefault(page, []).append([surah, ayah, ligne, min_x, max_x])

    # Les zones d'une page se rangent dans l'ordre du moushaf : par verset, puis
    # par ligne. Une zone par (verset, ligne), sans doublon.
    pages: dict[str, dict] = {}
    for page in sorted(bandes):
        lignes = [
            (bandes[page].get(n) if n in bandes[page] else None) for n in range(1, 16)
        ]
        propres: dict[tuple[int, int, int], list[int]] = {}
        for surah, ayah, ligne, min_x, max_x in zones.get(page, []):
            cle = (surah, ayah, ligne)
            actuelle = propres.get(cle)
            if actuelle is None:
                propres[cle] = [surah, ayah, ligne, min_x, max_x]
            else:
                actuelle[3] = min(actuelle[3], min_x)
                actuelle[4] = max(actuelle[4], max_x)

        pages[str(page)] = {
            "lignes": lignes,
            "zones": [propres[cle] for cle in sorted(propres)],
        }

    stats = {
        "pages": len(pages),
        "zones": sum(len(p["zones"]) for p in pages.values()),
        "marqueurs": marqueurs,
        "versets": len(dernier),
        "transposees": transposees,
        "sansMarqueur": sum(1 for cle in compte if not a_marqueur[cle]),
    }
    return pages, stats


def controler_le_modele(glyphes, mots: dict[tuple[int, int], int]) -> list[str]:
    """Verifie, verset par verset, que `glyphes = jetons + 1 - basmala`.

    C'est le controle qui donne son sens a l'exclusion du marqueur : s'il tient
    sur 6 235 versets et n'echoue que sur 13:37, alors le dernier glyphe est bien
    un marqueur partout ailleurs. Le script refuse d'ecrire si un seul verset de
    plus s'en ecarte.
    """
    problemes: list[str] = []
    compte: dict[tuple[int, int], int] = {}
    for page, ligne, surah, ayah, position, *_ in glyphes:
        compte[(surah, ayah)] = compte.get((surah, ayah), 0) + 1

    sans_marqueur: list[tuple[int, int]] = []
    for cle, nombre in sorted(compte.items()):
        attendu = mots.get(cle, 0) + 1 - (4 if cle in VERSETS_A_BASMALA else 0)
        if nombre == attendu:
            continue
        if nombre == attendu - 1:
            sans_marqueur.append(cle)
            continue
        problemes.append(
            f"{cle[0]}:{cle[1]} : {nombre} glyphes, {attendu} attendus "
            f"(jetons {mots.get(cle, 0)}, basmala {cle in VERSETS_A_BASMALA})"
        )

    if sans_marqueur != [VERSET_SANS_MARQUEUR]:
        problemes.append(
            f"versets sans marqueur : {sans_marqueur}, "
            f"{[VERSET_SANS_MARQUEUR]} attendu"
        )
    return problemes


def controler(
    pages: dict, stats: dict, glyphes, mots: dict[tuple[int, int], int]
) -> list[str]:
    """Les refus. Rend la liste des problemes ; vide veut dire « on peut ecrire »."""
    problemes: list[str] = controler_le_modele(glyphes, mots)

    if stats["pages"] != TOTAL_PAGES:
        problemes.append(f"{stats['pages']} pages decrites, {TOTAL_PAGES} attendues")
    if stats["versets"] != TOTAL_VERSETS:
        problemes.append(f"{stats['versets']} versets, {TOTAL_VERSETS} attendus")

    # 1. Chaque verset a-t-il une zone, et une seule page ?
    pages_du_verset: dict[tuple[int, int], set[int]] = {}
    for page_txt, contenu in pages.items():
        for surah, ayah, ligne, min_x, max_x in contenu["zones"]:
            pages_du_verset.setdefault((surah, ayah), set()).add(int(page_txt))
            # 2. La boite tient-elle dans la page, et n'est-elle pas vide ?
            if not (0 <= min_x < max_x <= LARGEUR_PAGE):
                problemes.append(
                    f"page {page_txt}, {surah}:{ayah} : abscisses hors page "
                    f"({min_x}..{max_x})"
                )
            if not (1 <= ligne <= 15):
                problemes.append(f"page {page_txt}, {surah}:{ayah} : ligne {ligne}")
            bande = contenu["lignes"][ligne - 1]
            if bande is None:
                problemes.append(
                    f"page {page_txt}, {surah}:{ayah} : ligne {ligne} sans bande"
                )
            elif not (0 <= bande[0] < bande[1] <= HAUTEUR_PAGE):
                problemes.append(
                    f"page {page_txt}, ligne {ligne} : bande hors page {bande}"
                )

    # 3. Un verset ne peut pas tomber sur deux pages : la table le dit, et le
    #    verifier ici rend le fait explicite plutot que suppose.
    for (surah, ayah), pages_vues in pages_du_verset.items():
        if len(pages_vues) > 1:
            problemes.append(
                f"{surah}:{ayah} tombe sur {sorted(pages_vues)} — deux pages"
            )

    # 4. Deux versets se recouvrent-ils sur une meme ligne ?
    #
    #    La liste des recouvrements est exigee EXACTEMENT egale a celle qui a ete
    #    mesuree : un seul couple, d'un seul pixel. Un controle qui se contenterait
    #    d'un seuil laisserait passer un second recouvrement sous ce seuil, et
    #    c'est precisement le genre d'ecart qui grandit sans se voir.
    recouvrements: list[tuple[int, int, tuple[int, int], tuple[int, int], int]] = []
    for page_txt, contenu in pages.items():
        par_ligne: dict[int, list[tuple[int, int, int, int]]] = {}
        for surah, ayah, ligne, min_x, max_x in contenu["zones"]:
            par_ligne.setdefault(ligne, []).append((min_x, max_x, surah, ayah))
        for ligne, boites in par_ligne.items():
            boites.sort()
            for i in range(1, len(boites)):
                chevauchement = boites[i - 1][1] - boites[i][0]
                if chevauchement > 0:
                    # Les deux versets sont nommes dans l'ordre du moushaf, et non
                    # dans celui des abscisses : c'est l'ordre dans lequel un
                    # lecteur les rencontre.
                    paire = sorted((boites[i - 1][2:], boites[i][2:]))
                    recouvrements.append(
                        (int(page_txt), ligne, paire[0], paire[1], chevauchement)
                    )
    recouvrements.sort()
    if recouvrements != [RECOUVREMENT_CONNU]:
        problemes.append(
            f"recouvrements : {recouvrements} — {[RECOUVREMENT_CONNU]} attendu"
        )

    # 5. L'accord avec la mise en page deja verifiee, verset par verset.
    with MISE_EN_PAGE.open(encoding="utf-8") as f:
        mise_en_page = json.load(f)
    lignes_attendues: dict[tuple[int, int], set[tuple[int, int]]] = {}
    for page_txt, lignes in mise_en_page["pages"].items():
        for i, ligne in enumerate(lignes):
            for element in ligne:
                if element[0] == "v":
                    lignes_attendues.setdefault((element[1], element[2]), set()).add(
                        (int(page_txt), i + 1)
                    )

    lignes_vues: dict[tuple[int, int], set[tuple[int, int]]] = {}
    for page_txt, contenu in pages.items():
        for surah, ayah, ligne, _, _ in contenu["zones"]:
            lignes_vues.setdefault((surah, ayah), set()).add((int(page_txt), ligne))

    for cle, attendues in sorted(lignes_attendues.items()):
        vues = lignes_vues.get(cle)
        if vues is None:
            problemes.append(f"{cle[0]}:{cle[1]} absent des zones")
        elif vues != attendues and cle != ECART_CONNU:
            problemes.append(
                f"{cle[0]}:{cle[1]} : lignes {sorted(vues)} au lieu de "
                f"{sorted(attendues)}"
            )

    return problemes


def engendrer(base: Path) -> tuple[dict, list[str]]:
    glyphes = lire_glyphes(base)
    # Le nombre de jetons par verset sert a savoir si un marqueur existe, et a
    # nommer les deux conventions dans la provenance. C'est une mesure : elle est
    # reportee telle quelle, et aucun texte coranique n'en sort.
    mots = charger_mots_du_verset()
    pages, stats = construire(glyphes, mots)
    problemes = controler(pages, stats, glyphes, mots)

    par_verset: dict[tuple[int, int], int] = {}
    for page, ligne, surah, ayah, position, *_ in glyphes:
        par_verset[(surah, ayah)] = par_verset.get((surah, ayah), 0) + 1
    ecarts: dict[int, int] = {}
    for cle, nombre in par_verset.items():
        d = nombre - mots.get(cle, 0)
        ecarts[d] = ecarts.get(d, 0) + 1

    donnees = {
        "provenance": {
            "source": "ayahinfo_1920.db, table glyphs — archive du moushaf fourni",
            "empreinteBase": empreinte(base),
            "largeurPage": LARGEUR_PAGE,
            "hauteurPage": HAUTEUR_PAGE,
            "pages": stats["pages"],
            "versets": stats["versets"],
            "zones": stats["zones"],
            "marqueursEcartes": stats["marqueurs"],
            "versetsSansMarqueur": stats["sansMarqueur"],
            "boitesTransposees": stats["transposees"],
            "glyphes": len(glyphes),
            "ecartGlyphesMoinsMots": {str(k): v for k, v in sorted(ecarts.items())},
            "ecartConnu": f"{ECART_CONNU[0]}:{ECART_CONNU[1]}",
            "note": (
                "Coordonnees mesurees, jamais devinees. Les zones couvrent les "
                "mots de chaque verset ; le medaillon qui le clot est ecarte, et "
                "la basmala n'a pas de boite dans la table."
            ),
        },
        "pages": pages,
    }
    return donnees, problemes


def main() -> int:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--base", type=Path, default=BASE_PAR_DEFAUT)
    analyseur.add_argument("--verifier", action="store_true")
    arguments = analyseur.parse_args()

    if not arguments.base.exists():
        print(
            f"La base est absente : {arguments.base}\n"
            "Elle se tire de l'archive du moushaf :\n"
            "    python scripts/extraire_base_ipa.py",
            file=sys.stderr,
        )
        return 2

    donnees, problemes = engendrer(arguments.base)

    if problemes:
        print("REFUS d'ecrire :", file=sys.stderr)
        for probleme in problemes[:40]:
            print(f"  - {probleme}", file=sys.stderr)
        if len(problemes) > 40:
            print(f"  … et {len(problemes) - 40} autres", file=sys.stderr)
        return 1

    prov = donnees["provenance"]
    print(f"pages decrites       : {prov['pages']}")
    print(f"versets              : {prov['versets']}")
    print(f"zones                : {prov['zones']}")
    print(f"marqueurs ecartes    : {prov['marqueursEcartes']}")
    print(f"versets sans marqueur: {prov['versetsSansMarqueur']}")
    print(f"boites transposees   : {prov['boitesTransposees']}")
    print(f"glyphes lus          : {prov['glyphes']}")
    print(f"ecart glyphes-mots   : {prov['ecartGlyphesMoinsMots']}")
    print(f"empreinte de la base : {prov['empreinteBase']}")

    if arguments.verifier:
        if not SORTIE.exists():
            print(f"\n{SORTIE.relative_to(RACINE)} est absent.", file=sys.stderr)
            return 1
        with SORTIE.open(encoding="utf-8") as f:
            enregistre = json.load(f)
        if enregistre != donnees:
            print(
                f"\n{SORTIE.relative_to(RACINE)} ne correspond plus a la base.",
                file=sys.stderr,
            )
            return 1
        print(f"\n{SORTIE.relative_to(RACINE)} correspond a la base.")
        return 0

    SORTIE.write_text(
        json.dumps(donnees, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"\nEcrit : {SORTIE.relative_to(RACINE)} ({SORTIE.stat().st_size:,} octets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
