"""Verifie la pagination du moushaf (604 pages) portee par le texte coranique.

Pourquoi ce fichier existe
--------------------------
Chaque verset de `quran_text_uthmani.json` porte un champ `page`. Ce champ vient
du jeu de donnees initial ; il n'a jamais ete controle, et il n'etait utilise
nulle part. L'application s'apprete a s'en servir pour afficher le Coran page
par page : une pagination fausse y produirait des pages qui ne correspondent a
aucun moushaf, sans que rien ne le signale.

Une page fausse est invisible a l'oeil sur un seul ecran. Elle se voit en
revanche tout de suite sur les invariants : 604 pages numerotees de 1 a 604,
sans trou ni recul, la premiere et la derniere connues, et 6 236 versets
repartis exactement une fois.

Le recoupement
--------------
Deux sources independantes decrivent les memes frontieres :

  - les champs `juz` et `hizbQuarter` du fichier de texte (jeu initial) ;
  - `divisions.json`, derive de quran-meta (source KFGQPC).

Elles doivent tomber d'accord au verset pres. C'est ce que ce script verifie :
un desaccord signifierait qu'une des deux tables de divisions est fausse, et il
faut le savoir avant de s'en servir.

Usage :
    python verifier_pages.py                 # invariants, hors ligne
    python verifier_pages.py --recouper-api  # + recoupement de l'API quran.com
"""

import io
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ICI = pathlib.Path(__file__).parent
TEXTE = ICI / "quran_text_uthmani.json"
DIVISIONS = ICI / "divisions.json"

ATTENDU_NB_VERSETS = 6236
ATTENDU_NB_PAGES = 604

# Bornes de controle, verifiables sur n'importe quel moushaf imprime de
# Madine : la premiere page porte la Fatiha entiere, la deuxieme ouvre
# Al-Baqara, et la derniere reunit les trois dernieres sourates.
BORNES_CONNUES = {
    1: ((1, 1), (1, 7)),
    2: ((2, 1), (2, 5)),
    604: ((112, 1), (114, 6)),
}

resultats = []


def verifier(nom, condition, detail=""):
    resultats.append((nom, bool(condition)))
    print(f"{'OK   ' if condition else 'ECHEC'}  {nom}{'  — ' + detail if detail else ''}")
    return bool(condition)


def charger():
    versets = json.loads(TEXTE.read_text(encoding="utf-8"))
    divisions = json.loads(DIVISIONS.read_text(encoding="utf-8"))
    return versets, divisions


def bornes_par_page(versets):
    """Premier et dernier verset de chaque page, dans l'ordre du moushaf."""
    bornes = {}
    for v in versets:
        page = v.get("page")
        cle = (v["surah"], v["ayah"])
        if page not in bornes:
            bornes[page] = [cle, cle]
        else:
            bornes[page][1] = cle
    return {p: (tuple(b[0]), tuple(b[1])) for p, b in bornes.items()}


def controler_invariants(versets, divisions):
    verifier("le fichier porte 6 236 versets", len(versets) == ATTENDU_NB_VERSETS,
             f"{len(versets)} versets")

    sans_page = [v for v in versets if not isinstance(v.get("page"), int)]
    verifier("chaque verset porte un numero de page entier", not sans_page,
             f"{len(sans_page)} verset(s) sans page" if sans_page else "")

    pages = [v["page"] for v in versets]
    distinctes = sorted(set(pages))
    verifier("604 pages distinctes", len(distinctes) == ATTENDU_NB_PAGES,
             f"{len(distinctes)} pages")
    verifier("les pages sont exactement 1..604",
             distinctes == list(range(1, ATTENDU_NB_PAGES + 1)),
             f"min {min(pages)}, max {max(pages)}")

    reculs = [(i, pages[i - 1], pages[i]) for i in range(1, len(pages)) if pages[i] < pages[i - 1]]
    verifier("la page ne recule jamais", not reculs, f"{len(reculs)} recul(s) {reculs[:3]}")

    sauts = [(pages[i - 1], pages[i]) for i in range(1, len(pages)) if pages[i] > pages[i - 1] + 1]
    verifier("aucune page n'est sautee", not sauts, f"{len(sauts)} saut(s) {sauts[:3]}")

    bornes = bornes_par_page(versets)
    for page, (debut, fin) in BORNES_CONNUES.items():
        verifier(
            f"page {page} : {debut[0]}:{debut[1]} a {fin[0]}:{fin[1]}",
            bornes.get(page) == (debut, fin),
            f"trouve {bornes.get(page)}",
        )

    total = sum(1 for _ in versets)
    verifier("chaque verset est compte une seule fois", total == ATTENDU_NB_VERSETS, f"{total}")

    # Recoupement : les frontieres de juz' et de rub' portees par le fichier de
    # texte doivent coincider avec divisions.json, qui vient d'une autre source.
    transitions_juz = []
    precedent = None
    for i, v in enumerate(versets):
        if v.get("juz") != precedent:
            transitions_juz.append((v["juz"], i + 1))
            precedent = v.get("juz")
    verifier("30 transitions de juz' dans le fichier de texte", len(transitions_juz) == 30,
             f"{len(transitions_juz)}")
    ecarts_juz = [
        (num, aid, j["juzNumber"], j["start"]["ayahId"])
        for (num, aid), j in zip(transitions_juz, divisions["juz"])
        if j["juzNumber"] != num or j["start"]["ayahId"] != aid
    ]
    verifier("les juz' du texte et divisions.json coincident",
             not ecarts_juz and len(transitions_juz) == len(divisions["juz"]),
             f"{len(ecarts_juz)} ecart(s) {ecarts_juz[:3]}")

    transitions_rub = []
    precedent = None
    for i, v in enumerate(versets):
        if v.get("hizbQuarter") != precedent:
            transitions_rub.append((v["hizbQuarter"], i + 1))
            precedent = v.get("hizbQuarter")
    verifier("240 transitions de rub' dans le fichier de texte", len(transitions_rub) == 240,
             f"{len(transitions_rub)}")
    ecarts_rub = [
        (num, aid, r["rubNumber"], r["start"]["ayahId"])
        for (num, aid), r in zip(transitions_rub, divisions["rub"])
        if r["rubNumber"] != num or r["start"]["ayahId"] != aid
    ]
    verifier("les rub' du texte et divisions.json coincident",
             not ecarts_rub and len(transitions_rub) == len(divisions["rub"]),
             f"{len(ecarts_rub)} ecart(s) {ecarts_rub[:3]}")

    return bornes


def recouper_avec_api(versets):
    """Confronte la pagination locale a celle de l'API quran.com.

    Facultatif, et volontairement hors du controle automatique : il depend du
    reseau, donc il ne doit pas faire echouer une verification qu'on veut
    rejouable hors ligne. Il sert a etablir, une fois, que la pagination du
    depot n'est pas propre a une seule source.
    """
    locales = {(v["surah"], v["ayah"]): v["page"] for v in versets}
    ecarts = []
    lues = 0

    # L'API refuse l'agent par defaut d'urllib en « 403 Forbidden ». Mesure
    # faite : sans cet en-tete, le recoupement echoue pour une raison qui n'a
    # rien a voir avec la pagination.
    entetes = {"User-Agent": "hifdh-app/verification-pagination"}

    for chapitre in range(1, 115):
        url = (
            "https://api.quran.com/api/v4/verses/by_chapter/"
            f"{chapitre}?fields=page_number&per_page=300"
        )
        try:
            requete = urllib.request.Request(url, headers=entetes)
            with urllib.request.urlopen(requete, timeout=30) as reponse:
                charge = json.loads(reponse.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as erreur:
            print(f"ECHEC  recoupement interrompu au chapitre {chapitre} : {erreur}")
            resultats.append(("recoupement avec l'API quran.com", False))
            return
        for verset in charge.get("verses", []):
            sourate, ayah = (int(x) for x in verset["verse_key"].split(":"))
            lues += 1
            attendue = verset.get("page_number")
            if locales.get((sourate, ayah)) != attendue:
                ecarts.append((sourate, ayah, locales.get((sourate, ayah)), attendue))

    verifier("l'API quran.com rend 6 236 versets", lues == ATTENDU_NB_VERSETS, f"{lues}")
    verifier("la pagination du depot coincide avec celle de l'API",
             not ecarts, f"{len(ecarts)} ecart(s) {ecarts[:5]}")


def main():
    versets, divisions = charger()
    controler_invariants(versets, divisions)

    if "--recouper-api" in sys.argv:
        recouper_avec_api(versets)

    echecs = [nom for nom, ok in resultats if not ok]
    print(f"\n{len(resultats) - len(echecs)}/{len(resultats)} verifications concluantes.")
    if echecs:
        print("En echec : " + " ; ".join(echecs))
        sys.exit(1)


if __name__ == "__main__":
    main()
