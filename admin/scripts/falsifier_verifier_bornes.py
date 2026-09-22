#!/usr/bin/env python3
"""Falsifie `admin/scripts/verifier-bornes.mjs` : chaque mutation doit etre vue.

Le controleur lit les donnees du tableau de bord. On lui presente donc des
donnees volontairement faussees — une a la fois — et l'on verifie qu'il refuse.
Une mutation non detectee signifie que le controle ne prouve rien.

La restauration se prouve par empreinte SHA-256 sur les octets, et non par
`git diff` : le depot normalise les fins de ligne, et une comparaison de texte
ne dirait pas si le fichier est revenu a l'identique.

Usage : python scripts/falsifier_verifier_bornes.py
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
ADMIN = ICI.parent
DONNEES = ADMIN / "src" / "donnees" / "thumn_hafs.json"
VERIFIEUR = ICI / "verifier-bornes.mjs"


def empreinte(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def lancer() -> tuple[int, str]:
    resultat = subprocess.run(
        ["node", str(VERIFIEUR)],
        cwd=ADMIN,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def muter_estimee_ouvre_un_rub(donnees: dict) -> None:
    """Un toumoun estime declare ouvrir un rub' al-hizb.

    C'est le defaut que la correction de convention vise : presenter une borne
    qui vient des donnees Hafs verifiees comme une borne a estimer.
    """
    for t in donnees["thumn"]:
        if t["verificationStatus"] == "estimated_offset":
            t["isRubStart"] = True
            return


def muter_rupture_de_chaine(donnees: dict) -> None:
    """Un toumoun ne commence plus au verset qui suit la fin du precedent."""
    donnees["thumn"][6]["hafs"]["startAyahId"] += 1


def muter_resume(donnees: dict) -> None:
    """Le resume des metadonnees ne dit plus le meme compte que les donnees."""
    resume = donnees["metadata"]["verificationSummary"]
    resume["estimated_offset"] = "150 / 480 (limites intermediaires, sourates differentes)"


def muter_debut_de_rub_deplace(donnees: dict) -> None:
    """Un toumoun impair ne marque plus son debut de rub'."""
    for t in donnees["thumn"]:
        if t["thumnNumber"] == 3:
            t["isRubStart"] = False
            return


MUTATIONS = [
    ("un toumoun estime declare ouvrir un rub'", muter_estimee_ouvre_un_rub, "estime(s) ouvrent un rub"),
    ("la chaine des toumoun porte une rupture", muter_rupture_de_chaine, "rupture entre les toumoun"),
    ("le resume des metadonnees ment sur le compte", muter_resume, "verificationSummary"),
    ("un debut de rub' n'est plus marque", muter_debut_de_rub_deplace, "debut(s) de rub' pour"),
]


def main() -> int:
    if not DONNEES.exists():
        print(f"ABSENT : {DONNEES}")
        return 1

    original = DONNEES.read_bytes()
    attendue = empreinte(DONNEES)

    # Temoin : sur les donnees intactes, le controle doit passer. Sans cette
    # etape, un controle deja casse serait compte comme detectant tout.
    code, sortie = lancer()
    if code != 0:
        print("ECHEC : le controle ne passe pas sur les donnees intactes.")
        print(sortie[-1500:])
        return 1
    print("temoin : le controle passe sur les donnees intactes\n")

    non_detectees = []
    try:
        for nom, mutation, motif in MUTATIONS:
            DONNEES.write_bytes(original)
            donnees = json.loads(original.decode("utf-8"))
            mutation(donnees)
            DONNEES.write_text(
                json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8", newline="\n"
            )

            code, sortie = lancer()
            detectee = code != 0 and motif in sortie
            print(f"{'DETECTE    ' if detectee else 'NON DETECTE'}  {nom}")
            if not detectee:
                non_detectees.append(nom)
                print(f"    motif attendu : {motif!r}")
                print("    sortie : " + sortie.strip().replace("\n", "\n    ")[:800])
    finally:
        DONNEES.write_bytes(original)

    obtenue = empreinte(DONNEES)
    restaure = obtenue == attendue
    print(
        f"\nrestauration : {'identique a l octet' if restaure else 'DIFFERENTE'} "
        f"({obtenue[:16]}…)"
    )

    # Les donnees rendues doivent repasser : une restauration qui laisserait un
    # etat intermediaire se verrait ici.
    code, _ = lancer()
    if code != 0:
        print("ECHEC : le controle ne repasse pas apres restauration.")
        restaure = False
    else:
        print("OK     le controle repasse apres restauration")

    print(f"\n{len(MUTATIONS) - len(non_detectees)}/{len(MUTATIONS)} mutations detectees")
    if non_detectees:
        print("Non detectees : " + ", ".join(non_detectees))
    return 0 if not non_detectees and restaure else 1


if __name__ == "__main__":
    sys.exit(main())
