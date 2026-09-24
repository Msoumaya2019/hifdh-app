"""Engendrer la table des actifs embarques des 604 pages du moushaf.

POURQUOI CE SCRIPT EXISTE
-------------------------
Embarquer les pages demande une table de 604 `require` :

    require('../../pages-moushaf/page001.png')

Ces 604 lignes ne s'ecrivent pas a la main : une seule erreur de numerotation
ferait afficher la mauvaise page, et rien ne le dirait a la compilation — le
`require` d'une page existante resout toujours. Le fichier est donc **engendre**,
et le controle qui le verifie compare le fichier au disque.

CE QU'IL ENGENDRE
-----------------
`src/lib/actifsPagesMoushaf.ts`, avec :

  - la table `ACTIFS_PAGES`, indexee de 0 a 603 pour la page 1 a 604 ;
  - `actifDePage(page)`, qui borne et rend `null` hors bornes.

Le chemin `require` est ecrit en relatif — `../../pages-moushaf/page001.png` —
parce que Metro resout les `require` d'actifs **litteralement**, au moment de
l'empaquetage : un chemin calcule (`require(dossier + nom)`) n'est pas resolu et
l'image manquerait a l'execution. C'est la raison pour laquelle ce fichier doit
etre engendre plutot qu'ecrit a la main, et aussi la raison pour laquelle il ne
peut pas se contenter d'un `map` sur une liste de noms.

USAGE
    python scripts/engendrer_actifs_pages.py            # ecrit la table
    python scripts/engendrer_actifs_pages.py --verifier  # n'ecrit rien, compare
"""

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PAGES = RACINE / "pages-moushaf"
SORTIE = RACINE / "src" / "lib" / "actifsPagesMoushaf.ts"

TOTAL_PAGES = 604
# Le chemin relatif depuis `src/lib/` vers le dossier des pages, a la racine.
RELATIF = "../../pages-moushaf"

ENTETE = '''// Les 604 pages du moushaf, EMBARQUEES dans l'application.
//
// FICHIER ENGENDRE — NE PAS MODIFIER A LA MAIN.
// `scripts/engendrer_actifs_pages.py` l'ecrit, et le controle
// `verifier:pages-moushaf` compare son contenu au dossier `pages-moushaf/`.
// Une correction faite ici serait perdue a la prochaine generation.
//
// POURQUOI DES `require` LITTERAUX
// --------------------------------
// Metro resout un `require` d'actif **au moment de l'empaquetage**, en lisant le
// chemin ecrit dans le source. Un chemin calcule — `require(dossier + nom)` —
// n'est pas resolu : le module se chargerait, mais l'image manquerait a
// l'execution, et le defaut n'apparaitrait qu'a l'ecran. Les 604 chemins sont
// donc ecrits en clair, et le fichier est engendre pour qu'aucun ne soit faux.
//
// CE QUE CE CHOIX COUTE, ET POURQUOI IL EST ASSUME
// ------------------------------------------------
// Les pages pesent 112,7 Mo et entrent dans l'APK comme dans l'IPA, qui
// passent d'environ 102 a environ 215 Mo. C'est une **decision de produit** :
// la page s'affiche immediatement, sans reseau, des l'installation — y compris
// la premiere fois, y compris hors connexion.
//
// Deux mesures ont conduit la decision, et elles sont consignees dans
// `src/lib/pagesMoushaf.ts` :
//   - les 604 pages font 1920 x 3106, en palette, et reduire la resolution les
//     **alourdit** (1440 px : 256 ko par page contre 148 ko a 1920 px), parce que
//     l'anti-aliasing ajoute des couleurs et detruit les aplats que le filtre PNG
//     compresse. Les originaux sont donc aussi le plus petit choix fidele ;
//   - elles sont recopiees **a l'octet** de la source dont l'utilisateur detient
//     les droits : aucun reencodage n'a lieu, ni ici ni a l'empaquetage
//     (`.gitattributes` declare `*.png binary`).
'''

PIED = '''
/**
 * L'actif embarque d'une page, ou `null` si le numero est hors bornes.
 *
 * L'index est decale de un : la page 1 est a l'indice 0. Le decalage est ecrit
 * une seule fois, ici, et jamais repete par un appelant.
 */
export function actifDePage(page: number): number | null {
  if (!Number.isInteger(page)) return null;
  if (page < 1 || page > TOTAL_PAGES_EMBARQUEES) return null;
  return ACTIFS_PAGES[page - 1];
}

/** Le nombre de pages embarquees. Doit valoir le nombre de pages du moushaf. */
export const TOTAL_PAGES_EMBARQUEES = %d;
'''


def engendrer(actifs: list[int]) -> str:
    """Le contenu complet du fichier, a partir des indices d'actifs."""
    lignes = [ENTETE]
    lignes.append("/* eslint-disable @typescript-eslint/no-require-imports */")
    lignes.append("")
    lignes.append("/**")
    lignes.append(" * Les 604 actifs, dans l'ordre des pages : l'indice 0 est la page 1.")
    lignes.append(" */")
    lignes.append("export const ACTIFS_PAGES: number[] = [")
    for n in range(1, TOTAL_PAGES + 1):
        nom = f"page{n:03d}.png"
        lignes.append(f"  require('{RELATIF}/{nom}'),")
    lignes.append("];")
    lignes.append("")
    return "\n".join(lignes) + (PIED % TOTAL_PAGES).lstrip("\n")


def lire_actifs_du_fichier(texte: str) -> list[str]:
    """Les noms de pages reclames par un fichier, dans l'ordre."""
    return re.findall(r"require\('\.\./\.\./pages-moushaf/([^']+)'\)", texte)


def main() -> int:
    verifier = "--verifier" in sys.argv

    manquants = [
        f"page{n:03d}.png"
        for n in range(1, TOTAL_PAGES + 1)
        if not (PAGES / f"page{n:03d}.png").exists()
    ]
    if manquants:
        print(f"[ERR] {len(manquants)} page(s) absente(s) du dossier, la premiere : {manquants[0]}")
        return 1

    contenu = engendrer(list(range(1, TOTAL_PAGES + 1)))

    if verifier:
        if not SORTIE.exists():
            print(f"[ERR] {SORTIE.relative_to(RACINE).as_posix()} est absent")
            return 1
        actuel = SORTIE.read_text(encoding="utf-8")
        if actuel != contenu:
            reclames_actuels = lire_actifs_du_fichier(actuel)
            reclames_attendus = [f"page{n:03d}.png" for n in range(1, TOTAL_PAGES + 1)]
            if reclames_actuels != reclames_attendus:
                ou = next(
                    (
                        i
                        for i, (a, b) in enumerate(
                            zip(reclames_actuels, reclames_attendus)
                        )
                        if a != b
                    ),
                    min(len(reclames_actuels), len(reclames_attendus)),
                )
                premier = (
                    f"premier ecart a l'indice {ou} : "
                    f"{reclames_actuels[ou] if ou < len(reclames_actuels) else 'rien'}"
                    f" au lieu de "
                    f"{reclames_attendus[ou] if ou < len(reclames_attendus) else 'rien'}"
                )
                print(f"[ERR] la table ne reclame pas les bonnes pages ({premier})")
            else:
                print(
                    "[ERR] la table reclame les bonnes pages, mais son texte a "
                    "divergé : regenerer avec ce script"
                )
            return 1
        print(
            f"[OK ] les {TOTAL_PAGES} pages sont reclamees dans l'ordre, "
            "et rien d'autre n'a bouge"
        )
        return 0

    SORTIE.write_text(contenu, encoding="utf-8", newline="\n")
    print(
        f"[OK ] {SORTIE.relative_to(RACINE).as_posix()} ecrit : "
        f"{TOTAL_PAGES} pages reclamees"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
