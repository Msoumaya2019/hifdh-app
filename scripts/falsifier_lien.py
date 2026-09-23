#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur des liens de courriel et de la réinitialisation.

Même exigence que les autres falsificateurs du dépôt : une mutation qui n'est pas
détectée accuse le test, pas la mutation. Et le témoin compte les tests exécutés,
parce que `node --test` sort en 0 quand un motif ne désigne rien.

CE QUE CE FICHIER VISE
----------------------
Les défauts qui ne se voient PAS sur un téléphone, parce qu'ils ne lèvent rien
et n'affichent rien :

  - un lien de réinitialisation valide dont les jetons ne sont jamais lus, parce
    que la lecture interroge la requête au lieu du fragment — Supabase dépose les
    jetons dans le FRAGMENT, et `searchParams` ne le voit pas. L'utilisateur voit
    un écran qui ne fait rien ;
  - un lien expiré présenté comme un lien utilisable ;
  - un geste d'authentification qui contourne le lanceur partagé, donc qui
    échappe au verrou de réentrance et à la borne de délai. Deux appuis lancent
    alors deux attentes, et le rond s'arrête pendant que la première attend
    encore.

Le premier est le plus coûteux des trois : il est totalement muet.
"""

import io
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = [
    "tests/lienAuth.test.mjs",
    "tests/attente.test.mjs",
    "tests/erreursAuth.test.mjs",
]
NODE = shutil.which("node") or "node"

# Les fichiers visés, nommés une fois : une ancre qui se trompe de fichier
# donnerait 0 occurrence, et le message d'erreur parlerait de l'ancre au lieu de
# la mutation.
L = "src/lib/lienAuth.ts"
S = "src/components/SauvegardeSection.tsx"
E = "src/lib/erreursAuth.ts"


def executer_tests():
    environ = dict(os.environ)
    environ["NODE_OPTIONS"] = ""
    resultat = subprocess.run(
        [
            NODE,
            "--import",
            "./scripts/register-alias.mjs",
            "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
            "--test",
            *TESTS,
        ],
        cwd=RACINE,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=environ,
    )
    sortie = resultat.stdout + resultat.stderr
    correspondance = re.search(r"^# tests (\d+)", sortie, re.MULTILINE)
    nombre = int(correspondance.group(1)) if correspondance else 0
    return resultat.returncode, nombre, sortie


def muter(chemin, motif, remplacement):
    """Remplace `motif` par `remplacement`, et refuse si l'ancre n'est pas unique."""
    fichier = RACINE / chemin
    contenu = io.open(fichier, encoding="utf-8").read()
    vues = contenu.count(motif)
    if vues != 1:
        raise AssertionError(f"ancre vue {vues} fois (il en faut exactement 1)")
    io.open(fichier, "w", encoding="utf-8", newline="\n").write(
        contenu.replace(motif, remplacement)
    )


# === Les mutations ÉQUIVALENTES, qui ne peuvent pas être détectées ===========
#
# Une mutation non détectée n'accuse pas toujours le test : elle peut aussi être
# une réécriture qui ne change RIEN au comportement. Celle-ci a été mesurée
# avant d'être retirée de la liste.
#
# LE GARDE-FOU « NI ACTION NI JETON » EST REDONDANT.
#   `lireLienAuth` se termine par
#
#       if (type === 'inconnu' && accessToken === null && code === null) {
#         return lienVide();
#       }
#
#   Or `lienVide()` rend exactement `{ type: 'inconnu', accessToken: null,
#   refreshToken: null, code: null, erreur: null }` — c'est-à-dire, dans ce cas
#   précis, l'objet que la fin de fonction construirait de toute façon : `type`
#   vaut déjà `'inconnu'`, et les trois autres champs sont déjà nuls.
#   Neutraliser le garde ne change donc aucun résultat. Mesuré sur
#   `hifdh://reinitialisation?utm_source=courriel` : les deux versions rendent le
#   même objet, champ pour champ.
#
#   Le garde est conservé dans le source : il énonce l'intention (« ce n'est pas
#   un lien d'authentification »), ce qui vaut mieux qu'une fin de fonction qui
#   laisse deviner. Mais il n'y a rien à couvrir par un test, et l'y laisser
#   ferait croire à un trou de couverture.

# === Les mutations ==========================================================
#
# Chaque entrée : (fichier, motif, remplacement, description).

MUTATIONS = [
    # --- La lecture du lien -------------------------------------------------
    (
        L,
        "  const fragment = texte.includes('#') ? texte.slice(texte.indexOf('#') + 1) : '';",
        "  const fragment = '';",
        "le fragment n'est plus lu : un lien valide ne produit rien",
    ),
    (
        L,
        "  for (const bloc of [requete, fragment]) {",
        "  for (const bloc of [fragment, requete]) {",
        "la requête l'emporte sur le fragment : un jeton final est ignoré",
    ),
    (
        L,
        "        decodee = decodeURIComponent(valeur.replace(/\\+/g, ' '));",
        "        decodee = valeur;",
        "les valeurs ne sont plus décodées : les + et les % restent visibles",
    ),
    (
        L,
        "  if (code === 'otp_expired') {",
        "  if (false) {",
        "un lien expiré n'est plus dit expiré",
    ),
    (
        L,
        "  return lien.erreur === null && lien.accessToken !== null && lien.accessToken !== '';",
        "  return lien.erreur === null;",
        "un lien sans jeton est dit porteur de jetons",
    ),
    (
        L,
        "  return lien.erreur === null && lien.type === 'reinitialisation';",
        "  return lien.erreur === null && lien.type !== 'inconnu';",
        "une confirmation d'adresse demande aussi un nouveau mot de passe",
    ),
    (
        L,
        "  if (lien.type === 'confirmation') {\n    return 'Votre adresse est confirmée. Vous pouvez vous connecter.';\n  }",
        "  if (false) {\n    return 'Votre adresse est confirmée. Vous pouvez vous connecter.';\n  }",
        "l'écran ne dit plus que l'adresse est confirmée",
    ),
    # --- La traduction des erreurs ------------------------------------------
    #
    # Ces deux mutations visaient `src/lib/auth.ts`, où la traduction vivait.
    # Elles y restaient NON DÉTECTÉES, et pour une raison mécanique : `auth.ts`
    # importe Expo, donc aucun test ne pouvait l'importer. La traduction a été
    # extraite dans `src/lib/erreursAuth.ts`, qui n'importe rien — c'est ce qui
    # les rend détectables.
    (
        E,
        "  if (code === 'same_password' || texte.includes('should be different from the old password')) {",
        "  if (false) {",
        "un mot de passe identique à l'ancien n'est plus expliqué",
    ),
    (
        E,
        "    code === 'otp_expired' ||\n    code === 'token_expired' ||",
        "    false ||\n    false ||",
        "un jeton expiré n'est plus reconnu au retour du lien",
    ),
    (
        E,
        "  return 'La connexion a échoué. Réessayez dans un instant.';",
        "  return '';",
        "une cause inconnue laisse l'utilisateur sans aucune phrase",
    ),
    (
        E,
        "    return `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE} caractères.`;\n  }\n  // Le lien de courriel a expiré",
        "    return `Le mot de passe doit contenir au moins 8 caractères.`;\n  }\n  // Le lien de courriel a expiré",
        "la phrase annonce une longueur que le contrôle n'applique pas",
    ),
    # --- La forme de l'écran ------------------------------------------------
    (
        S,
        "      resultat = await borner(action());",
        "      resultat = await action();",
        "la borne de délai est retirée : un rond peut tourner sans fin",
    ),
    (
        S,
        "  const handleMotDePasseOublie = () => lancer(() => reinitialiserMotDePasse(email));",
        "  const handleMotDePasseOublie = () => { void reinitialiserMotDePasse(email); };",
        "un geste contourne le lanceur : ni verrou, ni borne",
    ),
    (
        S,
        "      enCoursReference.current = false;\n      setEnCours(false);",
        "      setEnCours(false);",
        "le verrou n'est plus relâché : le bouton reste inerte ensuite",
    ),
    (
        S,
        "    if (enCoursReference.current) {",
        "    if (false) {",
        "la réentrance n'est plus refusée : deux appuis lancent deux attentes",
    ),
]


def main():
    # --- Le témoin ---------------------------------------------------------
    #
    # Avant toute mutation : les tests doivent être VERTS. Un témoin rouge
    # rendrait toutes les mutations « détectées » pour la mauvaise raison, et le
    # falsificateur annoncerait une couverture qui n'existe pas.
    code, nombre, sortie = executer_tests()
    if nombre == 0:
        print("HARNAIS : aucun test exécuté. Le motif ne désigne rien.")
        return 1
    if code != 0:
        print(f"TÉMOIN ROUGE : {nombre} test(s), code {code}. Corrigez avant de falsifier.")
        print(sortie[-2000:])
        return 1
    print(f"Témoin vert : {nombre} test(s).\n")

    resultats = []
    for chemin, motif, remplacement, description in MUTATIONS:
        initial = io.open(RACINE / chemin, encoding="utf-8").read()
        try:
            muter(chemin, motif, remplacement)
        except AssertionError as erreur:
            print(f"ANCRE       {description} : {erreur}")
            resultats.append((description, None))
            continue

        try:
            code, nombre, _ = executer_tests()
        finally:
            io.open(RACINE / chemin, "w", encoding="utf-8", newline="\n").write(initial)

        if nombre == 0:
            verdict, detail = "HARNAIS", "aucun test exécuté"
        elif code != 0:
            verdict, detail = "DETECTEE", ""
        else:
            verdict, detail = "NON DETECTEE", "le test reste vert"

        resultats.append((description, verdict == "DETECTEE"))
        print(f"{verdict:<12} {description}{'  — ' + detail if detail else ''}")

    detectees = sum(1 for _, ok in resultats if ok is True)
    ancrees = sum(1 for _, ok in resultats if ok is None)
    print(f"\n{detectees}/{len(resultats)} mutations détectées.")
    if ancrees:
        print(f"{ancrees} ancre(s) introuvable(s) : à corriger.")
    return 0 if detectees == len(resultats) else 1


if __name__ == "__main__":
    sys.exit(main())
