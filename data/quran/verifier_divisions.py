"""Verifie que chaque niveau de division pave exactement le Coran.

Propriete attendue, pour tout niveau (juz, hizb, rub', thumn) :
  - la premiere division commence au verset 1 (1:1) ;
  - la derniere se termine au verset 6236 (114:6) ;
  - la fin d'une division est immediatement suivie par le debut de la suivante :
    aucun trou, aucun recouvrement ;
  - aucune division n'est vide ;
  - la numerotation est continue, de 1 a N.

Une division vide ou une discontinuite signale une borne ecrasee lors de la
derivation : c'est le defaut le plus probable, et il resterait invisible a l'oeil
dans l'application.

Usage :
    python verifier_divisions.py
"""

import json
import sys
import io
import pathlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ICI = pathlib.Path(__file__).parent
TOTAL_VERSETS = 6236


def charger():
    divisions = json.loads((ICI / "divisions.json").read_text(encoding="utf-8"))
    thumn = json.loads((ICI / "thumn_hafs.json").read_text(encoding="utf-8"))
    return divisions, thumn


def verifier(nom, attendu, bornes):
    """bornes : liste de (numero, startAyahId, endAyahId)."""
    problemes = []

    if len(bornes) != attendu:
        problemes.append(f"{len(bornes)} divisions au lieu de {attendu}")

    for i, (num, debut, fin) in enumerate(bornes):
        if num != i + 1:
            problemes.append(f"division d'indice {i} numerotee {num}")

    if bornes and bornes[0][1] != 1:
        problemes.append(f"la premiere commence au verset {bornes[0][1]}, pas 1")
    if bornes and bornes[-1][2] != TOTAL_VERSETS:
        problemes.append(f"la derniere finit au verset {bornes[-1][2]}, pas {TOTAL_VERSETS}")

    vides = [b for b in bornes if b[2] < b[1]]
    for num, debut, fin in vides[:5]:
        problemes.append(f"division {num} vide ou inversee : {debut} -> {fin}")

    trous = []
    for i in range(len(bornes) - 1):
        fin = bornes[i][2]
        debut = bornes[i + 1][1]
        if debut != fin + 1:
            trous.append((bornes[i][0], bornes[i + 1][0], fin, debut))
    for a, b, fin, debut in trous[:5]:
        problemes.append(
            f"discontinuite entre {a} et {b} : fin={fin}, debut suivant={debut} "
            f"(ecart {debut - fin - 1})"
        )

    etat = "OK " if not problemes else "ECHEC"
    print(f"[{etat}] {nom:<8} {len(bornes):>3} divisions, "
          f"{len(vides)} vide(s), {len(trous)} discontinuite(s)")
    for p in problemes[:8]:
        print("         -", p)
    return not problemes


def verifier_imbrication(divisions, thumn):
    """Les niveaux doivent s'emboiter : 4 rub' par hizb, 8 thumn par hizb."""
    problemes = []
    rubs = divisions["rub"]

    for i, r in enumerate(rubs):
        attendu = (i // 4) + 1
        if r["hizbNumber"] != attendu:
            problemes.append(f"rub {r['rubNumber']} rattache au hizb {r['hizbNumber']}, attendu {attendu}")

    for i, t in enumerate(thumn["thumn"]):
        attendu = (i // 8) + 1
        if t["hizbNumber"] != attendu:
            problemes.append(f"thumn {t['thumnNumber']} rattache au hizb {t['hizbNumber']}, attendu {attendu}")
        attendu_rub = (i // 2) + 1
        if t["rubNumber"] != attendu_rub:
            problemes.append(f"thumn {t['thumnNumber']} rattache au rub {t['rubNumber']}, attendu {attendu_rub}")

    # Les thumn marques isRubStart doivent correspondre aux debuts de rub'.
    debuts_rub = {r["start"]["ayahId"] for r in rubs}
    marques = {t["hafs"]["startAyahId"] for t in thumn["thumn"] if t["isRubStart"]}
    if marques != debuts_rub:
        manquants = sorted(debuts_rub - marques)
        en_trop = sorted(marques - debuts_rub)
        if manquants:
            problemes.append(f"{len(manquants)} debut(s) de rub' sans thumn isRubStart : {manquants[:5]}")
        if en_trop:
            problemes.append(f"{len(en_trop)} thumn isRubStart hors debut de rub' : {en_trop[:5]}")

    etat = "OK " if not problemes else "ECHEC"
    print(f"[{etat}] imbrication rub'/hizb/thumn ({len(problemes)} probleme(s))")
    for p in problemes[:8]:
        print("         -", p)
    return not problemes


def verifier_sourates(divisions, thumn):
    """Les bornes doivent tomber dans des versets qui existent."""
    surahs = json.loads((ICI / "surahs.json").read_text(encoding="utf-8"))
    problemes = []

    def controle(nom, sourate, verset):
        if not (1 <= sourate <= 114):
            problemes.append(f"{nom} : sourate {sourate} hors bornes")
            return
        attendu = surahs[sourate - 1]["ayahCount"]
        if not (1 <= verset <= attendu):
            problemes.append(f"{nom} : verset {sourate}:{verset} inexistant (max {attendu})")

    for niveau in ("juz", "hizb", "rub"):
        for d in divisions[niveau]:
            controle(f"{niveau} {d[niveau + 'Number'] if niveau != 'rub' else d['rubNumber']} debut",
                     d["start"]["surah"], d["start"]["ayah"])
            controle(f"{niveau} fin", d["end"]["surah"], d["end"]["ayah"])

    for t in thumn["thumn"]:
        controle(f"thumn {t['thumnNumber']} debut", t["hafs"]["startSurah"], t["hafs"]["startAyah"])
        controle(f"thumn {t['thumnNumber']} fin", t["hafs"]["endSurah"], t["hafs"]["endAyah"])

    etat = "OK " if not problemes else "ECHEC"
    print(f"[{etat}] bornes dans des versets existants ({len(problemes)} probleme(s))")
    for p in problemes[:8]:
        print("         -", p)
    return not problemes


def verifier_continuite_sourates(divisions):
    """Un saut de sourate ne doit pas sauter de verset : fin de sourate -> debut suivante."""
    surahs = json.loads((ICI / "surahs.json").read_text(encoding="utf-8"))
    problemes = []

    # Les ayahId doivent suivre l'ordre des sourates sans trou.
    precedent = 0
    for s in surahs:
        if s["startAyahId"] != precedent + 1:
            problemes.append(f"sourate {s['number']} : startAyahId {s['startAyahId']} apres {precedent}")
        precedent = s["startAyahId"] + s["ayahCount"] - 1
    if precedent != TOTAL_VERSETS:
        problemes.append(f"dernier ayahId = {precedent}, attendu {TOTAL_VERSETS}")

    etat = "OK " if not problemes else "ECHEC"
    print(f"[{etat}] continuite des sourates ({len(problemes)} probleme(s))")
    for p in problemes[:8]:
        print("         -", p)
    return not problemes


def main():
    divisions, thumn = charger()

    print("=== Pavage des divisions ===")
    resultats = [
        verifier("juz", 30, [(d["juzNumber"], d["start"]["ayahId"], d["end"]["ayahId"])
                             for d in divisions["juz"]]),
        verifier("hizb", 60, [(d["hizbNumber"], d["start"]["ayahId"], d["end"]["ayahId"])
                              for d in divisions["hizb"]]),
        verifier("rub", 240, [(d["rubNumber"], d["start"]["ayahId"], d["end"]["ayahId"])
                              for d in divisions["rub"]]),
        verifier("thumn", 480, [(t["thumnNumber"], t["hafs"]["startAyahId"], t["hafs"]["endAyahId"])
                                for t in thumn["thumn"]]),
    ]

    print()
    print("=== Coherence ===")
    resultats.append(verifier_imbrication(divisions, thumn))
    resultats.append(verifier_sourates(divisions, thumn))
    resultats.append(verifier_continuite_sourates(divisions))

    print()
    if all(resultats):
        print("RESULTAT : toutes les verifications passent.")
        return 0
    print(f"RESULTAT : {resultats.count(False)} verification(s) en echec.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
