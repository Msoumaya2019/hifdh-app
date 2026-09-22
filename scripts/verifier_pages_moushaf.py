"""Verifier la source des images de pages du moushaf.

CE QUI PEUT MAL TOURNER, ET QUE CE CONTROLE ATTRAPE
---------------------------------------------------
Le mode « page » n'ecrit plus la page : il affiche son image. Trois choses
peuvent donc mal tourner, et aucune ne se voit a la compilation :

  1. **une page sans image** — le gabarit d'URL pourrait ne pas couvrir 1..604,
     ou une page serait sautee. L'utilisateur verrait un ecran de chargement qui
     ne finit jamais ;
  2. **une URL fabriquee hors bornes** — `getMushafPageImage(605)` doit rendre
     `null`, pas une adresse qui repondrait 404 ;
  3. **une URL ecrite ailleurs** que dans `pagesMoushaf.ts` — la source doit
     rester remplaçable en un seul endroit, sinon on ne saura plus ou la changer.

CE QUI N'EST PAS EPROUVE ICI
----------------------------
Que les 604 images existent vraiment sur le reseau. Cela demande Internet, et un
controle qui echoue hors ligne n'apprend rien sur le code. C'est l'objet de
l'option `--reseau`, qui interroge le CDN page par page et **compte** ce qu'il a
verifie — un controle qui n'annonce pas sa couverture ne couvre rien.

USAGE
    python scripts/verifier_pages_moushaf.py            # statique, hors ligne
    python scripts/verifier_pages_moushaf.py --reseau    # interroge le CDN
"""

import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "src" / "lib" / "pagesMoushaf.ts"
LECTEUR = RACINE / "src" / "components" / "LecteurPageMoushaf.tsx"

TOTAL_PAGES = 604


def lire(chemin: Path) -> str:
    if not chemin.exists():
        raise SystemExit(f"ABSENT : {chemin}")
    return chemin.read_text(encoding="utf-8")


def verifier_sans_reseau() -> list[str]:
    """Les invariants de la source, lisibles sans reseau."""
    problemes: list[str] = []
    ts = lire(SOURCE)

    # 1. Le nombre de pages est declare, et vaut 604.
    m = re.search(r"nombreDePages:\s*(\d+)", ts)
    if not m:
        problemes.append("le nombre de pages n'est pas declare dans SOURCE_PAGES")
    elif int(m.group(1)) != TOTAL_PAGES:
        problemes.append(
            f"le moushaf compte {TOTAL_PAGES} pages, la source en annonce {m.group(1)}"
        )

    # 2. Le gabarit est une fonction du numero de page : aucune page n'est
    #    ecrite en dur, sinon les 604 devraient y etre.
    if not re.search(r"gabarit:\s*\(page:\s*number\)", ts):
        problemes.append("le gabarit d'URL n'est pas une fonction du numero de page")

    # 3. La fonction centralisee existe et borne les pages.
    if "export function getMushafPageImage(" not in ts:
        problemes.append("getMushafPageImage est absente")
    if not re.search(r"page\s*<\s*1\s*\|\|\s*page\s*>\s*SOURCE_PAGES\.nombreDePages", ts):
        problemes.append("getMushafPageImage ne borne pas les pages (1..604)")

    # 4. L'URL vit a UN seul endroit. On la cherche dans tout le dossier source :
    #    deux occurrences signifieraient une source non remplaçable.
    #
    #    ATTENTION AU RETRAIT DES COMMENTAIRES. Le premier jet retirait `//`
    #    jusqu'a la fin de la ligne — ce qui coupe aussi le `//` de `https://` et
    #    **efface l'URL qu'on cherche**. Le controle ne pouvait alors rien voir, et
    #    il repondait « conforme » sur un fichier qui portait l'URL. On retire donc
    #    d'abord les commentaires de ligne entiere (une ligne dont le premier
    #    caractere non blanc ouvre un commentaire), puis les blocs `/* */`.
    url_ailleurs = []
    for f in list((RACINE / "src").rglob("*.ts")) + list((RACINE / "src").rglob("*.tsx")):
        if f.resolve() == SOURCE.resolve():
            continue
        t = f.read_text(encoding="utf-8")
        sans_commentaires = re.sub(r"/\*[\s\S]*?\*/", "", t)
        sans_commentaires = "\n".join(
            ligne for ligne in sans_commentaires.split("\n")
            if not ligne.lstrip().startswith("//")
        )
        if "jsdelivr" in sans_commentaires or "zohanur" in sans_commentaires.lower():
            url_ailleurs.append(f.relative_to(RACINE).as_posix())
    if url_ailleurs:
        problemes.append(
            "l'URL des pages est ecrite ailleurs que dans pagesMoushaf.ts : "
            + ", ".join(url_ailleurs)
        )

    # 5. Le lecteur ne doit pas composer la page : plus d'ornement rendu, plus
    #    d'URL en dur. C'est la regle qui protege contre le retour des
    #    superpositions qu'on vient de retirer.
    lecteur = lire(LECTEUR)
    for ornement in ("MedaillonVerset", "CartoucheNumero", "CadreDePage", "BandeauSourate"):
        if re.search(rf"<{ornement}\b", lecteur):
            problemes.append(f"le lecteur rend encore <{ornement}> : la composition est revenue")
    if re.search(r"https?://", lecteur):
        problemes.append("le lecteur contient une URL en dur")

    # 6. Le lecteur suit bien l'etat du cache, et reserve la place de la page.
    if "usePageMoushaf(" not in lecteur:
        problemes.append("le lecteur ne suit pas le cache des pages")
    if "resizeMode=\"contain\"" not in lecteur:
        problemes.append("l'image n'est pas en resizeMode=\"contain\" : elle serait deformee")

    # 7. LE CACHE DISQUE N'EST PAS TOUJOURS DISPONIBLE, ET LE CODE DOIT LE SAVOIR.
    #
    #    Defaut mesure sur appareil : `expo-file-system` resout son module natif
    #    par `requireOptionalNativeModule('ExponentFileSystem') ?? shim`, et le
    #    shim declare `cacheDirectory = null`. Un `?? ''` construisait alors un
    #    chemin **relatif sans schema** (`pages-moushaf/page-1.jpg`), que
    #    `downloadAsync` refuse ; le `catch` transformait ce refus en « verifie
    #    ta connexion ». La page ne s'affichait donc jamais, et le message
    #    accusait le reseau a tort.
    #
    #    Trois choses doivent donc tenir, et aucune ne se voit a la compilation :
    #    on ne fabrique pas de chemin avec un repli vide, on ne confond pas
    #    « pas de cache » avec « pas de reseau », et une page qu'on ne peut pas
    #    mettre en cache reste affichable par son URL distante.
    cache = lire(RACINE / "src" / "lib" / "cachePagesMoushaf.ts")
    cache_code = re.sub(r"/\*[\s\S]*?\*/", "", cache)
    cache_code = "\n".join(
        ligne for ligne in cache_code.split("\n")
        if not ligne.lstrip().startswith("//")
    )
    if "?? ''" in cache_code:
        problemes.append(
            "cachePagesMoushaf fabrique un chemin avec un repli vide : "
            "cacheDirectory peut etre null, et le chemin serait alors sans schema"
        )
    #    Meme piege que ci-dessus, et mesure : `DOSSIER === null` apparait dans
    #    quatre gardes (`preparerDossier`, `cheminLocal`, `assurerPage`,
    #    `viderCachePages`). Chercher la seule chaine reste donc vert meme si
    #    `cheminLocal` cesse de rendre `null` — mutation faite, et NON detectee.
    #    On ancre sur la LIGNE qui decide, pas sur le motif nu.
    if not re.search(
        r"return DOSSIER === null \? null : `\$\{DOSSIER\}page-\$\{page\}\.jpg`;",
        cache_code,
    ):
        problemes.append(
            "cheminLocal fabrique un chemin meme sans cache disque : "
            "un cache indisponible serait rapporte comme une panne reseau"
        )
    #    Le repli doit etre la GARDE elle-meme, pas un `return url;` quelconque :
    #    ce motif apparait quatre fois dans le fichier (dans la garde, dans le
    #    controle de chemin, apres le telechargement, et dans le `catch`). Un
    #    controle qui cherche la seule instruction reste vert meme si la garde
    #    rend `null` — mesure : la mutation « le repli sur l'URL distante est
    #    retire » n'etait PAS detectee. On ancre donc sur la condition ET sur ce
    #    qu'elle rend, sur la meme ligne.
    if not re.search(r"if \(DOSSIER === null\) return url;", cache_code):
        problemes.append(
            "cachePagesMoushaf ne retombe pas sur l'URL distante quand le cache "
            "disque est absent : une page s'afficherait en echec alors que le "
            "reseau repond"
        )

    return problemes


def verifier_reseau() -> list[str]:
    """Interroger le CDN pour quelques pages, et COMPTER ce qui a ete vu.

    On ne teste pas les 604 pages a chaque fois : ce serait long. Mais on dit
    exactement combien on en a teste, et on prend la premiere, la derniere, et
    des pages dans chaque tranche du moushaf — une source cassee en son milieu
    passerait un controle qui ne regarde que les extremites.
    """
    import urllib.error
    import urllib.request

    sys.path.insert(0, str(RACINE / "scripts"))
    source_ts = lire(SOURCE)
    m = re.search(r"gabarit:\s*\(page:\s*number\)\s*=>\s*`([^`]+)`", source_ts)
    if not m:
        return ["le gabarit d'URL est introuvable : impossible d'interroger le reseau"]
    gabarit = m.group(1)

    echantillon = [1, 2, 50, 100, 150, 177, 200, 250, 300, 350, 400, 450, 500, 550, 603, 604]
    problemes: list[str] = []
    vues = 0
    for page in echantillon:
        url = gabarit.replace("${page}", str(page))
        try:
            requete = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(requete, timeout=20) as reponse:
                type_ = reponse.headers.get("Content-Type", "")
                taille = int(reponse.headers.get("Content-Length", "0") or 0)
                if reponse.status != 200:
                    problemes.append(f"page {page} : HTTP {reponse.status}")
                elif not type_.startswith("image/"):
                    problemes.append(f"page {page} : Content-Type {type_!r}, pas une image")
                elif taille <= 0:
                    problemes.append(f"page {page} : taille nulle")
                else:
                    vues += 1
        except urllib.error.HTTPError as e:
            problemes.append(f"page {page} : HTTP {e.code}")
        except Exception as e:  # reseau coupe, DNS, delai
            problemes.append(f"page {page} : {e}")

    print(f"[INFO] {vues} page(s) sur {len(echantillon)} verifiee(s) aupres du CDN")
    if vues == 0:
        problemes.append("aucune page n'a pu etre vue : le reseau est-il disponible ?")
    return problemes


def main() -> int:
    avec_reseau = "--reseau" in sys.argv
    print("=" * 68)
    print("Source des images de pages du moushaf")
    print("=" * 68)

    problemes = verifier_sans_reseau()
    if problemes:
        for p in problemes:
            print(f"[ERR] {p}")
    else:
        print("[OK ] la source est unique, bornee, et le lecteur ne compose plus la page")

    if avec_reseau:
        print()
        problemes_reseau = verifier_reseau()
        if problemes_reseau:
            for p in problemes_reseau[:12]:
                print(f"[ERR] {p}")
            problemes += problemes_reseau
        else:
            print("[OK ] les pages echantillonnees existent et sont des images")

    print()
    if problemes:
        print(f"RESULTAT : {len(problemes)} probleme(s).")
        return 1
    print("RESULTAT : tout est conforme.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
