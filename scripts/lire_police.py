"""Lire, dans une police TrueType, ce qu'un point de code dessine vraiment.

POURQUOI CE FICHIER EXISTE
--------------------------
Les polices de page du moushaf partagent toutes la meme table de caracteres :
les 604 fichiers portent les memes 608 emplacements de glyphes et les memes 720
points de code. Ce qui change d'une page a l'autre, c'est le **dessin** : pour
un mot qui n'est pas sur la page, l'emplacement porte un rectangle de
remplissage — un pave — au lieu du trace du calligraphe.

Autrement dit : « ce point de code est dans la police » ne veut rien dire. Un
mot absent se dessine en pave, sans que rien ne manque a la table des
caracteres. La seule question qui compte est : **ce point de code dessine-t-il
quelque chose sur cette page ?**

CE QUI IDENTIFIE LE PAVE : SA FORME, PAS SA LARGEUR
---------------------------------------------------
Le pave se reconnait a sa forme : **deux contours, huit points**. Mesure sur les
604 polices, il occupe 347 a 478 emplacements par police, et aucun mot du
calligraphe n'a cette forme : les mots en comptent des dizaines de points.

Sa largeur d'avance est toujours 992 unites de police, et 992 est de loin la
largeur la plus frequente du fichier (la suivante, 903, apparait 68 fois). **La
largeur seule ne suffit pourtant pas, et s'y fier accuse les donnees a tort.**
Sur la page 155, l'emplacement 409 a la largeur 992 pour 83 points : c'est un
mot. Trois pages ont ainsi ete declarees fautives par une premiere version de ce
module, qui lisait la largeur ; la forme les a innocentees. Une largeur peut
tomber par hasard sur 992, une forme de huit points ne tombe pas par hasard sur
un mot.

C'est pourquoi le verdict de dessin se prend sur `forme`, et que la largeur du
pave ne sert plus que de controle de famille.

POURQUOI SANS BIBLIOTHEQUE
--------------------------
Les controles de ce depot tournent dans l'integration continue avec le `python3`
de la machine, sans rien installer. Ce module ne lit donc que ce dont il a
besoin, avec la bibliotheque standard : le repertoire des tables, la table des
caracteres (formats 4 et 12), la table des largeurs et la table des contours.
"""

from __future__ import annotations

import struct

# Largeur d'avance du pave de remplissage, en unites de police. Mesuree sur les
# 604 polices : c'est la largeur la plus frequente de chaque fichier, et la
# suivante l'est 5 a 7 fois moins. Ne sert qu'a reconnaitre la famille de
# polices — le verdict de dessin se prend sur FORME_DU_PAVE.
LARGEUR_DU_PAVE = 992

# Forme du pave : deux contours, huit points. C'est elle qui distingue un mot
# d'un remplissage ; la largeur, elle, peut coincider.
FORME_DU_PAVE = (2, 8)

# Forme d'un emplacement vide : rien n'y est trace. L'espace qui separe la
# marque de rub' du mot en est un, et c'est normal.
FORME_VIDE = (0, 0)

# Les quatre etats d'un point de code, tels que `etat_des_codes` les nomme.
DESSIN = "dessin"
PAVE = "pave"
VIDE = "vide"
ABSENT = "absent"

SIGNATURES = (b"\x00\x01\x00\x00", b"true", b"OTTO", b"ttcf")


def _u16(octets: bytes, position: int) -> int:
    return struct.unpack_from(">H", octets, position)[0]


def _i16(octets: bytes, position: int) -> int:
    return struct.unpack_from(">h", octets, position)[0]


def _u32(octets: bytes, position: int) -> int:
    return struct.unpack_from(">I", octets, position)[0]


def tables(octets: bytes) -> dict[str, tuple[int, int]]:
    """Les tables de la police : nom -> (debut, longueur)."""
    if not any(octets.startswith(s) for s in SIGNATURES):
        raise ValueError(f"signature inconnue {octets[:4]!r} : ce n'est pas une police")
    nombre = _u16(octets, 4)
    trouvees = {}
    for indice in range(nombre):
        position = 12 + indice * 16
        nom = octets[position:position + 4].decode("latin-1")
        debut = _u32(octets, position + 8)
        longueur = _u32(octets, position + 12)
        trouvees[nom] = (debut, longueur)
    return trouvees


def nombre_de_glyphes(octets: bytes) -> int:
    debut, _ = tables(octets)["maxp"]
    return _u16(octets, debut + 4)


def _sous_tables_cmap(octets: bytes) -> list[tuple[int, int, int]]:
    """Rend [(plateforme, encodage, debut de la sous-table)]."""
    debut, _ = tables(octets)["cmap"]
    nombre = _u16(octets, debut + 2)
    sorties = []
    for indice in range(nombre):
        position = debut + 4 + indice * 8
        plateforme = _u16(octets, position)
        encodage = _u16(octets, position + 2)
        decalage = _u32(octets, position + 4)
        sorties.append((plateforme, encodage, debut + decalage))
    return sorties


def _lire_format_4(octets: bytes, debut: int) -> dict[int, int]:
    longueur = _u16(octets, debut + 2)
    segments = _u16(octets, debut + 6) // 2
    fin = debut + 14
    depart = fin + segments * 2 + 2
    delta = depart + segments * 2
    plage = delta + segments * 2
    table = {}
    for i in range(segments):
        fin_segment = _u16(octets, fin + i * 2)
        debut_segment = _u16(octets, depart + i * 2)
        if debut_segment == 0xFFFF:
            continue
        decalage_plage = _u16(octets, plage + i * 2)
        ecart = _i16(octets, delta + i * 2)
        for point in range(debut_segment, fin_segment + 1):
            if decalage_plage == 0:
                glyphe = (point + ecart) & 0xFFFF
            else:
                # L'adresse se compte depuis l'emplacement de `idRangeOffset`
                # lui-meme, et non depuis le debut de la sous-table.
                ou = plage + i * 2 + decalage_plage + (point - debut_segment) * 2
                if ou + 2 > debut + longueur:
                    continue
                glyphe = _u16(octets, ou)
                if glyphe != 0:
                    glyphe = (glyphe + ecart) & 0xFFFF
            if glyphe != 0:
                table[point] = glyphe
    return table


def _lire_format_12(octets: bytes, debut: int) -> dict[int, int]:
    groupes = _u32(octets, debut + 12)
    table = {}
    for i in range(groupes):
        position = debut + 16 + i * 12
        premier = _u32(octets, position)
        dernier = _u32(octets, position + 4)
        premier_glyphe = _u32(octets, position + 8)
        for point in range(premier, dernier + 1):
            table[point] = premier_glyphe + (point - premier)
    return table


def _choisir_sous_table(octets: bytes):
    """La sous-table qu'un moteur de texte emploierait.

    L'ordre suit celui de FreeType : format 12 Unicode d'abord, puis format 4
    Unicode, puis a defaut n'importe quelle table de caractere.
    """
    candidates = _sous_tables_cmap(octets)
    essais = [
        lambda p, e: p == 3 and e == 10,
        lambda p, e: p == 0 and e in (4, 6),
        lambda p, e: p == 3 and e == 1,
        lambda p, e: p == 0,
        lambda p, e: True,
    ]
    for critere in essais:
        for plateforme, encodage, debut in candidates:
            if not critere(plateforme, encodage):
                continue
            format_ = _u16(octets, debut)
            if format_ == 12:
                return _lire_format_12(octets, debut)
            if format_ == 4:
                return _lire_format_4(octets, debut)
    raise ValueError("aucune table de caracteres lisible")


def points_de_code(octets: bytes) -> dict[int, int]:
    """Les points de code dessines : point -> numero de glyphe (jamais 0)."""
    return _choisir_sous_table(octets)


def largeurs(octets: bytes) -> list[int]:
    """La largeur d'avance de chaque glyphe, dans l'ordre des numeros."""
    reperes = tables(octets)
    debut_hhea, _ = reperes["hhea"]
    nombre_metriques = _u16(octets, debut_hhea + 34)
    debut_hmtx, _ = reperes["hmtx"]
    total = nombre_de_glyphes(octets)

    avances = []
    derniere = 0
    for indice in range(nombre_metriques):
        derniere = _u16(octets, debut_hmtx + indice * 4)
        avances.append(derniere)
    # Au-dela des metriques declarees, l'avance reste celle de la derniere :
    # c'est ce que dit la specification, et c'est ce que font les moteurs.
    while len(avances) < total:
        avances.append(derniere)
    return avances


def _reperes_glyphes(octets: bytes) -> list[int]:
    """Le debut de chaque glyphe dans la table `glyf`, longueur + 1."""
    reperes = tables(octets)
    debut_head, _ = reperes["head"]
    format_court = _i16(octets, debut_head + 50) == 0
    debut_loca, _ = reperes["loca"]
    nombre = nombre_de_glyphes(octets)
    if format_court:
        return [_u16(octets, debut_loca + i * 2) * 2 for i in range(nombre + 1)]
    return [_u32(octets, debut_loca + i * 4) for i in range(nombre + 1)]


def formes(octets: bytes) -> list[tuple[int, int]]:
    """La forme de chaque glyphe, dans l'ordre des numeros.

    Une forme est (nombre de contours, nombre de points). Un glyphe vide rend
    (0, 0) ; un glyphe compose, un nombre de contours negatif ; le pave de
    remplissage, exactement `FORME_DU_PAVE` ; un mot du calligraphe, des
    dizaines de points.

    La table `loca` n'est lue qu'une fois : la lire par glyphe ferait 608
    lectures par police, et 367 000 pour les 604.
    """
    reperes = _reperes_glyphes(octets)
    debut_glyf, _ = tables(octets)["glyf"]
    sorties = []
    for numero in range(len(reperes) - 1):
        debut, fin = reperes[numero], reperes[numero + 1]
        if fin <= debut:
            sorties.append((0, 0))
            continue
        base = debut_glyf + debut
        contours = _i16(octets, base)
        if contours <= 0:
            sorties.append((contours, 0))
            continue
        dernier = _u16(octets, base + 10 + (contours - 1) * 2)
        sorties.append((contours, dernier + 1))
    return sorties


def forme(octets: bytes, numero: int) -> tuple[int, int]:
    """(nombre de contours, nombre de points) d'un seul glyphe."""
    total = nombre_de_glyphes(octets)
    if numero < 0 or numero >= total:
        raise ValueError(f"glyphe {numero} hors de la police ({total} emplacements)")
    return formes(octets)[numero]


def est_pave(octets: bytes, numero: int) -> bool:
    """Ce glyphe porte-t-il le pave de remplissage plutot qu'un mot ?"""
    return forme(octets, numero) == FORME_DU_PAVE


def largeur_du_pave(octets: bytes) -> int | None:
    """La largeur d'avance du pave, ou None si la police n'en porte pas.

    **Controle de famille, et non verdict de dessin.** La largeur ne dit pas si
    un glyphe donne est un pave : un mot peut valoir 992. Ce que cette fonction
    etablit, c'est qu'on tient bien la famille attendue — celle dont les paves
    mesurent 992 et ou cette largeur ecrase toutes les autres.

    Deux cas, mesures sur les 604 polices.

    - **La police porte des paves.** La largeur 992 est alors de loin la plus
      frequente : 347 a 478 emplacements, contre 68 pour la suivante. On exige
      que 992 soit bien la largeur dominante. Si une autre largeur dominait, la
      police ne serait pas de la famille attendue, et le controle le dirait.

    - **La police n'en porte pas.** C'est le cas de la page 1, dont la police ne
      compte que 38 emplacements : elle ne contient que ses propres mots, et
      aucune largeur ne s'y detache — 992 y apparait une fois, comme n'importe
      quelle autre. Rendre None est alors la seule lecture honnete.

    Ce que ce controle ne peut pas voir — une police entiere remplacee par une
    autre qui dessine, mais faux — est couvert par les empreintes SHA-256 du
    manifeste. Les deux vont ensemble.
    """
    import collections

    avances = largeurs(octets)
    compte = collections.Counter(a for a in avances if a != 0)
    if not compte:
        raise ValueError("aucune largeur : police illisible")

    (mode, occurrences), (suivante, fois) = compte.most_common(2)
    if occurrences < 3 * fois:
        # Aucune largeur ne domine : la police ne porte pas de pave.
        return None
    if mode != LARGEUR_DU_PAVE:
        raise ValueError(
            f"la largeur dominante est {mode} ({occurrences} fois) et non "
            f"{LARGEUR_DU_PAVE} — cette police n'est pas de la famille attendue"
        )
    return mode


def codes_dessines(octets: bytes, codes: set[int]) -> set[int]:
    """Parmi ces points de code, ceux que cette police dessine vraiment.

    Le verdict se prend sur la **forme** du glyphe : est pave qui a deux
    contours et huit points. Lire la largeur a la place a deja fait accuser
    trois pages a tort — voir l'en-tete du module.
    """
    etats = etat_des_codes(octets, codes)
    return {point for point, etat in etats.items() if etat == DESSIN}


def codes_dessines_par(octets: bytes) -> set[int]:
    """**Tous** les points de code que cette police dessine.

    A distinguer de `codes_dessines`, qui filtre une liste fournie : ici on
    demande a la police ce qu'elle trace, sans lui souffler la reponse. Sans
    cela, on ne peut pas voir qu'un dessin n'est employe par rien — la
    difference serait vide par construction.
    """
    toutes = formes(octets)
    return {
        point
        for point, glyphe in points_de_code(octets).items()
        if toutes[glyphe] not in (FORME_DU_PAVE, FORME_VIDE)
    }


def etat_des_codes(octets: bytes, codes: set[int]) -> dict[int, str]:
    """Pour chaque point de code : `DESSIN`, `PAVE`, `VIDE` ou `ABSENT`.

    Distinguer les quatre cas permet de dire ce qui ne va pas, au lieu de
    constater que « quelque chose » ne va pas : un pave s'imprime en rectangle,
    un emplacement vide ne s'imprime pas du tout, un point absent de la table
    des caracteres ne peut pas etre demande a la police.
    """
    toutes = formes(octets)
    correspondance = points_de_code(octets)
    etats = {}
    for point in codes:
        glyphe = correspondance.get(point)
        if glyphe is None:
            etats[point] = ABSENT
        elif toutes[glyphe] == FORME_DU_PAVE:
            etats[point] = PAVE
        elif toutes[glyphe] == FORME_VIDE:
            etats[point] = VIDE
        else:
            etats[point] = DESSIN
    return etats
