#!/usr/bin/env python3
"""Applique a `thumn_hafs.json` les relectures exportees par le tableau de bord.

Pourquoi un script, et pas un formulaire
----------------------------------------

Le tableau de bord enregistre ce qu'un relecteur dit d'une borne et exporte
`corrections_toumoun.json`. Il n'ecrit jamais dans `thumn_hafs.json`, pour deux
raisons :

  1. une limite corrigee deplace **deux** toumoun : elle est le premier verset du
     toumoun N et la fin du toumoun N-1. Une correction locale laisserait donc la
     chaine incoherente, et le fichier porterait un recouvrement ou un trou ;
  2. le fichier est engendre, et il est verifie. Une ecriture depuis un
     formulaire ne rejouerait aucun des controles.

Ce script fait les deux : il recalcule les bornes voisines, puis rejoue
`verifier_divisions.py`, `verifier_pages.py` et le rapport des bornes estimees.
Si un seul controle tombe, il **n'ecrit rien** et rend les fichiers a l'octet
pres.

Ce qui est corrige, et ce qui ne l'est pas
------------------------------------------

La limite estimee est le **premier verset d'un toumoun pair** : c'est la valeur
que `generate_thumn.py` range dans `hafs_eighth_list[N]`, celle que porte le
statut `estimated_offset`. La **fin** d'un toumoun pair est une fin de rub'
al-hizb prise des donnees Hafs de KFGQPC — elle est verifiee, et ce script
refuse de la corriger. Les toumoun impairs, eux, commencent sur un debut de rub'
al-hizb : leur debut ne s'estime pas non plus.

Ce que devient une borne relue
------------------------------

`verificationStatus` prend une quatrieme valeur, `relue`. Ce n'est pas
`verified` : `verified` dit « la sourate a le meme nombre de versets dans les
deux lectures, le report depuis Qaloun est donc exact » — c'est une propriete du
calcul, pas d'une lecture. Une borne lue sur un moushaf imprime est autre chose,
et les confondre ferait disparaitre la distinction sans le dire.

L'origine de la borne est conservee dans `relecture.origine`. Pour une borne
corrigee, `source` decrit desormais la relecture : l'ancienne origine ne decrit
plus la valeur portee.

Ce que ce script ne fait pas
----------------------------

Il ne touche pas a `qalounReference` : c'est la borne de l'edition Qaloun, et
une relecture sur un moushaf Hafs ne dit rien d'elle.

Usage :
    python data/quran/appliquer_corrections.py corrections_toumoun.json
    python data/quran/appliquer_corrections.py corrections_toumoun.json --essai
"""

from __future__ import annotations

import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = Path(__file__).resolve().parent.parent.parent
ICI = RACINE / "data" / "quran"
THUMN = ICI / "thumn_hafs.json"
SOURATES = ICI / "surahs.json"
RAPPORT = RACINE / "docs" / "divisions-estimees.md"

VERSION_FICHIER = 1
TOTAL_TOUMOUN = 480
TOTAL_VERSETS = 6236

STATUT_RELUE = "relue"

# Le resume inscrit dans les metadonnees doit suivre les donnees : le rapport
# engendre compare les deux, et un desaccord le fait tomber. Les libelles sont
# ceux du generateur, recopies ici parce que ce script doit pouvoir ecrire le
# resume sans le reengendrer.
LIBELLES_RESUME = {
    "verified_hafs": "limites de rub' depuis donnees Hafs",
    "verified": "limites intermediaires, sourates identiques",
    "estimated_offset": "limites intermediaires, sourates differentes",
    STATUT_RELUE: "limites relues sur un moushaf imprime",
}


class Refus(SystemExit):
    """Un refus qui dit quoi faire, et qui n'ecrit rien."""


def charger(chemin: Path) -> object:
    try:
        return json.loads(chemin.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise Refus(f"ERREUR : {chemin} est absent")
    except json.JSONDecodeError as erreur:
        raise Refus(f"ERREUR : {chemin} n'est pas du JSON lisible — {erreur}")


def index_global(sourates: list[dict], surah: int, ayah: int) -> int | None:
    """L'identifiant global d'un verset (1 a 6236), ou `None` s'il n'existe pas."""
    for s in sourates:
        if s["number"] == surah:
            if not isinstance(ayah, int) or ayah < 1 or ayah > s["ayahCount"]:
                return None
            return s["startAyahId"] + ayah - 1
    return None


def borne_de_index(sourates: list[dict], ayah_id: int) -> tuple[int, int] | None:
    """La borne (sourate, verset) d'un identifiant global, ou `None` hors du Coran."""
    if not isinstance(ayah_id, int) or ayah_id < 1 or ayah_id > TOTAL_VERSETS:
        return None
    for s in sourates:
        if s["startAyahId"] <= ayah_id < s["startAyahId"] + s["ayahCount"]:
            return s["number"], ayah_id - s["startAyahId"] + 1
    return None


def controler_fichier(fichier: object, sourates: list[dict]) -> list[dict]:
    """Valide le fichier de corrections et rend ses entrees, triees."""
    if not isinstance(fichier, dict):
        raise Refus("ERREUR : le fichier de corrections doit etre un objet JSON")

    if fichier.get("version") != VERSION_FICHIER:
        raise Refus(
            f"ERREUR : version {fichier.get('version')!r} du fichier de corrections, "
            f"attendu {VERSION_FICHIER}. Ce script ne sait pas lire les autres."
        )

    corrections = fichier.get("corrections")
    if not isinstance(corrections, list):
        raise Refus("ERREUR : « corrections » doit etre une liste")
    if not corrections:
        raise Refus("ERREUR : le fichier ne porte aucune correction")

    annonce = fichier.get("total")
    if annonce != len(corrections):
        raise Refus(
            f"ERREUR : le fichier annonce {annonce} correction(s) et en porte "
            f"{len(corrections)} — refus d'appliquer un fichier incoherent"
        )

    vus: set[int] = set()
    entrees: list[dict] = []

    for rang, entree in enumerate(corrections):
        if not isinstance(entree, dict):
            raise Refus(f"ERREUR : la correction d'indice {rang} n'est pas un objet")

        numero = entree.get("thumnNumber")
        if not isinstance(numero, int) or not 1 <= numero <= TOTAL_TOUMOUN:
            raise Refus(
                f"ERREUR : toumoun {numero!r} hors des 480. "
                "Les toumoun se numerotent de 1 a 480."
            )
        if numero in vus:
            raise Refus(
                f"ERREUR : le toumoun {numero} apparait deux fois. "
                "Une borne ne se relit qu'une fois."
            )
        vus.add(numero)

        statut = entree.get("statut")
        if statut not in ("confirmee", "corrigee"):
            raise Refus(
                f"ERREUR : statut {statut!r} pour le toumoun {numero}, "
                "attendu « confirmee » ou « corrigee »"
            )

        surah = entree.get("limiteSurah")
        ayah = entree.get("limiteAyah")

        if statut == "confirmee":
            if surah is not None or ayah is not None:
                raise Refus(
                    f"ERREUR : le toumoun {numero} est confirme et porte pourtant une "
                    "borne. Une confirmation ne porte pas de borne : c'est le cas ou "
                    "celle des donnees vaut."
                )
        else:
            if index_global(sourates, surah, ayah) is None:
                if not any(s["number"] == surah for s in sourates):
                    raise Refus(
                        f"ERREUR : le toumoun {numero} est corrige vers la sourate "
                        f"{surah}, qui n'existe pas — le Coran en compte 114."
                    )
                compte = next(s["ayahCount"] for s in sourates if s["number"] == surah)
                raise Refus(
                    f"ERREUR : le toumoun {numero} est corrige vers {surah}:{ayah}, "
                    f"qui n'existe pas — la sourate {surah} compte {compte} versets."
                )

        entrees.append(
            {
                "thumnNumber": numero,
                "statut": statut,
                "surah": surah,
                "ayah": ayah,
                "note": entree.get("note"),
            }
        )

    return sorted(entrees, key=lambda e: e["thumnNumber"])


def controler_voisines(thumn: list[dict], sourates: list[dict], entrees: list[dict]) -> None:
    """Une limite corrigee doit tenir strictement entre ses deux voisines.

    La chaine est continue : le toumoun N commence au verset qui suit la fin du
    toumoun N-1. Corriger la limite, c'est donc deplacer a la fois le debut du
    toumoun indique et la fin du precedent. Le controle ne dit pas que la limite
    est juste — seul un moushaf le dit. Il dit qu'elle est possible, et il arrete
    une faute de frappe : « 2:300 » pour « 2:30 » ne passe pas.

    Ce qui est corrige, c'est le **debut** d'un toumoun pair, c'est-a-dire la
    limite intermediaire. Le debut d'un toumoun impair est un debut de rub'
    al-hizb, pris des donnees Hafs verifiees : il ne s'estime pas, et le deplacer
    ferait diverger le fichier de `divisions.json`.
    """
    par_numero = {t["thumnNumber"]: t for t in thumn}

    for entree in entrees:
        if entree["statut"] != "corrigee":
            continue

        numero = entree["thumnNumber"]
        toumoun = par_numero[numero]

        if toumoun["isRubStart"]:
            raise Refus(
                f"ERREUR : le toumoun {numero} ouvre un rub' al-hizb. Sa borne vient "
                "des donnees Hafs verifiees et ne s'estime pas : la corriger ferait "
                "diverger le fichier de `divisions.json`. Seules les limites "
                "intermediaires — les toumoun pairs — se relisent."
            )

        cible = index_global(sourates, entree["surah"], entree["ayah"])
        assert cible is not None  # deja valide

        precedent = par_numero.get(numero - 1)
        if precedent is not None and cible <= precedent["hafs"]["startAyahId"]:
            raise Refus(
                f"ERREUR : le toumoun {numero} commencerait a {entree['surah']}:"
                f"{entree['ayah']}, qui ne suit pas le debut du toumoun {numero - 1} "
                f"({precedent['hafs']['startSurah']}:{precedent['hafs']['startAyah']}). "
                "Un toumoun contient au moins un verset."
            )

        suivant = par_numero.get(numero + 1)
        if suivant is not None and cible >= suivant["hafs"]["startAyahId"]:
            raise Refus(
                f"ERREUR : le toumoun {numero} commencerait a {entree['surah']}:"
                f"{entree['ayah']}, qui atteint ou depasse le debut du toumoun "
                f"{numero + 1} ({suivant['hafs']['startSurah']}:"
                f"{suivant['hafs']['startAyah']}). Les deux se recouvriraient."
            )


def appliquer(
    donnees: dict, sourates: list[dict], entrees: list[dict], date_relecture: str
) -> list[str]:
    """Applique les corrections en place. Rend le journal de ce qui a change."""
    thumn: list[dict] = donnees["thumn"]
    par_numero = {t["thumnNumber"]: t for t in thumn}
    journal: list[str] = []

    for entree in entrees:
        numero = entree["thumnNumber"]
        toumoun = par_numero[numero]
        hafs = toumoun["hafs"]
        ancienne = f"{hafs['startSurah']}:{hafs['startAyah']}"

        toumoun["relecture"] = {
            "le": date_relecture,
            "statut": entree["statut"],
            "note": entree["note"],
            "origine": toumoun.get("source"),
        }
        toumoun["verificationStatus"] = STATUT_RELUE

        if entree["statut"] == "confirmee":
            journal.append(f"  toumoun {numero:3d} : confirmee, limite {ancienne} inchangee")
            continue

        # La limite est le premier verset du toumoun : c'est cette valeur que
        # porte le statut, et c'est elle que le relecteur a lue.
        hafs["startSurah"] = entree["surah"]
        hafs["startAyah"] = entree["ayah"]
        hafs["startAyahId"] = index_global(sourates, entree["surah"], entree["ayah"])
        toumoun["source"] = (
            f"relecture humaine sur moushaf Hafs imprime, le {date_relecture}"
        )

        # Et le precedent, qui finit juste avant. Sans cela la chaine porterait
        # un trou ou un recouvrement.
        precedent = par_numero.get(numero - 1)
        if precedent is not None:
            fin_id = hafs["startAyahId"] - 1
            borne = borne_de_index(sourates, fin_id)
            assert borne is not None
            precedent["hafs"]["endSurah"] = borne[0]
            precedent["hafs"]["endAyah"] = borne[1]
            precedent["hafs"]["endAyahId"] = fin_id

        journal.append(
            f"  toumoun {numero:3d} : corrigee, limite {ancienne} -> "
            f"{entree['surah']}:{entree['ayah']}"
            + (f" (le toumoun {numero - 1} finit desormais juste avant)" if precedent else "")
        )

    return journal


def recalculer_resume(donnees: dict) -> None:
    """Remet le resume des metadonnees d'accord avec les donnees.

    Le rapport engendre compare les deux ; un desaccord le ferait tomber. Le
    resume est donc recalcule, et non retouche a la main.
    """
    from collections import Counter

    compte = Counter(t["verificationStatus"] for t in donnees["thumn"])
    donnees["metadata"]["verificationSummary"] = {
        statut: f"{compte.get(statut, 0)} / {TOTAL_TOUMOUN} ({libelle})"
        for statut, libelle in LIBELLES_RESUME.items()
    }


def ecrire_json(chemin: Path, donnees: dict) -> None:
    """Ecrit comme le generateur : indent 2, non-ASCII litteral, fins de ligne LF.

    `newline="\\n"` n'est pas cosmetique. Sans lui, Python traduit les fins de
    ligne a l'ecriture et le fichier sort en CRLF sous Windows contre LF
    ailleurs : la copie du tableau de bord, qui est comparee par empreinte,
    divergerait de l'original pour cette seule raison.
    """
    chemin.write_text(
        json.dumps(donnees, ensure_ascii=False, indent=2),
        encoding="utf-8",
        newline="\n",
    )


def lancer(script: Path, *arguments: str) -> tuple[int, str]:
    resultat = subprocess.run(
        [sys.executable, str(script), *arguments],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def main() -> int:
    arguments = [a for a in sys.argv[1:] if not a.startswith("--")]
    essai = "--essai" in sys.argv[1:]

    if len(arguments) != 1:
        raise Refus(
            "Usage : python data/quran/appliquer_corrections.py "
            "corrections_toumoun.json [--essai]"
        )

    chemin_corrections = Path(arguments[0])
    if not chemin_corrections.is_absolute():
        chemin_corrections = RACINE / chemin_corrections

    donnees = charger(THUMN)
    sourates = charger(SOURATES)
    fichier = charger(chemin_corrections)

    assert isinstance(donnees, dict)
    assert isinstance(sourates, list)

    octets_thumn = THUMN.read_bytes()
    octets_rapport = RAPPORT.read_bytes() if RAPPORT.exists() else None
    empreinte = hashlib.sha256(octets_thumn).hexdigest()
    print(f"donnees   : {THUMN.relative_to(RACINE)} ({len(octets_thumn)} octets)")
    print(f"empreinte : sha256 {empreinte}")

    # Le fichier a ete exporte contre un etat precis des donnees. Si elles ont
    # bouge depuis, les bornes voisines ont pu changer, et une correction
    # validee sur l'ancien etat ne l'est plus forcement sur le nouveau.
    annoncee = fichier.get("sourceEmpreinte")
    if annoncee != empreinte:
        raise Refus(
            "ERREUR : le fichier de corrections a ete exporte contre un autre etat "
            f"des donnees.\n  empreinte attendue par le fichier : {annoncee}\n"
            f"  empreinte des donnees actuelles    : {empreinte}\n"
            "Les bornes voisines ont pu changer : reexporter depuis le tableau de "
            "bord, ou verifier que les donnees n'ont pas ete regenerees."
        )

    entrees = controler_fichier(fichier, sourates)
    controler_voisines(donnees["thumn"], sourates, entrees)

    date_relecture = str(fichier.get("genereLe") or "date inconnue")
    print(f"relecture : {len(entrees)} entree(s), exportees le {date_relecture}\n")

    journal = appliquer(donnees, sourates, entrees, date_relecture)
    recalculer_resume(donnees)
    for ligne in journal:
        print(ligne)
    print()

    if essai:
        print("Essai : les controles sont rejoues, puis tout est rendu en place.\n")

    echec: str | None = None
    try:
        ecrire_json(THUMN, donnees)

        code, sortie = lancer(ICI / "verifier_divisions.py")
        if code != 0:
            echec = "le pavage des divisions ne tient plus"
        else:
            code, sortie = lancer(ICI / "verifier_pages.py")
            if code != 0:
                echec = "la pagination ne tient plus"
            else:
                # Le rapport est engendre depuis les donnees : il doit etre
                # reecrit, sinon `verifier:rapport` signalerait une derive que
                # ce script vient lui-meme de creer.
                code, sortie = lancer(ICI / "rapport_divisions_estimees.py")
                if code != 0:
                    echec = "le rapport des bornes estimees n'a pas pu etre reengendre"
                else:
                    code, sortie = lancer(ICI / "rapport_divisions_estimees.py", "--verifier")
                    if code != 0:
                        echec = "le rapport reengendre ne s'accorde pas avec les donnees"
    except Exception:
        THUMN.write_bytes(octets_thumn)
        if octets_rapport is not None:
            RAPPORT.write_bytes(octets_rapport)
        raise
    finally:
        if echec is not None or essai:
            THUMN.write_bytes(octets_thumn)
            if octets_rapport is not None:
                RAPPORT.write_bytes(octets_rapport)
            else:
                RAPPORT.unlink(missing_ok=True)

    if echec is not None:
        print("ECHEC :", echec)
        print(sortie[-2000:])
        print(
            f"\nRien n'a ete ecrit. {THUMN.name} et le rapport sont rendus a l'octet "
            f"pres (sha256 {hashlib.sha256(THUMN.read_bytes()).hexdigest()})."
        )
        return 1

    if essai:
        print("Essai concluant : les corrections passeraient tous les controles.")
        print(f"Rien n'a ete ecrit (sha256 rendu : {hashlib.sha256(THUMN.read_bytes()).hexdigest()}).")
        return 0

    print(f"{THUMN.relative_to(RACINE)} ecrit.")
    print(f"{RAPPORT.relative_to(RACINE)} reengendre.")
    print(
        "\nA faire ensuite :\n"
        "  - `npm run verifier:donnees` et `npm test` cote application ;\n"
        "  - `node admin/scripts/synchroniser-donnees.mjs` pour reporter les donnees\n"
        "    dans le tableau de bord, qui en garde une copie empreinte."
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Refus as refus:
        print(refus)
        sys.exit(1)
