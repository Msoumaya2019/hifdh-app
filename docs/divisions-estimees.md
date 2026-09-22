# Bornes de toumoun estimees

> Document **engendre** par `data/quran/rapport_divisions_estimees.py`.
> Ne pas le modifier a la main : le script le reecrit, et le controle
> `--verifier` refuse toute divergence entre ce document et les donnees.

Les 480 toumoun du Coran sont donnes par `data/quran/thumn_hafs.json`, chacun
avec un statut de verification. Ce document liste celles des bornes qui ne sont
**pas** verifiees.

## Pourquoi 151 bornes ne sont pas verifiees

Les 240 limites de **rub' al-hizb** (les toumoun impairs) viennent des donnees
Hafs de quran-meta, source KFGQPC. Elles sont verifiees.

Les 240 limites **intermediaires** (les toumoun pairs) n'existent pas dans les
donnees Hafs : elles ont ete reportees depuis les donnees **Qaloun** du meme
fournisseur. Ce report est sur quand la sourate a le meme nombre de versets dans
les deux lectures, et approximatif sinon — c'est un **decalage cumulatif** qui
est applique, et le resultat peut etre faux de plus ou moins un verset.

| Statut | Toumoun | Origine |
| --- | ---: | --- |
| Verifiee — donnees Hafs | 240 | limites de rub' al-hizb, source KFGQPC |
| Verifiee — mappage direct | 89 | limite intermediaire, sourate de meme longueur en Hafs et en Qaloun |
| **Estimee** | **151** | limite intermediaire, sourate de longueur differente : report par decalage |

## Comment s'en servir

Chaque ligne donne la **limite estimee** : le premier verset du toumoun indique.
Le toumoun precedent finit au verset qui precede. Pour verifier, ouvrir un mushaf
Hafs imprime (edition Madina, KFGQPC) a la sourate indiquee et regarder si le
toumoun commence bien a ce verset-la.

**C'est le debut du toumoun qui est estime, et non sa fin.** La fin d'un toumoun
pair est une fin de rub' al-hizb, prise des donnees Hafs de KFGQPC : elle est
verifiee, et le fichier le dit. Le statut `estimated_offset` porte sur la valeur
qui ouvre le toumoun, celle qui a ete reportee depuis Qaloun. Confondre les deux
enverrait le relecteur verifier un verset qui n'a jamais ete en doute.

La colonne **Reference Qaloun** donne la valeur Qaloun d'ou l'estimation a ete
tiree. Quand les deux numeros de verset different, c'est que le decalage a joue.

Ces bornes sont utilisables en l'etat pour un programme d'apprentissage : un
ecart d'un verset sur une limite interieure de huitieme de hizb ne change pas la
quantite memorisee de facon sensible. Elles ne doivent en revanche **jamais**
etre presentees comme authentifiees.

## Les bornes estimees, sourate par sourate

### Sourate 2 — Al-Baqarah (La Vache) (286 versets)

19 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 2 | 1 | 1 | 2:13 | 2:13 |
| 4 | 1 | 2 | 2:33 | 2:33 |
| 6 | 1 | 3 | 2:53 | 2:53 |
| 8 | 1 | 4 | 2:66 | 2:66 |
| 10 | 2 | 5 | 2:84 | 2:84 |
| 12 | 2 | 6 | 2:101 | 2:101 |
| 14 | 2 | 7 | 2:114 | 2:114 |
| 16 | 2 | 8 | 2:132 | 2:132 |
| 18 | 3 | 9 | 2:147 | 2:147 |
| 20 | 3 | 10 | 2:167 | 2:167 |
| 22 | 3 | 11 | 2:184 | 2:184 |
| 24 | 3 | 12 | 2:196 | 2:196 |
| 26 | 4 | 13 | 2:211 | 2:211 |
| 28 | 4 | 14 | 2:226 | 2:226 |
| 30 | 4 | 15 | 2:234 | 2:234 |
| 32 | 4 | 16 | 2:246 | 2:246 |
| 34 | 5 | 17 | 2:257 | 2:257 |
| 36 | 5 | 18 | 2:266 | 2:266 |
| 38 | 5 | 19 | 2:281 | 2:281 |

### Sourate 4 — An-Nisa (Les Femmes) (176 versets)

12 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 62 | 8 | 31 | 4:11 | 4:11 |
| 64 | 8 | 32 | 4:19 | 4:19 |
| 66 | 9 | 33 | 4:31 | 4:31 |
| 68 | 9 | 34 | 4:46 | 4:46 |
| 70 | 9 | 35 | 4:63 | 4:63 |
| 72 | 9 | 36 | 4:77 | 4:77 |
| 74 | 10 | 37 | 4:92 | 4:92 |
| 76 | 10 | 38 | 4:104 | 4:104 |
| 78 | 10 | 39 | 4:122 | 4:122 |
| 80 | 10 | 40 | 4:137 | 4:137 |
| 82 | 11 | 41 | 4:158 | 4:158 |
| 84 | 11 | 42 | 4:171 | 4:171 |

### Sourate 5 — Al-Maidah (La Table Servie) (120 versets)

8 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 86 | 11 | 43 | 5:7 | 5:7 |
| 88 | 11 | 44 | 5:19 | 5:19 |
| 90 | 12 | 45 | 5:34 | 5:34 |
| 92 | 12 | 46 | 5:47 | 5:47 |
| 94 | 12 | 47 | 5:61 | 5:61 |
| 96 | 12 | 48 | 5:77 | 5:77 |
| 98 | 13 | 49 | 5:92 | 5:92 |
| 100 | 13 | 50 | 5:108 | 5:108 |

### Sourate 6 — Al-Anam (Les Bestiaux) (165 versets)

10 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 102 | 13 | 51 | 6:1 | 6:1 |
| 104 | 13 | 52 | 6:26 | 6:26 |
| 106 | 14 | 53 | 6:51 | 6:51 |
| 108 | 14 | 54 | 6:70 | 6:70 |
| 110 | 14 | 55 | 6:92 | 6:92 |
| 112 | 14 | 56 | 6:101 | 6:101 |
| 114 | 15 | 57 | 6:121 | 6:121 |
| 116 | 15 | 58 | 6:137 | 6:137 |
| 118 | 15 | 59 | 6:146 | 6:146 |
| 120 | 15 | 60 | 6:159 | 6:159 |

### Sourate 8 — Al-Anfal (Le Butin) (75 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 142 | 18 | 71 | 8:12 | 8:12 |
| 144 | 18 | 72 | 8:32 | 8:32 |
| 146 | 19 | 73 | 8:50 | 8:50 |
| 148 | 19 | 74 | 8:73 | 8:73 |

### Sourate 9 — At-Tawbah (Le Repentir) (129 versets)

8 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 150 | 19 | 75 | 9:12 | 9:12 |
| 152 | 19 | 76 | 9:25 | 9:25 |
| 154 | 20 | 77 | 9:40 | 9:40 |
| 156 | 20 | 78 | 9:54 | 9:54 |
| 158 | 20 | 79 | 9:70 | 9:70 |
| 160 | 20 | 80 | 9:85 | 9:85 |
| 162 | 21 | 81 | 9:102 | 9:102 |
| 164 | 21 | 82 | 9:118 | 9:118 |

### Sourate 11 — Hud (Hud) (123 versets)

6 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 178 | 23 | 89 | 11:15 | 11:15 |
| 180 | 23 | 90 | 11:32 | 11:32 |
| 182 | 23 | 91 | 11:50 | 11:50 |
| 184 | 23 | 92 | 11:73 | 11:73 |
| 186 | 24 | 93 | 11:94 | 11:94 |
| 188 | 24 | 94 | 11:119 | 11:119 |

### Sourate 13 — Ar-Rad (Le Tonnerre) (43 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 200 | 25 | 100 | 13:17 | 13:17 |
| 202 | 26 | 101 | 13:31 | 13:31 |

### Sourate 14 — Ibrahim (Abraham) (52 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 204 | 26 | 102 | 14:1 | 14:1 |
| 206 | 26 | 103 | 14:22 | 14:22 |
| 208 | 26 | 104 | 14:41 | 14:41 |

### Sourate 17 — Al-Isra (Le Voyage Nocturne) (111 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 226 | 29 | 113 | 17:11 | 17:11 |
| 228 | 29 | 114 | 17:36 | 17:36 |
| 230 | 29 | 115 | 17:61 | 17:61 |
| 232 | 29 | 116 | 17:85 | 17:85 |

### Sourate 18 — Al-Kahf (La Caverne) (110 versets)

5 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 234 | 30 | 117 | 18:1 | 18:1 |
| 236 | 30 | 118 | 18:23 | 18:23 |
| 238 | 30 | 119 | 18:44 | 18:44 |
| 240 | 30 | 120 | 18:63 | 18:63 |
| 242 | 31 | 121 | 18:82 | 18:82 |

### Sourate 19 — Maryam (Marie) (98 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 244 | 31 | 122 | 19:1 | 19:1 |
| 246 | 31 | 123 | 19:40 | 19:40 |
| 248 | 31 | 124 | 19:78 | 19:78 |

### Sourate 20 — Ta-Ha (Ta-Ha) (135 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 250 | 32 | 125 | 20:24 | 20:24 |
| 252 | 32 | 126 | 20:71 | 20:71 |
| 254 | 32 | 127 | 20:93 | 20:93 |
| 256 | 32 | 128 | 20:126 | 20:126 |

### Sourate 21 — Al-Anbiya (Les Prophetes) (112 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 258 | 33 | 129 | 21:16 | 21:16 |
| 260 | 33 | 130 | 21:42 | 21:42 |
| 262 | 33 | 131 | 21:73 | 21:73 |
| 264 | 33 | 132 | 21:100 | 21:100 |

### Sourate 22 — Al-Hajj (Le Pelerinage) (78 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 266 | 34 | 133 | 22:11 | 22:11 |
| 268 | 34 | 134 | 22:28 | 22:28 |
| 270 | 34 | 135 | 22:47 | 22:47 |
| 272 | 34 | 136 | 22:68 | 22:68 |

### Sourate 23 — Al-Muminun (Les Croyants) (118 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 274 | 35 | 137 | 23:21 | 23:21 |
| 276 | 35 | 138 | 23:58 | 23:58 |
| 278 | 35 | 139 | 23:98 | 23:98 |

### Sourate 24 — An-Nur (La Lumiere) (64 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 280 | 35 | 140 | 24:11 | 24:11 |
| 282 | 36 | 141 | 24:30 | 24:30 |
| 284 | 36 | 142 | 24:42 | 24:42 |
| 286 | 36 | 143 | 24:58 | 24:58 |

### Sourate 26 — Ash-Shuara (Les Poetes) (227 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 294 | 37 | 147 | 26:22 | 26:22 |
| 296 | 37 | 148 | 26:78 | 26:78 |
| 298 | 38 | 149 | 26:146 | 26:146 |
| 300 | 38 | 150 | 26:208 | 26:208 |

### Sourate 27 — An-Naml (Les Fourmis) (93 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 302 | 38 | 151 | 27:18 | 27:18 |
| 304 | 38 | 152 | 27:42 | 27:42 |
| 306 | 39 | 153 | 27:69 | 27:69 |

### Sourate 30 — Ar-Rum (Les Romains) (60 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 324 | 41 | 162 | 30:21 | 30:21 |
| 326 | 41 | 163 | 30:40 | 30:40 |

### Sourate 31 — Luqman (Luqman) (34 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 328 | 41 | 164 | 31:11 | 31:11 |
| 330 | 42 | 165 | 31:31 | 31:31 |

### Sourate 35 — Fatir (Le Createur) (45 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 348 | 44 | 174 | 35:5 | 35:5 |
| 350 | 44 | 175 | 35:31 | 35:31 |

### Sourate 36 — Ya-Sin (Ya-Sin) (83 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 352 | 44 | 176 | 36:1 | 36:1 |
| 354 | 45 | 177 | 36:44 | 36:44 |
| 356 | 45 | 178 | 36:76 | 36:76 |

### Sourate 38 — Sad (Sad) (88 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 362 | 46 | 181 | 38:1 | 38:1 |
| 364 | 46 | 182 | 38:29 | 38:29 |
| 366 | 46 | 183 | 38:83 | 38:83 |

### Sourate 39 — Az-Zumar (Les Groupes) (75 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 368 | 46 | 184 | 39:18 | 39:18 |
| 370 | 47 | 185 | 39:40 | 39:40 |
| 372 | 47 | 186 | 39:64 | 39:64 |

### Sourate 40 — Ghafir (Le Pardonneur) (85 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 374 | 47 | 187 | 40:9 | 40:9 |
| 376 | 47 | 188 | 40:30 | 40:30 |
| 378 | 48 | 189 | 40:53 | 40:53 |
| 380 | 48 | 190 | 40:78 | 40:78 |

### Sourate 41 — Fussilat (Les Detailles) (54 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 382 | 48 | 191 | 41:16 | 41:16 |
| 384 | 48 | 192 | 41:37 | 41:37 |

### Sourate 42 — Ash-Shura (La Consultation) (53 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 386 | 49 | 193 | 42:1 | 42:1 |
| 388 | 49 | 194 | 42:19 | 42:19 |
| 390 | 49 | 195 | 42:40 | 42:40 |

### Sourate 44 — Ad-Dukhan (La Fumee) (59 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 398 | 50 | 199 | 44:48 | 44:48 |

### Sourate 45 — Al-Jathiyah (L'Agenouillee) (37 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 400 | 50 | 200 | 45:22 | 45:22 |

### Sourate 46 — Al-Ahqaf (Al-Ahqaf) (35 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 402 | 51 | 201 | 46:14 | 46:14 |
| 404 | 51 | 202 | 46:32 | 46:32 |

### Sourate 47 — Muhammad (Muhammad) (38 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 406 | 51 | 203 | 47:21 | 47:21 |

### Sourate 52 — At-Tur (Le Mont) (49 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 420 | 53 | 210 | 52:42 | 52:42 |

### Sourate 53 — An-Najm (L'Etoile) (62 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 422 | 53 | 211 | 53:55 | 53:55 |

### Sourate 55 — Ar-Rahman (Le Tout Misericordieux) (78 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 426 | 54 | 213 | 55:31 | 55:31 |

### Sourate 56 — Al-Waqiah (L'Inevitable) (96 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 428 | 54 | 214 | 56:29 | 56:29 |

### Sourate 57 — Al-Hadid (Le Fer) (29 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 430 | 54 | 215 | 57:7 | 57:7 |
| 432 | 54 | 216 | 57:21 | 57:21 |

### Sourate 58 — Al-Mujadilah (La Discussion) (22 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 434 | 55 | 217 | 58:8 | 58:8 |

### Sourate 67 — Al-Mulk (La Royaute) (30 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 450 | 57 | 225 | 67:20 | 67:20 |

### Sourate 70 — Al-Maarij (Les Voies d'Ascension) (44 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 454 | 57 | 227 | 70:18 | 70:19 (ecart) |

### Sourate 71 — Nuh (Noe) (28 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 456 | 57 | 228 | 71:15 | 71:15 |

### Sourate 74 — Al-Muddaththir (Le Couvert d'un Manteau) (56 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 460 | 58 | 230 | 74:31 | 74:31 |

### Sourate 79 — An-Naziat (Les Anges qui Arrachent) (46 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Limite estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 466 | 59 | 233 | 79:1 | 79:1 |

## Traçabilite

| Element | Valeur |
| --- | --- |
| Recitation | Hafs an Asim |
| Texte coranique | Tanzil.net (texte Uthmani Hafs) |
| Donnees Hafs | quran-meta (npm) Hafs lists, source KFGQPC |
| Donnees Qaloun | quran-meta (npm) Qalun lists, source KFGQPC |
| Licence | MIT (quran-meta) / Tanzil Terms of Use |
| Genere le | 2026-09-22T00:58:29.192112 |
