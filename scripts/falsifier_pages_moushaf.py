# -*- coding: utf-8 -*-
"""Falsifier le verificateur de la source des pages.

Un controle qui n'a jamais rougi ne prouve rien. On mute chaque invariant que
`verifier_pages_moushaf.py` pretend tenir, et on exige qu'il TOMBE sur chacun.
On restaure ensuite par empreinte SHA-256 (jamais par `git diff`, qui subit
`eol=lf`).

Le temoin du harnais : chaque execution doit LANCER le programme et lire un
resultat. Un « succes » vide serait une anomalie.
"""
import hashlib
import subprocess
import sys
from pathlib import Path

# La racine se deduit de l'emplacement du fichier, jamais d'un chemin absolu :
# ce depot est public, et un chemin de machine n'y a rien a faire.
RACINE = Path(__file__).resolve().parent.parent
# `sys.executable` : le meme interpreteur que celui qui lance ce script.
PYTHON = sys.executable
VERIF = "scripts/verifier_pages_moushaf.py"

SOURCE = RACINE / "src/lib/pagesMoushaf.ts"
LECTEUR = RACINE / "src/components/LecteurPageMoushaf.tsx"
AUTRE = RACINE / "src/lib/progress.ts"
CACHE = RACINE / "src/lib/cachePagesMoushaf.ts"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def lancer() -> tuple[int, str]:
    r = subprocess.run([PYTHON, VERIF], cwd=RACINE, capture_output=True, text=True, timeout=120)
    sortie = r.stdout + r.stderr
    if not sortie.strip():
        raise SystemExit("le verificateur n'a RIEN produit : un succes vide est une anomalie")
    return r.returncode, sortie


MUTATIONS = [
    (
        "le nombre de pages annonce est faux",
        SOURCE, "nombreDePages: 604", "nombreDePages: 603",
    ),
    (
        "la borne haute est retiree de getMushafPageImage",
        SOURCE,
        "if (page < 1 || page > SOURCE_PAGES.nombreDePages) return null;",
        "if (page < 1) return null;",
    ),
    (
        "l'URL est recopiee dans le lecteur",
        LECTEUR,
        "source={{ uri: etat.chemin }}",
        "source={{ uri: 'https://cdn.jsdelivr.net/gh/zohanur/1.jpg' }}",
    ),
    (
        "un ornement est rendu a nouveau par le lecteur",
        LECTEUR,
        "// L'image seule, centrée, à son rapport réel",
        "// <CartoucheNumero />\n// L'image seule, centrée, à son rapport réel",
    ),
    (
        "l'image perd son resizeMode (elle serait deformee)",
        LECTEUR, 'resizeMode="contain"', 'resizeMode="stretch"',
    ),
    (
        # L'URL doit etre posee dans du CODE, pas dans un commentaire : le
        # verificateur retire les commentaires avant de chercher, et c'est
        # voulu — un commentaire qui cite une URL documente, il ne code pas.
        # Ma premiere mutation la mettait en commentaire, et le controle avait
        # raison de ne pas la voir. C'est la mutation qui etait fausse.
        "l'URL est recopiee dans un autre module",
        AUTRE,
        "import type {",
        "const URL_PAGE = 'https://cdn.jsdelivr.net/gh/Zohanur2026/zohanur-mushaf-pages-hafs/1.jpg';\nimport type {",
    ),
    # --- le cache disque indisponible : le defaut signale sur appareil -------
    (
        # Le retour du `?? ''` qui a fait echouer toutes les pages en vrai : le
        # chemin perd son schema `file://`, et downloadAsync le refuse.
        "le chemin de cache est fabrique avec un repli vide",
        CACHE,
        "const DOSSIER: string | null = FileSystem.cacheDirectory\n  ? `${FileSystem.cacheDirectory}pages-moushaf/`\n  : null;",
        "const DOSSIER: string = `${FileSystem.cacheDirectory ?? ''}pages-moushaf/`;",
    ),
    (
        # `cheminLocal` cesse de rendre `null` quand le cache manque, et fabrique
        # un chemin malgre tout. On n'ecrit pas `?? ''` ici : ce serait viser
        # deux regles a la fois, et l'on ne saurait pas laquelle a parle.
        "cheminLocal fabrique un chemin sans cache",
        CACHE,
        "return DOSSIER === null ? null : `${DOSSIER}page-${page}.jpg`;",
        "return `${DOSSIER}page-${page}.jpg`;",
    ),
    (
        # Le repli sur l'URL distante disparait : une page qu'on ne peut pas
        # mettre en cache s'affiche en echec alors que le reseau repond.
        "le repli sur l'URL distante est retire",
        CACHE,
        "  if (DOSSIER === null) return url;",
        "  if (DOSSIER === null) return null;",
    ),
]

print("=" * 74)
conforme_avant = True
for nom, fichier, avant, apres in MUTATIONS:
    brut = fichier.read_bytes()
    empreinte = sha(fichier)

    code0, _ = lancer()
    if code0 != 0:
        print(f"--- {nom}\n    ARRET : le verificateur est DEJA rouge sur le fichier sain")
        conforme_avant = False
        break

    texte = brut.decode("utf-8")
    if texte.count(avant) != 1:
        print(f"--- {nom}\n    ARRET : ancre non unique ({texte.count(avant)} occurrences)")
        break

    fichier.write_bytes(texte.replace(avant, apres, 1).encode("utf-8"))
    assert sha(fichier) != empreinte, "la mutation n'a rien change"

    code1, sortie1 = lancer()
    detecte = code1 != 0
    # La ligne qui explique l'echec, pour verifier qu'il tombe sur le BON motif.
    motif = next((l for l in sortie1.splitlines() if l.startswith("[ERR]")), "(aucun [ERR])")
    print(f"--- {nom}")
    print(f"    {'DETECTE' if detecte else 'NON DETECTE'}  {motif[:100]}")

    fichier.write_bytes(brut)
    assert sha(fichier) == empreinte, f"restauration non conforme : {fichier.name}"
    code2, _ = lancer()
    print(f"    restaure : {'OK' if code2 == 0 else 'ENCORE ROUGE (suspect)'}")

print("=" * 74)
print("Verifications finales :")
code, sortie = lancer()
print(f"  verificateur sur l'arbre reel : code {code}")
print(f"  {'-> ' + sortie.strip().splitlines()[-1]}")
