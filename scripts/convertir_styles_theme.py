"""Convertit les styles d'un ecran en styles fabriques au rendu.

Ce script est un OUTIL DE CHANTIER, employe une fois pour la conversion des
quinze fichiers. Il est conserve dans le depot parce qu'il dit exactement ce
qui a ete change, fichier par fichier, et qu'une revue a la main de quinze
fichiers ne le dirait pas mieux.

Ce qu'il fait, et rien d'autre :

  1. `const styles = StyleSheet.create({` devient
     `const creerStyles = (colors: Palette) => StyleSheet.create({` ;
  2. chaque composant de premier niveau qui reference `styles` recoit, en
     premiere ligne de son corps, `const styles = useStyles(creerStyles);` ;
  3. l'import de `@/theme` recoit `useStyles` et `type Palette` ;
  4. `colors` est retire de cet import s'il n'est plus lu hors des styles.

Ce qu'il ne fait pas : toucher au contenu des styles, ni a l'ordre des
fonctions. Les modifications de fond — le plein ecran du lecteur, les rythmes,
les reglages — sont faites a la main.
"""

import re
import pathlib
import sys

FICHIERS = [
    "app/(tabs)/coran.tsx",
    "app/(tabs)/index.tsx",
    "app/(tabs)/profil.tsx",
    "app/(tabs)/programme.tsx",
    "app/(tabs)/progres.tsx",
    "app/amis.tsx",
    "app/discussion.tsx",
    "app/lecteur.tsx",
    "app/lien.tsx",
    "app/onboarding.tsx",
    "src/components/AmisSection.tsx",
    "src/components/Card.tsx",
    "src/components/LecteurPageMoushaf.tsx",
    "src/components/ProgressBar.tsx",
    "src/components/SauvegardeSection.tsx",
]

DECL_STYLES = "const styles = StyleSheet.create({"
NOUVELLE_DECL = "const creerStyles = (colors: Palette) => StyleSheet.create({"

# Une declaration de fonction de premier niveau : la colonne zero est exigeante,
# et c'est voulu — une fonction imbriquee ne recoit pas de hook.
RE_FONCTION = re.compile(
    r"^(?:export\s+)?(?:default\s+)?function\s+([A-Za-z0-9_]+)\s*\(", re.M
)
RE_IMPORT_THEME = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'@/theme';", re.S)


def fin_des_parentheses(texte: str, debut: int) -> int:
    """L'index de la parenthese fermante qui repond a celle de `debut`."""
    profondeur = 0
    for i in range(debut, len(texte)):
        if texte[i] == "(":
            profondeur += 1
        elif texte[i] == ")":
            profondeur -= 1
            if profondeur == 0:
                return i
    raise ValueError("parenthese non fermee")


def convertir(source: str) -> tuple[str, list[str]]:
    if source.count(DECL_STYLES) != 1:
        raise ValueError(
            f"attendu une seule declaration de styles, trouve {source.count(DECL_STYLES)}"
        )

    # --- 1. Les composants, avant de renommer quoi que ce soit ---------------
    #
    # Le corps d'un composant va de sa declaration a la declaration suivante.
    # Cette borne est volontairement large : elle inclut le code de module qui
    # les separe — la table des styles, et les fonctions pures qui n'emploient
    # pas `styles`. Aucun de ces morceaux ne contient `styles.`, donc la
    # surestimation ne cree pas de faux positif. Ce qui compte, c'est qu'elle ne
    # descende jamais SOUS le vrai corps, sinon un composant qui emploie
    # `styles` serait oublie.
    declarations = [(m.start(), m.group(1)) for m in RE_FONCTION.finditer(source)]
    bornes = [d[0] for d in declarations] + [len(source)]

    insertions: list[tuple[int, str]] = []
    rapport: list[str] = []

    for i, (debut, nom) in enumerate(declarations):
        segment = source[debut : bornes[i + 1]]
        if "styles." not in segment and "styles[" not in segment:
            continue
        ouvrante = source.index("(", debut)
        fermante = fin_des_parentheses(source, ouvrante)
        accolade = source.index("{", fermante)
        insertions.append((accolade + 1, "\n  const styles = useStyles(creerStyles);"))
        rapport.append(f"    {nom} : hook ajoute")

    # --- 2. La table des styles ---------------------------------------------
    source = source.replace(DECL_STYLES, NOUVELLE_DECL)

    # --- 3. Les insertions, de la fin vers le debut -------------------------
    #
    # De la fin vers le debut : inserer en remontant laisse les index deja
    # calcules valides, alors qu'inserer en descendant les decalerait tous.
    for position, texte in sorted(insertions, key=lambda t: -t[0]):
        source = source[:position] + texte + source[position:]

    # --- 4. L'import de `@/theme` -------------------------------------------
    import_theme = RE_IMPORT_THEME.search(source)
    if import_theme is None:
        raise ValueError("aucun import de '@/theme'")

    noms = [n.strip() for n in import_theme.group(1).replace("\n", " ").split(",")]
    noms = [n for n in noms if n != ""]

    # `colors` ne survit que s'il est encore lu ailleurs que dans les styles.
    # La table des styles est desormais la fonction `creerStyles`, qui prend
    # `colors` en parametre : ses lectures ne comptent donc pas.
    debut_styles = source.index(NOUVELLE_DECL)
    avant_styles = source[:debut_styles]
    if re.search(r"\bcolors\b", avant_styles.split("from '@/theme';", 1)[-1]) is None:
        noms = [n for n in noms if n != "colors"]
        rapport.append("    import : colors retire (plus lu hors des styles)")

    for ajout in ["useStyles", "type Palette"]:
        if ajout not in noms:
            noms.append(ajout)
            rapport.append(f"    import : {ajout} ajoute")

    source = (
        source[: import_theme.start()]
        + "import { "
        + ", ".join(noms)
        + " } from '@/theme';"
        + source[import_theme.end() :]
    )

    return source, rapport


def main() -> int:
    racine = pathlib.Path(__file__).resolve().parent.parent
    echecs = 0
    for chemin in FICHIERS:
        fichier = racine / chemin
        source = fichier.read_text(encoding="utf-8")
        try:
            converti, rapport = convertir(source)
        except ValueError as erreur:
            print(f"ECHEC  {chemin} : {erreur}")
            echecs += 1
            continue
        fichier.write_text(converti, encoding="utf-8", newline="\n")
        print(f"ok     {chemin}")
        for ligne in rapport:
            print(ligne)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
