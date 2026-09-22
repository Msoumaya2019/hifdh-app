"""Recuperer les 604 polices de page du moushaf de Madine (QCF v1, 1405H).

POURQUOI CES POLICES
--------------------
Une police de page ne dessine pas des lettres : elle dessine des **mots
entiers**. Chaque mot du moushaf y est un seul point de code, dans une zone
privee, et le trace est celui de la main du calligraphe du Complexe Roi Fahd.
C'est ce qui permet a la page de l'application d'etre la page imprimee, et non
une approximation composee avec une police de texte.

CE QUI N'EST PAS FAIT ICI
-------------------------
Les fichiers sont ecrits **tels quels**, sans la moindre transformation : ni
sous-ensemble, ni renommage du contenu, ni reencodage. Les conditions d'usage
du Complexe Roi Fahd interdisent de modifier les fichiers ; les hacher et les
recopier n'est pas les modifier. Le manifeste enregistre l'empreinte SHA-256 de
chacun, afin qu'une copie differente se voie.

D'OU VIENNENT LES FICHIERS
--------------------------
`https://static.qurancdn.com/fonts/quran/hafs/v1/ttf/pN.ttf` — le meme service
que celui dont l'application tire deja la mise en page (API quran.com v4,
`mushaf=1`). Une seule provenance pour la page et pour ses glyphes.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parent.parent

DEPOT = "https://static.qurancdn.com/fonts/quran/hafs/v1/ttf"
NOMBRE_DE_PAGES = 604
ESSAIS = 4

DESTINATION = RACINE / "assets" / "polices-pages"
MANIFESTE = RACINE / "data" / "quran" / "polices_pages.json"

EN_TETE = {
    "User-Agent": "hifdh-app/1.0 (+https://github.com/Msoumaya2019/hifdh-app)",
    "Accept": "*/*",
}

# Le premier octet d'un fichier TrueType : 'true', 'OTTO' ou 0x00010000.
SIGNATURES = (b"\x00\x01\x00\x00", b"true", b"OTTO", b"ttcf")


def nom_de_fichier(page: int) -> str:
    return f"p{page:03d}.ttf"


def adresse(page: int) -> str:
    return f"{DEPOT}/p{page}.ttf"


def telecharger(page: int) -> tuple[int, bytes]:
    """Rend les octets de la page, ou leve. Reessaie sur incident reseau."""
    derniere: Exception | None = None
    for essai in range(ESSAIS):
        try:
            requete = urllib.request.Request(adresse(page), headers=EN_TETE)
            with urllib.request.urlopen(requete, timeout=90) as reponse:
                return page, reponse.read()
        except Exception as erreur:  # reseau, 5xx, coupure
            derniere = erreur
    raise RuntimeError(f"page {page} : {derniere}")


def verifier_octets(page: int, octets: bytes) -> None:
    """Refuse un fichier qui ne serait pas une police TrueType."""
    if len(octets) < 12:
        raise RuntimeError(f"page {page} : fichier trop court ({len(octets)} octets)")
    if not any(octets.startswith(s) for s in SIGNATURES):
        raise RuntimeError(
            f"page {page} : signature inconnue {octets[:4]!r}, ce n'est pas une police"
        )


def empreinte(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def ecrire_json(chemin: pathlib.Path, donnees: dict) -> None:
    # newline="\n" : sans lui, CRLF sous Windows contre LF ailleurs.
    chemin.write_text(
        json.dumps(donnees, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def lire_manifeste() -> dict:
    if not MANIFESTE.exists():
        raise SystemExit(
            f"manifeste absent : {MANIFESTE}\n"
            "Lancer d'abord « python scripts/recuperer_polices_pages.py »."
        )
    return json.loads(MANIFESTE.read_text(encoding="utf-8"))


def controler() -> int:
    """Verifie chaque fichier contre le manifeste. Rend le nombre de defauts."""
    manifeste = lire_manifeste()
    pages = manifeste["pages"]
    defauts = 0
    for page in range(1, NOMBRE_DE_PAGES + 1):
        entree = pages.get(str(page))
        if entree is None:
            print(f"  page {page} : absente du manifeste")
            defauts += 1
            continue
        chemin = DESTINATION / entree["fichier"]
        if not chemin.exists():
            print(f"  page {page} : fichier manquant {chemin.name}")
            defauts += 1
            continue
        octets = chemin.read_bytes()
        if len(octets) != entree["octets"]:
            print(
                f"  page {page} : {len(octets)} octets, attendu {entree['octets']}"
            )
            defauts += 1
            continue
        if empreinte(octets) != entree["sha256"]:
            print(f"  page {page} : empreinte differente")
            defauts += 1
    return defauts


def recuperer(forcer: bool) -> int:
    DESTINATION.mkdir(parents=True, exist_ok=True)

    a_faire = []
    for page in range(1, NOMBRE_DE_PAGES + 1):
        chemin = DESTINATION / nom_de_fichier(page)
        if chemin.exists() and not forcer:
            verifier_octets(page, chemin.read_bytes())
        else:
            a_faire.append(page)

    print(f"{NOMBRE_DE_PAGES - len(a_faire)} polices deja la, {len(a_faire)} a recuperer")

    entrees: dict[str, dict] = {}
    echecs: list[str] = []

    # Les fichiers deja presents entrent au manifeste avec leur empreinte
    # mesuree : on ne recopie jamais une empreinte venue d'ailleurs.
    for page in range(1, NOMBRE_DE_PAGES + 1):
        chemin = DESTINATION / nom_de_fichier(page)
        if chemin.exists() and page not in a_faire:
            octets = chemin.read_bytes()
            entrees[str(page)] = {
                "fichier": chemin.name,
                "octets": len(octets),
                "sha256": empreinte(octets),
            }

    if a_faire:
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executeur:
            futurs = {executeur.submit(telecharger, p): p for p in a_faire}
            faits = 0
            for futur in concurrent.futures.as_completed(futurs):
                page = futurs[futur]
                try:
                    _, octets = futur.result()
                    verifier_octets(page, octets)
                except Exception as erreur:
                    echecs.append(str(erreur))
                    print(f"  ECHEC {erreur}")
                    continue
                chemin = DESTINATION / nom_de_fichier(page)
                chemin.write_bytes(octets)
                entrees[str(page)] = {
                    "fichier": chemin.name,
                    "octets": len(octets),
                    "sha256": empreinte(octets),
                }
                faits += 1
                if faits % 50 == 0:
                    print(f"  {faits}/{len(a_faire)}")

    if echecs:
        print()
        print(f"ARRET : {len(echecs)} page(s) n'ont pas ete recuperees.")
        for echec in echecs[:10]:
            print(f"  {echec}")
        return 1

    total = sum(e["octets"] for e in entrees.values())
    manifeste = {
        "titre": "Polices de page du moushaf de Madine (QCF v1, edition 1405H)",
        "nature": (
            "604 polices TrueType, une par page du moushaf. Chaque mot imprime y "
            "est un seul point de code : la police ne compose pas des lettres, "
            "elle dessine le trace du calligraphe. Aucun texte coranique ici."
        ),
        "provenance": {
            "source": DEPOT,
            "service": "quran.com (API v4, mushaf=1) — le meme que la mise en page",
            "auteur": "Complexe Roi Fahd pour l'impression du Saint Coran (KFGQPC), Medine",
            "modification": (
                "aucune : les fichiers sont recopies octet pour octet, "
                "sans sous-ensemble ni reencodage"
            ),
        },
        "usage": (
            "Conditions du Complexe Roi Fahd : usage libre, y compris dans les "
            "sites et les logiciels ; attribution au Complexe Roi Fahd seule ; "
            "fichiers non modifies ; polices non vendues."
        ),
        "pages": {str(p): entrees[str(p)] for p in range(1, NOMBRE_DE_PAGES + 1)},
        "totalOctets": total,
    }
    ecrire_json(MANIFESTE, manifeste)

    print()
    print(f"ecrit : {MANIFESTE.relative_to(RACINE)}")
    print(f"  {len(entrees)} polices, {total} octets ({total / 1048576:.1f} Mo)")
    return 0


def main() -> int:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument(
        "--verifier",
        action="store_true",
        help="verifier les fichiers presents contre le manifeste, sans reseau",
    )
    analyseur.add_argument(
        "--forcer", action="store_true", help="retélécharger meme les fichiers presents"
    )
    options = analyseur.parse_args()

    if options.verifier:
        defauts = controler()
        if defauts:
            print(f"\n{defauts} defaut(s) : les polices ne sont pas celles attendues.")
            return 1
        print(f"{NOMBRE_DE_PAGES} polices conformes au manifeste.")
        return 0

    return recuperer(options.forcer)


if __name__ == "__main__":
    sys.exit(main())
