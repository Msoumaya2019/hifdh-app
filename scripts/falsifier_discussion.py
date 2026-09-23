#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Falsificateur de l'espace de discussion.

Même exigence que les autres falsificateurs du dépôt : une mutation qui n'est pas
détectée accuse le test, pas la mutation. Et le témoin compte les tests exécutés,
parce que `node --test` sort en 0 quand un motif ne désigne rien.

Ce que ce fichier vise, ce sont les défauts qui ne se voient PAS sur un
téléphone : un identifiant arrivé en chaîne, un message vide qui passe, un
message de trois mille caractères qui part, l'heure affichée dans un autre
fuseau, un fil affiché dans le désordre, un texte retiré qui réapparaît, une
date « Hier » qui désigne aujourd'hui. Tous se lisent comme une ligne à peine
bizarre, et aucun ne lève d'erreur.

Il vise aussi la promesse de FORME : que rien, dans la table, ne puisse
accueillir un fichier. C'est une garantie qu'un ajout distrait retirerait sans
qu'aucun test de comportement ne s'en aperçoive.

CE QUE CE FICHIER A APPRIS, ET QU'IL FAUT SAVOIR RELIRE
-------------------------------------------------------
Quatre mutations ci-dessous — le filtre des messages retirés, le franchissement
du mois, `29` en dur pour février, la règle de 1900 — portent sur du code qui
N'ÉTAIT PAS dans la source au moment où elles ont été écrites. Elles décrivent
le comportement CORRECT :

    return messages.filter((m) => !m.retire).length;   # pas messages.length
    if (mois === 2) return bissextile(annee) ? 29 : 28; # pas « return 29 »

La source, elle, portait `messages.length` et `return 29`. Lancé dans cet état,
le falsificateur aurait refusé d'écrire, ancre introuvable — et c'est ainsi
qu'il faut le lire : **une ancre qui ne trouve pas sa cible n'est pas un défaut
du falsificateur, c'est la source qui a dérivé de ce que le falsificateur
décrit.** Deux vrais défauts ont été trouvés par cette confrontation : un fil
nettoyé comptait ses messages retirés, et le séparateur de jour affichait
`29/02` pour un 1er mars d'année ordinaire.

Le falsificateur n'est donc pas seulement un juge : il est aussi un TÉMOIN de ce
que la source devrait dire. Quand une ancre tombe à 0 occurrence, comparer la
ligne visée à la ligne attendue avant de réparer l'ancre.
"""

import io
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
TESTS = ["tests/discussion.test.mjs", "tests/discussion_reseau.test.mjs"]
NODE = shutil.which("node") or "node"

# Les fichiers visés, nommés une fois : une ancre qui se trompe de fichier
# donnerait 0 occurrence, et le message d'erreur parlerait de l'ancre au lieu de
# la mutation.
D = "src/lib/discussion.ts"
S = "src/lib/sync/discussion.ts"


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


# === Les mutations ÉQUIVALENTES, qui ne peuvent pas être détectées ===========
#
# Une mutation non détectée n'accuse pas toujours le test : elle peut aussi être
# une réécriture qui ne change RIEN au comportement. Ces trois-là ont été
# mesurées, une par une, en exécutant la fonction mutée sur les entrées du test
# avant de conclure — et non en le supposant. Elles sont donc retirées de la
# liste pour être nommées ici, avec leur preuve. Les y laisser ferait croire à
# trois trous de couverture là où il n'y a rien à couvrir.
#
# 1. LE PREMIER GARDE DE `refusEnvoi` EST REDONDANT.
#    `if (texte.length === 0)` est déjà couvert par le garde suivant :
#    `nettoyerInvisibles(texte).length === 0` est vrai pour la chaîne vide,
#    parce que `nettoyerInvisibles('')` rend `''`. Neutraliser le premier garde
#    ne change donc aucun résultat. Mesuré : `refusEnvoi('')`,
#    `refusEnvoi('   ')` et `refusEnvoi('\n\n')` rendent la même phrase avec et
#    sans la mutation.
#
# 2. L'ORDRE DES DEUX COMPARAISONS DE DATE EST INDIFFÉRENT.
#    `hier` vaut `jourPrecedent(aujourdhui)`, donc à exactement un jour de
#    `aujourdhui`. Aucune date ne peut valoir les deux à la fois : les deux
#    conditions sont mutuellement exclusives, et permuter les lignes ne change
#    rien. Mesuré sur les trois cas (jour même, veille, date ancienne).
#
# 3. UNE COMPARAISON QUI NE REGARDE QUE L'IDENTIFIANT EST PRESQUE ÉQUIVALENTE.
#    Point subtil, et c'est le plus trompeur des trois. Le comparateur est
#    `date` d'abord, `id` ensuite. Or une implémentation qui ne rendrait que
#    `a.id - b.id` donne, mesuré, exactement le même ORDRE pour toute entrée où
#    les dates et les identifiants vont dans le même sens — ce qui est le cas
#    dès qu'on liste des messages par date croissante d'identifiants croissants.
#    Il fallait donc, pour la départager, une entrée où les deux sont
#    OPPOSÉS : le plus grand identifiant portant le message le plus ancien
#    (`[3 à 08h, 1 à 10h, 2 à 09h]` → `[3, 2, 1]` contre `[1, 2, 3]`). Cette
#    entrée existe maintenant dans `tests/discussion.test.mjs`, et la mutation
#    EST détectée. Elle a donc été retirée d'ici aussi — mais gardée en mémoire
#    dans ce commentaire, parce que le cas a coûté trois tentatives.
#
# La règle appliquée : avant de retirer une mutation de la liste, on exécute la
# version mutée et on compare les résultats à la version saine. Une mutation
# dont les résultats diffèrent accuse le test ; une mutation dont les résultats
# sont identiques accuse la mutation, et c'est elle qu'il faut corriger.


def muter(chemin, motif, remplacement):
    fichier = RACINE / chemin
    source = io.open(fichier, encoding="utf-8").read()
    occurrences = source.count(motif)
    if occurrences != 1:
        raise AssertionError(
            f"{chemin} : {occurrences} occurrence(s) de {motif!r}, une seule attendue"
        )
    io.open(fichier, "w", encoding="utf-8", newline="\n").write(
        source.replace(motif, remplacement)
    )


code, nombre, sortie = executer_tests()
if code != 0 or nombre == 0:
    print(f"TÉMOIN ROUGE : {nombre} test(s), code {code}")
    print(sortie[-2500:])
    sys.exit(1)
print(f"témoin : {nombre} test(s), tous verts\n")

MUTATIONS = [
    # --- La conversion des lignes -------------------------------------------
    (
        D,
        "  const id = entierPositif(ligne.id);\n  if (id === null) return null;",
        "  const id = ligne.id as number;\n  if (id === null || id === undefined) return null;",
        "l'identifiant reste une chaîne : deux messages peuvent sembler identiques",
    ),
    (
        D,
        "  if (typeof ligne.auteur !== 'string' || ligne.auteur.length === 0) return null;",
        "  // plus de contrôle d'auteur",
        "une ligne sans auteur se lit quand même : un message fantôme dans le fil",
    ),
    (
        D,
        "    corps: retire ? null : normaliserCorps(ligne.corps),",
        "    corps: normaliserCorps(ligne.corps),",
        "le texte d'un message retiré réapparaît",
    ),
    (
        D,
        "    masqueParModerateur: ligne.masque_par_moderateur === true,",
        "    masqueParModerateur: false,",
        "un message masqué n'est plus signalé comme tel",
    ),
    (
        D,
        "  if (typeof valeur !== 'string') return null;\n  const propre = nettoyerInvisibles(valeur);\n  return propre.length === 0 ? null : propre;",
        "  if (typeof valeur !== 'string') return null;\n  return valeur;",
        "des espaces comptent comme un message",
    ),
    # --- Ce qu'on accepte d'envoyer -----------------------------------------
    # La mutation « le premier garde de `refusEnvoi` est neutralisé » a été
    # retirée : elle est ÉQUIVALENTE, et la preuve est en tête de ce fichier.
    (
        D,
        "  if (nettoyerInvisibles(texte).length === 0) {\n    return 'Écris d’abord un message.';\n  }",
        "  if (false) {\n    return 'Écris d’abord un message.';\n  }",
        "un message fait d'espaces insécables passe : une bulle invisible",
    ),
    (
        D,
        "  if (texte.length > LONGUEUR_MESSAGE_MAX) {",
        "  if (false) {",
        "la borne de longueur ne s'applique plus",
    ),
    (
        D,
        "    return `Trop long de ${exces} caractère${exces > 1 ? 's' : ''}. La limite est ${LONGUEUR_MESSAGE_MAX}.`;",
        "    return 'Trop long.';",
        "l'excès n'est plus dit : l'utilisateur ne sait pas quoi raccourcir",
    ),
    (
        D,
        "  return Math.max(0, LONGUEUR_MESSAGE_MAX - saisie.length);",
        "  return LONGUEUR_MESSAGE_MAX - saisie.length;",
        "le compteur passe sous zéro",
    ),
    (
        D,
        "    .replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '')",
        "    .replace(/[\\u0000-\\u0008]/g, '')",
        "les caractères de contrôle passent dans le message",
    ),
    (
        D,
        "    .replace(/[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069\\uFEFF]/g, ' ')",
        "    .replace(/\\u00A0/g, ' ')",
        "la commande de direction U+202E repart dans le message et peut réordonner l'affichage",
    ),
    # --- L'ordre et la forme du fil -----------------------------------------
    (
        D,
        "  return [...messages].sort((a, b) => {\n    if (a.envoyeLe !== b.envoyeLe) return a.envoyeLe < b.envoyeLe ? -1 : 1;\n    return a.id - b.id;\n  });",
        "  return messages;",
        "le fil s'affiche dans le désordre où la base l'a rendu",
    ),
    (
        D,
        "    if (a.envoyeLe !== b.envoyeLe) return a.envoyeLe < b.envoyeLe ? -1 : 1;\n    return a.id - b.id;",
        "    return a.id - b.id;",
        "l'ordre du fil suit les identifiants, pas les dates",
    ),
    (
        D,
        "  return [...messages].sort((a, b) => {",
        "  return messages.sort((a, b) => {",
        "le tri modifie le tableau reçu",
    ),
    (
        D,
        "  return messages.filter((m) => !m.retire).length;",
        "  return messages.length;",
        "les messages retirés comptent : un fil nettoyé paraît actif",
    ),
    # --- Les dates ----------------------------------------------------------
    (
        D,
        "  return `${jour}/${mois} à ${heure}:${minute}`;",
        "  return new Date(iso).toLocaleTimeString().slice(0, 5);",
        "l'heure passe par le fuseau local : elle change selon l'appareil",
    ),
    (
        D,
        "  if (numero > 1) return formaterJour(annee, mois, numero - 1);\n  if (mois > 1) return formaterJour(annee, mois - 1, joursDuMois(annee, mois - 1));\n  return formaterJour(annee - 1, 12, 31);",
        "  return formaterJour(annee, mois, numero - 1);",
        "le jour précédent ne franchit plus les mois ni les années",
    ),
    (
        D,
        "  if (mois === 2) return bissextile(annee) ? 29 : 28;",
        "  if (mois === 2) return 29;",
        "février fait toujours 29 jours : « Hier » saute au 28 d'une année ordinaire",
    ),
    (
        D,
        "  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;",
        "  return annee % 4 === 0;",
        "1900 est traitée comme bissextile",
    ),
    (
        D,
        "  if (precedent !== null && precedent.envoyeLe.slice(0, 10) === jour) return null;",
        "  if (false) return null;",
        "le séparateur de jour se répète sur chaque message",
    ),
    # --- Les messages d'erreur ----------------------------------------------
    (
        D,
        "    return 'Vous ne pouvez pas écrire dans cette discussion. L’amitié a peut-être été rompue.';",
        "    return message ?? '';",
        "un refus de portée laisse l'utilisateur sans phrase utile",
    ),
    (
        D,
        "    if (brut.includes('réécrit') || brut.includes('reecrit')) {\n      return 'Un message envoyé ne peut pas être réécrit.';\n    }",
        "    if (false) {\n      return 'Un message envoyé ne peut pas être réécrit.';\n    }",
        "une réécriture refusée se confond avec un refus de portée",
    ),
    (
        D,
        "  if (code === '23514') {\n    // Une contrainte `CHECK` : corps vide, ou trop long. Le texte de la base\n    // est long et parle de contraintes ; on préfère une phrase utile.\n    return 'Ce message ne peut pas être envoyé : il est vide ou trop long.';\n  }",
        "  if (false) {\n    return 'inutilisé';\n  }",
        "une contrainte de longueur n'est plus traduite : le texte SQL s'affiche",
    ),
    (
        D,
        "  const propre = (message ?? '').trim();\n  return propre.length > 0 ? propre : \"Le message n'a pas pu être envoyé. Réessayez.\";",
        "  return '';",
        "un code d'erreur inconnu laisse l'utilisateur sans phrase",
    ),
    # --- La forme : aucune prise pour un fichier ----------------------------
    (
        "supabase/discussions.sql",
        "  corps TEXT NOT NULL,",
        "  corps TEXT NOT NULL,\n  piece_jointe TEXT,",
        "une colonne pour un fichier apparaît dans la table",
    ),
    (
        "supabase/discussions.sql",
        "  corps TEXT NOT NULL,",
        "  corps TEXT NOT NULL,\n  video_url TEXT,",
        "une colonne pour une vidéo apparaît dans la table",
    ),
    (
        "app/discussion.tsx",
        "import { Ionicons } from '@expo/vector-icons';",
        "import { Ionicons } from '@expo/vector-icons';\nimport * as ImagePicker from 'expo-image-picker';",
        "l'écran peut joindre une image",
    ),
    (
        "app/discussion.tsx",
        "import { Ionicons } from '@expo/vector-icons';",
        "import { Ionicons } from '@expo/vector-icons';\nimport * as DocumentPicker from 'expo-document-picker';",
        "l'écran peut joindre un fichier",
    ),
    # --- La couche réseau ---------------------------------------------------
    (
        S,
        "  const utilisateur = await borner(utilisateurCourant());",
        "  const utilisateur = await utilisateurCourant();",
        "la lecture de session n'est plus bornée : un rond peut tourner sans fin",
    ),
    (
        S,
        "  if (reponse === DELAI_DEPASSE) return { erreur: MESSAGE_DELAI };",
        "  if (reponse === DELAI_DEPASSE) return { data: null };",
        "un délai dépassé passe pour un résultat vide",
    ),
    (
        S,
        "  return moi < ami ? [moi, ami] : [ami, moi];",
        "  return [moi, ami];",
        "la paire n'est plus rangée : la base refuse l'écriture",
    ),
    (
        S,
        "  const [a, b] = paireCanonique(ctx.userId, amiId);",
        "  const [a, b] = [ctx.userId, amiId];",
        "l'écriture envoie une paire non rangée",
    ),
    (
        S,
        "    auteur: ctx.userId,",
        "    auteur: amiId,",
        "un message est signé du nom de l'autre",
    ),
    (
        S,
        "  const appel = await appelerRpc(ctx.client, 'retirer_message', { p_message: messageId });\n  if ('erreur' in appel) return refuserAppel(appel);\n  return { statut: 'ok', fait: appel.data === true };",
        "  const appel = await appelerRpc(ctx.client, 'retirer_message', { p_message: messageId });\n  if ('erreur' in appel) return refuserAppel(appel);\n  return { statut: 'ok', fait: true };",
        "un retrait refusé est annoncé comme fait",
    ),
    (
        S,
        "  const appel = await appelerRpc(ctx.client, fonction, { p_message: messageId });\n  if ('erreur' in appel) return refuserAppel(appel);\n  return { statut: 'ok', fait: appel.data === true };",
        "  const appel = await appelerRpc(ctx.client, fonction, { p_message: messageId });\n  if ('erreur' in appel) return refuserAppel(appel);\n  return { statut: 'ok', fait: true };",
        "un masquage refusé par la base est annoncé comme fait",
    ),
    (
        S,
        "  const messages = lignes.map(lireMessage).filter((m): m is MessageDiscussion => m !== null);\n  return { statut: 'ok', messages };",
        "  const messages = lignes.map(lireMessage) as MessageDiscussion[];\n  return { statut: 'ok', messages };",
        "une ligne illisible reste dans le fil",
    ),
    (
        S,
        "  const reponse = await borner(\n    ctx.client.from('discussion_messages').insert({\n      user_a: a,\n      user_b: b,\n      auteur: ctx.userId,\n      corps: preparerEnvoi(saisie),\n    })\n  );",
        "  const reponse = await borner(\n    ctx.client.from('discussion_messages').insert({\n      user_a: a,\n      user_b: b,\n      auteur: ctx.userId,\n      corps: saisie,\n    })\n  );",
        "le message part sans être préparé : caractères de contrôle inclus",
    ),
]

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
        code, nombre, sortie = executer_tests()
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
sys.exit(0 if detectees == len(resultats) else 1)
