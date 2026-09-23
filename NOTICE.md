# Attributions et licences

Ce dépôt redistribue des données produites par des tiers — texte coranique,
divisions, images des pages du moushaf, polices de texte, et les **mesures**
prises sur les polices de page. Chacune est utilisée sous sa licence d'origine,
rappelée ici. Toute réutilisation de ce dépôt doit conserver ces mentions.

Les **604 polices de page** elles-mêmes ne sont pas redistribuées : elles pèsent
92 Mo, aucun code ne les emploie, et ce poids faisait dépasser la limite du CDN
qui sert les images des pages. Leur provenance, leur licence et le moyen de les
rétablir à l'identique sont en §3 bis.

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
- **Fichiers** : **absents du dépôt, et c'est délibéré** — voir ci-dessous. Ils se
  rétablissent par `python scripts/recuperer_polices_pages.py`, qui les écrit
  dans `assets/polices-pages/p001.ttf` … `p604.ttf` (604 fichiers,
  95 051 108 octets), dossier écarté par `.gitignore`. Les fichiers obtenus se
  confrontent au manifeste par `python scripts/recuperer_polices_pages.py
  --verifier`, qui lit chaque empreinte sans réseau.
- **Manifeste** : `data/quran/polices_pages.json` — la taille et l'empreinte
  SHA-256 de chacun des 604 fichiers, avec la provenance ci-dessus. Il est
  **versionné** : c'est lui qui rend la copie vérifiable — et rétablissable à
  l'identique — plutôt qu'une déclaration.
- **Aucune modification** : les fichiers sont recopiés octet pour octet, sans
  sous-ensemble ni réencodage.

**Pourquoi les fichiers ne sont pas dans le dépôt.** Ils pèsent 92 Mo, pour des
polices qu'aucun code n'emploie : la composition par police a été retirée du
lecteur, et le mode « page du moushaf » affiche l'**image** de la page (§3 ter).
Or ce poids faisait passer le dépôt au-dessus de la limite de 150 Mo par paquet
du CDN qui sert ces images — la seule limite qui compte ici, puisque c'est elle
qui décide si une page s'affiche. Les retirer a ramené le dépôt sous cette
limite. Rien de ce qui est livré n'a changé : aucune version publiée n'embarquait
ces polices, mesuré dans l'APK.

**Ce qui reste versionné, et pourquoi.** Ce que ces polices portent est utile
même sans elles : la table `data/quran/largeurs_pages.json` donne, pour chacune
des 604 pages, la largeur naturelle de ses quinze lignes et sa largeur de
référence. Elle est **lue par l'application**, et elle enregistre l'empreinte de
`moushaf_layout.json` au moment de la mesure — c'est ce qui permet de vérifier,
sans les polices, qu'elle décrit bien la mise en page courante. La mesure
elle-même se refait à la demande, polices rétablies, par
`python scripts/mesurer_largeurs_pages.py` ; son `--verifier` recalcule tout et
compare à la table.

Ces polices ne dessinent pas des lettres mais **des mots** : chaque mot imprimé
y est un seul point de code, et son avance est celle du calligraphe. C'est ce qui
a permis de mesurer les coupures de ligne sur la main de l'imprimeur plutôt que
sur une police de texte. Aucun texte coranique n'y est stocké : le texte reste
celui de Tanzil, et la police ne fait que le dessiner.

---

## 3 ter. Images des pages du moushaf (604 pages)

L'affichage « page du moushaf » montre l'**image** de la page imprimée, et non
une composition de cette page. Les 604 images sont **rangées dans ce dépôt**,
sous `pages-moushaf/`, et servies depuis ce dépôt. Elles ne sont pas embarquées
dans l'application : elles sont téléchargées à la demande, puis gardées dans le
cache local de l'appareil.

- **Œuvre** : les pages du moushaf de Madine, narration Hafs 'an Asim, 604 pages
  (1 à 604, sans page manquante), telles qu'elles sont imprimées — cadre,
  médaillons, cartouches et numéros compris.
- **Provenance** : extraites de l'archive `com.quran.ios-2.6.8-eeveedecrypter.ipa`
  fournie par le propriétaire du projet, dossier
  `Payload/Quran.app/hafs_1405/images_1920/width_1920/`. Les 604 fichiers sont
  **recopiés octet pour octet** : aucun réencodage, aucun redimensionnement,
  aucune retouche.
- **Droits** : le propriétaire du projet déclare détenir les droits sur cette
  archive et sur son usage ici. Aucune licence tierce n'est invoquée : la source
  n'est pas un dépôt public de tiers, mais le fichier fourni par le projet
  lui-même. **Avant toute distribution de l'application**, il lui appartient de
  confirmer cette appréciation — c'est une déclaration, et elle est écrite ici
  comme telle, non comme une licence vérifiée.
- **Empreinte de l'ensemble** : les 604 fichiers, lus dans l'ordre des pages,
  donnent
  `12024d904b55a7f5bd817c4a81d6dfe791880c1d19f667fe3c784f6c2e99a93f`
  (118 203 707 octets, soit 112,7 Mio). Le détail par page est dans
  `pages-moushaf/EMPREINTES.txt`.
- **Format** : 1920 × 3106 pour les 604 pages, sans exception. Palette de 9 à 13
  couleurs (599 fichiers en 4 bits, 5 en 8 bits). Réduire la résolution les
  **alourdit** — 1440 px donne 256 Ko par page contre 148 Ko à 1920 px — parce que
  l'anti-aliasing ajoute des couleurs et détruit les aplats que le filtre PNG
  compresse. Les originaux sont donc aussi le plus petit choix fidèle.
- **Code** : `src/lib/pagesMoushaf.ts` — `getMushafPageImage(page)` est le seul
  point de contact avec cette source ; `SOURCE_PAGES` en est le seul endroit à
  modifier pour en changer.
- **Servi depuis ce dépôt.** L'application lit les pages à l'adresse
  `https://cdn.jsdelivr.net/gh/Msoumaya2019/hifdh-app@main/pages-moushaf/pageNNN.png`.
  Deux conséquences, dites ici parce qu'elles ne se voient nulle part ailleurs :
  le dépôt doit rester **public**, et la branche servie est **`main`**. Renommer
  le dépôt, le rendre privé ou renommer la branche couperait les 604 pages d'un
  coup — sans erreur de compilation. Changer de branche servie est une
  modification de `SOURCE_PAGES.base`.
- **Le poids du dépôt est une contrainte de service, pas une coquetterie.** La
  documentation de jsDelivr borne un paquet à **150 Mo**, et un fichier isolé à
  **20 Mo** ; son API de liste, elle, refuse au-delà de **50 Mo**. Les trois
  chiffres ne s'accordent pas, et c'est le dernier qui se voit — mais c'est le
  premier qui décide si une page s'affiche. Le dépôt suivi pèse aujourd'hui
  **121,0 Mo** (807 fichiers, mesuré sur l'index) ; il en pesait **211,7 Mo**
  tant que les 604 polices de page y étaient, soit hors de l'enveloppe
  documentée — les 604 pages étaient pourtant bien servies, mesuré une à une.
  **Avant d'ajouter des fichiers lourds, mesurer** : `git ls-files` puis la somme
  des tailles, jamais `du` sur un dossier partiel.
- **Cache** : `src/lib/cachePagesMoushaf.ts` — une page téléchargée est écrite
  sur le disque et n'est plus retéléchargée.
- **Repli** : si le cache disque n'est pas disponible sur l'appareil — le module
  natif de fichiers peut être absent, et `cacheDirectory` vaut alors `null` sans
  lever — l'image n'est **pas** cachée : c'est l'adresse distante qui est rendue,
  et l'`Image` de React Native l'affiche avec son propre cache réseau. Une panne
  du cache ne doit jamais retirer la page à la personne qui la lit.
- **Vérification** : `npm run verifier:pages-moushaf` (et son falsificateur
  `npm run falsifier:pages-moushaf`). Le contrôle lit l'en-tête des **604**
  fichiers sur le disque, compare leur format à celui que le code réserve, exige
  que le nom servi soit celui du fichier rangé, et vérifie qu'aucun module ne
  réclame ces pages — les embarquer doublerait le poids de l'application. Avec
  `--reseau`, il interroge en plus la source pour seize pages.

### Ce qui a été mesuré sur ces pages

- **La mise en page calculée leur correspond.** `data/quran/moushaf_layout.json`
  vient de l'API quran.com, donc d'une autre source que ces images. Confronté mot
  par mot à la table `glyphs` de l'archive — qui donne, pour chaque mot, sa page
  et sa ligne — il place **81 989 mots sur 81 990** sur la même page et la même
  ligne que l'image affichée. Les bandes de surlignage de la séance tombent donc
  sur les bonnes lignes. Le seul écart — un mot, page 454 — est mesuré et nommé
  dans `docs/mise-en-page-moushaf.md`, avec la méthode et les deux conventions
  qu'il a fallu neutraliser pour que la comparaison ait un sens.
- **La composition par police n'est plus une voie de repli.** Le module qui la
  portait (`src/lib/policesMoushaf.ts`) et la table des 604 `require()` qui
  l'alimentait ont été supprimés, et les 92 Mo de polices de page ne sont plus
  dans le dépôt (§3 bis) : elles pesaient plus que la limite du CDN qui sert les
  pages, pour des fichiers qu'aucun code n'employait. Aucune version publiée ne
  les embarquait — mesuré dans l'APK, qui n'en contient aucun fichier.

### Pourquoi pas quran.com

Quran.com a été essayé en premier, comme demandé à l'origine, pour les images
des pages. Son API v4 — et la nouvelle API de la Quran Foundation, qui demande
désormais des identifiants d'application — expose le texte, les traductions,
l'audio et la recherche, mais **aucune image de page** : ni champ `image` sur un
verset, ni ressource « pages ». Les URL d'images du site ne sont pas non plus
adressables (essayées : 404 ou 403). C'est cette recherche qui avait conduit à
une source de tiers, désormais remplacée par le fichier du projet lui-même.

Quran.com reste la source de la **mise en page** (`moushaf_layout.json`), et non
des images : c'est l'API qui donne, pour chaque verset, la page et la ligne. Ce
fichier a été confronté mot par mot aux images (§ ci-dessus) et leur correspond.

## 3 quater. Lecture de la page, et surlignage de la séance

Depuis la version 1.6.4, le lecteur n'affiche plus qu'un mode : la **page du
moushaf**, telle qu'elle est imprimée. Le mode « verset par verset » n'a pas été
supprimé — le code est là — mais aucun onglet n'y mène plus. Une configuration
enregistrée avant ce changement est ramenée au mode page : l'ignorer afficherait
un écran dont le seul contrôle de sortie n'existe plus.

**Le surlignage suit la ligne, pas le mot.** La page affichée est l'image de
l'imprimé : rien ne permet d'y colorier un mot. Ce qui se sait, en revanche,
c'est quelles **lignes** portent quels versets — c'est ce que décrit la mise en
page. Une plage de versets marque donc toutes les lignes qu'elle touche, et rien
d'autre. Un verset qui commence au milieu d'une ligne marque la ligne entière :
c'est exact, et c'est la seule chose qui puisse l'être sans mesurer la police de
l'imprimé.

**La bande est dessinée derrière l'image**, jamais devant : posée au-dessus, elle
voilerait les signes de vocalisation, qui sont précisément ce qu'on vient lire.
Elle porte `pointerEvents="none"`, sans quoi elle intercepterait le geste de
tourne-page là où l'on pose le doigt.

**Placement en fraction, et pourquoi c'est légitime.** Chaque page du moushaf
fait exactement quinze lignes ; c'est la mise en page qui le dit, et un test
l'exige de toutes les pages. Les bandes se placent donc en pourcentage, et
suivent la page à toute taille d'écran.

**Code** : `src/lib/surlignagePassage.ts` (les lignes d'une plage, testé sans
appareil), `src/components/LecteurPageMoushaf.tsx` (le rendu). Éprouvé par
`tests/surlignage.test.mjs` et `tests/lecteur.test.mjs`, et tenu par
`npm run falsifier:surlignage`.

### Le verset récité, surligné au mot près (depuis 1.9.0)

La ligne suffit pour dire « la séance passe par ici ». Elle ne suffit pas pour
suivre une **récitation** : une ligne qui porte trois versets courts les
marquerait tous les trois. Le suivi visuel demande donc la position de chaque
verset, et cette position **existe** — elle n'a pas eu à être devinée.

La base qui accompagne les images (`ayahinfo_1920.db`, table `glyphs`) porte, pour
chacun des 88 246 mots des 604 pages, la **boîte exacte de son tracé** en
coordonnées de la page (1920 × 3106). `data/quran/generer_zones_surlignage.py` en
tire `data/quran/zones_surlignage.json` : 13 201 zones, une par fragment de verset
et par ligne.

**Ce qui a été mesuré, et non supposé :**

- le **modèle de la table** — `glyphes = jetons + 1 − (4 si le verset porte la
  basmala)` — vérifié verset par verset sur les 6 236 versets : 6 123 sont
  exacts, 112 portent la basmala, et **13:37 est la seule exception** (son
  médaillon est absent de la table, et non son dernier mot). Écarter son dernier
  glyphe aurait supprimé le mot `وَاقٍ` ;
- le **médaillon** du numéro de verset occupe la dernière position du verset et
  déborde sur la ligne suivante dans **566 cas**. C'est lui qui explique les 566
  écarts entre les zones et la mise en page. Médaillon écarté, **6 235 versets sur
  6 236 ont exactement les mêmes lignes** dans les deux sources, et le seul écart
  restant est **38:24, page 454** — celui que `docs/mise-en-page-moushaf.md`
  documentait déjà ;
- **2 971 boîtes sont transposées** (`max_x < min_x`) : ce sont des signes
  détachés — harakat, marques de waqf — dont les deux bornes ont été échangées à
  la saisie. Leurs boîtes retransposées tombent exactement dans le blanc que
  l'ordre de lecture leur laisse. Les normaliser ne déplace que 204 zones, de
  9,5 px en moyenne, toujours sur le bord gauche ;
- **un seul recouvrement dans tout le Coran** : page 254, ligne 7, 13:37 finit à
  x = 289 et 13:38 commence à x = 290 — un **contact d'un pixel**, expliqué par le
  médaillon absent. Le générateur l'exige **exactement**, au lieu de le tolérer
  par un seuil ;
- **la transparence des pages** : ce sont des PNG à palette dont le `tRNS` a une
  longueur de 1 et vaut 0, donc **le blanc est le seul index transparent**. Le
  papier est transparent, l'encre est opaque. C'est cette propriété, et non une
  marge choisie à l'œil, qui garantit qu'une bande posée **derrière** l'image ne
  peut pas masquer une diacritique.

**Deux surlignages, et ils ne disent pas la même chose.** La bande de la séance
couvre des lignes entières et dit « la séance passe par ici » ; la zone du verset
récité couvre les mots d'un seul verset et dit « c'est ici, maintenant ». La
teinte de la seconde suit le thème (`primary`) — vert, rose ou bleu ; la première
reste dorée, accent neutre présent dans les quatre palettes.

**Le verset surligné est celui dont le fichier joue**, jamais un verset estimé
d'après une durée écoulée. L'état est publié par le moteur audio
(`src/lib/audio/ContexteAudio.tsx`, champ `actif`) et lu par la page : une seule
source, donc deux affichages ne peuvent pas diverger.

**Code** : `data/quran/generer_zones_surlignage.py` (la mesure),
`src/lib/zonesMoushaf.ts` (les zones en fractions de page, et la résolution d'un
appui), `src/components/LecteurPageMoushaf.tsx` (le rendu),
`src/lib/audio/suiviRecitation.ts` (le changement de page). Éprouvé par
`tests/audio.test.mjs` — dont un contrôle qui parcourt les 604 pages, et un qui
pose un appui au milieu de **chacune** des 13 201 zones — et tenu par
`npm run falsifier:audio`.

Le fichier versionné se vérifie par `npm run verifier:zones`, qui refait le calcul
depuis la base et le compare. Ce contrôle **exige la base**, qui n'est pas
versionnée : il tourne en local, pas en intégration continue. La CI garde la
cohérence du fichier lui-même, par les tests.

## 3 quinquies. Récitation audio (un fichier par verset)

Depuis la version 1.9.0, un passage peut être écouté et répété, avec le suivi
visuel du verset récité.

**La synchronisation est celle du verset, pas d'un minuteur.** Chaque verset a son
propre fichier audio, et le lecteur joue exactement le verset qu'il surligne. Un
minuteur — même bien réglé — dériverait, et annoncerait un verset pendant qu'un
autre est récité ; c'est précisément ce que la spécification interdit.

**Source** : le CDN d'Al Quran Cloud (`cdn.islamic.network`), qui sert
`quran/audio/<débit>/<édition>/<id>.mp3`, **un fichier par verset**, désigné par le
**numéro global du verset** (1 à 6236). Ce numéro est celui que l'application
calcule déjà (`startAyahId + ayah - 1`) : aucune table de correspondance n'a été
ajoutée. Douze versets ont été vérifiés contre l'API avant qu'elle ne limite le
débit : 1:1 → 1, 2:255 → 262, 2:286 → 293, 18:1 → 2141, 29:69 → 3409, 36:1 → 3706,
55:78 → 4979, 87:19 → 5967, 112:1 → 6222.

**Le débit dépend de l'édition, et il a été mesuré édition par édition** :
`128/ar.alafasy`, `128/ar.husary`, `128/ar.minshawi`,
`192/ar.abdulbasitmurattal`, `128/ar.mahermuaiqly`, `192/ar.abdurrahmaansudais`,
`128/ar.shaatree`, `128/ar.hudhaify`, `64/ar.saoodshuraym`,
`128/ar.muhammadayyoub`. Écrire `128` partout rend un **403** pour Abdul Basit,
As-Sudais et Ash-Shuraym : l'écran aurait annoncé une panne de réseau qui n'existe
pas.

**Al-Ghamdi n'est pas proposé**, et c'est un fait mesuré : `ar.saadalghamdi`
existe dans le catalogue mais son champ `audio` est `null` — l'édition est servie
au niveau de la sourate, pas du verset. Aucun identifiant « ghamdi » n'apparaît
dans les 176 éditions audio. Un récitateur proposé qui ne peut pas jouer se lit
comme une panne, donc il est **omis**, et son absence est documentée ici.

**Une seule récitation à la fois.** Un seul objet `Audio.Sound` existe, dans un
seul moteur (`src/lib/audio/ContexteAudio.tsx`), et changer de récitateur en cours
de lecture arrête le fichier courant avant de rejouer l'étape. Un verrou de séance
(`src/lib/audio/verrou.ts`) invalide toute réponse de chargement arrivée après un
arrêt.

**Lecture en arrière-plan : ce qui est configuré, et ce qui ne l'est pas.** Le mode
audio demande `staysActiveInBackground` et déclare `UIBackgroundModes: ["audio"]`
dans `app.json` : sur iOS, la récitation continue donc écran verrouillé. Sur
Android, `expo-av` ne fournit pas de service de premier plan, et le système peut
arrêter le son quand l'application passe en arrière-plan — ce n'est **pas** corrigé
ici, et c'est écrit plutôt que sous-entendu.

**Écouter ne marque rien.** Aucune écoute ne rend un passage « mémorisé », et
aucune ne modifie le texte coranique. Le texte n'est jamais engendré : il vient de
Tanzil, comme au § 1.

**Code** : `src/lib/audio/` — `recitateurs.ts` (le catalogue et les adresses),
`repetitions.ts`, `plan.ts` (l'ordre des étapes), `etatLecture.ts` (la machine à
états), `suiviRecitation.ts` (le changement de page), `ContexteAudio.tsx` (le
moteur), `preferences.ts` (les réglages conservés). Éprouvé par
`tests/audio.test.mjs` et tenu par `npm run falsifier:audio`.

## 4. Données partagées entre comptes (suivi entre amis)

Depuis la version 1.6.3, deux personnes peuvent se relier par un **code
d'invitation** et voir mutuellement leur progression. Ce n'est pas une donnée
tierce : elle est produite par les utilisateurs eux-mêmes, et ce paragraphe
existe pour dire **exactement** ce qui circule, puisque rien d'autre dans ce
document ne le couvre.

- **Recto-verso, et non unilatéral.** La relation est une seule ligne, à ordre
  canonique, entre deux identifiants. Il n'existe donc pas d'état où l'un suit
  l'autre sans être suivi — la réciprocité est dans la forme de la table, pas
  dans une règle applicative.
- **Ce qu'un ami voit** : le nombre de versets et de pages équivalentes
  mémorisés depuis lundi, la date de la dernière séance, la dernière sourate
  travaillée et le nombre de jours d'étude sur sept jours.
- **Ce qu'un ami ne voit pas**, et c'est un choix, pas un oubli : **quelles
  parties restent à renforcer**. C'est le seul indicateur qui dit « je suis en
  retard », et le rendre visible transformerait un outil d'entraide en
  classement entre pairs. Aucune phrase affichée ne compare un apprenant à un
  autre ; un test le vérifie (`tests/amis.test.mjs`, « la synthèse ne dit jamais
  “en retard” »).
- **Le code d'invitation est un secret.** Dix signes, sans les lettres ni les
  chiffres ambigus (I, L, O, 0), sur un alphabet de 32 signes exactement. Il
  n'est rendu qu'à son propriétaire ; la fonction qui l'échange contre un
  identifiant ne rend **aucune** donnée du profil trouvé — seulement
  l'identifiant, qui sert à créer la relation.
- **Où l'autorisation vit** : dans les politiques RLS
  (`supabase/amis.sql`), jamais dans le corps des fonctions ni dans le client.
  Une seule fonction est `SECURITY DEFINER`, parce que lire un profil par son
  code est impossible autrement, et elle ne rend rien du profil.
- **Rupture** : supprimer un ami ferme la relation dans les deux sens ; vérifié
  par le banc, dans les deux sens.
- **Code** : `supabase/amis.sql` (schéma), `src/lib/amis.ts` (décisions, testées
  sans réseau), `src/lib/sync/amis.ts` (appels), `app/amis.tsx` et
  `src/components/AmisSection.tsx` (écrans). Éprouvé par
  `npm run verifier:supabase` (80 épreuves) et `npm run falsifier:amis`.

## 5. L'espace de discussion entre deux amis (mots seulement, modéré)

Depuis la version 1.6.5, deux amis déjà reliés disposent d'un espace de
discussion textuelle pour s'encourager. Ce paragraphe dit ce qui est stocké, ce
qui ne l'est **pas**, et qui peut lire quoi.

- **Des mots, et rien d'autre — par la forme de la table, pas par un réglage.**
  Elle déclare `corps TEXT NOT NULL` et **aucune** colonne pour un fichier, une
  image ou une vidéo. Une colonne qui n'existe pas ne peut rien recevoir, quel
  que soit l'écran écrit plus tard. C'est plus fort qu'une case à décocher :
  trois tests lisent les colonnes **déclarées** (et non les commentaires qui
  expliquent leur absence), le module de décisions, la couche réseau et l'écran.
  Aucun sélecteur d'image ou de document n'est importé nulle part.
- **Un message ne se réécrit pas.** Une fois envoyé, le texte reste : le
  `UPDATE` est refusé par un déclencheur `BEFORE UPDATE`, qui compare l'ancien
  et le nouveau corps. Une politique RLS ne peut pas le faire — dans un
  `WITH CHECK`, les deux côtés nomment la ligne NOUVELLE, si bien que
  `corps = corps` est une tautologie qui ne garde rien.
- **Retirer n'est pas effacer.** L'auteur peut retirer son message : le texte
  disparaît du fil, remplacé par « Message retiré », et une date garde la trace.
  Aucun `DELETE` n'est possible, pour personne — ni politique, ni droit SQL.
- **La modération.** L'administrateur (le même que celui du tableau de bord) peut
  masquer un message : il disparaît du fil des deux amis, et **sa trace reste
  lisible par la modération**, texte compris. Masquer est réversible ; démasquer
  le rétablit. Un modérateur **ne peut pas écrire** dans un fil : un message est
  signé par son auteur, et la table l'exige (`auteur = user_a OR auteur = user_b`).
- **Ce que la modération ne fait pas** : elle ne voit pas les messages d'un fil
  auquel elle ne participe pas sans le demander explicitement, par une fonction
  dédiée qui **nomme la paire observée** — un modérateur n'est pas partie au fil,
  et une fonction qui demanderait « mon fil avec X » rendrait zéro ligne en
  silence. C'est le défaut qu'a trouvé le banc.
- **Rupture de l'amitié** : le fil se ferme, dans les deux sens, et **aucun
  message n'est supprimé**. Le modérateur continue de les lire. Vérifié par le
  banc.
- **Où l'autorisation vit** : dans les politiques RLS
  (`supabase/discussions.sql`), jamais dans le client. Les fonctions de
  modération accordées à `authenticated` se refusent **elles-mêmes** si
  l'appelant n'est pas administrateur : le droit d'exécuter n'est pas le droit de
  modérer, mais accorder le premier permet un refus lisible plutôt qu'une erreur
  de permission qui ne dirait rien de la règle.
- **Une limite de forme qui a coûté deux fois** : `GRANT` et politiques RLS sont
  deux barrières successives. Sans le `GRANT`, le rôle est refusé avant qu'une
  politique soit consultée. Et `BIGSERIAL` crée une **séquence séparée**, objet à
  part entière qu'un `GRANT ... ON TABLE` ne couvre pas — le fichier accorde donc
  aussi la séquence, sans quoi toute insertion échoue.
- **Code** : `supabase/discussions.sql` (schéma), `src/lib/discussion.ts`
  (décisions, testées sans réseau), `src/lib/sync/discussion.ts` (appels),
  `app/discussion.tsx` (écran). Éprouvé par `npm run verifier:supabase`,
  `npm test` et `npm run falsifier:discussion`.

## 6. Doublures de modules, pour les tests

Rien de tout ceci n'entre dans l'application livrée : ce paragraphe existe parce
que la mécanique est inhabituelle et qu'elle a déjà été écrite deux fois.

Pour éprouver la couche réseau de la discussion sans réseau, `tests/discussion_reseau.test.mjs`
remplace deux modules (`src/lib/supabase.ts`, `src/lib/auth.ts`) par des
doublures. `node:test` sait le faire (`mock.module`), mais pas ici : la
substitution n'agit que sur un module **non encore chargé**, or l'import
statique en tête du fichier de test compte comme ce premier chargement.

Le remplacement passe donc par le chargeur d'alias déjà présent
(`scripts/alias-loader.mjs`), qui décide quelle **source** sert une URL. La
liste des doublures est déposée dans un fichier
(`scripts/doublures-deposees.json`, ignoré par git) que le chargeur relit à
chaque chargement.

**Ce fichier est sur le disque, et non un `Map` partagé, pour une raison
précise** : `--import` instancie le chargeur dans un **contexte séparé**. Un
module importé des deux côtés — le test et le chargeur — y est donc évalué
**deux fois**. Deux registres distincts, une doublure posée par le test mais
invisible au chargeur, la vraie source servie, et un échec qui parle d'un module
React Native non transpilé, à cent lieues de la cause. Un état partagé entre
deux contextes passe par le disque.

La neutralisation du chargeur fait tomber 17 tests sur 30 : c'est la preuve que
les doublures portent, et non qu'elles sont décoratives.

## 7. Comptes, et liens de courriel

Le compte ne sert qu'à deux choses : retrouver sa progression sur un autre
téléphone, et la garder si l'appareil est perdu. Rien dans l'application n'exige
de compte — elle fonctionne entièrement hors ligne.

### Ce que le code fait

- **Créer un compte** : si Supabase ouvre la session immédiatement, l'application
  le dit ; s'il exige une confirmation par courriel, elle le dit aussi, et propose
  alors de **renvoyer le courriel** — sans quoi un courriel perdu laisserait le
  compte inutilisable pour toujours.
- **Mot de passe oublié** : demande un lien de réinitialisation. La réponse est la
  **même** que l'adresse existe ou non, délibérément : répondre « adresse
  inconnue » laisserait n'importe qui vérifier qui possède un compte.
- **Le lien reçu** ouvre `hifdh://lien`, que `src/lib/lienAuth.ts` lit. Les jetons
  sont dans le **fragment** de l'adresse (`#access_token=…`), et non dans la
  requête : `new URL(url).searchParams` ne voit pas le fragment, et un module
  écrit avec lui rendrait un lien vide sur un lien parfaitement valide, **sans
  rien lever ni rien afficher**. C'est le défaut le plus coûteux de cette partie,
  et un test le surveille nommément.
- Le flux d'authentification par défaut de `@supabase/supabase-js` est
  **implicite** (`flowType: 'implicit'`, lu dans le paquet installé) : les liens
  portent donc des jetons, et `setSession` est le bon appel. Le flux PKCE
  porterait un `?code=`, qui exigerait le vérificateur déposé par l'appareil
  ayant demandé le lien — suivre le lien sur un autre téléphone ne marcherait
  alors pas, et l'écran le dit.

### Ce que le propriétaire du compte doit faire

Deux réglages, dans le tableau de bord Supabase, que le code ne peut pas poser :

1. **Authentication → URL Configuration → Redirect URLs** : ajouter `hifdh://lien`.
   Sans cette entrée, Supabase refuse de rediriger et l'utilisateur reste sur une
   page blanche après avoir suivi son lien.
2. **Authentication → Sign In / Providers → Email** : selon le choix,
   - **décocher « Confirm email »** : l'inscription ouvre alors la session
     immédiatement, sans courriel. C'est le réglage le plus simple, et il convient
     à cette application, dont les comptes servent à sauvegarder une progression
     et non à authentifier une identité ;
   - **ou laisser la confirmation, et configurer un SMTP** : le service de
     courriel intégré de Supabase **ne livre qu'aux adresses membres de
     l'organisation du projet**. À toute autre adresse, il **refuse** l'envoi, en
     répondant « Email address not authorized » ; il est de plus plafonné à
     **2 messages par heure**. Ce n'est donc pas une question de dossier
     indésirable : sans SMTP dédié, aucun courriel de confirmation n'atteint un
     utilisateur réel.

**Ce que cela implique pour « mot de passe oublié ».** Cette fonction ne peut pas
reposer sur la seule application : sans SMTP dédié, le lien de réinitialisation
n'atteint jamais son destinataire, quel que soit le soin mis dans le code. Le
réglage « Confirm email » peut donc être décoché pour débloquer les inscriptions,
mais **configurer un SMTP** (Brevo, Resend, Postmark…) reste la seule voie qui
rende la réinitialisation réellement utilisable. Les deux réglages sont
indépendants.

Le réglage a été **constaté** sur le projet, en lecture seule, par
`GET /auth/v1/settings` : `mailer_autoconfirm: false`, c'est-à-dire confirmation
exigée. C'est la cause directe du blocage à l'inscription.
