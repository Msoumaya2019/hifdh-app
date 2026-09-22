"""Remplace le texte coranique par le texte Uthmani officiel de Tanzil.

Provenance (reproductible) :
    https://tanzil.net/pub/download/index.php
        ?quranType=uthmani   # graphie uthmani, narration Hafs 'an Asim
        &marks=true          # marques de pause (ۖ ۗ ۚ ۛ)
        &sajdah=true         # signes de prosternation
        &rub=true            # marqueurs de rub' al-hizb (۞)
        &outType=txt-2       # "sourate|verset|texte"
        &agree=true

Ce script ne touche QUE le champ `text`. Les champs `juz`, `page` et
`hizbQuarter` (utilises pour les divisions et la progression) sont conserves
tels quels : la structure de l'application est donc inchangee.

Usage :
    python import_tanzil_text.py <chemin_vers_tanzil.txt>
"""

import json
import sys
import io
import hashlib
import pathlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ICI = pathlib.Path(__file__).parent
CIBLE = ICI / "quran_text_uthmani.json"
ATTENDU_NB_VERSETS = 6236


def charger_tanzil(chemin):
    """Lit le format 'sourate|verset|texte' produit par Tanzil.

    Le fichier se termine par un bloc de commentaires `#` : la notice de
    copyright que la licence impose de conserver. On la lit et on l'exige.
    """
    table = {}
    notice = []
    with open(chemin, encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.rstrip("\n").rstrip("\r")
            if ligne.startswith("#"):
                notice.append(ligne)
                continue
            if not ligne.strip():
                continue
            morceaux = ligne.split("|", 2)
            if len(morceaux) != 3:
                raise ValueError(f"ligne illisible : {ligne[:60]!r}")
            sourate, verset, texte = morceaux
            table[(int(sourate), int(verset))] = texte

    texte_notice = "\n".join(notice)
    if "Tanzil Quran Text" not in texte_notice or "Copyright" not in texte_notice:
        raise ValueError("le bloc de copyright Tanzil est absent du fichier source")
    return table, texte_notice


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    source = pathlib.Path(sys.argv[1])
    octets = source.read_bytes()
    print(f"source      : {source}")
    print(f"octets      : {len(octets)}")
    print(f"sha256      : {hashlib.sha256(octets).hexdigest()}")

    tanzil, notice = charger_tanzil(source)
    print(f"versets Tanzil : {len(tanzil)}")
    if len(tanzil) != ATTENDU_NB_VERSETS:
        sys.exit(f"ERREUR : {len(tanzil)} versets au lieu de {ATTENDU_NB_VERSETS}")

    # La licence impose de reproduire la notice : on la conserve dans le depot.
    fichier_notice = ICI / "TANZIL_LICENSE.txt"
    fichier_notice.write_text(notice + "\n", encoding="utf-8")
    print(f"notice         : {fichier_notice.name}, "
          f"{notice.count(chr(10)) + 1} lignes, {len(notice)} caracteres")

    versets = json.loads(CIBLE.read_text(encoding="utf-8"))
    print(f"versets actuels : {len(versets)}")
    if len(versets) != ATTENDU_NB_VERSETS:
        sys.exit(f"ERREUR : fichier cible incoherent ({len(versets)})")

    manquants = []
    for v in versets:
        cle = (int(v["surah"]), int(v["ayah"]))
        if cle not in tanzil:
            manquants.append(cle)
            continue
        v["text"] = tanzil[cle]
    if manquants:
        sys.exit(f"ERREUR : {len(manquants)} versets absents de la source : {manquants[:5]}")

    # Controle : plus aucun BOM, et correspondance integrale.
    boms = [v for v in versets if "\ufeff" in v["text"]]
    if boms:
        sys.exit(f"ERREUR : {len(boms)} versets contiennent encore un BOM")

    ecarts = [v for v in versets
              if v["text"] != tanzil[(int(v["surah"]), int(v["ayah"]))]]
    if ecarts:
        sys.exit(f"ERREUR : {len(ecarts)} versets ne correspondent pas")

    CIBLE.write_text(
        json.dumps(versets, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"ecrit       : {CIBLE} ({CIBLE.stat().st_size} octets)")
    print("correspondance : 6236/6236 versets identiques a la source Tanzil")


if __name__ == "__main__":
    main()
