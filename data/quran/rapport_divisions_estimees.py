#!/usr/bin/env python3
"""Engendre la liste precise des toumoun dont la borne n'est pas verifiee.

Pourquoi ce document existe
---------------------------

`thumn_hafs.json` porte, pour chacun des 480 toumoun, un champ
`verificationStatus`. Trois valeurs, et elles ne disent pas la meme chose :

  - `verified_hafs`  : la borne vient des donnees Hafs de quran-meta (KFGQPC) ;
  - `verified`       : borne intermediaire, deduite d'un mappage direct depuis
                       Qaloun — la sourate a le meme nombre de versets dans les
                       deux lectures, le report est donc sur ;
  - `estimated_offset` : borne intermediaire, deduite par report d'un **decalage
                       cumulatif** entre Hafs et Qaloun. Elle peut etre fausse
                       de plus ou moins un verset.

Le troisieme cas est celui qui compte : une borne estimee est presentee dans
l'application exactement comme une borne verifiee. Le present rapport les liste
une par une, avec la reference Qaloun dont chacune est issue, pour qu'elles
puissent etre confrontees a un mushaf Hafs imprime.

Ce que ce script garantit
-------------------------

Il engendre `docs/divisions-estimees.md`. Le document etant versionne, il peut
diverger des donnees des la prochaine regeneration de `thumn_hafs.json` — et
personne ne le verrait. D'ou le mode `--verifier`, qui reengendre le document en
memoire et le compare a celui du depot : il sort en code 1 s'ils different.

    python data/quran/rapport_divisions_estimees.py            # ecrit le document
    python data/quran/rapport_divisions_estimees.py --verifier  # refuse la derive

Usage :
    python3 data/quran/rapport_divisions_estimees.py [--verifier]
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
CHEMIN_THUMN = RACINE / "data" / "quran" / "thumn_hafs.json"
CHEMIN_SOURATES = RACINE / "data" / "quran" / "surahs.json"
CHEMIN_SORTIE = RACINE / "docs" / "divisions-estimees.md"

STATUTS = {
    "verified_hafs": "verifiee (donnees Hafs)",
    "verified": "verifiee (mappage direct)",
    "estimated_offset": "**estimee**",
}


def charger() -> tuple[dict, list[dict], list[dict]]:
    with CHEMIN_THUMN.open(encoding="utf-8") as f:
        donnees = json.load(f)
    with CHEMIN_SOURATES.open(encoding="utf-8") as f:
        sourates = json.load(f)
    return donnees["metadata"], donnees["thumn"], sourates


def controler(metadata: dict, thumn: list[dict]) -> list[str]:
    """Controle les invariants dont depend le rapport.

    Le rapport ne vaut que si les donnees tiennent debout : un total faux, ou un
    desaccord avec le resume inscrit dans les metadonnees, le rendrait trompeur
    sans qu'on s'en apercoive. Ces controles sont donc bloquants.
    """
    problemes: list[str] = []

    if len(thumn) != 480:
        problemes.append(f"480 toumoun attendus, {len(thumn)} trouves")

    numeros = [t["thumnNumber"] for t in thumn]
    if numeros != list(range(1, 481)):
        problemes.append("les numeros de toumoun ne vont pas de 1 a 480 sans trou")

    debuts_rub = [t for t in thumn if t["isRubStart"]]
    if len(debuts_rub) != 240:
        problemes.append(f"240 debuts de rub' attendus, {len(debuts_rub)} trouves")

    # Les bornes estimees sont les limites *intermediaires* : aucune ne doit
    # tomber sur un debut de rub', sinon c'est la borne de rub' elle-meme qui
    # serait estimee — un cas beaucoup plus grave, et qui doit se voir.
    estimees_sur_rub = [t["thumnNumber"] for t in thumn
                        if t["verificationStatus"] == "estimated_offset" and t["isRubStart"]]
    if estimees_sur_rub:
        problemes.append(
            "des bornes estimees tombent sur un debut de rub' "
            f"(toumoun {estimees_sur_rub[:5]}) : une borne de rub' ne peut pas etre estimee"
        )

    # Le rapport doit s'accorder avec le resume inscrit dans les metadonnees.
    # C'est exactement le genre d'accord que deux endroits portent sans pouvoir
    # se lire.
    compte = Counter(t["verificationStatus"] for t in thumn)
    resume = metadata.get("verificationSummary", {})
    for statut, libelle in resume.items():
        annonce = int(str(libelle).split("/")[0].strip())
        reel = compte.get(statut, 0)
        if annonce != reel:
            problemes.append(
                f"verificationSummary annonce {annonce} « {statut} », "
                f"les donnees en portent {reel}"
            )

    return problemes


def nom_sourate(sourates: list[dict], numero: int) -> str:
    for s in sourates:
        if s["number"] == numero:
            return s["nameFr"]
    return f"sourate {numero}"


def engendrer(metadata: dict, thumn: list[dict], sourates: list[dict]) -> str:
    estimees = [t for t in thumn if t["verificationStatus"] == "estimated_offset"]
    compte = Counter(t["verificationStatus"] for t in thumn)

    lignes: list[str] = []
    a = lignes.append

    a("# Bornes de toumoun estimees")
    a("")
    a("> Document **engendre** par `data/quran/rapport_divisions_estimees.py`.")
    a("> Ne pas le modifier a la main : le script le reecrit, et le controle")
    a("> `--verifier` refuse toute divergence entre ce document et les donnees.")
    a("")
    a("Les 480 toumoun du Coran sont donnes par `data/quran/thumn_hafs.json`, chacun")
    a("avec un statut de verification. Ce document liste celles des bornes qui ne sont")
    a("**pas** verifiees.")
    a("")
    a("## Pourquoi 151 bornes ne sont pas verifiees")
    a("")
    a("Les 240 limites de **rub' al-hizb** (les toumoun impairs) viennent des donnees")
    a("Hafs de quran-meta, source KFGQPC. Elles sont verifiees.")
    a("")
    a("Les 240 limites **intermediaires** (les toumoun pairs) n'existent pas dans les")
    a("donnees Hafs : elles ont ete reportees depuis les donnees **Qaloun** du meme")
    a("fournisseur. Ce report est sur quand la sourate a le meme nombre de versets dans")
    a("les deux lectures, et approximatif sinon — c'est un **decalage cumulatif** qui")
    a("est applique, et le resultat peut etre faux de plus ou moins un verset.")
    a("")
    a("| Statut | Toumoun | Origine |")
    a("| --- | ---: | --- |")
    a(f"| Verifiee — donnees Hafs | {compte.get('verified_hafs', 0)} | "
      "limites de rub' al-hizb, source KFGQPC |")
    a(f"| Verifiee — mappage direct | {compte.get('verified', 0)} | "
      "limite intermediaire, sourate de meme longueur en Hafs et en Qaloun |")
    a(f"| **Estimee** | **{compte.get('estimated_offset', 0)}** | "
      "limite intermediaire, sourate de longueur differente : report par decalage |")
    a("")
    a("## Comment s'en servir")
    a("")
    a("Chaque ligne donne la borne de **fin** d'un toumoun, c'est-a-dire le point ou le")
    a("toumoun suivant commence. Pour verifier, ouvrir un mushaf Hafs imprime (edition")
    a("Madina, KFGQPC) a la sourate indiquee et regarder si le verset marque comme fin")
    a("de toumoun est bien celui-la.")
    a("")
    a("La colonne **Reference Qaloun** donne la borne d'ou l'estimation a ete tiree.")
    a("Quand les deux numeros de verset different, c'est que le decalage a joue.")
    a("")
    a("Ces bornes sont utilisables en l'etat pour un programme d'apprentissage : un")
    a("ecart d'un verset sur une limite interieure de huitieme de hizb ne change pas la")
    a("quantite memorisee de facon sensible. Elles ne doivent en revanche **jamais**")
    a("etre presentees comme authentifiees.")
    a("")

    par_sourate: dict[int, list[dict]] = defaultdict(list)
    for t in estimees:
        par_sourate[t["hafs"]["endSurah"]].append(t)

    a("## Les bornes estimees, sourate par sourate")
    a("")
    for numero in sorted(par_sourate):
        lot = par_sourate[numero]
        nb_versets = next((s["ayahCount"] for s in sourates if s["number"] == numero), "?")
        a(f"### Sourate {numero} — {nom_sourate(sourates, numero)} ({nb_versets} versets)")
        a("")
        a(f"{len(lot)} borne(s) estimee(s).")
        a("")
        a("| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |")
        a("| ---: | ---: | ---: | --- | --- |")
        for t in sorted(lot, key=lambda x: x["thumnNumber"]):
            h = t["hafs"]
            q = t["qalounReference"]
            fin = f"{h['endSurah']}:{h['endAyah']}"
            ref = f"{q['endSurah']}:{q['endAyah']}"
            if (q["endSurah"], q["endAyah"]) != (h["endSurah"], h["endAyah"]):
                ref = f"{ref} (ecart)"
            a(f"| {t['thumnNumber']} | {t['hizbNumber']} | {t['rubNumber']} | {fin} | {ref} |")
        a("")

    a("## Traçabilite")
    a("")
    a("| Element | Valeur |")
    a("| --- | --- |")
    a(f"| Recitation | {metadata.get('recitation', '?')} |")
    a(f"| Texte coranique | {metadata.get('sources', {}).get('quranText', '?')} |")
    a(f"| Donnees Hafs | {metadata.get('sources', {}).get('hafsData', '?')} |")
    a(f"| Donnees Qaloun | {metadata.get('sources', {}).get('qalounData', '?')} |")
    a(f"| Licence | {metadata.get('license', '?')} |")
    a(f"| Genere le | {metadata.get('generatedAt', '?')} |")
    a("")

    return "\n".join(lignes)


def main() -> int:
    verifier = "--verifier" in sys.argv[1:]

    metadata, thumn, sourates = charger()

    problemes = controler(metadata, thumn)
    if problemes:
        print("Les donnees ne permettent pas d'etablir ce rapport :", file=sys.stderr)
        for p in problemes:
            print(f"  - {p}", file=sys.stderr)
        return 2

    document = engendrer(metadata, thumn, sourates)
    estimees = sum(1 for t in thumn if t["verificationStatus"] == "estimated_offset")

    if verifier:
        if not CHEMIN_SORTIE.exists():
            print(f"{CHEMIN_SORTIE.name} est absent du depot.", file=sys.stderr)
            return 1
        existant = CHEMIN_SORTIE.read_text(encoding="utf-8")
        if existant != document:
            print(
                f"{CHEMIN_SORTIE.name} a derive des donnees.\n"
                "Le regenerer : python3 data/quran/rapport_divisions_estimees.py",
                file=sys.stderr,
            )
            return 1
        print(f"{CHEMIN_SORTIE.name} est a jour ({estimees} bornes estimees).")
        return 0

    CHEMIN_SORTIE.parent.mkdir(parents=True, exist_ok=True)
    CHEMIN_SORTIE.write_text(document, encoding="utf-8", newline="\n")
    print(f"{CHEMIN_SORTIE.name} engendre : {estimees} bornes estimees sur {len(thumn)} toumoun.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
