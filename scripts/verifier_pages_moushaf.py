"""Verifier la source des images de pages du moushaf.

CE QUI PEUT MAL TOURNER, ET QUE CE CONTROLE ATTRAPE
---------------------------------------------------
Le mode « page » n'ecrit plus la page : il affiche son image, servie depuis le
depot. Six choses peuvent mal tourner, et aucune ne se voit a la compilation :

  1. **une page sans image** — le nom fabrique par `nomDeFichierPage` pourrait ne
     pas couvrir 1..604, ou un fichier manquerait dans `pages-moushaf/`.
     L'utilisateur verrait un ecran de chargement qui ne finit jamais ;
  2. **une adresse fabriquee hors bornes** — `getMushafPageImage(605)` doit
     rendre `null`, pas une adresse qui repondrait 404 ;
  3. **un nom qui diverge entre le code et le disque** — si le code sert
     `page177.png` et que le fichier s'appelle autrement, l'adresse est fausse et
     rien ne le dit. On compare donc les deux ;
  4. **un rapport reserve faux** — la place reservee avant l'arrivee de l'image
     doit etre le rapport REEL des fichiers. Sinon la page saute quand l'image
     arrive, et les boutons se deplacent sous le doigt ;
  5. **une adresse ecrite ailleurs** que dans `pagesMoushaf.ts` — la source doit
     rester remplaçable en un seul endroit. C'est aussi ce qui garantit que la
     table des actifs embarques reste la SEULE a reclamer les pages ;
  6. **les pages embarquees sans que rien ne le dise** — elles pesent 112,7 Mo et
     entrent dans l'APK comme dans l'IPA, qui passent d'environ 102 a environ
     215 Mo. C'est une **decision** : la page s'affiche des l'installation, sans
     reseau. Ce qui est controle n'est donc pas l'embarquement lui-meme, mais le
     fait qu'il reste **explicite et complet** : une seule table le porte, elle
     reclame les 604 pages dans l'ordre, et le module qui les resout passe par
     l'actif embarque AVANT le reseau.

CE QUI N'EST PAS EPROUVE ICI
----------------------------
Que les 604 adresses repondent vraiment. Cela demande Internet, et un controle
qui echoue hors ligne n'apprend rien sur le code. C'est l'objet de l'option
`--reseau`, qui interroge la source page par page et **compte** ce qu'il a
verifie — un controle qui n'annonce pas sa couverture ne couvre rien.

NB : depuis que les pages sont embarquees, `--reseau` sert surtout a verifier le
REPLI. Le chemin normal ne touche pas au reseau, donc ce controle peut echouer
sur une machine hors ligne sans que l'application en souffre.

USAGE
    python scripts/verifier_pages_moushaf.py            # statique, hors ligne
    python scripts/verifier_pages_moushaf.py --reseau    # interroge la source
"""

import hashlib
import re
import struct
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "src" / "lib" / "pagesMoushaf.ts"
LECTEUR = RACINE / "src" / "components" / "LecteurPageMoushaf.tsx"
CACHE = RACINE / "src" / "lib" / "cachePagesMoushaf.ts"
PAGES = RACINE / "pages-moushaf"
GITATTRIBUTES = RACINE / ".gitattributes"

TOTAL_PAGES = 604
# Le manifeste des empreintes, range a cote des pages et au format `sha256sum`
# (`<empreinte>  <nom>`), pour qu'il se verifie aussi a la main :
#     cd pages-moushaf && sha256sum -c EMPREINTES.txt
MANIFESTE = "EMPREINTES.txt"
# L'expression de remplissage ecrite dans `nomDeFichierPage`. Le controle la
# cherche LITTERALEMENT : si elle change, c'est le controle qu'il faut mettre a
# jour, et le dire vaut mieux que deviner un autre remplissage.
REMPLISSAGE = "${String(page).padStart(3, '0')}"


def sha256(chemin: Path) -> str:
    """L'empreinte d'un fichier, lue par blocs : une page fait 200 Ko, pas 2 Go."""
    h = hashlib.sha256()
    with chemin.open("rb") as f:
        for bloc in iter(lambda: f.read(1 << 20), b""):
            h.update(bloc)
    return h.hexdigest()


def lire(chemin: Path) -> str:
    if not chemin.exists():
        raise SystemExit(f"ABSENT : {chemin}")
    return chemin.read_text(encoding="utf-8")


def sans_commentaires(texte: str) -> str:
    """Retirer les commentaires, pour ne pas confondre du code et sa notice.

    ATTENTION AU RETRAIT DES COMMENTAIRES DE LIGNE. Le premier jet retirait `//`
    jusqu'a la fin de la ligne — ce qui coupe aussi le `//` de `https://` et
    **efface l'adresse qu'on cherche**. Le controle ne pouvait alors rien voir, et
    il repondait « conforme » sur un fichier qui portait l'adresse. On retire donc
    d'abord les blocs `/* */`, puis les lignes dont le premier caractere non blanc
    ouvre un commentaire.
    """
    t = re.sub(r"/\*[\s\S]*?\*/", "", texte)
    return "\n".join(
        ligne for ligne in t.split("\n") if not ligne.lstrip().startswith("//")
    )


def dimensions_png(chemin: Path) -> tuple[int, int, int]:
    """Lire largeur, hauteur et profondeur dans l'en-tete IHDR d'un PNG.

    On lit les OCTETS, pas l'image : le controle ne doit dependre d'aucune
    bibliotheque de traitement d'image, et 33 octets suffisent.
    """
    with chemin.open("rb") as f:
        entete = f.read(26)
    if len(entete) < 26 or entete[:8] != b"\x89PNG\r\n\x1a\n" or entete[12:16] != b"IHDR":
        raise ValueError("ce n'est pas un PNG, ou son en-tete IHDR est absent")
    largeur, hauteur = struct.unpack(">II", entete[16:24])
    return largeur, hauteur, entete[24]


def verifier_sans_reseau() -> list[str]:
    """Les invariants de la source, lisibles sans reseau."""
    problemes: list[str] = []
    ts = lire(SOURCE)
    code = sans_commentaires(ts)

    # 1. Le nombre de pages est declare, et vaut 604.
    m = re.search(r"nombreDePages:\s*(\d+)", code)
    if not m:
        problemes.append("le nombre de pages n'est pas declare dans SOURCE_PAGES")
    elif int(m.group(1)) != TOTAL_PAGES:
        problemes.append(
            f"le moushaf compte {TOTAL_PAGES} pages, la source en annonce {m.group(1)}"
        )

    # 2. Le nom de fichier est une FONCTION du numero de page, complete a trois
    #    chiffres et terminee par `.png` : aucune page n'est ecrite en dur, sinon
    #    les 604 devraient y etre. On lit le MODELE rendu, et pas seulement la
    #    presence de la fonction : une fonction qui rendrait `page1.jpg` serait
    #    une adresse morte pour les 604 pages, et rien d'autre ici ne le dirait.
    m_nom = re.search(
        r"export function nomDeFichierPage\(page: number\): string \{\s*"
        r"return `([^`]+)`;",
        code,
    )
    if not m_nom:
        problemes.append("nomDeFichierPage n'est pas une fonction du numero de page")
    else:
        modele = m_nom.group(1)
        if REMPLISSAGE not in modele:
            problemes.append(
                "nomDeFichierPage ne complete pas le numero a trois chiffres : "
                "l'ordre du dossier ne serait plus celui du moushaf, et le controle "
                "ne saurait plus quel nom attendre"
            )
        if not modele.endswith(".png"):
            problemes.append(
                f"nomDeFichierPage ne rend pas un nom en .png : le modele est "
                f"{modele!r}, et les 604 pages seraient servies sous une extension "
                "qui n'existe pas"
            )

    # 3. La fonction centralisee existe et borne les pages.
    if "export function getMushafPageImage(" not in code:
        problemes.append("getMushafPageImage est absente")
    if not re.search(
        r"if \(page < 1 \|\| page > SOURCE_PAGES\.nombreDePages\) return null;", code
    ):
        problemes.append("getMushafPageImage ne borne pas les pages (1..604)")

    # 4. L'adresse de base est absolue et en https : une adresse relative, ou en
    #    clair, ne se chargerait pas sur un appareil.
    m_base = re.search(r"base:\s*'([^']+)'", code)
    m_dossier = re.search(r"dossier:\s*'([^']+)'", code)
    if not m_base:
        problemes.append("l'adresse de base de la source n'est pas declaree")
    elif not m_base.group(1).startswith("https://"):
        problemes.append(
            f"l'adresse de base n'est pas absolue en https : {m_base.group(1)!r}"
        )
    if not m_dossier:
        problemes.append("le dossier des pages n'est pas declare")

    # 5. LES FICHIERS SUR LE DISQUE. C'est le controle que la copie locale rend
    #    possible, et il est plus fort que celui d'avant : on ne verifie pas
    #    qu'un gabarit a la bonne forme, on verifie que les 604 pages sont LA, et
    #    que leur nom est exactement celui que le code fabrique.
    if not PAGES.is_dir():
        problemes.append(f"le dossier des pages est absent : {PAGES}")
    else:
        attendus = [f"page{n:03d}.png" for n in range(1, TOTAL_PAGES + 1)]
        # Le manifeste vit dans le meme dossier : il n'est pas une page en trop.
        presents = sorted(
            p.name for p in PAGES.iterdir() if p.is_file() and p.name != MANIFESTE
        )
        manquants = [n for n in attendus if n not in set(presents)]
        en_trop = [n for n in presents if n not in set(attendus)]
        if manquants:
            problemes.append(
                f"{len(manquants)} page(s) absente(s) du dossier, la premiere etant "
                f"{manquants[0]} : l'application servirait une adresse qui repond 404"
            )
        if en_trop:
            problemes.append(
                f"{len(en_trop)} fichier(s) en trop dans le dossier des pages : "
                + ", ".join(en_trop[:5])
            )

        # 6. LE RAPPORT RESERVE DOIT ETRE LE RAPPORT REEL. On lit l'en-tete des
        #    604 fichiers, pas d'un echantillon : un format different sur une
        #    seule page ferait sauter cette page a l'ecran, et c'est exactement
        #    ce qu'un echantillon laisserait passer.
        m_largeur = re.search(r"export const LARGEUR_PAGE = (\d+);", code)
        m_hauteur = re.search(r"export const HAUTEUR_PAGE = (\d+);", code)
        if not m_largeur or not m_hauteur:
            problemes.append(
                "les dimensions des pages ne sont pas declarees dans pagesMoushaf.ts"
            )
        elif not re.search(
            r"export const RATIO_PAGE_PAR_DEFAUT = HAUTEUR_PAGE / LARGEUR_PAGE;", code
        ):
            problemes.append(
                "le rapport reserve n'est pas calcule a partir des dimensions "
                "declarees : il pourrait ne plus correspondre aux fichiers"
            )
        else:
            attendu = (int(m_largeur.group(1)), int(m_hauteur.group(1)))
            formats: dict[tuple[int, int], list[str]] = {}
            illisibles: list[str] = []
            for nom in attendus:
                chemin = PAGES / nom
                if not chemin.exists():
                    continue
                try:
                    largeur, hauteur, _ = dimensions_png(chemin)
                except ValueError as e:
                    illisibles.append(f"{nom} ({e})")
                    continue
                formats.setdefault((largeur, hauteur), []).append(nom)
            if illisibles:
                problemes.append(
                    f"{len(illisibles)} fichier(s) illisible(s) : "
                    + ", ".join(illisibles[:5])
                )
            for (largeur, hauteur), noms in sorted(formats.items()):
                if (largeur, hauteur) != attendu:
                    problemes.append(
                        f"{len(noms)} page(s) au format {largeur}x{hauteur} alors que "
                        f"la source annonce {attendu[0]}x{attendu[1]} "
                        f"(la premiere : {noms[0]}) : la place reservee serait fausse"
                    )

        # 6 bis. LE MANIFESTE PROUVE QUE LES OCTETS SONT CEUX DE LA SOURCE.
        #
        #    Les pages sont recopiees a l'octet depuis le fichier du projet : sans
        #    manifeste, cette phrase reste une intention. On recalcule donc les
        #    604 empreintes et on les compare. Une page remplacee, tronquee ou
        #    abimee par une conversion de fin de ligne se voit ici — et nulle part
        #    ailleurs, puisque rien a l'ecran ne distingue deux pages du moushaf.
        manifeste = PAGES / MANIFESTE
        if not manifeste.exists():
            problemes.append(
                f"le manifeste {MANIFESTE} est absent : la copie des pages ne serait "
                "pas verifiable"
            )
        else:
            lignes = [
                l for l in manifeste.read_text(encoding="utf-8").split("\n") if l.strip()
            ]
            if len(lignes) != TOTAL_PAGES:
                problemes.append(
                    f"le manifeste porte {len(lignes)} ligne(s) au lieu de {TOTAL_PAGES}"
                )
            attendus_manifeste: dict[str, str] = {}
            mal_formees: list[str] = []
            for ligne in lignes:
                morceaux = ligne.split("  ", 1)
                if len(morceaux) != 2 or len(morceaux[0]) != 64:
                    mal_formees.append(ligne[:60])
                    continue
                attendus_manifeste[morceaux[1].strip()] = morceaux[0]
            if mal_formees:
                problemes.append(
                    f"{len(mal_formees)} ligne(s) illisible(s) dans le manifeste : "
                    + ", ".join(mal_formees[:3])
                )
            absentes = [n for n in attendus if n not in attendus_manifeste]
            if absentes:
                problemes.append(
                    f"{len(absentes)} page(s) sans empreinte dans le manifeste, la "
                    f"premiere etant {absentes[0]}"
                )
            divergentes: list[str] = []
            for nom in attendus:
                chemin = PAGES / nom
                attendue = attendus_manifeste.get(nom)
                if attendue is None or not chemin.exists():
                    continue
                if sha256(chemin) != attendue:
                    divergentes.append(nom)
            if divergentes:
                problemes.append(
                    f"{len(divergentes)} page(s) ne correspondent plus a leur empreinte "
                    f"(la premiere : {divergentes[0]}) : les octets du depot ne sont "
                    "plus ceux de la source"
                )

    # 7. L'ADRESSE VIT A UN SEUL ENDROIT. On la cherche dans tout le dossier
    #    source : deux occurrences signifieraient une source non remplaçable.
    hotes = ("jsdelivr", "githubusercontent")
    adresses_ailleurs = []
    for f in list((RACINE / "src").rglob("*.ts")) + list(
        (RACINE / "src").rglob("*.tsx")
    ):
        if f.resolve() == SOURCE.resolve():
            continue
        t = sans_commentaires(f.read_text(encoding="utf-8"))
        if any(h in t.lower() for h in hotes):
            adresses_ailleurs.append(f.relative_to(RACINE).as_posix())
    if adresses_ailleurs:
        problemes.append(
            "l'adresse des pages est ecrite ailleurs que dans pagesMoushaf.ts : "
            + ", ".join(adresses_ailleurs)
        )

    # 8. LES PAGES SONT EMBARQUEES, ET C'EST UNE DECISION TENUE ICI.
    #
    #    Elles pesent 112,7 Mo et entrent dans l'APK comme dans l'IPA, qui
    #    passent d'environ 102 a environ 215 Mo. C'etait l'inverse avant : un
    #    controle interdisait le `require`, au motif que l'alourdissement serait
    #    silencieux. La decision a change — la page doit s'afficher des
    #    l'installation, sans reseau —, et le controle change avec elle.
    #
    #    Ce qu'il garde, et qui n'a pas change : l'alourdissement ne doit pas
    #    etre SILENCIEUX. Trois choses sont donc exigees ensemble :
    #
    #      a) les pages sont reclamees par la table engendree, et par elle seule
    #         (`actifsPagesMoushaf.ts`) — un `require` pose ailleurs, dans un
    #         ecran ou un composant, remettrait la decision hors du controle ;
    #      b) la table reclame les 604 pages, dans l'ordre, sans doublon ;
    #      c) le module qui les resolve passe bien par l'actif embarque AVANT le
    #         reseau — sans quoi l'embarquement ne servirait a rien.
    #
    #    (b) et (c) sont lus sur le disque et sur le code, donc une page
    #    renommee, une ligne perdue ou un ordre casse se voient ici.
    TABLE_ACTIFS = RACINE / "src" / "lib" / "actifsPagesMoushaf.ts"
    attendus_ordre = [f"page{n:03d}.png" for n in range(1, TOTAL_PAGES + 1)]

    #    Le code du module qui resout les pages, sans ses commentaires : c'est lui
    #    qu'on interroge ci-dessous, et en 12.
    cache_code = sans_commentaires(lire(CACHE))

    if not TABLE_ACTIFS.exists():
        problemes.append(
            "la table des actifs embarques est absente "
            f"({TABLE_ACTIFS.relative_to(RACINE).as_posix()}) : les pages ne "
            "seraient pas dans l'application, et l'affichage dependrait du reseau"
        )
    else:
        table = TABLE_ACTIFS.read_text(encoding="utf-8")
        reclamees = re.findall(
            r"require\('\.\./\.\./pages-moushaf/([^']+)'\)", table
        )
        if reclamees != attendus_ordre:
            manquantes = [n for n in attendus_ordre if n not in set(reclamees)]
            en_trop = [n for n in reclamees if n not in set(attendus_ordre)]
            doublons = sorted({n for n in reclamees if reclamees.count(n) > 1})
            detail = []
            if manquantes:
                detail.append(f"{len(manquantes)} page(s) non reclamee(s), dont {manquantes[0]}")
            if en_trop:
                detail.append(f"{len(en_trop)} nom(s) inattendu(s), dont {en_trop[0]}")
            if doublons:
                detail.append(f"{len(doublons)} doublon(s), dont {doublons[0]}")
            if not detail:
                detail.append(
                    f"les {len(reclamees)} pages sont la, mais l'ORDRE differe : "
                    "l'indice d'une page ne serait plus le sien, et une page "
                    "s'afficherait a la place d'une autre"
                )
            problemes.append(
                "la table des actifs ne reclame pas les 604 pages dans l'ordre : "
                + " ; ".join(detail)
            )

    #    (a) Aucun `require` sur les pages en dehors de la table engendree.
    requires_ailleurs = []
    for f in list((RACINE / "src").rglob("*.ts")) + list(
        (RACINE / "src").rglob("*.tsx")
    ):
        if f.resolve() == TABLE_ACTIFS.resolve():
            continue
        t = sans_commentaires(f.read_text(encoding="utf-8"))
        if re.search(r"require\([^)]*pages-moushaf/", t):
            requires_ailleurs.append(f.relative_to(RACINE).as_posix())
    if requires_ailleurs:
        problemes.append(
            "des pages sont reclamees hors de la table engendree : l'embarquement "
            "echappe au controle : " + ", ".join(requires_ailleurs)
        )

    #    (c) L'actif embarque est essaye AVANT le disque et AVANT le reseau.
    #        On ancre sur l'appel en position de premiere voie, et sur le fait que
    #        la fonction rend un chemin local : un module qui reclamerait les pages
    #        sans jamais les afficher ne servirait a rien.
    if not re.search(
        r"const embarque = await cheminActifEmbarque\(page\);\s*\n\s*"
        r"if \(embarque !== null\) \{",
        cache_code,
    ):
        problemes.append(
            "cachePagesMoushaf n'essaie pas l'actif embarque en premier : "
            "l'affichage attendrait le reseau alors que la page est dans "
            "l'application"
        )
    if "async function cheminActifEmbarque" not in cache_code:
        problemes.append(
            "cachePagesMoushaf ne sait pas resoudre un actif embarque"
        )
    if "actifDePage(" not in cache_code:
        problemes.append(
            "cachePagesMoushaf ne passe pas par la table des actifs engendree"
        )

    # 9. Les fichiers binaires ne doivent pas subir de conversion de fin de
    #    ligne : sans cette declaration, un clone sous Windows ou Linux peut
    #    corrompre les PNG, et l'image ne s'affiche plus.
    if not GITATTRIBUTES.exists():
        problemes.append(".gitattributes est absent : les PNG pourraient etre convertis")
    elif not re.search(r"^\*\.png\s+binary\s*$", lire(GITATTRIBUTES), re.MULTILINE):
        problemes.append(
            ".gitattributes ne declare pas `*.png binary` : un clone pourrait "
            "convertir les pages et les corrompre"
        )

    # 10. Le lecteur ne doit pas composer la page : plus d'ornement rendu, plus
    #     d'adresse en dur. C'est la regle qui protege contre le retour des
    #     superpositions qu'on vient de retirer.
    lecteur = lire(LECTEUR)
    for ornement in ("MedaillonVerset", "CartoucheNumero", "CadreDePage", "BandeauSourate"):
        if re.search(rf"<{ornement}\b", lecteur):
            problemes.append(f"le lecteur rend encore <{ornement}> : la composition est revenue")
    if re.search(r"https?://", lecteur):
        problemes.append("le lecteur contient une adresse en dur")

    # 11. Le lecteur suit bien l'etat du cache, et reserve la place de la page.
    if "usePageMoushaf(" not in lecteur:
        problemes.append("le lecteur ne suit pas le cache des pages")
    if 'resizeMode="contain"' not in lecteur:
        problemes.append("l'image n'est pas en resizeMode=\"contain\" : elle serait deformee")

    # 12. LE DISQUE N'EST PAS TOUJOURS DISPONIBLE, ET LE CODE DOIT LE SAVOIR.
    #
    #    Defaut mesure sur appareil : `expo-file-system` resout son module natif
    #    par `requireOptionalNativeModule('ExponentFileSystem') ?? shim`, et le
    #    shim declare `cacheDirectory = null`. Un `?? ''` construisait alors un
    #    chemin **relatif sans schema** (`pages-moushaf/page-1.png`), que
    #    `downloadAsync` refuse ; le `catch` transformait ce refus en « verifie
    #    ta connexion ». La page ne s'affichait donc jamais, et le message
    #    accusait le reseau a tort.
    #
    #    Depuis que les pages sont embarquees, ce piege ne mord plus sur
    #    l'affichage — l'actif ne passe pas par le disque. Il mord encore sur les
    #    deux usages qui subsistent : lire une page qu'un ancien telechargement
    #    avait laissee, et vider ce dossier. Les gardes restent donc, et aucune
    #    ne doit fabriquer de chemin avec un repli vide.
    if "?? ''" in cache_code:
        problemes.append(
            "cachePagesMoushaf fabrique un chemin avec un repli vide : "
            "cacheDirectory peut etre null, et le chemin serait alors sans schema"
        )
    #    Meme piege que ci-dessus, et mesure : `DOSSIER === null` apparait dans
    #    plusieurs gardes. Chercher la seule chaine reste donc vert meme si
    #    `cheminLocal` cesse de rendre `null` — mutation faite, et NON detectee.
    #    On ancre sur la LIGNE qui decide, pas sur le motif nu.
    if not re.search(
        r"return DOSSIER === null \? null : `\$\{DOSSIER\}page-\$\{page\}\.png`;",
        cache_code,
    ):
        problemes.append(
            "cheminLocal fabrique un chemin meme sans cache disque : "
            "un cache indisponible serait rapporte comme une panne reseau"
        )
    #    Le repli final, quand aucune voie locale n'aboutit, doit rendre l'ADRESSE
    #    DISTANTE. On ancre sur le CODE — la memorisation suivie du retour — et
    #    jamais sur un commentaire : `sans_commentaires` les a retirees, donc une
    #    ancre posee sur eux ne peut pas tenir. Deux `return url;` existent dans
    #    le fichier : celui de la voie normale, et celui du `catch` d'urgence. Le
    #    `catch` ne memorise pas — la page n'y est pas resolue —, donc exiger les
    #    deux instructions ensemble distingue les deux sans ambiguite.
    if not re.search(r"retenir\(page, url\);\s*\n\s*return url;", cache_code):
        problemes.append(
            "cachePagesMoushaf ne retombe pas sur l'adresse distante quand aucune "
            "voie locale n'aboutit : une page s'afficherait en echec alors que la "
            "source repond"
        )
    #    `pageEnCache` decide si la resolution est SAUTEE. Elle doit repondre
    #    d'apres les chemins REELLEMENT resolus, et non d'apres le seul disque :
    #    une page servie par l'actif embarque serait sinon declaree non prete a
    #    chaque affichage, et repasserait par l'indicateur d'attente.
    if not re.search(r"export function pageEnCache\(page: number\): boolean \{\s*\n\s*return pretes\.has\(page\);", cache_code):
        problemes.append(
            "pageEnCache ne repond pas d'apres les chemins resolus : une page "
            "embarquee serait rapportee comme non prete"
        )

    return problemes


def verifier_reseau() -> list[str]:
    """Interroger la source pour quelques pages, et COMPTER ce qui a ete vu.

    On ne teste pas les 604 pages a chaque fois : ce serait long. Mais on dit
    exactement combien on en a teste, et on prend la premiere, la derniere, et
    des pages dans chaque tranche du moushaf — une source cassee en son milieu
    passerait un controle qui ne regarde que les extremites.
    """
    import urllib.error
    import urllib.request

    code = sans_commentaires(lire(SOURCE))
    m_base = re.search(r"base:\s*'([^']+)'", code)
    m_dossier = re.search(r"dossier:\s*'([^']+)'", code)
    if not m_base or not m_dossier:
        return ["l'adresse de base est introuvable : impossible d'interroger la source"]

    base, dossier = m_base.group(1), m_dossier.group(1)

    echantillon = [1, 2, 50, 100, 150, 177, 200, 250, 300, 350, 400, 450, 500, 550, 603, 604]
    problemes: list[str] = []
    vues = 0
    for page in echantillon:
        url = f"{base}/{dossier}/page{page:03d}.png"
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

    print(f"[INFO] {vues} page(s) sur {len(echantillon)} verifiee(s) aupres de la source")
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
        print(
            f"[OK ] les {TOTAL_PAGES} pages sont sur le disque, au format annonce, "
            "embarquees dans l'application par la table engendree, et resolues "
            "avant tout appel au reseau"
        )

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
