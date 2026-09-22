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

Le script REFUSE d'ecrire si un seul verset ne s'aligne pas. Une mise en page
partielle serait pire que pas de mise en page : elle deplacerait des mots.

Usage :
    python data/quran/generer_layout_moushaf.py            # engendre
    python data/quran/generer_layout_moushaf.py --verifier  # controle hors ligne
"""

import argparse
import json
import sys
import time
import unicodedata
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
SOURCE_TEXTE = RACINE / "data" / "quran" / "quran_text_uthmani.json"
SORTIE = RACINE / "data" / "quran" / "moushaf_layout.json"
CACHE = RACINE / ".tmp-layout-cache"

API = "https://api.quran.com/api/v4"
LIGNES_PAR_PAGE = 15
PAGES = 604
JUZ = 30

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
    chemin = CACHE / f"juz_{numero:02d}.json"
    if chemin.exists():
        return json.loads(chemin.read_text(encoding="utf-8"))

    # `per_page=1000` et non 300 : l'API tronque en silence. Le juz 30 compte
    # 564 versets, et une requete a 300 en rendait 300 sans le dire — 590
    # versets manquaient au total, et la generation s'arretait bien plus loin
    # sur un compte global, sans indiquer d'ou venait le manque.
    url = (
        f"{API}/verses/by_juz/{numero}"
        "?words=true&word_fields=text_uthmani,line_number&mushaf=1&per_page=1000"
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
    """Rend {cle_verset: {"page": int, "mots": [(graphie, ligne)], "fin": ligne}}."""
    versets = {}
    for numero in range(1, JUZ + 1):
        donnees = telecharger_juz(numero)
        for verset in donnees.get("verses", []):
            cle = verset["verse_key"]
            mots = []
            fin = None
            for mot in verset.get("words", []):
                ligne = mot.get("line_number")
                if ligne is None:
                    continue
                if mot.get("char_type_name") == "word":
                    mots.append((mot["text_uthmani"], ligne))
                elif mot.get("char_type_name") == "end":
                    fin = ligne
            versets[cle] = {"page": verset["page_number"], "mots": mots, "fin": fin}
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
    """La ligne de chaque jeton de Tanzil, ou une liste d'erreurs.

    `decalage` est le nombre de jetons de basmala mis de cote au debut : ils
    n'ont pas de correspondant cote quran.com et sont traites separement.
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

    chaine_qc = "".join(depouiller(graphie) for graphie, _ in mots_qc)
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
            return None, [
                f"le texte depouille differe au caractere {rang} "
                f"({chaine_qc[max(0, rang - 10):rang + 10]!r} contre "
                f"{chaine_tz[max(0, rang - 10):rang + 10]!r})"
            ]

    # Intervalles cote quran.com, dans la meme chaine depouillee.
    bornes_qc = []
    position = 0
    for graphie, _ in mots_qc:
        longueur = len(depouiller(graphie))
        bornes_qc.append((position, position + longueur))
        position += longueur

    lignes = [None] * len(intervalles_verset)
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
            return None, erreurs
        debut_qc, fin_qc = bornes_qc[rang_qc]
        if not (debut_qc <= debut and fin <= fin_qc):
            erreurs.append(
                f"le jeton {indice + 1} ({jetons_verset[indice]!r}) chevauche deux mots "
                f"de quran.com : {debut}-{fin} contre {debut_qc}-{fin_qc} "
                f"({mots_qc[rang_qc][0]!r})"
            )
            return None, erreurs

        lignes[indice] = mots_qc[rang_qc][1]

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
            return None, erreurs
        lignes[indice] = choisie

    return lignes, erreurs


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


def placer_ouverture(pages, page, sourate, a_basmala, premiere, entetes_en_marge):
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
            ligne_de(pages, page, libres[1]).append(
                ["b", sourate, 1, 0, BASMALA_JETONS - 1]
            )
        elif len(libres) == 1:
            ligne_de(pages, page, libres[0]).append(
                ["b", sourate, 1, 0, BASMALA_JETONS - 1]
            )
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

    return None


def construire(texte_par_verset, mise_en_page):
    """Rend (pages, entetes_en_marge, ecarts_de_page, erreurs).

    `pages[n]` est une liste de 15 listes d'elements. `entetes_en_marge` associe
    a une page le numero de la sourate dont le nom s'imprime dans la bande de
    marge, au-dessus des quinze lignes. `ecarts_de_page` consigne les versets ou
    la pagination de quran.com dit autre chose que celle du depot.
    """
    pages = {n: [[] for _ in range(LIGNES_PAR_PAGE)] for n in range(1, PAGES + 1)}
    entetes_en_marge = {}
    ecarts_de_page = []
    erreurs = []
    versets_places = set()

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

        lignes_jetons, soucis = reporter(source, mots_qc, decalage)
        if soucis:
            erreurs.extend(f"{cle} : {souci}" for souci in soucis)
            continue

        # L'en-tete de la sourate et sa basmala, dans les lignes libres qui
        # precedent immediatement le premier mot.
        if verset_num == 1:
            souci = placer_ouverture(
                pages, page, sourate, a_basmala, mots_qc[0][1], entetes_en_marge
            )
            if souci:
                erreurs.append(f"{cle} : {souci}")
                continue

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
            rang += 1

        if info["fin"] is not None:
            pages[page][info["fin"] - 1].append(["m", sourate, verset_num])

        versets_places.add(cle)

    manquants = set(mise_en_page) - versets_places
    if manquants:
        erreurs.append(
            f"{len(manquants)} verset(s) n'ont pas ete places, dont "
            + ", ".join(sorted(manquants, key=lambda c: (int(c.split(':')[0]), int(c.split(':')[1])))[:5])
        )

    return pages, entetes_en_marge, ecarts_de_page, erreurs


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
    pages, entetes_en_marge, ecarts_de_page, erreurs = construire(
        texte_par_verset, mise_en_page
    )

    if erreurs:
        print(f"\nECHEC : {len(erreurs)} probleme(s) — refus d'ecrire\n")
        for erreur in erreurs[:40]:
            print(f"  - {erreur}")
        if len(erreurs) > 40:
            print(f"  … et {len(erreurs) - 40} autre(s)")
        return 1

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
            "entetesEnMarge": (
                "Pour les sourates qui ouvrent une page, le moushaf imprime son nom "
                "dans la bande de marge, au-dessus des quinze lignes, et la basmala "
                "occupe la ligne 1. La page ne porte alors qu'un seul element "
                "d'ouverture. Les pages concernees sont listees dans `entetesEnMarge`."
            ),
        },
        "entetesEnMarge": {str(p): s for p, s in sorted(entetes_en_marge.items())},
        "pages": {str(n): pages[n] for n in range(1, PAGES + 1)},
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
    if ecarts_de_page:
        print(
            f"  {len(ecarts_de_page)} ecart(s) de pagination avec quran.com, "
            f"consigne(s) dans les metadonnees"
        )
    return 0


def verifier():
    """Controle hors ligne : la mise en page est-elle coherente avec le texte ?

    Six epreuves. Les quatre premieres portent sur la structure du fichier, la
    cinquieme sur l'ouverture des sourates, la sixieme sur le renvoi des
    en-tetes en marge. Aucune ne lit le reseau : elles doivent pouvoir etre
    rejouees sur une machine sans connexion.
    """
    if not SORTIE.exists():
        print(f"Absent : {SORTIE.relative_to(RACINE)} — lancer sans --verifier.")
        return 1

    fichier = json.loads(SORTIE.read_text(encoding="utf-8"))
    brut = json.loads(SOURCE_TEXTE.read_text(encoding="utf-8"))
    texte_par_verset = {(v["surah"], v["ayah"]): v for v in brut}

    pages = fichier["pages"]
    entetes_en_marge = fichier.get("entetesEnMarge", {})
    problemes = []

    if len(pages) != PAGES:
        problemes.append(f"{len(pages)} pages au lieu de {PAGES}")

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

    if problemes:
        print(f"Mise en page du moushaf : ECHEC ({len(problemes)} probleme(s))\n")
        for probleme in problemes[:30]:
            print(f"  - {probleme}")
        return 1

    total_elements = sum(len(l) for page in pages.values() for l in page)
    print("Mise en page du moushaf : OK")
    print(f"  {len(pages)} pages, {LIGNES_PAR_PAGE} lignes chacune")
    print(f"  {total_elements} elements")
    print(f"  {len(places)} versets places, une fois chacun")
    print(f"  {len(entetes_en_marge)} en-tete(s) de sourate en marge")
    return 0


def main():
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--verifier", action="store_true", help="controle hors ligne")
    arguments = analyseur.parse_args()
    return verifier() if arguments.verifier else engendrer()


if __name__ == "__main__":
    sys.exit(main())
