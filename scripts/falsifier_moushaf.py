"""Prouve que les controles de la page du moushaf detectent reellement un defaut.

Un controle qui n'a jamais echoue ne prouve rien : il peut regarder a cote. Ce
script mutile les fichiers dont la page se dessine, lance `tests/moushaf.test.mjs`,
et exige que le controle tombe — et tombe **par le controle attendu**, nomme pour
chaque mutation. Sans cela, une mutation pourrait etre « detectee » par un
controle sans rapport, et on croirait verifie ce qui ne l'est pas.

CE QUE CE SCRIPT VERIFIE SUR LUI-MEME
-------------------------------------
`node --test` sort en **0** quand aucun test ne s'execute — un fichier vide, ou
un nom de fichier mal orthographie. Un banc qui se contenterait du code de sortie
annoncerait alors « mutation detectee » pour une raison qui n'a rien a voir avec
le code mute. Le temoin exige donc deux choses de plus, lues dans le rapport TAP
du coureur : que le nombre de tests executes soit celui attendu, et qu'aucun test
ne tombe avant la mutation. C'est le fichier de tests entier qui est lance, et non
un motif : `--test-name-pattern` sort en 0 quand le motif ne designe aucun test,
ce qui rend le meme mensonge possible.

Chaque fichier est rendu a l'octet pres apres chaque mutation, et la restauration
se prouve par empreinte SHA-256 — jamais par `git diff`, qui depend de la
configuration de fin de ligne.

CE QUI EST MUTILE, ET LE CONTROLE QUI DOIT TOMBER
-------------------------------------------------
  1. une mesure de geometrie faussee  -> « la geometrie de la page vient du fichier » ;
  2. la reference d'une page deplacee -> « la reference d'une page suit la regle annoncee » ;
  3. une ligne d'en-tete qui prend une largeur -> « une ligne d'en-tete n'a pas de largeur » ;
  4. une ligne qui deborde sa page    -> « aucune ligne mesuree ne depasse sa page » ;
  5. un code remplace par du latin    -> « les codes ne portent que des formes de presentation » ;
  6. la basmala d'une page changee    -> « la basmala est celle de la page 1 » ;
  7. un element retire des codes      -> « les codes et le texte decrivent la meme page » ;
  8. un chemin de police abime        -> « la table des polices ecrit les 604 chemins ».
  9. une teinte d'ornement inventee   -> « les ornements portent les teintes relevees » ;
 10. le medaillon sans emplacement    -> « le medaillon recoit le numero » ;
 11. le medaillon qui n'affiche rien  -> « le medaillon recoit le numero » ;
 12. un cartouche a taille fixe       -> « les cartouches se dimensionnent sur le pas » ;
 13. le cadre remis dans le flux      -> « le cadre se dessine en fond » ;
 14. un caractere arabe dans les ornements -> « aucun ornement ne dessine de texte coranique ».

L'ANCRE DOIT ETRE UNIQUE
------------------------
Une ancre qui apparait plusieurs fois fait muter le mauvais endroit : le script
compte les occurrences, et refuse d'ecrire si ce n'est pas **1**. Et le fragment
du controle attendu doit etre un morceau **exact** du nom du test : un fragment
mal orthographie fait annoncer « non detectee » alors que le test est tombe, ce
qui accuse le code au lieu du harnais. Les deux cas se sont produits.

Usage :
    python scripts/falsifier_moushaf.py
"""

import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

RACINE = pathlib.Path(__file__).resolve().parent.parent
FICHIER_LAYOUT = RACINE / "data" / "quran" / "moushaf_layout.json"
FICHIER_LARGEURS = RACINE / "data" / "quran" / "largeurs_pages.json"
FICHIER_POLICES = RACINE / "src" / "data" / "policesPages.ts"
FICHIER_ORNEMENTS = RACINE / "src" / "components" / "ornementsMoushaf.tsx"
FICHIER_LECTEUR = RACINE / "app" / "lecteur.tsx"
TEST = RACINE / "tests" / "moushaf.test.mjs"

# Le nombre de tests du fichier. S'il change, le temoin change aussi : c'est
# volontaire, un test ajoute doit se voir ici.
TESTS_ATTENDUS = 19


def lancer_controle():
    resultat = subprocess.run(
        [
            "node",
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            "tests/moushaf.test.mjs",
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return resultat.returncode, (resultat.stdout or "") + (resultat.stderr or "")


def lire_rapport(sortie):
    """(nombre de tests executes, noms des tests tombes)."""
    executes = 0
    tombes = []
    for ligne in sortie.splitlines():
        ligne = ligne.strip()
        if ligne.startswith("# tests "):
            executes = int(ligne.split()[-1])
        elif ligne.startswith("not ok "):
            tombes.append(ligne.split(" - ", 1)[-1])
    return executes, tombes


def lire(chemin):
    return json.loads(chemin.read_text(encoding="utf-8"))


def ecrire(chemin, contenu):
    chemin.write_text(
        json.dumps(contenu, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def page_alignee(fichier):
    """Une page alignee des deux bords, avec sa reference et sa plus large ligne."""
    for numero in range(1, 605):
        page = fichier["pages"][str(numero)]
        if page["justifiee"] and page["reference"] > 0:
            return numero
    raise LookupError("aucune page alignee")


def page_avec_basmala(layout):
    for numero in range(1, 605):
        for ligne in layout["glyphes"][str(numero)]:
            if any(element[0] == "b" for element in ligne):
                return numero
    raise LookupError("aucune basmala")


def remplacer_une_fois(chemin, ancre, remplacement):
    """Remplace une ancre dans un fichier de texte, et refuse si elle n'est pas unique.

    Une ancre qui apparait plusieurs fois ferait muter le mauvais endroit : les
    deux premiers remplacements reussiraient, le troisieme aussi, et la mutation
    n'eprouverait plus ce qu'elle annonce. On exige donc **une** occurrence, et on
    echoue bruyamment sinon.
    """
    texte = chemin.read_text(encoding="utf-8")
    occurrences = texte.count(ancre)
    if occurrences != 1:
        raise LookupError(
            f"{chemin.name} : l'ancre apparait {occurrences} fois, il en faut exactement 1"
        )
    chemin.write_text(texte.replace(ancre, remplacement), encoding="utf-8")


def mutations():
    """Rend (nom, description, fichier, mutation, fragment du controle attendu)."""

    def geometrie_faussee(fichier):
        fichier["partDeLaBasmala"] = 0.5

    def reference_deplacee(fichier):
        page = page_alignee(fichier)
        fichier["pages"][str(page)]["reference"] += 400

    def entete_mesuree(fichier):
        # Une ligne d'en-tete n'a pas de largeur : lui en donner une doit tomber.
        for numero in range(1, 605):
            page = fichier["pages"][str(numero)]
            for i, largeur in enumerate(page["lignes"]):
                if largeur is None:
                    page["lignes"][i] = page["reference"]
                    return

    def ligne_qui_deborde(fichier):
        page = page_alignee(fichier)
        lignes = fichier["pages"][str(page)]["lignes"]
        for i, largeur in enumerate(lignes):
            if largeur:
                lignes[i] = int(fichier["pages"][str(page)]["reference"] * 1.06)
                return

    def code_latin(layout):
        for numero in range(1, 605):
            for ligne in layout["glyphes"][str(numero)]:
                for element in ligne:
                    if element[0] == "m":
                        element[3] = "A"
                        return
                    if element[0] in ("v", "b"):
                        element[3][0] = "A"
                        return

    def basmala_changee(layout):
        page = page_avec_basmala(layout)
        for ligne in layout["glyphes"][str(page)]:
            for element in ligne:
                if element[0] == "b":
                    # Le premier code de la basmala prend celui d'un autre mot.
                    element[3][0] = layout["glyphes"]["1"][2][0][3][0]
                    return

    def element_retire(layout):
        for numero in range(1, 605):
            for ligne in layout["glyphes"][str(numero)]:
                if len(ligne) >= 2:
                    ligne.pop()
                    return

    def chemin_abime(_fichier):
        texte = FICHIER_POLICES.read_text(encoding="utf-8")
        FICHIER_POLICES.write_text(
            texte.replace(
                "require('../../assets/polices-pages/p604.ttf')",
                "require('../../assets/polices-pages/p0604.ttf')",
            ),
            encoding="utf-8",
        )

    # --- les ornements : mutations de texte, non de donnees ------------------
    #
    # Les controles d'ornements lisent le source pour tenir une coherence (les
    # teintes sont celles de l'imprime, les cartouches suivent le pas, le cadre
    # est en fond). Une mutation doit donc viser exactement ce que le controle
    # annonce, sans quoi on eprouverait autre chose.

    def teinte_inventee(_fichier):
        remplacer_une_fois(FICHIER_ORNEMENTS, "brun: '#B07B4F',", "brun: '#123456',")

    def medaillon_sans_emplacement(_fichier):
        # Le composant cesse d'accepter un caractere : le numero de verset n'aurait
        # plus ou se poser, et le medaillon resterait vide.
        remplacer_une_fois(
            FICHIER_ORNEMENTS,
            "  children?: ReactNode;\n}) {\n  return (\n"
            '    <Svg width={taille} height={taille} viewBox="0 0 100 100">',
            "}) {\n  return (\n"
            '    <Svg width={taille} height={taille} viewBox="0 0 100 100">',
        )

    def medaillon_muet(_fichier):
        # Le composant accepte le caractere mais ne le dessine pas : la
        # declaration seule ne prouverait rien.
        remplacer_une_fois(
            FICHIER_ORNEMENTS,
            "        strokeWidth={0.9}\n      />\n      {children}",
            "        strokeWidth={0.9}\n      />",
        )

    def cartouche_a_taille_fixe(_fichier):
        # Un cartouche en pixels ne suivrait plus la page d'un ecran a l'autre.
        remplacer_une_fois(
            FICHIER_LECTEUR,
            "<CartoucheNumero largeur={Math.max(56, largeurDuBloc * 0.16)}",
            "<CartoucheNumero largeur={56}",
        )

    def cadre_dans_le_flux(_fichier):
        remplacer_une_fois(FICHIER_ORNEMENTS, "position: 'absolute'", "position: 'relative'")

    def texte_arabe_dans_les_ornements(_fichier):
        # Un caractere coranique ecrit en dur dans le module d'ornements : c'est
        # exactement ce que la regle du projet interdit.
        remplacer_une_fois(
            FICHIER_ORNEMENTS,
            "  encre: '#1C1C1C',",
            "  encre: '#1C1C1C',\n  piegeArabe: '\u0628\u0650\u0633\u0652\u0645\u0650',",
        )

    return [
        (
            "geometrie faussee",
            "la part de la basmala passe de 0,572 a 0,5",
            FICHIER_LARGEURS,
            geometrie_faussee,
            "la géométrie de la page vient du fichier",
        ),
        (
            "reference deplacee",
            "la reference d'une page gagne 400 unites",
            FICHIER_LARGEURS,
            reference_deplacee,
            "la référence d’une page suit la règle annoncée",
        ),
        (
            "ligne d'en-tete mesuree",
            "une ligne d'en-tete prend la largeur de sa page",
            FICHIER_LARGEURS,
            entete_mesuree,
            "une ligne d’en-tête n’a pas de largeur",
        ),
        (
            "ligne qui deborde",
            "une ligne vaut 1,06 fois sa reference",
            FICHIER_LARGEURS,
            ligne_qui_deborde,
            "aucune ligne mesurée ne dépasse sa page",
        ),
        (
            "code latin",
            "un mot prend le code d'une lettre latine",
            FICHIER_LAYOUT,
            code_latin,
            "les codes ne portent que des formes de présentation",
        ),
        (
            "basmala changee",
            "la basmala d'une page prend le code d'un autre mot",
            FICHIER_LAYOUT,
            basmala_changee,
            "la basmala est celle de la page 1",
        ),
        (
            "element retire",
            "un element disparait des codes d'une ligne",
            FICHIER_LAYOUT,
            element_retire,
            "les codes et le texte décrivent la même page",
        ),
        (
            "chemin de police abime",
            "le chemin de la page 604 ne suit plus la convention",
            FICHIER_POLICES,
            chemin_abime,
            "la table des polices écrit les 604 chemins",
        ),
        (
            "teinte inventee",
            "le brun de l'encadrement devient un brun de charte",
            FICHIER_ORNEMENTS,
            teinte_inventee,
            "les ornements portent les teintes relevées",
        ),
        (
            "medaillon sans emplacement",
            "le medaillon n'accepte plus de caractere",
            FICHIER_ORNEMENTS,
            medaillon_sans_emplacement,
            "le médaillon reçoit le numéro",
        ),
        (
            "medaillon muet",
            "le medaillon accepte le caractere sans le dessiner",
            FICHIER_ORNEMENTS,
            medaillon_muet,
            "le médaillon reçoit le numéro",
        ),
        (
            "cartouche a taille fixe",
            "le cartouche du numero ne suit plus la largeur du bloc",
            FICHIER_LECTEUR,
            cartouche_a_taille_fixe,
            "les cartouches se dimensionnent sur le pas",
        ),
        (
            "cadre dans le flux",
            "le cadre prend une place dans le flux au lieu du fond",
            FICHIER_ORNEMENTS,
            cadre_dans_le_flux,
            "le cadre se dessine en fond",
        ),
        (
            "arabe dans les ornements",
            "un caractere coranique est ecrit en dur dans les ornements",
            FICHIER_ORNEMENTS,
            texte_arabe_dans_les_ornements,
            "aucun ornement ne dessine de texte coranique",
        ),
    ]


def main() -> None:
    for chemin in (FICHIER_LAYOUT, FICHIER_LARGEURS, FICHIER_POLICES, TEST):
        if not chemin.exists():
            sys.exit(f"ERREUR : {chemin} est absent")

    originaux = {chemin: chemin.read_bytes() for chemin in {m[2] for m in mutations()}}
    empreintes = {chemin: hashlib.sha256(o).hexdigest() for chemin, o in originaux.items()}
    for chemin, empreinte in empreintes.items():
        print(f"reference : {chemin.relative_to(RACINE)} — {len(originaux[chemin])} octets, "
              f"sha256 {empreinte[:16]}…")

    code, sortie = lancer_controle()
    executes, tombes = lire_rapport(sortie)
    if code != 0 or tombes:
        print("Le controle est deja en echec avant toute mutation :")
        print(sortie[-2000:])
        sys.exit(1)
    if executes != TESTS_ATTENDUS:
        print(
            f"ECHEC  le temoin attend {TESTS_ATTENDUS} test(s) execute(s), "
            f"le rapport en annonce {executes} — le fichier n'a pas ete joue, "
            "et rien de ce qui suit ne prouverait quoi que ce soit"
        )
        sys.exit(1)
    print(f"controle vert avant mutation : oui ({executes} test(s) execute(s))\n")

    echecs = []
    try:
        for nom, description, chemin, muter, attendu in mutations():
            # Chaque mutation part de **tous** les fichiers d'origine : sans
            # cette remise a zero, une mutation laissee en place serait
            # « detectee » par l'effet de la precedente, et le rapport
            # attribuerait a celle-ci ce qui appartient a celle-la.
            for fichier_origine, octets in originaux.items():
                fichier_origine.write_bytes(octets)

            # Un fichier de donnees se lit et s'ecrit en JSON ; un fichier de
            # source (.ts, .tsx) est mute sur son texte directement, par
            # `remplacer_une_fois`. Confondre les deux ferait echouer la lecture
            # JSON sur du TypeScript.
            if chemin.suffix in (".ts", ".tsx"):
                muter(None)
            else:
                fichier = lire(chemin)
                muter(fichier)
                ecrire(chemin, fichier)

            code, sortie = lancer_controle()
            executes, tombes = lire_rapport(sortie)
            detecte = code != 0 and bool(tombes)
            par_le_bon = any(attendu in nom_du_test for nom_du_test in tombes)
            temoin = executes == TESTS_ATTENDUS

            if detecte and par_le_bon and temoin:
                print(f"OK     {nom}  — {description}")
                for ligne in tombes[:2]:
                    print(f"         {ligne}")
            elif detecte and par_le_bon:
                print(f"ECHEC  {nom}  — {description}")
                print(f"         detecte, mais {executes} test(s) execute(s) au lieu de "
                      f"{TESTS_ATTENDUS}")
                echecs.append(f"{nom} (temoin fausse)")
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
        for chemin, octets in originaux.items():
            chemin.write_bytes(octets)
        restauree = all(
            hashlib.sha256(chemin.read_bytes()).hexdigest() == empreintes[chemin]
            for chemin in originaux
        )
        print()
        for chemin in originaux:
            print(f"restauration : {chemin.relative_to(RACINE)} — "
                  f"sha256 {hashlib.sha256(chemin.read_bytes()).hexdigest()[:16]}…")
        if not restauree:
            print("ECHEC  la restauration ne rend pas les fichiers d'origine")
            sys.exit(1)
        print("OK     les fichiers sont rendus a l'identique")

    code, sortie = lancer_controle()
    executes, tombes = lire_rapport(sortie)
    if code != 0 or tombes:
        print("ECHEC  le controle reste en echec apres restauration")
        sys.exit(1)
    print("OK     le controle repasse au vert")

    if echecs:
        print(f"\nECHEC  {len(echecs)} mutation(s) non detectee(s) : " + " ; ".join(echecs))
        sys.exit(1)
    print(f"\nOK     les {len(mutations())} mutations sont detectees")


if __name__ == "__main__":
    main()
