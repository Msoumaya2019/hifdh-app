"""Falsifier le test de l'accord avec Firebase.

Un test qui n'a jamais rougi ne prouve rien. On casse, une par une, chacune des
quatre choses que `tests/firebase.test.mjs` pretend tenir, et on exige qu'il
TOMBE — sur le test nomme pour elle, et pas sur un voisin.

DEUX FORMES DE MUTATION, ET POURQUOI
------------------------------------
1. **sur le fichier** : on remplace une valeur dans `app.json` ou dans
   `google-services.json`, on lance, on restaure a l'octet par empreinte ;
2. **sur le disque** : on renomme le fichier declare, pour eprouver le controle
   d'existence.

Temoin : on exige un nombre de tests EXECUTES non nul. `node --test` sort en 0
quand le motif ne designe aucun test — un « succes » vide serait une anomalie.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
NODE = shutil.which("node") or "node"
TEST = "tests/firebase.test.mjs"

APP = RACINE / "app.json"
GS = RACINE / "google-services.json"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def lancer() -> tuple[int, str]:
    """Lancer le test seul, et rendre (code, sortie)."""
    r = subprocess.run(
        [
            NODE,
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            TEST,
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        timeout=120,
    )
    return r.returncode, r.stdout + r.stderr


def compter_executes(sortie: str) -> int:
    """Le nombre de tests REELLEMENT executes.

    On lit la ligne `1..N` du plan, que le coureur ecrit meme quand tout echoue.
    Un motif qui ne designe rien produit un plan a 0, et c'est ce qu'on refuse.
    """
    m = re.search(r"^1\.\.(\d+)$", sortie, re.MULTILINE)
    return int(m.group(1)) if m else -1


def apres(mutation) -> tuple[int, str]:
    """Poser la mutation, lancer, restaurer — et rendre le verdict."""
    etat = mutation()
    try:
        return lancer()
    finally:
        etat()


def main() -> int:
    # --- le temoin : sur l'arbre reel, tout doit etre vert -------------------
    code, sortie = lancer()
    executes = compter_executes(sortie)
    print("=" * 70)
    print("Temoin : le test sur l'arbre reel")
    print("=" * 70)
    print(f"  code {code}, {executes} test(s) execute(s)")
    if code != 0:
        print("[ERR] le test est DEJA en echec : on ne peut rien falsifier")
        print(sortie[-2000:])
        return 1
    if executes <= 0:
        print("[ERR] aucun test n'a ete execute : le harnais ne prouve rien")
        return 1

    # --- les mutations ------------------------------------------------------
    s_app = sha(APP)
    s_gs = sha(GS)

    def muter_paquet_app():
        t = APP.read_text(encoding="utf-8")
        APP.write_text(
            t.replace('"package": "com.hifdh.app"', '"package": "com.hifdh.autre"'),
            encoding="utf-8",
            newline="\n",
        )

        def rendre():
            APP.write_bytes(APP.read_bytes())  # no-op si restaure ci-dessous
            t2 = APP.read_text(encoding="utf-8")
            APP.write_text(
                t2.replace('"package": "com.hifdh.autre"', '"package": "com.hifdh.app"'),
                encoding="utf-8",
                newline="\n",
            )

        return rendre

    def muter_paquet_firebase():
        d = json.loads(GS.read_text(encoding="utf-8"))
        d["client"][0]["client_info"]["android_client_info"]["package_name"] = (
            "com.hifdh.autre"
        )
        GS.write_text(json.dumps(d, indent=2), encoding="utf-8", newline="\n")

        def rendre():
            GS.write_bytes(ORIGINAL_GS)

        return rendre

    def retirer_declaration():
        t = APP.read_text(encoding="utf-8")
        APP.write_text(
            t.replace(',\n      "googleServicesFile": "./google-services.json"\n    },', "\n    },"),
            encoding="utf-8",
            newline="\n",
        )

        def rendre():
            t2 = APP.read_text(encoding="utf-8")
            APP.write_text(
                t2.replace('"package": "com.hifdh.app"\n    },', '"package": "com.hifdh.app",\n      "googleServicesFile": "./google-services.json"\n    },'),
                encoding="utf-8",
                newline="\n",
            )

        return rendre

    def renommer_fichier():
        cache = RACINE / "google-services.json.ecarte"
        GS.rename(cache)

        def rendre():
            cache.rename(GS)

        return rendre

    def retirer_project_id():
        d = json.loads(GS.read_text(encoding="utf-8"))
        d["project_info"].pop("project_id", None)
        GS.write_text(json.dumps(d, indent=2), encoding="utf-8", newline="\n")

        def rendre():
            GS.write_bytes(ORIGINAL_GS)

        return rendre

    ORIGINAL_GS = GS.read_bytes()

    mutations = [
        (
            "le paquet d'app.json diverge de Firebase",
            "le paquet d’app.json est bien celui enregistré dans Firebase",
            muter_paquet_app,
        ),
        (
            "le paquet de google-services.json diverge d'app.json",
            "le paquet d’app.json est bien celui enregistré dans Firebase",
            muter_paquet_firebase,
        ),
        (
            "app.json ne declare plus le fichier",
            "app.json déclare le fichier Firebase dans le bloc Android",
            retirer_declaration,
        ),
        (
            "le fichier declare a disparu du disque",
            "le fichier Firebase déclaré existe sur le disque",
            renommer_fichier,
        ),
        (
            "le projet Firebase n'a plus d'identifiant",
            "le projet Firebase a un identifiant, et il est lisible",
            retirer_project_id,
        ),
    ]

    print()
    print("=" * 70)
    print(f"{len(mutations)} mutation(s) a eprouver")
    print("=" * 70)

    detectees = 0
    for nom, test_vise, fabrique in mutations:
        code, sortie = apres(fabrique)
        tombe = code != 0
        # Le test vise a-t-il parle ? On le cherche par son nom dans la sortie.
        a_parle = test_vise in sortie
        verdict = "DETECTEE" if (tombe and a_parle) else ("HARNAIS" if not tombe else "ANCRE")
        if verdict == "DETECTEE":
            detectees += 1
        print(f"--- {nom}")
        print(f"    {verdict}  (code {code}, test vise nomme : {a_parle})")
        if verdict != "DETECTEE":
            print(sortie[-1200:])

    # --- l'arbre est-il rendu tel qu'il etait ? -----------------------------
    print()
    print("=" * 70)
    print("Restauration")
    print("=" * 70)
    app_ok = sha(APP) == s_app
    gs_ok = sha(GS) == s_gs
    print(f"  app.json            : {'identique' if app_ok else 'DIFFERENT'}")
    print(f"  google-services.json: {'identique' if gs_ok else 'DIFFERENT'}")
    print(f"  le fichier est en place : {GS.exists()}")

    code, sortie = lancer()
    print(f"  test sur l'arbre restaure : code {code}")
    if code != 0:
        print(sortie[-1500:])

    print()
    if not (app_ok and gs_ok):
        print("RESULTAT : l'arbre n'a PAS ete restaure — a corriger avant tout.")
        return 1
    if code != 0:
        print("RESULTAT : le test echoue apres restauration — l'arbre est suspect.")
        return 1
    print(
        f"RESULTAT : {len(mutations)} mutation(s), {detectees} detectee(s), "
        "arbre restaure."
    )
    return 0 if detectees == len(mutations) else 1


if __name__ == "__main__":
    sys.exit(main())
