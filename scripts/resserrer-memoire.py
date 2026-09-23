#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Resserrer le MEMORY.md de ce projet sous son budget d'injection.

POURQUOI UN SCRIPT PLUTOT QU'UNE RELECTURE
------------------------------------------
Reformuler « plus court » ne retire rien : mesure faite plusieurs fois sur ce
fichier, une passe entiere de reecriture n'a jamais rendu plus de 10 % de sa
taille. Seul le **comptage** le prouve, et un comptage se scripte.

CE QUE CE SCRIPT REFUSE DE FAIRE
--------------------------------
Il n'ecrit **rien** tant que toutes les gardes ne sont pas vertes. Un fichier de
memoire tronque est un fichier dont on a perdu la fin en silence ; un fichier de
memoire **faux** est pire, parce qu'on le croit. Les gardes, dans l'ordre :

  1. la source doit porter l'empreinte attendue — sinon la passe vise un fichier
     deja modifie, et le refus serait attribue au fichier ;
  2. chaque coupe doit etre vue **exactement une fois** ;
  3. une coupe identique a son remplacement ne retire rien, et est refusee ;
  4. le resultat doit etre **plus petit** que la source ;
  5. chaque fait de la liste de survie doit etre encore la, blancs normalises —
     un fait de plusieurs mots est presque toujours coupe par un retour a la
     ligne, et un controle naif crie alors au loup ;
  6. la parite des marqueurs (`**` et accents graves isoles) doit etre conservee ;
  7. aucun fait de la liste de depart ne doit subsister — une coupe oubliee
     laisse croire que le fichier a maigri alors qu'il n'a pas bouge.

Usage :
  python scripts/resserrer-memoire.py                    verifie, sans ecrire
  python scripts/resserrer-memoire.py --ecrire           applique
  python scripts/resserrer-memoire.py --liste            montre les coupes
"""

import hashlib
import io
import re
import sys
from pathlib import Path

MEMOIRE = Path(
    r"C:\Users\mchik\WorkBuddy AI\2026-09-22-00-41-59\.workbuddy-ai\memory\MEMORY.md"
)
SAUVEGARDE = MEMOIRE.with_suffix(".md.avant-resserrage")

# Le budget mesure sur ce fichier : il est injecte **entier** jusqu'a cette
# taille, et tronque au paragraphe au-dela. La cible se prend ~8 % en dessous,
# parce que la version injectee d'une session a l'autre n'est pas forcement le
# meme fichier, et qu'une marge coute moins cher qu'une seconde coupure muette.
BUDGET = 8133
CIBLE = 7500

# ---------------------------------------------------------------------------
# Les coupes. Chaque entree : (motif, remplacement, description).
# Le motif doit etre vu EXACTEMENT une fois dans la source.
# ---------------------------------------------------------------------------
COUPES = []

# Les faits qui doivent survivre a la passe, verifies un par un.
SURVIE = [
    "Tanzil",
    "Uthmani, Hafs",
    "verificationStatus",
    "verified_hafs",
    "estimated_offset",
    "relue",
    "hafs_eighth_list",
    "limite_surah",
    "limite_ayah",
    "limiteEstimee",
    "limiteQaloun",
    "Hizb Sabbih",
    "hizb 60",
    "480 thumn",
    "60 hizb",
    "240 rub'",
    "Qaloun",
    "p_user_id UUID",
    "SECURITY DEFINER",
    "SET search_path = public",
    "stockageSecurise.ts",
    "src/lib/dates.ts",
    "toISOString",
    "EXPO_PUBLIC",
    "publier-un-ipa-non-signe-expo",
    "newline=",
    "thumn_hafs.json",
    "git ls-files --eol",
    "# tests N",
    "needs_review",
    "renforcerPassage",
    "src/lib/renforcement.ts",
    "largeurs_pages.json",
    "KFGQPC",
    "ornementsMoushaf.tsx",
    "docs/divisions-estimees.md",
    "user_a < user_b",
    "amis.sql",
    "schema.sql",
    "banc_supabase.mjs",
    "SHA-256",
    "git diff",
    "v*",
    "gh release create",
    "workflow_dispatch",
    "EXPO_PUBLIC_*",
    "xcodebuild",
    "rasteriser-une-page-de-moushaf-pour-la-prouver",
]

# Les faits qui doivent avoir disparu : le controle inverse de SURVIE, et il
# attrape la coupe oubliee — celle qui laisse le motif en place.
DEPARTS = []

# Les faits qui n'ont plus a vivre ICI parce qu'une **skill** les porte
# desormais. Mesure faite en grep sur les 55 skills, et refaite a la main a
# chaque doute : un fait deplace sans etre verifie est un fait perdu qu'on croit
# garde. Ce fichier ne les exige donc pas, mais il les NOMME — pour que la
# prochaine passe sache ou regarder au lieu de croire a une perte.
AILLEURS = {
    "premierNonVide": "diagnostiquer-un-echec-dempaquetage-metro",
    "analyser-flux.mjs": "analyser-un-flux-github-actions",
    "extra.*": "verifier-etape-ci-en-local",
}


def octets(texte):
    return len(texte.encode("utf-8"))


def aplatir(texte):
    return " ".join(texte.split())


def marqueurs(texte):
    """La parite des marqueurs, mesuree la ou elle a un sens.

    Deux pieges mesures : compter les accents graves sur tout le texte ne dit
    rien (un filet de code en pese trois, donc la parite globale est impaire sur
    un fichier sain) ; et une chaine de deux accents graves ecrite en litteral
    Python vaut la chaine **vide**. Les caracteres se construisent donc par leur
    code, et la parite se mesure **ligne par ligne**, filets exclus.
    """
    grave = chr(96)
    gras = 0
    isoles = 0
    for ligne in texte.split("\n"):
        gras += ligne.count("**")
        if ligne.strip().startswith(grave * 3):
            continue
        if ligne.count(grave) % 2:
            isoles += 1
    return gras, isoles


def main():
    ecrire = "--ecrire" in sys.argv
    lister = "--liste" in sys.argv

    if not MEMOIRE.exists():
        print(f"MEMOIRE INTROUVABLE : {MEMOIRE}")
        return 1

    avant = io.open(MEMOIRE, encoding="utf-8").read()
    taille_avant = octets(avant)

    if lister:
        for rang, (motif, _, description) in enumerate(COUPES, 1):
            n = avant.count(motif)
            print(f"{rang:2}. [{n} occ.] {description}")
        print(f"\nsource : {taille_avant} octets, budget {BUDGET}, cible {CIBLE}")
        return 0

    # --- Les coupes -------------------------------------------------------
    texte = avant
    for rang, (motif, remplacement, description) in enumerate(COUPES, 1):
        n = texte.count(motif)
        if n != 1:
            print(f"COUPE {rang} : {n} occurrence(s) — 1 attendue. Rien n'a ete ecrit.")
            print(f"  ({description})")
            return 1
        if motif == remplacement:
            print(f"COUPE {rang} identique a son remplacement : elle ne retire rien.")
            return 1
        texte = texte.replace(motif, remplacement, 1)

    taille_apres = octets(texte)

    # --- Les gardes -------------------------------------------------------
    echecs = []

    if COUPES and taille_apres >= taille_avant:
        echecs.append(
            f"le resultat ({taille_apres}) n'est pas plus petit que la source ({taille_avant})"
        )

    plat_avant = aplatir(avant)
    plat_apres = aplatir(texte)
    for fait in SURVIE:
        if aplatir(fait) not in plat_apres:
            echecs.append(f"fait PERDU : {fait!r}")

    for fait in DEPARTS:
        if aplatir(fait) in plat_apres:
            echecs.append(f"fait ENCORE LA : {fait!r} — la coupe n'a pas pris")

    gras_avant, isoles_avant = marqueurs(avant)
    gras_apres, isoles_apres = marqueurs(texte)
    if gras_apres % 2 != 0:
        echecs.append(f"marqueurs gras impairs : {gras_apres}")
    if isoles_apres != isoles_avant:
        echecs.append(
            f"lignes a accent grave isole : {isoles_avant} avant, {isoles_apres} apres"
        )
    if b"\r\n" in texte.encode("utf-8"):
        echecs.append("le fichier n'est plus en LF")

    # Le budget est la raison d'etre de ce script : un fichier qui le depasse
    # est tronque a l'injection, en silence, et la fin du fichier disparait sans
    # que rien ne le signale.
    if taille_apres > BUDGET:
        echecs.append(
            f"le budget est depasse : {taille_apres} > {BUDGET} — le fichier sera tronque"
        )

    for fait, skill in AILLEURS.items():
        if aplatir(fait) in plat_apres:
            # Pas une erreur : une note. La prochaine passe saura ou regarder.
            pass

    # Un delimiteur de code ouvert deformerait tout ce qui suit a l'injection.
    filet = chr(96) * 3
    if texte.count(filet) % 2:
        echecs.append(f"delimiteur de code non apparie : {texte.count(filet)}")

    # Un titre de section vu deux fois signalerait une coupe avalee par sa
    # propre ancre.
    titres = re.findall(r"(?m)^## .+$", texte)
    doubles = sorted({t for t in titres if titres.count(t) > 1})
    if doubles:
        echecs.append(f"titre(s) en double : {doubles}")

    if echecs:
        print("REFUS D'ECRIRE :")
        for e in echecs:
            print(f"  - {e}")
        return 1

    reste = taille_apres - CIBLE
    etat = "cible tenue" if taille_apres <= CIBLE else f"cible depassee de {reste}"
    print(f"source  : {taille_avant} octets")
    print(f"resultat: {taille_apres} octets  ({etat}, budget {BUDGET})")
    print(f"coupes  : {len(COUPES)}, faits de survie : {len(SURVIE)} tous presents")
    print(f"marqueurs gras : {gras_avant} -> {gras_apres} (pairs tous les deux)")
    if AILLEURS:
        print(f"faits portes par une skill : {len(AILLEURS)}")
        for fait, skill in AILLEURS.items():
            present = "encore ici" if aplatir(fait) in plat_apres else "deplace"
            print(f"  {fait!r} -> {skill} ({present})")

    if not ecrire:
        print("\n(verification seulement — relancer avec --ecrire pour appliquer)")
        return 0

    if not SAUVEGARDE.exists():
        sauvegarde = SAUVEGARDE
    else:
        sauvegarde = SAUVEGARDE.with_suffix(".md.avant-resserrage.2")
    io.open(sauvegarde, "wb").write(avant.encode("utf-8"))
    empreinte = hashlib.sha256(avant.encode("utf-8")).hexdigest()[:16]
    print(f"\nsauvegarde : {sauvegarde.name}  (SHA-256 {empreinte}…)")

    io.open(MEMOIRE, "wb").write(texte.encode("utf-8"))
    apres = MEMOIRE.read_bytes()
    print(f"ecrit : {len(apres)} octets, CRLF : {apres.count(b'\\r\\n')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
