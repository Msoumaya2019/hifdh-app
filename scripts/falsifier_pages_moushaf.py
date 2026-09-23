# -*- coding: utf-8 -*-
"""Falsifier le verificateur de la source des pages.

Un controle qui n'a jamais rougi ne prouve rien. On mute chaque invariant que
`verifier_pages_moushaf.py` pretend tenir, et on exige qu'il TOMBE sur chacun.
On restaure ensuite par empreinte SHA-256 (jamais par `git diff`, qui subit
`eol=lf`).

DEUX GENRES DE MUTATION
-----------------------
- **dans le texte** : on remplace une chaine par une autre, on lance, on restaure
  a l'octet ;
- **sur le disque** : on retire une page, ou on en ajoute une. Ces mutations-la
  ne s'ecrivent pas comme un remplacement de texte, et ce sont justement celles
  qui eprouvent le controle que la copie locale a rendu possible — un fichier
  manquant est le defaut reel, celui qui fait une page morte.

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
GITATTRIBUTES = RACINE / ".gitattributes"
PAGES = RACINE / "pages-moushaf"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def lancer() -> tuple[int, str]:
    r = subprocess.run([PYTHON, VERIF], cwd=RACINE, capture_output=True, text=True, timeout=180)
    sortie = r.stdout + r.stderr
    if not sortie.strip():
        raise SystemExit("le verificateur n'a RIEN produit : un succes vide est une anomalie")
    return r.returncode, sortie


# --- Mutations dans le texte -------------------------------------------------
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
        # Le remplissage disparait : les noms deviennent page1.png, page2.png…
        # Le dossier ne se lit plus dans l'ordre du moushaf, et surtout le
        # controle ne sait plus quel nom attendre.
        "le numero de page n'est plus complete a trois chiffres",
        SOURCE, "String(page).padStart(3, '0')", "String(page)",
    ),
    (
        # Les 604 adresses deviennent des .jpg qui n'existent pas : toutes les
        # pages sont mortes, et aucune compilation ne le dit.
        "le nom de fichier ne finit plus par .png",
        SOURCE, "}.png`;", "}.jpg`;",
    ),
    (
        # Une adresse en clair ne se charge pas sur un appareil (Android refuse
        # le trafic non chiffre par defaut).
        "l'adresse de base n'est plus en https",
        SOURCE, "base: 'https://cdn.jsdelivr.net", "base: 'http://cdn.jsdelivr.net",
    ),
    (
        # La hauteur declaree ne correspond plus aux fichiers : la place
        # reservee est fausse, et la page saute quand l'image arrive.
        "la hauteur declaree ne correspond plus aux fichiers",
        SOURCE, "export const HAUTEUR_PAGE = 3106;", "export const HAUTEUR_PAGE = 3107;",
    ),
    (
        # Le rapport devient une constante ecrite a la main : il ne suit plus
        # les dimensions declarees, et rien ne le relie aux fichiers.
        "le rapport reserve ne suit plus les dimensions declarees",
        SOURCE,
        "export const RATIO_PAGE_PAR_DEFAUT = HAUTEUR_PAGE / LARGEUR_PAGE;",
        "export const RATIO_PAGE_PAR_DEFAUT = 1.65;",
    ),
    (
        # Les pages sont reclamees par un module : elles entreraient dans
        # l'APK, qui passerait de 102 a environ 215 Mo.
        "un module reclame une page, qui serait embarquee",
        AUTRE,
        "import type {",
        "const PAGE_EMBARQUEE = require('../../pages-moushaf/page001.png');\nimport type {",
    ),
    (
        # L'adresse doit etre posee dans du CODE, pas dans un commentaire : le
        # verificateur retire les commentaires avant de chercher, et c'est
        # voulu — un commentaire qui cite une adresse documente, il ne code pas.
        "l'adresse est recopiee dans un autre module",
        AUTRE,
        "import type {",
        "const URL_PAGE = 'https://cdn.jsdelivr.net/gh/Msoumaya2019/hifdh-app@main/pages-moushaf/page001.png';\nimport type {",
    ),
    (
        "l'adresse est recopiee dans le lecteur",
        LECTEUR,
        "source={{ uri: etat.chemin }}",
        "source={{ uri: 'https://cdn.jsdelivr.net/gh/Msoumaya2019/hifdh-app@main/pages-moushaf/page001.png' }}",
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
        # Sans cette declaration, un clone peut convertir les fins de ligne des
        # PNG et les corrompre.
        "les PNG ne sont plus declares binaires",
        GITATTRIBUTES, "*.png binary", "*.png text",
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
        "return DOSSIER === null ? null : `${DOSSIER}page-${page}.png`;",
        "return `${DOSSIER}page-${page}.png`;",
    ),
    (
        # Le repli sur l'adresse distante disparait : une page qu'on ne peut pas
        # mettre en cache s'affiche en echec alors que la source repond.
        "le repli sur l'adresse distante est retire",
        CACHE,
        "  if (DOSSIER === null) return url;",
        "  if (DOSSIER === null) return null;",
    ),
    (
        # Une seule regle visee : la garde du cache disque dans `pageEnCache`.
        # La retirer ne casse rien AUJOURD'HUI (`pretes` ne se remplit que du
        # cote disque), et c'est exactement pourquoi la mutation est utile : elle
        # montre que l'invariant tient la garde elle-meme, pas son effet du jour.
        "pageEnCache ne verifie plus le cache disque",
        CACHE,
        "  return DOSSIER !== null && pretes.has(page);",
        "  return pretes.has(page);",
    ),
]


# --- Mutations sur le disque -------------------------------------------------
# Chaque fabrique POSE la mutation et rend de quoi la RETIRER. Le harnais ne
# restaure jamais autrement : une mutation qui laisserait une trace ferait
# echouer toutes les suivantes, et l'on accuserait le controle.
def page_absente():
    """Retirer une page du dossier : c'est le defaut reel, celui qui fait 404."""
    cible = PAGES / "page177.png"
    brut = cible.read_bytes()
    cible.unlink()
    return lambda: cible.write_bytes(brut)


def fichier_en_trop():
    """Ajouter un fichier qui n'est pas une page : le dossier doit le dire."""
    cible = PAGES / "page999.png"
    cible.write_bytes(b"ceci n'est pas une page")
    return lambda: cible.unlink()


def dossier_des_pages_absent():
    """Le dossier entier disparait : les 604 pages sont mortes."""
    sauvegarde = PAGES.with_name("pages-moushaf-sauvegarde")
    PAGES.rename(sauvegarde)
    return lambda: sauvegarde.rename(PAGES)


def page_abimee():
    """Un octet change dans une page : les octets ne sont plus ceux de la source.

    C'est le defaut que rien, a l'ecran, ne distingue : deux pages du moushaf se
    ressemblent, et une page legerement abimee s'affiche quand meme. Seul le
    manifeste peut le dire.
    """
    cible = PAGES / "page300.png"
    brut = cible.read_bytes()
    # On abime un octet du flux, loin de l'en-tete : le format reste lisible, et
    # seule l'empreinte peut voir la difference.
    abime = bytearray(brut)
    abime[len(abime) // 2] ^= 0xFF
    cible.write_bytes(bytes(abime))
    return lambda: cible.write_bytes(brut)


def manifeste_absent():
    """Le manifeste disparait : la copie cesse d'etre verifiable."""
    cible = PAGES / "EMPREINTES.txt"
    brut = cible.read_bytes()
    cible.unlink()
    return lambda: cible.write_bytes(brut)


def manifeste_tronque():
    """Le manifeste perd des lignes : des pages cessent d'etre couvertes."""
    cible = PAGES / "EMPREINTES.txt"
    brut = cible.read_bytes()
    lignes = brut.decode("utf-8").split("\n")
    cible.write_bytes(("\n".join(lignes[:300]) + "\n").encode("utf-8"))
    return lambda: cible.write_bytes(brut)


MUTATIONS_FICHIERS = [
    ("une page manque dans le dossier", page_absente),
    ("un fichier en trop dans le dossier", fichier_en_trop),
    ("le dossier des pages a disparu", dossier_des_pages_absent),
    ("une page est abimee (octets changes)", page_abimee),
    ("le manifeste des empreintes a disparu", manifeste_absent),
    ("le manifeste est tronque", manifeste_tronque),
]


def main() -> int:
    print("=" * 74)
    echecs = 0

    for nom, fichier, avant, apres in MUTATIONS:
        brut = fichier.read_bytes()
        empreinte = sha(fichier)

        code0, _ = lancer()
        if code0 != 0:
            print(f"--- {nom}\n    ARRET : le verificateur est DEJA rouge sur l'arbre sain")
            return 1

        texte = brut.decode("utf-8")
        if texte.count(avant) != 1:
            print(f"--- {nom}\n    ARRET : ancre non unique ({texte.count(avant)} occurrences)")
            return 1

        fichier.write_bytes(texte.replace(avant, apres, 1).encode("utf-8"))
        assert sha(fichier) != empreinte, "la mutation n'a rien change"

        code1, sortie1 = lancer()
        detecte = code1 != 0
        motif = next((l for l in sortie1.splitlines() if l.startswith("[ERR]")), "(aucun [ERR])")
        print(f"--- {nom}")
        print(f"    {'DETECTE' if detecte else 'NON DETECTE'}  {motif[:104]}")
        if not detecte:
            echecs += 1

        fichier.write_bytes(brut)
        assert sha(fichier) == empreinte, f"restauration non conforme : {fichier.name}"
        code2, _ = lancer()
        print(f"    restaure : {'OK' if code2 == 0 else 'ENCORE ROUGE (suspect)'}")
        if code2 != 0:
            echecs += 1

    for nom, fabrique in MUTATIONS_FICHIERS:
        code0, _ = lancer()
        if code0 != 0:
            print(f"--- {nom}\n    ARRET : le verificateur est DEJA rouge sur l'arbre sain")
            return 1

        retirer = fabrique()
        try:
            code1, sortie1 = lancer()
            detecte = code1 != 0
            motif = next((l for l in sortie1.splitlines() if l.startswith("[ERR]")), "(aucun [ERR])")
            print(f"--- {nom}")
            print(f"    {'DETECTE' if detecte else 'NON DETECTE'}  {motif[:104]}")
            if not detecte:
                echecs += 1
        finally:
            retirer()

        code2, _ = lancer()
        print(f"    restaure : {'OK' if code2 == 0 else 'ENCORE ROUGE (suspect)'}")
        if code2 != 0:
            echecs += 1

    print("=" * 74)
    print("Verifications finales :")
    code, sortie = lancer()
    print(f"  verificateur sur l'arbre reel : code {code}")
    print(f"  {'-> ' + sortie.strip().splitlines()[-1]}")
    if code != 0:
        echecs += 1

    print("=" * 74)
    total = len(MUTATIONS) + len(MUTATIONS_FICHIERS)
    if echecs:
        print(f"RESULTAT : {echecs} anomalie(s) sur {total} mutation(s).")
        return 1
    print(f"RESULTAT : {total} mutation(s), toutes detectees, arbre restaure.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
