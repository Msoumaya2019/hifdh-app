# Attributions et licences

Ce dépôt redistribue des données et des polices produites par des tiers. Chacune
est utilisée sous sa licence d'origine, rappelée ici. Toute réutilisation de ce
dépôt doit conserver ces mentions.

---

## 1. Texte coranique

- **Œuvre** : Tanzil Quran Text (Uthmani, Version 1.1), graphie uthmani,
  narration Hafs 'an Asim, 6 236 versets.
- **Source** : Tanzil Project — <https://tanzil.net>
- **Licence** : Creative Commons Attribution 3.0
- **Fichier** : `data/quran/quran_text_uthmani.json`
- **Notice intégrale** : `data/quran/TANZIL_LICENSE.txt`, reproduite telle quelle
  comme la licence l'exige.

Le texte n'est **jamais** modifié, ni corrigé, ni généré par un modèle de
langage. Le script `data/quran/import_tanzil_text.py` se contente de recopier les
versets de la source officielle ; il ne touche qu'au champ `text` et laisse
intacts `juz`, `page` et `hizbQuarter`, qui portent la structure des divisions.

Paramètres exacts du téléchargement, pour que la provenance soit reproductible :

```
https://tanzil.net/pub/download/index.php
    ?quranType=uthmani    # graphie uthmani, Hafs 'an Asim
    &marks=true           # marques de pause (ۖ ۗ ۚ ۛ)
    &sajdah=true          # signes de prosternation
    &rub=true             # marqueurs de rub' al-hizb (۞)
    &outType=txt-2        # format « sourate|verset|texte »
    &agree=true
```

Empreinte du fichier source utilisé :

```
sha256  4b91f9e6e8ac645d039e4ed85b3be492e795232a31cd22d668ac58238722e26f
```

> Note de provenance. Le texte initialement intégré provenait de l'édition
> `quran-uthmani` de l'API AlQuran Cloud. La comparaison verset par verset a
> montré qu'il ne s'agissait pas du texte de Tanzil (3 617 versets sur 6 236
> différaient, principalement par les marques d'ikhfā et d'iqlāb et par
> l'écriture du hamza) et qu'il contenait un BOM parasite en tête de 1:1. Le
> dépôt a donc été basculé sur la source Tanzil officielle, dont la licence est
> explicite et vérifiable.

---

## 2. Métadonnées de division

- **Œuvre** : quran-meta — <https://github.com/quran-center/quran-meta>
- **Licence** : MIT
- **Usage** : limites des 30 juz', 60 hizb et 240 rub' al-hizb, dérivées de la
  source KFGQPC.

Les 480 toumoun (thumn al-hizb) ne sont **pas** fournis par quran-meta pour la
narration Hafs. Ils sont donc *dérivés*, et chaque entrée porte son statut de
vérification dans `data/quran/thumn_hafs.json` :

| Statut | Nombre | Signification |
| --- | --- | --- |
| `verified_hafs` | 240 | limite lue directement dans les données Hafs |
| `verified` | 89 | limite intermédiaire, sourate au nombre de versets identique |
| `estimated_offset` | 151 | limite intermédiaire estimée, **à confirmer** sur un mushaf imprimé |
| `relue` | 0 | limite lue sur un mushaf Hafs imprimé, puis appliquée |

`relue` n'est pas une nuance de `verified` : `verified` dit une **propriété du
calcul** — la sourate a le même nombre de versets dans les deux lectures, donc
le report depuis Qaloun est exact. `relue` dit autre chose : quelqu'un a ouvert
un moushaf imprimé et a lu la limite. Les confondre ferait disparaître la
distinction sans le dire. Le décompte de `estimated_offset` baisse à chaque
relecture appliquée par `data/quran/appliquer_corrections.py` ; les nombres
ci-dessus sont ceux du fichier livré.

Les entrées `estimated_offset` ne doivent pas être présentées comme
authentifiées. L'architecture les isole dans un fichier unique, de sorte qu'une
correction n'exige aucune modification du reste de l'application.

La liste précise des limites estimées — sourate par sourate, avec la référence
Qaloun dont chacune est issue — est dans **`docs/divisions-estimees.md`**. Ce
document est engendré par `data/quran/rapport_divisions_estimees.py`, et le
contrôle `npm run verifier:rapport` refuse qu'il dérive des données.

---

## 2 bis. Pagination du moushaf (604 pages)

- **Ce que c'est** : le découpage en 604 pages du moushaf de Médine, porté par le
  champ `page` de chaque verset de `data/quran/quran_text_uthmani.json`.
- **Origine** : le jeu de données initialement intégré, dont les champs `juz`,
  `page` et `hizbQuarter` ont été conservés tels quels lors du basculement du
  texte vers Tanzil (voir la note de provenance ci-dessus). Le texte, lui, vient
  de Tanzil ; la pagination ne dépend pas de la source du texte, puisque les deux
  numérotent les mêmes 6 236 versets de la même façon.

Cette pagination n'a pas été reprise sur parole. Elle est corroborée par trois
chemins indépendants :

1. **Invariants** — 604 pages numérotées de 1 à 604, sans trou ni recul, page 1 =
   1:1-7, page 2 = 2:1-5, page 604 = 112:1-114:6, et 6 236 versets répartis
   exactement une fois. Contrôle : `data/quran/verifier_pages.py`, lancé par
   `npm run verifier:pages`.
2. **Accord avec une seconde source de divisions** — les champs `juz` et
   `hizbQuarter` du fichier de texte et `divisions.json` (dérivé de quran-meta,
   source KFGQPC) décrivent les mêmes frontières, au verset près : 30 juz' et
   240 rub' al-hizb, zéro écart.
3. **Accord avec l'API quran.com** — le champ `page_number` de l'API coïncide
   avec la pagination du dépôt sur les 6 236 versets. Contrôle :
   `npm run recouper:pages`. Ce recoupement dépend du réseau et n'est donc pas
   dans l'intégration continue ; il se lance à la demande.

Une page imprimée du moushaf (page 401, Juz' 20, sourate 29) a également servi
de témoin : elle porte 29:39 à 29:45, ce que la donnée du dépôt reproduit.

**Ce que l'application affiche exactement** : les bornes de page, c'est-à-dire la
liste des versets que porte chaque page. **Ce qu'elle n'affiche pas exactement** :
les coupures de ligne à l'intérieur d'une page, qui dépendent de la fonte et de
la justification de l'édition imprimée. L'écran le dit à l'utilisateur.

---

## 3. Polices de caractères

- **Œuvre** : Amiri — Amiri Regular, Amiri Bold, Amiri Quran
- **Auteurs** : Copyright 2010-2022 The Amiri Project Authors
  — <https://github.com/aliftype/amiri>
- **Licence** : SIL Open Font License 1.1
- **Notice intégrale** : `assets/fonts/OFL.txt`
- **Fichiers** : `assets/fonts/Amiri-Regular.ttf`, `Amiri-Bold.ttf`,
  `AmiriQuran.ttf`

---

## 3 bis. Polices de page du moushaf (QCF v1)

- **Œuvre** : polices de page du moushaf de Madine, version 1 (QCF v1, édition
  1405H) — 604 polices TrueType, une par page.
- **Auteur** : Complexe Roi Fahd pour l'impression du Saint Coran (KFGQPC),
  Médine.
- **Source** : <https://static.qurancdn.com/fonts/quran/hafs/v1/ttf> —
  distribuées par quran.com, le service dont proviennent aussi les numéros de
  ligne du moushaf (voir `## 2 bis`).
- **Licence** : conditions du Complexe Roi Fahd — usage libre, y compris dans
  les sites et les logiciels ; attribution au Complexe Roi Fahd seule ; fichiers
  non modifiés ; polices non vendues.
- **Fichiers** : `assets/polices-pages/p001.ttf` … `p604.ttf`
  (604 fichiers, 95 051 108 octets).
- **Manifeste** : `data/quran/polices_pages.json` — la taille et l'empreinte
  SHA-256 de chacun des 604 fichiers, avec la provenance ci-dessus. C'est lui
  qui rend la copie vérifiable, et non une déclaration.
- **Aucune modification** : les fichiers sont recopiés octet pour octet, sans
  sous-ensemble ni réencodage.

Ces polices ne dessinent pas des lettres mais **des mots** : chaque mot imprimé
y est un seul point de code, et son avance est celle du calligraphe. C'est ce
qui permet à l'écran de page de l'application d'être la page imprimée — les
mêmes coupures, les mêmes places — plutôt qu'une composition qui lui ressemble.
Aucun texte coranique n'y est stocké : le texte reste celui de Tanzil, et la
police ne fait que le dessiner.

---

## 3 ter. Images des pages du moushaf (604 pages)

L'affichage « page du moushaf » montre désormais l'**image** de la page
imprimée, et non plus une composition de cette page. Les 604 images ne sont pas
redistribuées dans ce dépôt : elles sont téléchargées à la demande, puis gardées
dans le cache local de l'appareil.

- **Œuvre** : photographies numériques du moushaf de Madine, narration Hafs
  'an Asim, 604 pages (1 à 604, sans page manquante).
- **Source** : jeu `Zohanur2026/zohanur-mushaf-pages-hafs`, servi par le CDN
  jsDelivr — <https://cdn.jsdelivr.net/gh/Zohanur2026/zohanur-mushaf-pages-hafs@main/{page}.jpg>
- **Licence** : **non déclarée** par la source. Voir l'avertissement ci-dessous.
- **Code** : `src/lib/pagesMoushaf.ts` — `getMushafPageImage(page)` est le seul
  point de contact avec cette source ; `SOURCE_PAGES` en est le seul endroit à
  modifier pour en changer.
- **Cache** : `src/lib/cachePagesMoushaf.ts` — une page téléchargée est écrite
  sur le disque et n'est plus retéléchargée.
- **Repli** : si le cache disque n'est pas disponible sur l'appareil — le module
  natif de fichiers peut être absent, et `cacheDirectory` vaut alors `null` sans
  lever — l'image n'est **pas** cachée : c'est l'URL distante qui est rendue, et
  l'`Image` de React Native l'affiche avec son propre cache réseau. Une panne du
  cache ne doit jamais retirer la page à la personne qui la lit.
- **Vérification** : `npm run verifier:pages-moushaf` (et son falsificateur
  `npm run falsifier:pages-moushaf`), qui contrôle les invariants de la source
  et, avec `--reseau`, l'existence réelle des pages.

### Avertissement sur la licence des images

Contrairement au texte de Tanzil (CC-BY 3.0), aux métadonnées et aux polices,
**le jeu d'images ne porte aucune licence explicite**. Le dépôt qui les héberge
n'en déclare aucune. C'est signalé ici plutôt que passé sous silence, et c'est
la raison pour laquelle :

1. les images ne sont **pas** redistribuées dans ce dépôt ;
2. la source est isolée derrière une seule fonction, pour qu'un remplacement
   soit possible sans toucher au reste de l'application ;
3. **avant toute distribution de l'application**, il appartient à la personne
   qui la publie de vérifier que l'usage de ces images est autorisé — ou de les
   remplacer par une source dont la licence est établie.

Le code des pages du moushaf est écrit pour que ce remplacement soit une
modification d'une seule constante.

### Pourquoi pas quran.com

Quran.com a été essayé en premier, comme demandé à l'origine. Son API v4 — et la
nouvelle API de la Quran Foundation, qui demande désormais des identifiants
d'application — expose le texte, les traductions, l'audio et la recherche, mais
**aucune image de page** : ni champ `image` sur un verset, ni ressource
« pages ». Les URL d'images du site ne sont pas non plus adressables (essayées :
404 ou 403). Quran.com n'est donc pas exploitable pour les images, et c'est la
solution de repli qui a été mise en place.
