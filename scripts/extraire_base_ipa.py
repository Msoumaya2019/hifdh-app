"""Extraire la base des glyphes de l'archive du moushaf.

POURQUOI CETTE BASE
-------------------
Les images des pages viennent de l'archive du moushaf fourni (voir `NOTICE.md`).
Cette archive porte, a cote des images, une base `ayahinfo_1920.db` dont la table
`glyphs` donne pour **chaque mot du Coran** sa page, sa ligne, son rang dans le
verset, et la **boite exacte de son trace** — `min_x`, `max_x`, `min_y`,
`max_y`. C'est la source des pages elles-memes : celle qui a servi a les dessiner.

C'est d'elle que viennent les zones de surlignage du lecteur audio
(`data/quran/zones_surlignage.json`). Sans elle, le lecteur ne saurait pas ou
tomber un verset sur la page, et il faudrait deviner — ce que le projet
s'interdit.

CE QUI EST FAIT ICI, ET CE QUI NE L'EST PAS
--------------------------------------------
Le fichier est extrait de l'archive **a l'octet**, sans reencodage ni
transformation : il est lu dans le zip et ecrit tel quel. Son empreinte SHA-256
est verifiee contre celle qui a ete mesuree, afin qu'une autre archive, ou une
extraction interrompue, se voie au lieu de produire des zones fausses.

La base n'est **pas versionnee** : elle pese 5,9 Mo, et c'est un fichier de
travail, pas une donnee de l'application. Ce que l'application lit est le JSON
engendre, qui est versionne, leger, et verifie par `npm run verifier:zones`.

USAGE
    python scripts/extraire_base_ipa.py
    python scripts/extraire_base_ipa.py --ipa <chemin de l'archive.ipa>
    python scripts/extraire_base_ipa.py --verifier

`--verifier` ne reecrit rien : il confronte le fichier present a l'empreinte
attendue, et sort en 1 s'il en differe.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import zipfile
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

# Le chemin du fichier dans l'archive. Les images des pages et la base des
# glyphes viennent du meme dossier : c'est ce qui garantit que les boites
# decrivent bien les images affichees.
CHEMIN_DANS_L_ARCHIVE = (
    "Payload/Quran.app/hafs_1405/images_1920/databases/ayahinfo_1920.db"
)

DESTINATION = RACINE / "data" / "quran" / "ayahinfo_1920.db"

# L'empreinte et la taille mesurees sur l'archive du moushaf fourni par le
# proprietaire du projet. Verifiees ici, et reportees dans la provenance du
# fichier engendre : une autre archive se signale au lieu de passer.
EMPREINTE_ATTENDUE = "fc37944d6ff90d992e89aafb4dc24cd382099c52bd07da1fded8d89cc07ba793"
TAILLE_ATTENDUE = 5_926_912

# Les emplacements ou l'archive est cherchee quand `--ipa` n'est pas donne.
EMPLACEMENTS = (
    Path.home() / "Downloads" / "com.quran.ios-2.6.8-eeveedecrypter.ipa",
)


def empreinte(chemin: Path) -> str:
    h = hashlib.sha256()
    with chemin.open("rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def trouver_archive(donnee: Path | None) -> Path | None:
    if donnee is not None:
        return donnee if donnee.exists() else None
    for emplacement in EMPLACEMENTS:
        if emplacement.exists():
            return emplacement
    return None


def main() -> int:
    analyseur = argparse.ArgumentParser(description=__doc__)
    analyseur.add_argument("--ipa", type=Path, default=None)
    analyseur.add_argument("--verifier", action="store_true")
    arguments = analyseur.parse_args()

    if arguments.verifier:
        if not DESTINATION.exists():
            print(f"La base est absente : {DESTINATION}", file=sys.stderr)
            return 1
        mesuree = empreinte(DESTINATION)
        if mesuree != EMPREINTE_ATTENDUE:
            print(
                f"La base ne correspond pas :\n  mesuree  {mesuree}\n"
                f"  attendue {EMPREINTE_ATTENDUE}",
                file=sys.stderr,
            )
            return 1
        print(f"La base correspond : {mesuree}")
        return 0

    archive = trouver_archive(arguments.ipa)
    if archive is None:
        print(
            "Archive introuvable. Indique-la :\n"
            "    python scripts/extraire_base_ipa.py --ipa <chemin.ipa>",
            file=sys.stderr,
        )
        return 2

    print(f"archive : {archive}")
    with zipfile.ZipFile(archive) as z:
        try:
            with z.open(CHEMIN_DANS_L_ARCHIVE) as source:
                octets = source.read()
        except KeyError:
            print(
                f"L'archive ne porte pas {CHEMIN_DANS_L_ARCHIVE}.\n"
                "C'est le chemin de la base des glyphes pour cette version ; "
                "une autre archive peut le ranger ailleurs.",
                file=sys.stderr,
            )
            return 1

    mesuree = hashlib.sha256(octets).hexdigest()
    print(f"extraite : {len(octets):,} octets")
    print(f"empreinte: {mesuree}")

    if len(octets) != TAILLE_ATTENDUE or mesuree != EMPREINTE_ATTENDUE:
        print(
            "REFUS d'ecrire : cette base n'est pas celle qui a ete mesuree.\n"
            f"  taille   {len(octets):,} au lieu de {TAILLE_ATTENDUE:,}\n"
            f"  empreinte {mesuree}\n"
            f"  attendue  {EMPREINTE_ATTENDUE}\n"
            "Les zones engendrees decriraient d'autres images que celles "
            "affichees. Si l'archive a legitimement change, mettre a jour les "
            "deux constantes de ce script, puis regenerer les zones.",
            file=sys.stderr,
        )
        return 1

    DESTINATION.write_bytes(octets)
    print(f"\nEcrit : {DESTINATION.relative_to(RACINE)}")
    print("Regenerer les zones : python data/quran/generer_zones_surlignage.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
