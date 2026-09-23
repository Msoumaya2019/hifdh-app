"""Engendre la mise en page du moushaf de Madine : 604 pages, 15 lignes.

POURQUOI CE FICHIER EXISTE
--------------------------
Une page imprimee du moushaf ne coupe pas ses lignes selon la largeur de
l'ecran : ses coupures font partie de la mise en page publiee. La page 401
porte quinze lignes, et chacune contient exactement les mots que l'imprimeur y
a places. Aucune justification automatique ne reproduit cela — il faut la
donnee.

CE QUE CE SCRIPT PRODUIT, ET CE QU'IL NE PRODUIT PAS
----------------------------------------------------
Il produit un **index**, jamais un texte. Chaque element du fichier engendre
designe un intervalle de jetons dans `quran_text_uthmani.json`, la source
Tanzil. Aucune lettre coranique ne figure dans le fichier de mise en page, et
aucune ne peut donc y etre alteree : le rendu lit le texte de Tanzil et se
contente d'y reprendre les mots designes.

C'est la regle du projet : on ne fabrique pas de texte coranique, on ne modifie
pas un verset. Ici, on ne fait que dire ou se trouve chaque mot sur la page.

D'OU VIENT LA MISE EN PAGE
--------------------------
De l'API quran.com v4, `mushaf=1` — la disposition du moushaf de Madine imprime
par le complexe KFGQPC, celle que le lecteur a sous les yeux. Chaque mot y porte
un `line_number`. On ne prend de cette API **que** les numeros de ligne et les
numeros de page : son texte, sa decoupe et sa graphie sont ignores.

COMMENT LES DEUX SOURCES SONT RECONCILIEES
------------------------------------------
Les deux sources ne decoupent pas les mots pareil — quran.com colle la marque
de waqf au mot, tient « الٓمٓ » pour un seul mot, et insere un tatweel dans les
madd. Comparer des listes de mots est donc sans issue.

On compare le TEXTE, signe par signe, apres avoir retire tout ce qui n'est pas
lettre (harakat, marques de waqf, tatweel, espaces). Si les deux chaines
coincident caractere pour caractere, la correspondance est exacte : chaque
caractere de l'une a une position connue dans l'autre, et l'on reporte les
numeros de ligne sans jamais toucher au texte.

Un seul ecart systematique subsiste, et il est traite a part : Tanzil prefixe la
basmala au premier verset de chaque sourate, sauf pour Al-Fatiha (ou elle EST le
premier verset) et At-Tawbah (qui n'en a pas). quran.com la stocke separement.
Ces quatre jetons sont donc mis de cote, et places sur la ligne de basmala.

LA COUPURE DES LIGNES, ET SA CORRECTION MESUREE
-----------------------------------------------
Une page du moushaf est alignee des deux bords : sur la page 443 imprimee,
l'encre de chacune des quinze lignes couvre 634 a 635 pixels — 0,3 % d'ecart.
Or les numeros de ligne publies par quran.com placent sur deux pages un mot de
trop sur une ligne. La police de la page le dit, et le dit sans ambiguite : ses
avances sont celles de l'imprimeur. La page 443 y porte une ligne de 35 015
unites quand sa reference est de 29 439 (+18,9 %), la page 177 une ligne de
31 670 contre 29 033 (+9,1 %). Une ligne plus large que la page n'a pas pu etre
imprimee : la coupure publiee est fausse.

L'ESPACE ENTRE LES MOTS EST DANS L'AVANCE DU GLYPHE
---------------------------------------------------
Il ne faut **aucune espace** entre les mots : le calligraphe a dessine chaque mot
de sorte que son avance comprenne deja son blanc de fin. Mesure sur la page 177,
au corps que donne sa reference (45,08 px) :

    les 9 mots de la ligne 2, colles sans separateur, donnent 638 px d'encre
    — l'imprime en donne 638 a 642 sur ses treize lignes ;
    les memes mots joints par une espace donnent 654 px, soit 2 % de trop.

Les blancs internes de 5 a 7 px apparaissent d'eux-memes entre les mots. Et
l'avance du caractere espace de la police ne vaut que 81 unites, soit 1,78 px :
ce n'est pas l'espace de la ligne. Le rendu colle donc les codes les uns aux
autres, et la largeur d'une ligne est bien la somme de leurs seules avances —
ce que `largeur_de_ligne` calcule deja.

La correction se mesure. Sur la page 177, deplacer le dernier mot (« وَهُمْ »)
ramene la ligne a 29 074 unites et la suivante a 29 024, toutes deux a moins de
0,2 % de la reference. La page imprimee confirme : elle porte bien « وَهُمْ » au
debut de la ligne suivante. Sur la page 443, deplacer le dernier mot (le code
0xFBF4, « وَصَدَقَ ») ramene les deux lignes a 29 343 et 29 428 unites, soit
0,4 % de la reference — et c'est le seul mot dont le deplacement y parvienne.

Le script REFUSE d'ecrire si un seul verset ne s'aligne pas. Une mise en page
partielle serait pire que pas de mise en page : elle deplacerait des mots.

Usage :
    python data/quran/generer_layout_moushaf.py            # engendre
    python data/quran/generer_layout_moushaf.py --verifier  # controle hors ligne
"""

import argparse
import hashlib
import json
import statistics
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))

import lire_police  # noqa: E402

SOURCE_TEXTE = RACINE / "data" / "quran" / "quran_text_uthmani.json"
SORTIE = RACINE / "data" / "quran" / "moushaf_layout.json"
LARGEURS_DES_PAGES = RACINE / "data" / "quran" / "largeurs_pages.json"
CACHE = RACINE / ".tmp-layout-cache"
POLICES_DES_PAGES = RACINE / "assets" / "polices-pages"

API = "https://api.quran.com/api/v4"
LIGNES_PAR_PAGE = 15
PAGES = 604
JUZ = 30

# La page dont la police dessine la basmala, et la seule : l'API ne donne la
# basmala comme mots que pour Al-Fatiha, ou elle EST le premier verset.
PAGE_DE_LA_BASMALA = 1

# La resolution des 604 polices, verifiee a la lecture.
UNITES_PAR_EM = 2048

# Au-dela de cette part, une ligne ne peut pas avoir ete imprimee : elle
# depasserait le cadre. En deca, l'ecart est celui de la main de l'imprimeur.
SEUIL_DE_DEBORDEMENT = 0.05

# En deca de cette part de lignes proches de la reference, la page n'est pas
# alignee des deux bords, et il n'y a pas de reference a retrouver.
PART_DE_LIGNES_JUSTIFIEES = 0.70

# Le nombre de lignes qui font la reference d'une page : la mediane des plus
# larges. Un nombre pair ne prend pas le maximum, qui peut etre la ligne fausse
# qu'on cherche justement a reconnaitre.
LIGNES_DE_REFERENCE = 8

# Version du cache disque des reponses de l'API. A incrementer des qu'on reclame
# un champ de plus, sinon l'ancien cache est relu et le champ manque.
CACHE_VERSION = 2

# Le tatweel : un trait d'allongement que quran.com insere dans les madd, et
# que Tanzil n'ecrit pas.
TATWEEL = "\u0640"

# Symboles qui ne sont pas des lettres et que la categorie Unicode ne range pas
# avec les signes combinants : marqueur de rub' al-hizb, signe de sajdah,
# marqueur de fin de verset.
SYMBOLES = {"\u06dd", "\u06de", "\u06e9", "\u08e2"}

# Les sourates dont le premier verset n'est pas precede d'une basmala separee :
# Al-Fatiha, ou la basmala est le verset lui-meme, et At-Tawbah, qui n'en a pas.
SANS_BASMALA_SEPAREE = {1, 9}

BASMALA_JETONS = 4

# Versets ou les deux editions divergent sur la graphie elle-meme, et non sur la
# maniere de la coder.
#
# 11:13 — quran.com ecrit « افتراه », Tanzil ecrit « ٱفترىه ». C'est l'imāla,
# cette inflexion du alif vers le ya que l'edition de Tanzil note dans sa
# graphie. Une difference d'ecole, pas une erreur de report : le mot tient sur
# une ligne dans les deux cas, et c'est la seule chose que ce fichier a besoin
# de savoir.
#
# Declarer ne suffit pas a passer. Le report exige en plus que les deux chaines
# depouillees aient exactement la meme longueur — sans quoi les positions des
# mots de quran.com ne tomberaient plus sur les jetons de Tanzil, et l'ecart
# deviendrait un decalage. Un ecart declare s'affiche a la generation et se
# retrouve dans les metadonnees du fichier engendre : il ne peut pas passer
# inapercu, et tout ecart non declare fait echouer la generation.
ECARTS_ORTHOGRAPHIQUES_DECLARES = {
    (11, 13): "imāla : « ٱفترىه » (Tanzil) contre « افتراه » (quran.com)",
}


def depouiller(texte):
    """Ne garde que les lettres : ni signe, ni espace, ni tatweel.

    La decomposition Unicode vient en premier, et elle compte. Une lettre
    precomposee et la meme lettre suivie de son signe doivent se lire pareil :
    Tanzil ecrit « أَنَّا » avec un alef-hamza d'un seul caractere, quran.com
    l'ecrit en alef suivi du signe de hamza. Sans decomposition, l'un gardait sa
    lettre et l'autre perdait son signe, et le verset echouait sur un ecart qui
    n'en est pas un. La decomposition s'applique aux deux sources : elle ne
    favorise ni l'une ni l'autre.

    Ce qui reste apres cela est une vraie difference d'edition, et non de
    codage — voir ECARTS_ORTHOGRAPHIQUES_DECLARES.
    """
    sortie = []
    for caractere in unicodedata.normalize("NFD", texte):
        if caractere == TATWEEL:
            continue
        categorie = unicodedata.category(caractere)
        if categorie in ("Mn", "Me", "Cf"):
            continue
        if caractere.isspace():
            continue
        if caractere in SYMBOLES:
            continue
        sortie.append(caractere)
    return "".join(sortie)


# ---------------------------------------------------------------------------
# Recuperation de la mise en page
# ---------------------------------------------------------------------------


def telecharger_juz(numero):
    """Le juz, avec le numero de ligne de chaque mot. Mis en cache sur disque."""
    CACHE.mkdir(exist_ok=True)
    # Le nom du cache porte la version des champs demandes. Sans cela, un cache
    # ecrit avant qu'on ne reclame `code_v1` serait relu tel quel : les codes
    # manqueraient, et la generation s'arreterait en accusant l'API.
    chemin = CACHE / f"juz_{numero:02d}_v{CACHE_VERSION}.json"
    if chemin.exists():
        return json.loads(chemin.read_text(encoding="utf-8"))

    # `per_page=1000` et non 300 : l'API tronque en silence. Le juz 30 compte
    # 564 versets, et une requete a 300 en rendait 300 sans le dire — 590
    # versets manquaient au total, et la generation s'arretait bien plus loin
    # sur un compte global, sans indiquer d'ou venait le manque.
    url = (
        f"{API}/verses/by_juz/{numero}"
        "?words=true&word_fields=text_uthmani,line_number,code_v1&mushaf=1&per_page=1000"
    )
    # L'API refuse une requete sans User-Agent : 403, sans dire pourquoi.
    requete = urllib.request.Request(url, headers={"User-Agent": "hifdh-app/1.1"})
    with urllib.request.urlopen(requete, timeout=120) as reponse:
        donnees = json.load(reponse)

    # Le garde-fou : le compte annonce par l'API doit egaler le compte recu.
    # Sans lui, une troncature future se lirait comme un juz plus court.
    annonces = donnees.get("pagination", {}).get("total_records")
    recus = len(donnees.get("verses", []))
    if annonces is not None and annonces != recus:
        raise SystemExit(
            f"juz {numero} : l'API annonce {annonces} versets et en rend {recus} "
            f"— reponse tronquee, refus d'utiliser ce cache"
        )

    chemin.write_text(json.dumps(donnees, ensure_ascii=False), encoding="utf-8")
    time.sleep(0.3)
    return donnees


def charger_mise_en_page():
    """Rend {cle_verset: {"page", "mots": [(graphie, ligne, code)], "fin", "fin_code"}}.

    Le troisieme terme d'un mot est son `code_v1` : **un seul caractere** qui,
    dans la police de sa page, dessine ce mot tel qu'il est imprime. Ce n'est
    pas une lettre du Coran, c'est une reference de dessin — la meme nature
    qu'un numero de page. Un mot sans code fait echouer la generation : sans lui
    le mot ne serait pas dessinable dans la page du moushaf.
    """
    versets = {}
    sans_code = []
    for numero in range(1, JUZ + 1):
        donnees = telecharger_juz(numero)
        for verset in donnees.get("verses", []):
            cle = verset["verse_key"]
            mots = []
            fin = None
            fin_code = None
            for mot in verset.get("words", []):
                ligne = mot.get("line_number")
                if ligne is None:
                    continue
                genre = mot.get("char_type_name")
                code = mot.get("code_v1")
                if not code:
                    sans_code.append(f"{cle} ({genre})")
                    continue
                if genre == "word":
                    mots.append((mot["text_uthmani"], ligne, code))
                elif genre == "end":
                    fin = ligne
                    fin_code = code
            versets[cle] = {
                "page": verset["page_number"],
                "mots": mots,
                "fin": fin,
                "fin_code": fin_code,
            }

    if sans_code:
        raise SystemExit(
            f"{len(sans_code)} mot(s) sans code de police, dont "
            + ", ".join(sans_code[:5])
            + " — refus d'ecrire une page dont des mots ne seraient pas dessinables"
        )
    return versets


# ---------------------------------------------------------------------------
# Report des numeros de ligne sur les jetons de Tanzil
# ---------------------------------------------------------------------------


def decouper_jetons(texte):
    """Les jetons de Tanzil, avec leur intervalle dans le texte depouille."""
    jetons = texte.split()
    intervalles = []
    position = 0
    for jeton in jetons:
        nu = depouiller(jeton)
        intervalles.append((position, position + len(nu)))
        position += len(nu)
    return jetons, intervalles


def reporter(verset, mots_qc, decalage):
    """Rend (ligne de chaque jeton, mot de quran.com de chaque jeton, erreurs).

    `decalage` est le nombre de jetons de basmala mis de cote au debut : ils
    n'ont pas de correspondant cote quran.com et sont traites separement.

    Le deuxieme terme rend, pour chaque jeton du verset **basmala comprise**,
    l'indice de son mot chez quran.com — ou None pour les jetons de basmala, qui
    n'en ont pas. C'est ce qui permet d'attacher a un element de page les codes
    de police de ses mots, sans avoir a recalculer d'appariement.
    """
    jetons, intervalles = decouper_jetons(verset["text"])
    jetons_verset = jetons[decalage:]

    # Les intervalles sont calcules sur le texte entier, basmala comprise. Or la
    # comparaison porte sur le verset seul : il faut donc recaler les positions
    # sur le debut du verset — et decouper la chaine depouillee au meme endroit.
    # Recaler les intervalles sans decouper la chaine laissait la tranche porter
    # sur le debut du texte : sur 2:1, on comparait « الم » a « بسم », et les
    # cent quatorze premiers versets de sourate echouaient pour cette seule
    # raison. Les deux decalages vont ensemble ou pas du tout.
    base = intervalles[decalage - 1][1] if decalage else 0
    intervalles_verset = [(debut - base, fin - base) for debut, fin in intervalles[decalage:]]
    depouille = depouiller(verset["text"])[base:]

    chaine_qc = "".join(depouiller(graphie) for graphie, _, _ in mots_qc)
    chaine_tz = "".join(depouille[debut:fin] for debut, fin in intervalles_verset)

    if chaine_qc != chaine_tz:
        cle = (verset["surah"], verset["ayah"])
        declare = ECARTS_ORTHOGRAPHIQUES_DECLARES.get(cle)
        # Un ecart declare ne dispense pas de la condition qui rend le report
        # possible : des chaines de meme longueur. Autrement, la position des
        # mots de quran.com ne coinciderait plus avec celle des jetons de
        # Tanzil, et l'on placerait un mot sur la ligne du voisin.
        if declare is None or len(chaine_qc) != len(chaine_tz):
            rang = next(
                (i for i, (x, y) in enumerate(zip(chaine_qc, chaine_tz)) if x != y),
                min(len(chaine_qc), len(chaine_tz)),
            )
            return None, None, [
                f"le texte depouille differe au caractere {rang} "
                f"({chaine_qc[max(0, rang - 10):rang + 10]!r} contre "
                f"{chaine_tz[max(0, rang - 10):rang + 10]!r})"
            ]

    # Intervalles cote quran.com, dans la meme chaine depouillee.
    bornes_qc = []
    position = 0
    for graphie, _, _ in mots_qc:
        longueur = len(depouiller(graphie))
        bornes_qc.append((position, position + longueur))
        position += longueur

    lignes = [None] * len(intervalles_verset)
    mot_de_jeton = [None] * len(jetons)
    erreurs = []
    rang_qc = 0

    for indice, (debut, fin) in enumerate(intervalles_verset):
        # Un jeton sans lettre n'a pas de position propre : il est rempli plus
        # bas, depuis ses voisins.
        if fin == debut:
            continue

        while rang_qc < len(bornes_qc) and bornes_qc[rang_qc][1] <= debut:
            rang_qc += 1
        if rang_qc >= len(bornes_qc):
            erreurs.append(
                f"le jeton {indice + 1} ({jetons_verset[indice]!r}) tombe apres le "
                f"dernier mot de quran.com (chaine de {len(chaine_qc)} lettres)"
            )
            return None, None, erreurs
        debut_qc, fin_qc = bornes_qc[rang_qc]
        if not (debut_qc <= debut and fin <= fin_qc):
            erreurs.append(
                f"le jeton {indice + 1} ({jetons_verset[indice]!r}) chevauche deux mots "
                f"de quran.com : {debut}-{fin} contre {debut_qc}-{fin_qc} "
                f"({mots_qc[rang_qc][0]!r})"
            )
            return None, None, erreurs

        lignes[indice] = mots_qc[rang_qc][1]
        mot_de_jeton[indice + decalage] = rang_qc

    # Les jetons sans lettre prennent la ligne du plus proche jeton qui en a une :
    # celle du precedent s'il y en a un — une marque de waqf se lit avec le mot
    # qu'elle suit — et celle du suivant sinon. C'est le cas du marqueur de rub'
    # al-hizb, qui ouvre certains versets et n'a donc rien avant lui.
    for indice, ligne in enumerate(lignes):
        if ligne is not None:
            continue
        avant = next(
            (lignes[j] for j in range(indice - 1, -1, -1) if lignes[j] is not None), None
        )
        apres = next(
            (lignes[j] for j in range(indice + 1, len(lignes)) if lignes[j] is not None), None
        )
        choisie = avant if avant is not None else apres
        if choisie is None:
            erreurs.append(f"le jeton {indice + 1} est vide et le verset entier l'est aussi")
            return None, None, erreurs
        lignes[indice] = choisie

    # Un jeton sans lettre est une marque de waqf ou un marqueur de rub' al-hizb,
    # et il ne porte aucun code propre. Non parce qu'il ne serait pas imprime,
    # mais parce que quran.com le range **dans le mot voisin** : la marque de
    # 2:5 est ecrite « رَّبِّهِمْ ۖ » d'un seul mot, dont le code porte deux
    # glyphes — le mot puis la marque. Le dessin est donc complet sans qu'on
    # apparie quoi que ce soit, et le nombre de codes par mot n'est pas fixe.
    #
    # Ce qui doit etre vrai, en revanche, c'est que chaque mot de quran.com soit
    # emis une fois et une seule : c'est verifie plus bas, dans `construire`.
    return lignes, mot_de_jeton, erreurs


# ---------------------------------------------------------------------------
# Assemblage des pages
# ---------------------------------------------------------------------------


def lignes_libres_avant(pages, page, premiere):
    """La suite contigue de lignes sans element qui precede immediatement `premiere`.

    Contigue, et non « toutes les lignes vides de la page » : sur la page 396,
    les lignes 8 et 9 sont libres — l'en-tete et la basmala de la sourate 29 —
    mais les lignes 1 a 7 portent la fin de la sourate 28. Prendre toutes les
    lignes vides confondrait les deux cas des qu'une page en porterait une
    ailleurs.
    """
    libres = []
    numero = premiere - 1
    while numero >= 1 and not pages[page][numero - 1]:
        libres.append(numero)
        numero -= 1
    return list(reversed(libres))


def ligne_de(pages, page, numero):
    """La ligne `numero` d'une page, numerotee a partir de 1.

    Les lignes du moushaf se comptent de 1 a 15 ; les listes de Python, de 0 a
    14. Confondre les deux decale une ouverture de sourate d'une ligne entiere,
    et le decalage est silencieux : la page reste valide, la sourate reste
    placee, seuls l'en-tete et la basmala descendent d'un cran. Cette fonction
    existe pour que la conversion se fasse a un seul endroit, et se nomme.
    """
    return pages[page][numero - 1]


def placer_ouverture(pages, glyphes, page, sourate, a_basmala, premiere, entetes_en_marge, basmala):
    """Place l'en-tete et la basmala dans les lignes libres. Rend un souci, ou None.

    Deux cas, tous deux releves sur le moushaf imprime :

    - **Deux lignes libres.** L'en-tete occupe la premiere, la basmala la
      seconde. Page 128, sourate 6 : le cartouche « سُورَةُ الْأَنْعَامِ » est
      la ligne 1, la basmala la ligne 2, et les mots commencent ligne 3. Page
      601, qui porte trois ouvertures de suite : lignes 1-2, 5-6 et 11-12.

    - **Une seule ligne libre**, parce que la sourate ouvre la page. Le moushaf
      imprime alors son nom dans la bande de marge, au-dessus des quinze
      lignes, et la basmala occupe la ligne 1. Page 77, sourate 4 : la marge
      porte « سورة النساء », la ligne 1 la basmala, les mots des la ligne 2.
      Les deux sourates sans basmala, Al-Fatiha et At-Tawbah, n'ont que leur
      en-tete a placer : il occupe cette ligne — page 1.

    Aucun autre compte n'existe sur les 114 ouvertures. Le verifier, c'est
    refuser de deviner : un troisieme cas serait un signe, pas un detail.
    """
    libres = lignes_libres_avant(pages, page, premiere)

    if a_basmala:
        if len(libres) == 2:
            ligne_de(pages, page, libres[0]).append(["e", sourate])
            ligne_de(glyphes, page, libres[0]).append(["e", sourate])
            ligne_de(pages, page, libres[1]).append(
                ["b", sourate, 1, 0, BASMALA_JETONS - 1]
            )
            ligne_de(glyphes, page, libres[1]).append(["b", sourate, 1, list(basmala)])
        elif len(libres) == 1:
            ligne_de(pages, page, libres[0]).append(
                ["b", sourate, 1, 0, BASMALA_JETONS - 1]
            )
            ligne_de(glyphes, page, libres[0]).append(["b", sourate, 1, list(basmala)])
            entetes_en_marge[page] = sourate
        else:
            return (
                f"{len(libres)} ligne(s) libre(s) avant le premier mot, attendu 2 "
                f"(en-tete et basmala) ou 1 (basmala seule, en-tete en marge)"
            )
    else:
        if len(libres) != 1:
            return (
                f"{len(libres)} ligne(s) libre(s) avant le premier mot, attendu 1 "
                f"(en-tete seul : cette sourate n'a pas de basmala)"
            )
        ligne_de(pages, page, libres[0]).append(["e", sourate])
        ligne_de(glyphes, page, libres[0]).append(["e", sourate])

    return None


def codes_de_basmala(mise_en_page):
    """Les quatre codes de police de la basmala, pris a la page 1.

    Le moushaf imprime la meme basmala au-dessus de chaque sourate, mais l'API
    ne la donne comme mots que pour Al-Fatiha, ou elle EST le premier verset.
    Les quatre codes de 1:1 sont donc ceux que dessine la police de la page 1,
    et c'est cette police-la que le rendu emploiera pour la basmala de toutes
    les pages — sinon la basmala serait le seul mot de la page dans une autre
    main que le reste.
    """
    premiers = mise_en_page.get("1:1")
    if premiers is None or len(premiers["mots"]) < BASMALA_JETONS:
        raise SystemExit("1:1 absent ou trop court : les codes de la basmala sont introuvables")
    codes = [code for _, _, code in premiers["mots"][:BASMALA_JETONS]]
    return codes


def charger_polices():
    """Les avances et les codes de chacune des 604 polices de page.

    Rend `{page: (avances, correspondance)}` ou `avances[glyphe]` est l'avance
    du glyphe et `correspondance[pointDeCode]` son numero. C'est la table
    `hmtx`, celle que l'imprimeur a dessinee : elle dit la largeur de chaque mot
    imprime, et c'est sur elle que la coupure des lignes se verifie.
    """
    polices = {}
    unites = set()
    for page in range(1, PAGES + 1):
        chemin = POLICES_DES_PAGES / f"p{page:03d}.ttf"
        if not chemin.exists():
            raise SystemExit(
                f"{chemin.relative_to(RACINE)} est absent : la coupure des lignes "
                "ne peut pas etre mesuree. Lancer d'abord "
                "« python scripts/recuperer_polices_pages.py »."
            )
        octets = chemin.read_bytes()
        debut, _ = lire_police.tables(octets)["head"]
        unites.add(lire_police._u16(octets, debut + 18))
        polices[page] = (lire_police.largeurs(octets), lire_police.points_de_code(octets))

    if unites != {UNITES_PAR_EM}:
        raise SystemExit(
            f"les polices n'ont pas toutes {UNITES_PAR_EM} unites par cadratin : "
            f"{sorted(unites)} — la coupure des lignes serait mesuree dans une "
            "unite fausse"
        )
    return polices


def largeur_de_ligne(ligne, avances, correspondance, avances_basmala, correspondance_basmala):
    """La somme des avances des glyphes d'une ligne, ou `None` pour un en-tete.

    La basmala se mesure dans la police de la page 1 : c'est la seule qui la
    dessine, et c'est celle que le rendu emploie pour la basmala de toutes les
    pages. La mesurer dans la police de la page donnerait la largeur d'un pave.
    """
    if any(element[0] == "e" for element in ligne):
        return None
    if any(element[0] == "b" for element in ligne):
        avances, correspondance = avances_basmala, correspondance_basmala

    total = 0
    for element in ligne:
        codes = element[3] if element[0] != "m" else [element[3]]
        for code in codes:
            for caractere in code:
                glyphe = correspondance.get(ord(caractere))
                if glyphe is not None:
                    total += avances[glyphe]
    return total


def largeurs_de_page(page, glyphes, polices):
    """Les quinze largeurs naturelles d'une page, dans l'unite de sa police."""
    avances, correspondance = polices[page]
    avances_basmala, correspondance_basmala = polices[PAGE_DE_LA_BASMALA]
    return [
        largeur_de_ligne(ligne, avances, correspondance, avances_basmala, correspondance_basmala)
        for ligne in glyphes[page]
    ]


def reference_de_page(largeurs):
    """La largeur de reference d'une page : la mediane de ses plus larges.

    Le maximum ne conviendrait pas : sur une page dont une ligne est fausse,
    c'est justement cette ligne-la qui est la plus large, et la reference
    monterait jusqu'a elle. La mediane de plusieurs lignes larges l'ignore.
    """
    valeurs = sorted((largeur for largeur in largeurs if largeur), reverse=True)
    return int(statistics.median(valeurs[:LIGNES_DE_REFERENCE]))


def page_justifiee(largeurs, reference):
    """Une page est alignee des deux bords si la plupart de ses lignes le sont.

    Les pages 1 et 2 — l'ouverture d'Al-Fatiha et celle d'Al-Baqara, composees
    en grand corps — portent des lignes de largeurs tres differentes : chaque
    verset y occupe une ligne, et la page n'est pas alignee des deux bords. Il
    n'y a donc pas de reference a laquelle ramener une ligne, et une ligne plus
    large que la mediane n'y est pas une faute.
    """
    non_vides = [largeur for largeur in largeurs if largeur]
    if not non_vides:
        return False
    proches = sum(
        1
        for largeur in non_vides
        if abs(largeur - reference) <= SEUIL_DE_DEBORDEMENT * reference
    )
    return proches >= PART_DE_LIGNES_JUSTIFIEES * len(non_vides)


def dernier_mot(ligne_texte, ligne_codes, codes_par_jeton):
    """Le dernier mot d'une ligne, et le premier des jetons qu'il couvre.

    Rend `(indice, premierJeton, code)` ou `None` si la ligne ne se laisse pas
    raccourcir. Trois cas s'y refusent :

      - la ligne est vide, ou se termine par un **medaillon** : le medaillon
        marque la fin du verset, et le retirer avec le mot deplacerait la
        marque de fin sur la ligne suivante ;
      - la ligne se termine par un **en-tete** ou une **basmala**, qui ne
        portent pas de mots ;
      - le dernier code couvre plusieurs jetons dont l'un **n'est pas le
        dernier** : le mot est a cheval sur la coupure, et le couper ecrirait
        deux moities de mot.

    Le dernier cas ne se rencontre pas sur les 604 pages, et le script refuse
    d'ecrire plutot que de le traiter au jugé.
    """
    if not ligne_texte or ligne_texte[-1][0] != "v":
        return None
    _, sourate, verset, debut, fin = ligne_texte[-1]
    codes = ligne_codes[-1][3]
    if not codes:
        return None

    par_jeton = codes_par_jeton.get((sourate, verset)) or []
    if len(par_jeton) <= fin or par_jeton[fin] != codes[-1]:
        return None
    premier = fin
    while premier > debut and par_jeton[premier - 1] == codes[-1]:
        premier -= 1
    return len(ligne_texte) - 1, premier, codes[-1]


def reculer_un_mot(pages, glyphes, page, ligne, indice, premier):
    """Poser le dernier mot de `ligne` au debut de `ligne + 1`.

    L'element de texte porte un intervalle de jetons, l'element de codes la
    liste des codes de ses mots : les deux se raccourcissent du meme mot, sans
    quoi le dessin ne repondrait plus au texte.
    """
    texte, codes = pages[page][ligne], glyphes[page][ligne]
    element_texte, element_codes = texte[indice], codes[indice]
    _, sourate, verset, debut, fin = element_texte
    liste = element_codes[3]

    if premier > debut:
        # L'element porte [genre, sourate, verset, premierJeton, dernierJeton] :
        # c'est le dernier jeton qui recule, pas le premier.
        element_texte[4] = premier - 1
        element_codes[3] = liste[:-1]
    else:
        texte.pop(indice)
        codes.pop(indice)

    suivant_texte, suivant_codes = pages[page][ligne + 1], glyphes[page][ligne + 1]
    if (
        suivant_texte
        and suivant_texte[0][0] == "v"
        and suivant_texte[0][1] == sourate
        and suivant_texte[0][2] == verset
        and suivant_texte[0][3] == fin + 1
    ):
        # La plage du verset est deja ouverte sur la ligne suivante : le mot
        # s'y ajoute au lieu d'ouvrir une seconde plage du meme verset.
        suivant_texte[0][3] = premier
        suivant_codes[0][3].insert(0, liste[-1])
    else:
        suivant_texte.insert(0, ["v", sourate, verset, premier, fin])
        suivant_codes.insert(0, ["v", sourate, verset, [liste[-1]]])


def corriger_coupures(pages, glyphes, codes_par_jeton, polices):
    """Rapporter sur la ligne suivante les mots d'une ligne trop large.

    Rend `(corrections, problemes)`. Une correction est
    `[page, ligne, sourate, verset, premierJeton, dernierJeton, code]` : ce qui
    a bouge, et de quoi le verifier a la main sur la page imprimee.
    """
    corrections = []
    problemes = []

    for page in range(1, PAGES + 1):
        largeurs = largeurs_de_page(page, glyphes, polices)
        reference = reference_de_page(largeurs)
        if not page_justifiee(largeurs, reference):
            continue

        for ligne in range(LIGNES_PAR_PAGE - 1):
            # Une ligne d'en-tete ne porte pas de mots, et n'a donc pas de
            # largeur a mesurer.
            if largeurs[ligne] is None:
                continue
            if largeurs[ligne + 1] is None:
                if largeurs[ligne] > (1 + SEUIL_DE_DEBORDEMENT) * reference:
                    problemes.append(
                        f"page {page} ligne {ligne + 1} : {largeurs[ligne]} unites "
                        f"pour une reference de {reference}, et la ligne suivante "
                        "porte un en-tete de sourate"
                    )
                continue
            for _ in range(LIGNES_PAR_PAGE * 4):
                if largeurs[ligne] <= (1 + SEUIL_DE_DEBORDEMENT) * reference:
                    break
                mot = dernier_mot(pages[page][ligne], glyphes[page][ligne], codes_par_jeton)
                if mot is None:
                    problemes.append(
                        f"page {page} ligne {ligne + 1} : {largeurs[ligne]} unites "
                        f"pour une reference de {reference}, et la ligne ne se "
                        "laisse pas raccourcir"
                    )
                    break
                indice, premier, code = mot
                _, sourate, verset, _, fin = pages[page][ligne][indice]
                poids = sum(
                    polices[page][0][polices[page][1][ord(caractere)]]
                    for caractere in code
                    if ord(caractere) in polices[page][1]
                )
                reculer_un_mot(pages, glyphes, page, ligne, indice, premier)
                largeurs[ligne] -= poids
                largeurs[ligne + 1] += poids
                corrections.append(
                    [page, ligne + 1, sourate, verset, premier, fin, code]
                )
            else:
                problemes.append(
                    f"page {page} ligne {ligne + 1} : toujours {largeurs[ligne]} "
                    f"unites pour une reference de {reference} apres "
                    f"{LIGNES_PAR_PAGE * 4} mots deplaces"
                )

    return corrections, problemes


def construire(texte_par_verset, mise_en_page):
    """Rend (pages, glyphes, entetes_en_marge, ecarts_de_page, codes, erreurs).

    `pages[n]` est une liste de 15 listes d'elements de texte. `glyphes[n]` est
    la meme chose, mais chaque element y porte les **codes de police** de ses
    mots : c'est avec eux que la page se dessine dans la main du moushaf.
    `entetes_en_marge` associe a une page le numero de la sourate dont le nom
    s'imprime dans la bande de marge, au-dessus des quinze lignes.
    `ecarts_de_page` consigne les versets ou la pagination de quran.com dit
    autre chose que celle du depot.
    `codes_par_jeton` associe a un verset, pour chacun de ses jetons, le code de
    police du mot qui le porte : c'est ce qui permet de deplacer un mot d'une
    ligne a l'autre sans couper ce qui doit rester ensemble.
    """
    pages = {n: [[] for _ in range(LIGNES_PAR_PAGE)] for n in range(1, PAGES + 1)}
    glyphes = {n: [[] for _ in range(LIGNES_PAR_PAGE)] for n in range(1, PAGES + 1)}
    entetes_en_marge = {}
    codes_par_jeton = {}
    ecarts_de_page = []
    erreurs = []
    versets_places = set()
    basmala = codes_de_basmala(mise_en_page)
    # Les mots de chaque verset, par leur indice : chacun doit se retrouver une
    # fois et une seule sur la page, sans quoi un mot serait dessine deux fois
    # ou pas du tout.
    mots_emis = {}

    for cle, info in sorted(
        mise_en_page.items(), key=lambda e: (int(e[0].split(":")[0]), int(e[0].split(":")[1]))
    ):
        sourate, verset_num = (int(x) for x in cle.split(":"))

        source = texte_par_verset.get((sourate, verset_num))
        if source is None:
            erreurs.append(f"{cle} : absent du texte de Tanzil")
            continue

        # La page est celle du texte de Tanzil, jamais celle annoncee par
        # quran.com a cote des mots.
        #
        # Mesure faite : le `page_number` de quran.com change selon les champs
        # demandes — 121 pour 5:83 avec `word_fields=text_uthmani,line_number`,
        # 122 avec `word_fields=line_number` — alors que les numeros de ligne,
        # eux, ne bougent pas d'un pouce. Un champ qui depend de la requete ne
        # peut pas servir de pagination.
        #
        # Celle du depot, elle, est confirmee verset par verset par deux sources
        # independantes : alquran.cloud et le `page_number` par defaut de
        # quran.com, 6236 versets sur 6236. Les 56 desaccords sont donc
        # consignes dans le fichier engendre, pas corriges.
        page = source["page"]
        if not 1 <= page <= PAGES:
            erreurs.append(f"{cle} : page {page} hors des 604 pages")
            continue
        if info["page"] != page:
            ecarts_de_page.append([cle, info["page"], page])

        mots_qc = info["mots"]
        if not mots_qc:
            erreurs.append(f"{cle} : aucun mot avec un numero de ligne")
            continue

        # La basmala de tete, mise de cote : elle ne compte pas dans le verset.
        a_basmala = verset_num == 1 and sourate not in SANS_BASMALA_SEPAREE
        decalage = BASMALA_JETONS if a_basmala else 0

        if a_basmala:
            jetons = source["text"].split()
            if len(jetons) <= BASMALA_JETONS:
                erreurs.append(f"{cle} : trop court pour porter une basmala")
                continue
            # Les quatre jetons doivent bien etre la basmala, et non autre chose.
            if depouiller(" ".join(jetons[:BASMALA_JETONS])) != depouiller(
                "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
            ):
                erreurs.append(
                    f"{cle} : les quatre premiers jetons ne sont pas la basmala "
                    f"({jetons[:BASMALA_JETONS]!r})"
                )
                continue

        lignes_jetons, mot_de_jeton, soucis = reporter(source, mots_qc, decalage)
        if soucis:
            erreurs.extend(f"{cle} : {souci}" for souci in soucis)
            continue

        # Le code de chaque jeton, basmala comprise — un jeton de basmala n'a pas
        # de mot chez quran.com et vaut donc `None`. La cle est le couple
        # (sourate, verset) : c'est sous cette forme que les elements de page
        # designent leur verset.
        codes_par_jeton[(sourate, verset_num)] = [
            None if rang is None else mots_qc[rang][2] for rang in mot_de_jeton
        ]

        # L'en-tete de la sourate et sa basmala, dans les lignes libres qui
        # precedent immediatement le premier mot.
        if verset_num == 1:
            souci = placer_ouverture(
                pages, glyphes, page, sourate, a_basmala, mots_qc[0][1],
                entetes_en_marge, basmala,
            )
            if souci:
                erreurs.append(f"{cle} : {souci}")
                continue

        emis = mots_emis.setdefault(cle, [])

        # Les mots, regroupes en plages consecutives sur la meme ligne.
        rang = 0
        while rang < len(lignes_jetons):
            debut = rang
            ligne = lignes_jetons[rang]
            while rang + 1 < len(lignes_jetons) and lignes_jetons[rang + 1] == ligne:
                rang += 1
            fin = rang
            # Les indices portent sur la liste complete des jetons du verset,
            # basmala comprise : le rendu n'a ainsi qu'a decouper.
            pages[page][ligne - 1].append(
                ["v", sourate, verset_num, debut + decalage, fin + decalage]
            )

            # Les codes de police des mots couverts par cette plage de jetons.
            # Deux jetons qui tombent sur le meme mot ne le comptent qu'une fois :
            # sans cela le mot serait dessine deux fois, cote a cote.
            rangs = []
            for indice in range(debut + decalage, fin + decalage + 1):
                mot = mot_de_jeton[indice]
                if mot is not None and (not rangs or rangs[-1] != mot):
                    rangs.append(mot)
            if not rangs:
                erreurs.append(
                    f"{cle} : la plage de jetons {debut + decalage}-{fin + decalage} "
                    f"ne couvre aucun mot de quran.com"
                )
                break
            emis.extend(rangs)
            glyphes[page][ligne - 1].append(
                ["v", sourate, verset_num, [mots_qc[m][2] for m in rangs]]
            )
            rang += 1

        if info["fin"] is not None:
            pages[page][info["fin"] - 1].append(["m", sourate, verset_num])
            glyphes[page][info["fin"] - 1].append(
                ["m", sourate, verset_num, info["fin_code"]]
            )

        versets_places.add(cle)

    # Chaque mot de chaque verset doit avoir ete emis une fois, et une seule.
    for cle, info in mise_en_page.items():
        attendus = len(info["mots"])
        emis = sorted(mots_emis.get(cle, []))
        if emis != list(range(attendus)):
            manquants = sorted(set(range(attendus)) - set(emis))
            doubles = sorted({m for m in emis if emis.count(m) > 1})
            erreurs.append(
                f"{cle} : {len(emis)} mot(s) dessine(s) pour {attendus} — "
                f"manquants {manquants[:5]}, doubles {doubles[:5]}"
            )
            if len(erreurs) > 60:
                break

    manquants = set(mise_en_page) - versets_places
    if manquants:
        erreurs.append(
            f"{len(manquants)} verset(s) n'ont pas ete places, dont "
            + ", ".join(sorted(manquants, key=lambda c: (int(c.split(':')[0]), int(c.split(':')[1])))[:5])
        )

    return pages, glyphes, entetes_en_marge, ecarts_de_page, codes_par_jeton, erreurs


# ---------------------------------------------------------------------------


def engendrer():
    print("Lecture du texte de Tanzil…")
    brut = json.loads(SOURCE_TEXTE.read_text(encoding="utf-8"))
    texte_par_verset = {(v["surah"], v["ayah"]): v for v in brut}
    print(f"  {len(texte_par_verset)} versets")

    print("Recuperation de la mise en page (30 requetes, mises en cache)…")
    mise_en_page = charger_mise_en_page()
    print(f"  {len(mise_en_page)} versets avec un numero de ligne")

    if len(mise_en_page) != len(texte_par_verset):
        raise SystemExit(
            f"la mise en page couvre {len(mise_en_page)} versets, "
            f"le texte en compte {len(texte_par_verset)} — refus d'ecrire"
        )

    print("Report des numeros de ligne sur les jetons de Tanzil…")
    pages, glyphes, entetes_en_marge, ecarts_de_page, codes_par_jeton, erreurs = construire(
        texte_par_verset, mise_en_page
    )

    if erreurs:
        print(f"\nECHEC : {len(erreurs)} probleme(s) — refus d'ecrire\n")
        for erreur in erreurs[:40]:
            print(f"  - {erreur}")
        if len(erreurs) > 40:
            print(f"  … et {len(erreurs) - 40} autre(s)")
        return 1

    print("Mesure de la coupure des lignes, polices ouvertes…")
    polices = charger_polices()
    corrections, problemes = corriger_coupures(pages, glyphes, codes_par_jeton, polices)

    if problemes:
        print(f"\nECHEC : {len(problemes)} ligne(s) trop large(s) — refus d'ecrire\n")
        for probleme in problemes[:20]:
            print(f"  - {probleme}")
        return 1

    for page, ligne, sourate, verset, premier, fin, code in corrections:
        print(
            f"  page {page} ligne {ligne} : {sourate}:{verset} jetons "
            f"{premier}-{fin} (code U+{ord(code[0]):04X}) reportes sur la ligne "
            "suivante — la coupure publiee y mettait un mot de trop"
        )

    fichier = {
        "metadata": {
            "title": "Mise en page du moushaf de Madine (604 pages, 15 lignes)",
            "recitation": "Hafs an Asim",
            "disposition": "quran.com API v4, mushaf=1 (complexe KFGQPC, edition de Madine)",
            "texte": "Tanzil.net — ce fichier ne contient aucun texte coranique",
            "nature": (
                "Index : chaque element designe un intervalle de jetons dans "
                "quran_text_uthmani.json. Aucune lettre coranique ici."
            ),
            "totalPages": PAGES,
            "lignesParPage": LIGNES_PAR_PAGE,
            "pagination": {
                "source": (
                    "le champ `page` de quran_text_uthmani.json, confirme verset par "
                    "verset par alquran.cloud et par le `page_number` par defaut de "
                    "quran.com"
                ),
                "pourquoiPasCelleDeQuranCom": (
                    "Le `page_number` de quran.com change selon les champs demandes : "
                    "121 pour 5:83 avec `word_fields=text_uthmani,line_number`, 122 avec "
                    "`word_fields=line_number`, les numeros de ligne restant identiques. "
                    "Un champ qui depend de la requete ne peut pas servir de pagination. "
                    "Il s'ecarte de celle du depot sur 56 versets, consignes ci-dessous."
                ),
                "ecartsAvecQuranCom": len(ecarts_de_page),
                "ecarts": ecarts_de_page,
            },
            "recoupementTexte": {
                "versets": len(texte_par_verset),
                "identiques": len(texte_par_verset) - len(ECARTS_ORTHOGRAPHIQUES_DECLARES),
                "ecartsDeclares": {
                    f"{s}:{a}": raison
                    for (s, a), raison in sorted(ECARTS_ORTHOGRAPHIQUES_DECLARES.items())
                },
                "methode": (
                    "Le texte de Tanzil et celui de quran.com, depouilles de leurs "
                    "signes, de leur tatweel et de leurs espaces, puis ramenes a leur "
                    "forme decomposee, coincident caractere pour caractere sur 6235 des "
                    "6236 versets. La decomposition compte : ecrite d'un seul caractere "
                    "chez Tanzil et en lettre suivie de son signe chez quran.com, la "
                    "meme lettre se lisait autrement. Les ecarts qui restent sont des "
                    "differences d'edition, declarees une par une ; tout ecart non "
                    "declare fait echouer la generation, et rien n'est ecrit."
                ),
            },
            "elements": {
                "v": "verset — [sourate, verset, premier jeton, dernier jeton]",
                "m": "medaillon de fin de verset — [sourate, verset]",
                "b": "basmala — [sourate, verset, premier jeton, dernier jeton]",
                "e": "en-tete de sourate — [sourate]",
            },
            "glyphes": (
                "Le meme decoupage que `pages`, mais chaque element porte les codes "
                "de la police de sa page au lieu d'un intervalle de jetons : "
                "`[\"v\", sourate, verset, [codes]]` et `[\"b\", sourate, 1, [codes]]` "
                "portent la liste des codes de leurs mots — un code par mot, et un mot "
                "peut en porter plusieurs quand une marque de waqf lui est attachee — "
                "`[\"m\", sourate, verset, code]` le code du medaillon, `[\"e\", sourate]` "
                "aucun : l'en-tete s'ecrit avec une police de texte. Un code n'est pas "
                "une lettre coranique : c'est un caractere de la zone privee qui designe "
                "un dessin dans la police de la page, de la meme nature qu'un numero de "
                "page. La basmala porte les codes de la page 1 et se dessine donc avec "
                "la police de la page 1 : l'API ne donne la basmala comme mots que pour "
                "Al-Fatiha, ou elle est le premier verset."
            ),
            "policeDesPages": (
                "QCF v1 (edition de Madine 1405H), une police par page, du Complexe "
                "Roi Fahd pour l'impression du Saint Coran. Empreintes et provenance "
                "dans data/quran/polices_pages.json ; conditions d'usage dans NOTICE.md."
            ),
            "coupuresCorrigees": {
                "nombre": len(corrections),
                "regle": (
                    "Une page du moushaf est alignee des deux bords. La reference "
                    "d'une page est la mediane des avances de ses huit lignes les "
                    "plus larges ; toute ligne qui la depasse de plus de 5 % porte "
                    "un mot de trop, et ce mot est reporte sur la ligne suivante. "
                    "La correction ne s'applique qu'aux pages dont au moins 70 % des "
                    "lignes sont proches de la reference : les pages 1 et 2, "
                    "composees en grand corps avec un verset par ligne, ne sont pas "
                    "alignees des deux bords et ne sont pas touchees."
                ),
                "preuve": (
                    "Sur la page 443 imprimee, l'encre de chacune des quinze lignes "
                    "couvre 634 a 635 pixels — 0,3 % d'ecart. Sur la page 177, "
                    "deplacer le dernier mot ramene la ligne a 29 074 unites et la "
                    "suivante a 29 024 pour une reference de 29 033, et la page "
                    "imprimee porte bien ce mot au debut de la ligne suivante."
                ),
                "corrections": corrections,
                "elements": (
                    "[page, ligne, sourate, verset, premierJeton, dernierJeton, code]"
                ),
            },
            "entetesEnMarge": (
                "Pour les sourates qui ouvrent une page, le moushaf imprime son nom "
                "dans la bande de marge, au-dessus des quinze lignes, et la basmala "
                "occupe la ligne 1. La page ne porte alors qu'un seul element "
                "d'ouverture. Les pages concernees sont listees dans `entetesEnMarge`."
            ),
        },
        "entetesEnMarge": {str(p): s for p, s in sorted(entetes_en_marge.items())},
        "pages": {str(n): pages[n] for n in range(1, PAGES + 1)},
        "glyphes": {str(n): glyphes[n] for n in range(1, PAGES + 1)},
    }

    # `newline="\n"` n'est pas cosmetique. Sans lui, Python traduit les fins de
    # ligne a l'ecriture, et le fichier sort en CRLF sous Windows contre LF
    # ailleurs : le meme script, sur la meme donnee, produirait deux fichiers de
    # tailles differentes selon la machine, et `git status` afficherait le fichier
    # entier comme modifie apres une simple regeneration.
    SORTIE.write_text(
        json.dumps(fichier, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    octets = SORTIE.stat().st_size
    total_elements = sum(len(ligne) for page in pages.values() for ligne in page)
    vides = sum(1 for page in pages.values() for ligne in page if not ligne)
    print(f"\nEcrit : {SORTIE.relative_to(RACINE)} ({octets} octets)")
    print(f"  {total_elements} elements sur {PAGES * LIGNES_PAR_PAGE} lignes")
    print(f"  {vides} lignes sans element")
    print(f"  {len(entetes_en_marge)} en-tete(s) de sourate renvoye(s) en marge")
    print(f"  {len(corrections)} coupure(s) de ligne corrigee(s), mesurees sur les polices")
    if ecarts_de_page:
        print(
            f"  {len(ecarts_de_page)} ecart(s) de pagination avec quran.com, "
            f"consigne(s) dans les metadonnees"
        )
    # La table des largeurs decrit la mise en page TELLE QU'ELLE ETAIT au moment
    # de la mesure, et elle en porte l'empreinte. Le fichier vient d'etre
    # reecrit : cette empreinte ne correspond donc plus, et `--verifier` la
    # refusera jusqu'a ce que la table soit remesuree. Le dire ici evite de
    # decouvrir l'ecart trois commandes plus loin, dans un controle qui parle
    # d'empreintes et non de ce qu'on vient de faire.
    print(
        "  la table des largeurs decrit la mise en page precedente : la remesurer "
        "par « npm run mesurer:largeurs », polices presentes"
    )
    return 0


def verifier():
    """Controle hors ligne : la mise en page est-elle coherente avec le texte ?

    Huit epreuves. Les quatre premieres portent sur la structure du fichier, la
    cinquieme sur l'ouverture des sourates, la sixieme sur le renvoi des
    en-tetes en marge, la septieme sur l'accord entre les elements de texte et
    les codes de police, la huitieme sur l'accord entre cette mise en page et la
    table des largeurs de `largeurs_pages.json`.

    Aucune ne lit le reseau, et aucune n'ouvre les 604 polices : elles doivent
    pouvoir etre rejouees sur une machine sans connexion, et — depuis que les
    polices ne sont plus dans le depot — sur un clone neuf. Ce que cela laisse
    hors de portee : que chaque code soit dessine par la police de sa page, et
    que les largeurs aient ete mesurees justes. Les deux se verifient a la
    demande, polices retablies, par `scripts/recuperer_polices_pages.py
    --verifier` puis `scripts/mesurer_largeurs_pages.py --verifier`.
    """
    if not SORTIE.exists():
        print(f"Absent : {SORTIE.relative_to(RACINE)} — lancer sans --verifier.")
        return 1

    fichier = json.loads(SORTIE.read_text(encoding="utf-8"))
    brut = json.loads(SOURCE_TEXTE.read_text(encoding="utf-8"))
    texte_par_verset = {(v["surah"], v["ayah"]): v for v in brut}

    pages = fichier["pages"]
    glyphes = fichier.get("glyphes")
    entetes_en_marge = fichier.get("entetesEnMarge", {})
    problemes = []

    if len(pages) != PAGES:
        problemes.append(f"{len(pages)} pages au lieu de {PAGES}")
    if glyphes is None:
        problemes.append("le fichier ne porte pas les codes de police (`glyphes`)")
        glyphes = {}

    jetons_par_verset = {cle: v["text"].split() for cle, v in texte_par_verset.items()}

    # 1. Chaque page porte exactement 15 lignes.
    for numero, lignes in pages.items():
        if len(lignes) != LIGNES_PAR_PAGE:
            problemes.append(f"page {numero} : {len(lignes)} lignes")

    # 2. Les versets d'une page sont ceux que la donnee de pagination annonce,
    #    dans l'ordre, et sans recouvrement.
    for numero in sorted(pages, key=int):
        vus = []
        for ligne in pages[numero]:
            for element in ligne:
                if element[0] in ("v", "b", "m"):
                    cle = (element[1], element[2])
                    if not vus or vus[-1] != cle:
                        vus.append(cle)
        attendus = [
            cle
            for cle, v in sorted(
                texte_par_verset.items(), key=lambda e: (e[0][0], e[0][1])
            )
            if v["page"] == int(numero)
        ]
        if vus != attendus:
            problemes.append(
                f"page {numero} : versets {vus} alors que la pagination annonce {attendus}"
            )

    # 3. Les intervalles de jetons sont valides et se suivent sans trou.
    for numero in sorted(pages, key=int):
        suites = {}
        for ligne in pages[numero]:
            for element in ligne:
                if element[0] == "v":
                    _, sourate, verset, debut, fin = element
                    cle = (sourate, verset)
                    total = len(jetons_par_verset.get(cle, []))
                    if not (0 <= debut <= fin < total):
                        problemes.append(
                            f"page {numero} : {cle} jetons {debut}-{fin} hors de 0-{total - 1}"
                        )
                        continue
                    suites.setdefault(cle, []).append((debut, fin))
                elif element[0] == "b":
                    _, sourate, verset, debut, fin = element
                    if (debut, fin) != (0, BASMALA_JETONS - 1):
                        problemes.append(
                            f"page {numero} : basmala {sourate} en {debut}-{fin}, "
                            f"attendu 0-{BASMALA_JETONS - 1}"
                        )
        for cle, plages in suites.items():
            plages.sort()
            # Les indices portent sur la liste complete des jetons du verset,
            # basmala comprise : le premier verset d'une sourate ne commence
            # donc pas au jeton 0, mais apres les quatre jetons de basmala.
            depart = BASMALA_JETONS if cle[1] == 1 and cle[0] not in SANS_BASMALA_SEPAREE else 0
            attendu = depart
            for debut, fin in plages:
                if debut != attendu:
                    problemes.append(
                        f"page {numero} : {cle} reprend au jeton {debut} au lieu de {attendu}"
                    )
                    break
                attendu = fin + 1
            else:
                total = len(jetons_par_verset.get(cle, []))
                if attendu != total:
                    problemes.append(
                        f"page {numero} : {cle} s'arrete au jeton {attendu - 1}, "
                        f"le verset en compte {total}"
                    )

    # 4. Chaque verset est place une fois, et une seule.
    places = {}
    for numero in sorted(pages, key=int):
        for ligne in pages[numero]:
            for element in ligne:
                if element[0] == "v":
                    cle = (element[1], element[2])
                    places.setdefault(cle, []).append(numero)
    absents = set(texte_par_verset) - set(places)
    if absents:
        problemes.append(f"{len(absents)} verset(s) jamais places")
    doubles = {cle: p for cle, p in places.items() if len(set(p)) > 1}
    if doubles:
        problemes.append(f"{len(doubles)} verset(s) places sur plusieurs pages")

    # 5. L'ouverture de chaque sourate : une ou deux lignes libres, et ce qu'il
    #    faut dedans. C'est ici que se verifie la regle relevee sur le moushaf.
    occupe = {}
    premieres = {}
    for numero in sorted(pages, key=int):
        occupe[int(numero)] = set()
        for indice, ligne in enumerate(pages[numero], start=1):
            for element in ligne:
                if element[0] in ("v", "m"):
                    occupe[int(numero)].add(indice)
                if element[0] == "v" and element[2] == 1:
                    cle = (element[1], element[2])
                    premieres[cle] = min(premieres.get(cle, indice), indice)

    for sourate in range(1, 115):
        cle = (sourate, 1)
        if cle not in premieres:
            problemes.append(f"sourate {sourate} : premier verset jamais place")
            continue
        page = texte_par_verset[cle]["page"]
        premiere = premieres[cle]
        libres = []
        n = premiere - 1
        while n >= 1 and n not in occupe[page]:
            libres.append(n)
            n -= 1
        libres.reverse()

        a_basmala = sourate not in SANS_BASMALA_SEPAREE
        contenu = [e for n in libres for e in pages[str(page)][n - 1]]
        if a_basmala and len(libres) == 2:
            if contenu != [["e", sourate], ["b", sourate, 1, 0, BASMALA_JETONS - 1]]:
                problemes.append(
                    f"sourate {sourate} page {page} : ouverture {contenu} au lieu de "
                    f"l'en-tete puis la basmala"
                )
        elif a_basmala and len(libres) == 1:
            if contenu != [["b", sourate, 1, 0, BASMALA_JETONS - 1]]:
                problemes.append(
                    f"sourate {sourate} page {page} : ligne unique {contenu} au lieu "
                    f"de la basmala seule"
                )
        elif not a_basmala and len(libres) == 1:
            if contenu != [["e", sourate]]:
                problemes.append(
                    f"sourate {sourate} page {page} : ligne unique {contenu} au lieu "
                    f"de l'en-tete seul"
                )
        else:
            problemes.append(
                f"sourate {sourate} page {page} : {len(libres)} ligne(s) libre(s) "
                f"avant le premier mot"
            )

    # 6. Le renvoi des en-tetes en marge : exactement les pages ou la sourate
    #    n'a qu'une ligne libre et une basmala a placer.
    attendus_marge = {}
    for sourate in range(1, 115):
        if sourate in SANS_BASMALA_SEPAREE:
            continue
        page = texte_par_verset[(sourate, 1)]["page"]
        premiere = premieres.get((sourate, 1))
        if premiere is None:
            continue
        libres = [
            n for n in range(premiere - 1, 0, -1) if n not in occupe[page]
        ]
        if len(libres) == 1:
            attendus_marge[page] = sourate
    if {int(p): s for p, s in entetes_en_marge.items()} != attendus_marge:
        problemes.append(
            f"en-tetes en marge {entetes_en_marge} au lieu de {attendus_marge}"
        )

    # 7. Les codes de police repondent aux elements de texte, un pour un.
    #
    #    C'est l'epreuve qui compte : la page se dessine avec les codes, et se
    #    replie sur le texte quand la police manque. Si les deux listes ne se
    #    correspondaient plus, le repli ne montrerait pas la meme page que le
    #    dessin — et rien, a l'ecran, ne le dirait.
    for numero in sorted(pages, key=int):
        lignes_glyphes = glyphes.get(numero)
        if lignes_glyphes is None:
            problemes.append(f"page {numero} : aucun code de police")
            continue
        if len(lignes_glyphes) != len(pages[numero]):
            problemes.append(
                f"page {numero} : {len(lignes_glyphes)} lignes de codes "
                f"contre {len(pages[numero])} lignes de texte"
            )
            continue
        for indice, (ligne_texte, ligne_codes) in enumerate(
            zip(pages[numero], lignes_glyphes), start=1
        ):
            if len(ligne_texte) != len(ligne_codes):
                problemes.append(
                    f"page {numero} ligne {indice} : {len(ligne_codes)} element(s) "
                    f"dessine(s) contre {len(ligne_texte)} de texte"
                )
                continue
            for element_texte, element_codes in zip(ligne_texte, ligne_codes):
                if element_texte[0] != element_codes[0]:
                    problemes.append(
                        f"page {numero} ligne {indice} : {element_codes[0]!r} dessine "
                        f"la ou le texte porte {element_texte[0]!r}"
                    )
                    continue
                genre = element_texte[0]
                if genre == "e":
                    if element_codes != element_texte:
                        problemes.append(
                            f"page {numero} ligne {indice} : en-tete {element_codes} "
                            f"au lieu de {element_texte}"
                        )
                    continue
                if (element_codes[1], element_codes[2]) != (
                    element_texte[1],
                    element_texte[2],
                ):
                    problemes.append(
                        f"page {numero} ligne {indice} : {genre} {element_codes[1:3]} "
                        f"dessine pour {element_texte[1:3]}"
                    )
                    continue
                if genre == "m":
                    if not isinstance(element_codes[3], str) or not element_codes[3]:
                        problemes.append(
                            f"page {numero} ligne {indice} : medaillon "
                            f"{element_texte[1:3]} sans code"
                        )
                    continue
                codes = element_codes[3]
                if not isinstance(codes, list) or not codes:
                    problemes.append(
                        f"page {numero} ligne {indice} : {genre} {element_texte[1:3]} "
                        f"sans code de police"
                    )
                    continue
                if not all(isinstance(c, str) and c for c in codes):
                    problemes.append(
                        f"page {numero} ligne {indice} : {genre} {element_texte[1:3]} "
                        f"porte un code vide"
                    )
                if genre == "b" and len(codes) != BASMALA_JETONS:
                    problemes.append(
                        f"page {numero} ligne {indice} : la basmala porte {len(codes)} "
                        f"code(s) au lieu de {BASMALA_JETONS}"
                    )

    # 8. La table des largeurs decrit bien CETTE mise en page, et aucune ligne
    #    ne deborde.
    #
    #    C'est l'epreuve qui tient la page imprimee. Une page du moushaf est
    #    alignee des deux bords : sur la page 443 imprimee, l'encre des quinze
    #    lignes couvre 634 a 635 pixels. Une ligne dont les avances depassent la
    #    reference de sa page de plus de 5 % n'a donc pas pu etre imprimee, et
    #    c'est le signe que la coupure publiee y met un mot de trop. Sans cette
    #    epreuve, la page se dessinerait avec une ligne qui sort du cadre.
    #
    #    Elle ne rouvre plus les 604 polices : elles ne sont plus dans le depot
    #    — 92 Mo pour des fichiers qu'aucun code n'emploie, contre la limite de
    #    150 Mo du CDN qui sert les pages — et les largeurs mesurees sont
    #    versionnees dans `largeurs_pages.json`, que l'application lit elle
    #    aussi. L'epreuve porte donc sur l'ACCORD entre cette table et la mise
    #    en page ci-dessus, et sur l'alignement des deux.
    #
    #    Cet accord n'est pas une formalite. Les deux fichiers se regenerent par
    #    des scripts DIFFERENTS — `engendrer()` ecrit celui-ci,
    #    `scripts/mesurer_largeurs_pages.py` ecrit l'autre — et rien ne les
    #    liait. Une coupure deplacee d'un mot laissait la table decrire une ligne
    #    qui n'existe plus : la page se dessinerait a une taille legerement
    #    fausse, une bande de surlignage tomberait a cote de son mot, et rien ne
    #    le dirait. La table enregistre pour cela l'empreinte de
    #    `moushaf_layout.json` au moment de la mesure ; une empreinte qui ne
    #    correspond plus est exactement ce defaut-la.
    #
    #    Ce que cette epreuve ne dit PAS : que les largeurs aient ete mesurees
    #    justes. Cela demande d'ouvrir les polices et se verifie a la demande —
    #    `scripts/recuperer_polices_pages.py --verifier` pour l'identite des 604
    #    fichiers, puis `scripts/mesurer_largeurs_pages.py --verifier` pour la
    #    mesure elle-meme.
    pages_justifiees = 0
    if not LARGEURS_DES_PAGES.exists():
        problemes.append(
            f"{LARGEURS_DES_PAGES.relative_to(RACINE)} est absent : la coupure des "
            "lignes ne peut pas etre verifiee. Le fichier est versionne — le "
            "restaurer, puis relancer « npm run mesurer:largeurs »"
        )
    else:
        empreinte = hashlib.sha256(SORTIE.read_bytes()).hexdigest()
        table = json.loads(LARGEURS_DES_PAGES.read_text(encoding="utf-8"))
        enregistree = (table.get("provenance") or {}).get("empreinteMiseEnPage")
        if enregistree != empreinte:
            problemes.append(
                "la table des largeurs ne decrit plus cette mise en page : "
                f"empreinte {enregistree or 'absente'} au lieu de {empreinte} — "
                "une coupure a bouge depuis la mesure. Polices retablies par "
                "« python scripts/recuperer_polices_pages.py », relancer "
                "« npm run mesurer:largeurs »"
            )
        else:
            mesures = table.get("pages") or {}
            if len(mesures) != PAGES:
                problemes.append(
                    f"la table des largeurs porte {len(mesures)} pages au lieu de {PAGES}"
                )
            for numero in sorted(glyphes, key=int):
                page = int(numero)
                entree = mesures.get(numero)
                if entree is None:
                    problemes.append(f"page {page} : absente de la table des largeurs")
                    continue
                largeurs = entree.get("lignes") or []
                if len(largeurs) != LIGNES_PAR_PAGE:
                    problemes.append(
                        f"page {page} : {len(largeurs)} largeurs au lieu de "
                        f"{LIGNES_PAR_PAGE}"
                    )
                    continue

                # La ligne d'en-tete de sourate est composee en police de texte,
                # pas dessinee par la police de page : elle vaut `null`, et
                # c'est la seule. Un `null` qui ne tombe pas sur une en-tete —
                # ou une en-tete mesuree — veut dire que la table decrit une
                # autre page que celle-ci.
                for indice, ligne in enumerate(glyphes[numero]):
                    en_tete = any(element[0] == "e" for element in ligne)
                    if (largeurs[indice] is None) != en_tete:
                        problemes.append(
                            f"page {page} ligne {indice + 1} : "
                            + (
                                "mesuree alors que c'est un en-tete de sourate"
                                if en_tete
                                else "sans mesure alors que ce n'est pas un en-tete"
                            )
                        )

                if not entree.get("justifiee"):
                    continue
                pages_justifiees += 1
                reference = entree.get("reference") or 0
                for indice, largeur in enumerate(largeurs, start=1):
                    if largeur is None:
                        continue
                    if largeur > (1 + SEUIL_DE_DEBORDEMENT) * reference:
                        problemes.append(
                            f"page {page} ligne {indice} : {largeur} unites pour une "
                            f"reference de {reference} ({(largeur / reference - 1):.1%} "
                            "de trop) — la ligne ne peut pas avoir ete imprimee"
                        )

            if pages_justifiees != table.get("pagesJustifiees"):
                problemes.append(
                    f"{pages_justifiees} page(s) alignee(s) des deux bords dans la table, "
                    f"qui en annonce {table.get('pagesJustifiees')}"
                )

    if problemes:
        print(f"Mise en page du moushaf : ECHEC ({len(problemes)} probleme(s))\n")
        for probleme in problemes[:30]:
            print(f"  - {probleme}")
        return 1

    total_elements = sum(len(l) for page in pages.values() for l in page)
    total_codes = sum(
        1
        for page in glyphes.values()
        for ligne in page
        for element in ligne
        if element[0] in ("v", "b", "m")
        for _ in (element[3] if element[0] != "m" else [element[3]])
    )
    print("Mise en page du moushaf : OK")
    print(f"  {len(pages)} pages, {LIGNES_PAR_PAGE} lignes chacune")
    print(f"  {total_elements} elements")
    print(f"  {total_codes} codes de police")
    print(
        "  (que chaque code soit dessine par la police de sa page, et que les "
        "largeurs soient mesurees justes, demande d'ouvrir les 604 polices : cela "
        "se verifie a la demande — `scripts/recuperer_polices_pages.py --verifier` "
        "puis `scripts/mesurer_largeurs_pages.py --verifier`)"
    )
    print(f"  {len(places)} versets places, une fois chacun")
    print(f"  {len(entetes_en_marge)} en-tete(s) de sourate en marge")
    print(
        f"  {pages_justifiees} page(s) alignee(s) des deux bords, aucune ligne ne "
        "deborde sa reference"
    )
    print(
        "  la table des largeurs decrit cette mise en page : empreinte "
        f"{hashlib.sha256(SORTIE.read_bytes()).hexdigest()[:16]}…"
    )
    return 0


def main():
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--verifier", action="store_true", help="controle hors ligne")
    arguments = analyseur.parse_args()
    return verifier() if arguments.verifier else engendrer()


if __name__ == "__main__":
    sys.exit(main())
