# La mise en page du moushaf, confrontée aux images

> Document **écrit à la main**. Il rapporte une mesure, et non une règle du
> projet : les chiffres qu'il porte se recalculent, la méthode est décrite pour
> cela.

## Pourquoi cette mesure existe

Le mode « page » affiche l'**image** d'une page du moushaf et surligne les
**lignes** qui portent les versets de la séance. Ces deux moitiés viennent de
deux sources différentes :

- les images viennent du fichier fourni par le projet, copiées dans
  `pages-moushaf/` (voir `NOTICE.md` §3 ter) ;
- les coupures de ligne viennent de `data/quran/moushaf_layout.json`, engendré
  depuis l'API quran.com (`mushaf=1`, disposition du complexe KFGQPC).

Si ces deux sources ne coupent pas les lignes au même endroit, les bandes de
surlignage tombent sur les mauvaises lignes — **et rien ne le signale**, puisque
chaque moitié est cohérente avec elle-même. Un verset surligné deux lignes trop
bas ne ressemble pas à une panne : il ressemble à un verset surligné.

## La méthode

L'archive fournie porte, à côté des images, une base `ayahinfo_1920.db` dont la
table `glyphs` donne pour **chaque mot du Coran** : `sura_number`,
`ayah_number`, `position`, `page_number`, `line_number`. C'est la source de la
mise en page imprimée — celle qui a servi à dessiner les images.

`moushaf_layout.json` donne la même chose, en intervalles de jetons. Les deux se
comparent donc mot par mot, sur la page **et** sur la ligne.

## Deux conventions à neutraliser d'abord

La première comparaison, faite sur le **numéro de position**, a annoncé **128
désaccords**, tous du même signe et tous sur le verset 1 d'une sourate. C'était
faux, et l'erreur était dans la comparaison, pas dans les données :

1. **La basmala.** L'application l'attache au premier verset de chaque sourate
   (segment de type `b`, jetons 0 à 3). La table `glyphs` ne la porte pas du
   tout : sur la page 77, sa ligne 1 est **vide** — c'est le bandeau de titre de
   la sourate. Comparer des positions revient donc à comparer deux listes
   décalées de trois ou quatre crans, et à appeler « désaccord » ce qui n'est
   qu'un décalage de numérotation.
2. **Le marqueur de verset.** Pour 6 235 versets sur 6 236, la table `glyphs`
   porte **exactement un glyphe de plus** que l'application n'a de mots : le
   numéro du verset, inscrit dans son ornement. C'est un glyphe, ce n'est pas un
   mot, et il se place **en dernier**.

On aligne donc les mots **par rang dans le verset** — le 1er, le 2e, le 3e —, ce
qui ne dépend d'aucune convention, après avoir écarté le dernier glyphe de
chaque verset.

> Leçon à retenir : un contrôle qui annonce « 128 désaccords » accuse trois
> choses à la fois — la donnée comparée, la clé de comparaison, et le nombre de
> mots de chaque côté. Ici, la donnée était juste et la clé était fausse.

## Le résultat

| Mesure | Valeur |
| --- | ---: |
| Mots comparés | 81 990 |
| Même page **et** même ligne | **81 989** |
| Même page, autre ligne | 1 |
| Page différente | 0 |

Soit **99,999 %** d'accord. Les bandes de surlignage tombent donc sur les bonnes
lignes des images affichées, pour tout le Coran sauf un mot.

## Le seul écart, nommé

| Page | Verset | Mot | Application | Image |
| ---: | --- | ---: | --- | --- |
| 454 | 38:24 | 35 | ligne 11 | ligne 12 |

L'application place le mot 35 sur la ligne 11 (qui porte alors les mots 23 à 35,
soit 13 mots) ; l'image le place au début de la ligne 12 (la ligne 11 portant
les mots 23 à 34, soit 12 mots). Le générateur corrige les lignes **trop
larges** pour la page — une ligne plus large que la page n'a pas pu être
imprimée —, et cette ligne-ci passe sous son seuil : la correction ne se
déclenche donc pas.

**Ce que cela coûte** : si une séance se termine exactement sur le mot 35 de
38:24, la bande de la ligne 11 ne couvre pas ce mot. Un mot, sur 81 990, sur une
page sur 604.

## Deux pages qui étaient suspectes, et ne le sont plus

Les pages **23** et **254** avaient été signalées comme suspectes lors d'une
campagne précédente. La confrontation par rang les **blanchit** : elles ne
portent aucun désaccord.

## Ce qui corrigerait cet écart

`moushaf_layout.json` pourrait être engendré depuis la table `glyphs` — la
source des pages elles-mêmes, qui est plus autoritaire que l'API pour ce qu'elle
décrit, et qui porte en outre la **boîte exacte de chaque mot** (`min_x`,
`max_x`, `min_y`, `max_y`), ce qui ouvrirait le surlignage au mot et non
seulement à la ligne.

La mesure dit que ce remplacement serait sûr : les deux sources s'accordent sur
81 989 mots sur 81 990, donc changer d'oracle ne déplacerait qu'un mot. Ce
n'est **pas** fait ici : `moushaf_layout.json` est engendré, vérifié et recopié
dans le tableau de bord, et changer sa provenance est un travail à part entière,
avec ses propres contrôles.
