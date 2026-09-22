#!/usr/bin/env python3
"""Falsifie le controle de derive du rapport des bornes estimees.

Quatre cas, chacun devant faire echouer le controle pour la bonne raison, puis
restauration verifiee par empreinte SHA-256 — jamais par git diff, qui ne voit
rien quand .gitattributes normalise en eol=lf.

Deux regles de methode, apprises en ecrivant ce fichier.

1. **La sauvegarde porte sur les OCTETS, pas sur les donnees.** Une premiere
   version relisait le JSON et le reecrivait apres mutation : la restauration
   etait fidele au *sens* mais pas a l'octet, et l'empreinte le disait. Un
   fichier de donnees versionne se sauvegarde brut et se restaure brut.

2. **Une mutation se compte avant de s'ecrire.** Si le motif cherche n'est pas
   trouve — fichier reecrit entre-temps, format change — la substitution ne fait
   rien, le controle reste vert, et l'on conclut a tort que le controle est
   fautif. Chaque mutation exige donc un nombre d'occurrences exact.

Usage :
    python3 scripts/falsifier_rapport.py
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
DOC = RACINE / "docs" / "divisions-estimees.md"
DONNEES = RACINE / "data" / "quran" / "thumn_hafs.json"
SCRIPT = "data/quran/rapport_divisions_estimees.py"

STATUT_ESTIME = b'"verificationStatus": "estimated_offset"'
RESUME_ESTIME = b'"estimated_offset": "151 / 480'

echecs: list[str] = []


def empreinte(chemin: Path) -> str:
    return hashlib.sha256(chemin.read_bytes()).hexdigest()


def lancer() -> int:
    return subprocess.run(
        [sys.executable, SCRIPT, "--verifier"], cwd=RACINE, capture_output=True
    ).returncode


def cas(nom: str, doit_echouer: bool) -> None:
    code = lancer()
    ok = (code != 0) if doit_echouer else (code == 0)
    print(f"{'OK  ' if ok else 'ECHEC'} {nom} — code {code}")
    if not ok:
        echecs.append(nom)


def substituer(chemin: Path, avant: bytes, apres: bytes, occurrences: int) -> bool:
    """Remplace dans le fichier, en exigeant le nombre d'occurrences annonce."""
    contenu = chemin.read_bytes()
    trouvees = contenu.count(avant)
    if trouvees != occurrences:
        print(
            f"ECHEC mutation impossible dans {chemin.name} : "
            f"{trouvees} occurrence(s) de {avant!r}, {occurrences} attendue(s)"
        )
        echecs.append(f"mutation introuvable dans {chemin.name}")
        return False
    chemin.write_bytes(contenu.replace(avant, apres, 1))
    return True


def main() -> int:
    doc_origine = DOC.read_bytes()
    donnees_origine = DONNEES.read_bytes()
    empreinte_doc = hashlib.sha256(doc_origine).hexdigest()
    empreinte_donnees = hashlib.sha256(donnees_origine).hexdigest()

    print("=== Etat initial ===")
    cas("le document du depot est a jour", doit_echouer=False)

    print()
    print("=== Mutation 1 : le document derive des donnees ===")
    DOC.write_bytes(doc_origine + b"\n<!-- derive -->\n")
    cas("un document modifie est refuse", doit_echouer=True)
    DOC.write_bytes(doc_origine)
    print(f"OK   document restaure ({'identique a l octet' if empreinte(DOC) == empreinte_doc else 'DIFFERENT'})")
    if empreinte(DOC) != empreinte_doc:
        echecs.append("restauration du document")

    print()
    print("=== Mutation 2 : une borne estimee devient verifiee ===")
    if substituer(DONNEES, STATUT_ESTIME, b'"verificationStatus": "verified"', 151):
        # Le document, lui, n'a pas bouge : les donnees et le rapport divergent.
        cas("une donnee modifiee sans regenerer le document est refusee", doit_echouer=True)
    DONNEES.write_bytes(donnees_origine)

    print()
    print("=== Mutation 3 : le resume des metadonnees ment ===")
    if substituer(DONNEES, RESUME_ESTIME, b'"estimated_offset": "999 / 480', 1):
        # Ici les donnees sont coherentes entre elles, mais le resume inscrit
        # dans les metadonnees ne l'est plus : c'est l'accord entre deux
        # endroits qui portent la meme verite sans pouvoir se lire.
        cas("un resume en desaccord avec les donnees est refuse", doit_echouer=True)
    DONNEES.write_bytes(donnees_origine)

    print()
    print("=== Mutation 4 : une borne estimee sur un debut de rub' ===")
    if substituer(DONNEES, b'"isRubStart": false', b'"isRubStart": true', 240):
        cas("une borne de rub' marquee estimee est refusee", doit_echouer=True)
    DONNEES.write_bytes(donnees_origine)

    print()
    print("=== Restauration ===")
    for chemin, origine, attendue, nom in (
        (DOC, doc_origine, empreinte_doc, "document"),
        (DONNEES, donnees_origine, empreinte_donnees, "donnees"),
    ):
        chemin.write_bytes(origine)
        obtenue = empreinte(chemin)
        if obtenue != attendue:
            print(f"ECHEC {nom} : {obtenue[:16]} != {attendue[:16]}")
            echecs.append(f"restauration du {nom}")
        else:
            print(f"OK   {nom} identique a l'octet ({obtenue[:16]})")
    cas("le controle repasse apres restauration", doit_echouer=False)

    print()
    if echecs:
        print(f"{len(echecs)} cas en echec : {echecs}")
        return 1
    print("Toutes les mutations sont detectees, et les restaurations sont exactes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
