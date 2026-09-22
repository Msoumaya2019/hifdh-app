"""Prouve que les controles de pagination detectent reellement un defaut.

Un controle qui n'a jamais echoue ne prouve rien : il peut regarder a cote. Ce
script mutile la donnee de pagination, lance les controles, et exige qu'ils
tombent. Puis il restaure le fichier et verifie la restauration par empreinte
SHA-256 — jamais par `git diff`, qui depend de la configuration de fin de ligne.

Ce qui est mutile, et ce que cela doit declencher :

  1. une borne deplacee d'un verset  -> bornes connues et traversee de page ;
  2. une page supprimee              -> page sautee ;
  3. un numero de page qui recule    -> recul ;
  4. la premiere page decalee        -> bornes connues ;
  5. un juz' decale                  -> coherence du juz'.

Le fichier se reecrit a l'octet pres avec les memes separateurs que
`import_tanzil_text.py` : la mutation est donc exactement reversible.

Usage :
    python scripts/falsifier_pages.py
"""

import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
DONNEES = RACINE / "data" / "quran" / "quran_text_uthmani.json"
TEST = "tests/pages.test.mjs"
SEPARATEURS = (",", ":")


def node() -> str:
    return shutil.which("node") or "node"


def lire() -> list:
    return json.loads(DONNEES.read_text(encoding="utf-8"))


def ecrire(versets: list) -> None:
    DONNEES.write_bytes(
        json.dumps(versets, ensure_ascii=False, separators=SEPARATEURS).encode("utf-8")
    )


def trouver(versets: list, sourate: int, ayah: int) -> dict:
    for verset in versets:
        if verset["surah"] == sourate and verset["ayah"] == ayah:
            return verset
    raise KeyError(f"{sourate}:{ayah} introuvable")


def lancer_controles() -> tuple[int, str]:
    resultat = subprocess.run(
        [
            node(),
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            TEST,
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def mutations():
    """Rend (nom, description, mutation, fragment du controle attendu).

    Le fragment nomme le controle qui doit tomber. Sans lui, une mutation
    pourrait etre « detectee » par un controle sans rapport, et on croirait
    verifie ce qui ne l'est pas.
    """

    def borne_deplacee(versets):
        # 29:46 passe sur la page 401 : la page 401 porte alors 8 versets, et la
        # frontiere ne correspond plus a la page imprimee.
        trouver(versets, 29, 46)["page"] = 401

    def page_supprimee(versets):
        # La page 300 disparait : ses versets rejoignent la 299.
        for verset in versets:
            if verset["page"] == 300:
                verset["page"] = 299

    def page_qui_recule(versets):
        trouver(versets, 18, 1)["page"] = 300

    def premiere_page_decalee(versets):
        trouver(versets, 1, 7)["page"] = 2

    def juz_decale(versets):
        trouver(versets, 29, 39)["juz"] = 21

    return [
        ("borne deplacee", "29:46 ramene sur la page 401", borne_deplacee,
         "la page 401 est celle de la photo"),
        ("page supprimee", "la page 300 est absorbee par la 299", page_supprimee,
         "la pagination couvre les 6 236 versets"),
        ("page qui recule", "18:1 renvoye page 300", page_qui_recule,
         "la pagination couvre les 6 236 versets"),
        ("premiere page decalee", "1:7 renvoye page 2", premiere_page_decalee,
         "les bornes connues du moushaf"),
        ("juz' decale", "29:39 annonce juz 21 au lieu de 20", juz_decale,
         "le juz"),
    ]


def main() -> None:
    if not DONNEES.exists():
        sys.exit(f"ERREUR : {DONNEES} est absent")
    if not (RACINE / TEST).exists():
        sys.exit(f"ERREUR : {TEST} est absent")

    octets = DONNEES.read_bytes()
    empreinte = hashlib.sha256(octets).hexdigest()
    print(f"reference : {len(octets)} octets, sha256 {empreinte}")

    code, sortie = lancer_controles()
    if code != 0:
        print("Les controles sont deja en echec avant toute mutation :")
        print(sortie[-2000:])
        sys.exit(1)
    print("controles verts avant mutation : oui\n")

    echecs = []
    try:
        for nom, description, muter, attendu in mutations():
            # Chaque mutation part du fichier d'origine : sans cette remise a
            # zero, elles s'empileraient et une mutation pourrait etre « detectee »
            # par l'effet de la precedente, sans que son propre controle regarde
            # quoi que ce soit. C'est mesure, pas suppose : la premiere version de
            # ce script restaurait seulement a la fin, et la mutation du juz'
            # tombait alors a cause des mutations de pages.
            DONNEES.write_bytes(octets)

            versets = lire()
            muter(versets)
            ecrire(versets)

            code, sortie = lancer_controles()
            tombes = [
                ligne.strip()
                for ligne in sortie.splitlines()
                if ligne.strip().startswith("not ok")
            ]
            detecte = code != 0
            par_le_bon = any(attendu in ligne for ligne in tombes)

            if detecte and par_le_bon:
                print(f"OK     {nom}  — {description}")
                for ligne in tombes[:3]:
                    print(f"         {ligne}")
            elif detecte:
                print(f"ECHEC  {nom}  — {description}")
                print(f"         detecte, mais pas par le controle attendu « {attendu} » :")
                for ligne in tombes[:3]:
                    print(f"         {ligne}")
                echecs.append(f"{nom} (mauvais controle)")
            else:
                print(f"ECHEC  {nom}  — {description}")
                print("         AUCUN controle n'est tombe")
                echecs.append(f"{nom} (non detectee)")
    finally:
        DONNEES.write_bytes(octets)
        restauree = hashlib.sha256(DONNEES.read_bytes()).hexdigest()
        print(f"\nrestauration : sha256 {restauree}")
        if restauree != empreinte:
            print("ECHEC  la restauration ne rend pas le fichier d'origine")
            sys.exit(1)
        print("OK     le fichier est rendu a l'identique")

    code, _ = lancer_controles()
    if code != 0:
        print("ECHEC  les controles restent en echec apres restauration")
        sys.exit(1)
    print("OK     les controles repassent au vert")

    if echecs:
        print(f"\nECHEC  {len(echecs)} mutation(s) non detectee(s) : " + " ; ".join(echecs))
        sys.exit(1)
    print(f"\nOK     les {len(mutations())} mutations sont detectees")


if __name__ == "__main__":
    main()
