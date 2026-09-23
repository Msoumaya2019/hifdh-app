#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Rejoue en local les etapes du flux de verification, DANS L'ORDRE du flux.

L'ORDRE EST EXTRAIT de `.github/workflows/ci.yml`, jamais ecrit ici.

C'est la correction d'un defaut reel. La version precedente portait une liste
recopiee a la main, et elle avait derive dans les deux sens : elle rejouait une
etape qui n'existait pas dans le flux, et elle en avait oublie deux — dont le
garde-fou de `LecteurPageMoushaf.tsx`, precisement le fichier que la session
venait de modifier. Rien ne le disait : le script annoncait « vert ».

Trois proprietes sont recherchees, et aucune n'est optionnelle :

  - l'ordre vient du fichier de flux ;
  - on ne s'arrete PAS au premier echec. Une liste abregée fait sauter l'etape
    qui garde le fichier qu'on vient de modifier ;
  - toute etape `run:` du flux est rejouee, SAUF si une regle d'exclusion
    explicite la vise. Une etape non visee est rejouee par defaut, donc un ajout
    a `ci.yml` ne peut pas passer inapercu.

Le journal COMPLET va dans un fichier, et son chemin est affiche. La version
precedente ecrivait sur la sortie standard, qu'un `| tail -70` tronquait : les
deux echecs d'un rejeu de trente-six minutes ont ete perdus de cette facon, et il
a fallu tout rejouer pour les nommer.

Usage :  python scripts/rejouer_ci_local.py
"""

import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# La racine se deduit de l'emplacement du fichier, jamais d'un chemin absolu :
# ce depot est public, et un chemin de machine n'y a rien a faire.
RACINE = Path(__file__).resolve().parent.parent
FLUX = RACINE / ".github" / "workflows" / "ci.yml"
JOURNAL = Path(tempfile.gettempdir()) / "hifdh-ci-local.log"

# Ce qui est ecarte, et POURQUOI. Toute etape non visee ici est rejouee.
ECARTEES = [
    (
        r"^npm ci$",
        "les dependances n'ont pas bouge : reinstaller remplacerait un node_modules sain "
        "par un autre, sans rien prouver de plus",
    ),
    (
        r"npm run build",
        "la construction du tableau de bord exige les variables de depot, qui n'existent "
        "que sur GitHub — son echec local ne dirait rien du code",
    ),
]

# Le bac a sable de cette machine refuse une suppression en masse. Deux etapes
# d'empaquetage ecrivent un dossier d'export et le vident d'abord : elles
# tombent sur ce refus, qui n'a rien a voir avec le code. Les confondre avec un
# echec ferait perdre une heure, et les presenter comme vertes serait un
# mensonge : elles forment donc un troisieme verdict, distinct des deux autres.
MARQUEURS_BAC_A_SABLE = (
    "SAFE_DELETE_BULK_CONFIRM_REQUIRED",
    "SANDBOX PERMISSION DENIED",
)


def extraire_etapes() -> list[dict]:
    """Rend les etapes `run:` du flux, dans l'ordre, avec leur job et leur repertoire.

    Le lecteur suit la forme reelle du fichier : un job commence a deux espaces,
    une etape a six, son `run:` a huit, et un bloc multiligne a dix. Un `uses:`
    n'a pas de `run:` et n'est donc pas une etape a rejouer.
    """
    lignes = FLUX.read_text(encoding="utf-8").splitlines()
    etapes: list[dict] = []
    job = None
    repertoire = None
    dans_steps = False
    i = 0

    while i < len(lignes):
        ligne = lignes[i]

        job_vu = re.match(r"^  ([A-Za-z0-9_-]+):\s*$", ligne)
        if job_vu:
            job = job_vu.group(1)
            repertoire = None
            dans_steps = False

        if re.match(r"^    defaults:\s*$", ligne):
            j = i + 1
            while j < len(lignes) and (lignes[j].startswith("      ") or not lignes[j].strip()):
                trouve = re.match(r"^\s+working-directory:\s*(\S+)", lignes[j])
                if trouve:
                    repertoire = trouve.group(1)
                j += 1

        if re.match(r"^    steps:\s*$", ligne):
            dans_steps = True

        if dans_steps:
            nom_vu = re.match(r"^      - name:\s*(.+?)\s*$", ligne)
            if nom_vu:
                nom = nom_vu.group(1)
                j = i + 1
                commande = None
                while j < len(lignes) and not re.match(r"^      - ", lignes[j]):
                    run_vu = re.match(r"^        run:\s*(.*)$", lignes[j])
                    if run_vu:
                        reste = run_vu.group(1).strip()
                        if reste in ("|", ">", "|-", ">-"):
                            bloc = []
                            k = j + 1
                            while k < len(lignes) and (
                                lignes[k].startswith("          ") or not lignes[k].strip()
                            ):
                                if lignes[k].strip():
                                    bloc.append(lignes[k].strip())
                                k += 1
                            commande = "\n".join(bloc)
                        elif reste:
                            commande = reste
                        break
                    j += 1
                if commande:
                    etapes.append(
                        {"job": job, "nom": nom, "repertoire": repertoire, "commande": commande}
                    )
                i = j

        i += 1

    return etapes


def motif_exclusion(commande: str) -> str | None:
    for motif, raison in ECARTEES:
        if re.search(motif, commande):
            return raison
    return None


def refus_du_bac_a_sable(sortie: str) -> bool:
    return any(m in sortie for m in MARQUEURS_BAC_A_SABLE)


def main() -> int:
    if not FLUX.exists():
        raise SystemExit(f"flux introuvable : {FLUX}")

    etapes = extraire_etapes()
    if not etapes:
        raise SystemExit("aucune etape `run:` extraite : le lecteur du flux ne lit plus rien")

    print(f"Flux : {FLUX.relative_to(RACINE)}")
    print(f"{len(etapes)} etape(s) `run:` extraite(s), dans l'ordre du flux.")
    print(f"Journal complet : {JOURNAL}")
    print()

    journal = JOURNAL.open("w", encoding="utf-8")
    journal.write(f"Rejeu de {FLUX}\n{len(etapes)} etapes extraites\n")

    vertes, ecartees, refusees, echecs = 0, 0, 0, 0

    for etape in etapes:
        commande = etape["commande"]
        entete = f"{etape['nom']}   [{etape['job']}]"

        raison = motif_exclusion(commande)
        if raison:
            ecartees += 1
            print(f"  ecartee    {entete}\n             {raison}")
            journal.write(f"\n### ECARTEE  {entete}\n    raison : {raison}\n    $ {commande}\n")
            continue

        cwd = RACINE / etape["repertoire"] if etape["repertoire"] else RACINE
        print(f"  en cours   {entete} ... ", end="", flush=True)

        debut = time.time()
        # `bash -c` explicitement : sous Windows, `shell=True` appellerait
        # cmd.exe, et les blocs multilignes du flux sont ecrits en bash.
        resultat = subprocess.run(
            ["bash", "-c", commande],
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        duree = time.time() - debut
        sortie = (resultat.stdout or "") + (resultat.stderr or "")

        journal.write(f"\n=== {entete}\n    $ {commande}\n    code {resultat.returncode} ({duree:.0f} s)\n")
        journal.write(sortie)

        if resultat.returncode == 0:
            vertes += 1
            print(f"OK ({duree:.0f} s)")
        elif refus_du_bac_a_sable(sortie):
            refusees += 1
            print(f"REFUSEE PAR LE BAC A SABLE ({duree:.0f} s) — a rejouer hors bac a sable")
            journal.write("    -> REFUSEE PAR LE BAC A SABLE (artefact d'environnement, pas un echec)\n")
        else:
            echecs += 1
            print(f"ECHEC ({duree:.0f} s)")
            journal.write("    -> ECHEC\n")
            for ligne in sortie.strip().splitlines()[-25:]:
                print(f"             {ligne}")
                journal.write(f"       {ligne}\n")

    journal.close()

    print()
    print("=" * 60)
    print(f"  {vertes} verte(s), {ecartees} ecartee(s), {refusees} refusee(s) par le bac a sable,")
    print(f"  {echecs} echec(s)   —   journal : {JOURNAL}")
    print("=" * 60)

    if refusees:
        print(
            "  Les etapes refusees par le bac a sable doivent etre rejouees separement :\n"
            "  leur refus est un artefact d'environnement, il ne dit rien du code."
        )

    return 1 if echecs else 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
    raise SystemExit(main())
