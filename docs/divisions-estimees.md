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

Chaque ligne donne la borne de **fin** d'un toumoun, c'est-a-dire le point ou le
toumoun suivant commence. Pour verifier, ouvrir un mushaf Hafs imprime (edition
Madina, KFGQPC) a la sourate indiquee et regarder si le verset marque comme fin
de toumoun est bien celui-la.

La colonne **Reference Qaloun** donne la borne d'ou l'estimation a ete tiree.
Quand les deux numeros de verset different, c'est que le decalage a joue.

Ces bornes sont utilisables en l'etat pour un programme d'apprentissage : un
ecart d'un verset sur une limite interieure de huitieme de hizb ne change pas la
quantite memorisee de facon sensible. Elles ne doivent en revanche **jamais**
etre presentees comme authentifiees.

## Les bornes estimees, sourate par sourate

### Sourate 2 — Al-Baqarah (La Vache) (286 versets)

19 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 2 | 1 | 1 | 2:25 | 2:24 (ecart) |
| 4 | 1 | 2 | 2:43 | 2:42 (ecart) |
| 6 | 1 | 3 | 2:59 | 2:58 (ecart) |
| 8 | 1 | 4 | 2:74 | 2:74 |
| 10 | 2 | 5 | 2:91 | 2:90 (ecart) |
| 12 | 2 | 6 | 2:105 | 2:104 (ecart) |
| 14 | 2 | 7 | 2:123 | 2:122 (ecart) |
| 16 | 2 | 8 | 2:141 | 2:140 (ecart) |
| 18 | 3 | 9 | 2:157 | 2:156 (ecart) |
| 20 | 3 | 10 | 2:176 | 2:175 (ecart) |
| 22 | 3 | 11 | 2:188 | 2:187 (ecart) |
| 24 | 3 | 12 | 2:202 | 2:200 (ecart) |
| 26 | 4 | 13 | 2:218 | 2:216 (ecart) |
| 28 | 4 | 14 | 2:232 | 2:230 (ecart) |
| 30 | 4 | 15 | 2:242 | 2:240 (ecart) |
| 32 | 4 | 16 | 2:252 | 2:250 (ecart) |
| 34 | 5 | 17 | 2:262 | 2:261 (ecart) |
| 36 | 5 | 18 | 2:271 | 2:270 (ecart) |
| 38 | 5 | 19 | 2:282 | 2:281 (ecart) |

### Sourate 4 — An-Nisa (Les Femmes) (176 versets)

12 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 62 | 8 | 31 | 4:11 | 4:12 (ecart) |
| 64 | 8 | 32 | 4:23 | 4:23 |
| 66 | 9 | 33 | 4:35 | 4:35 |
| 68 | 9 | 34 | 4:57 | 4:56 (ecart) |
| 70 | 9 | 35 | 4:73 | 4:72 (ecart) |
| 72 | 9 | 36 | 4:87 | 4:85 (ecart) |
| 74 | 10 | 37 | 4:99 | 4:98 (ecart) |
| 76 | 10 | 38 | 4:113 | 4:112 (ecart) |
| 78 | 10 | 39 | 4:134 | 4:128 (ecart) |
| 80 | 10 | 40 | 4:147 | 4:146 (ecart) |
| 82 | 11 | 41 | 4:162 | 4:164 (ecart) |
| 84 | 11 | 42 | 4:176 | 5:3 (ecart) |

### Sourate 5 — Al-Maidah (La Table Servie) (120 versets)

8 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 86 | 11 | 43 | 5:11 | 5:12 (ecart) |
| 88 | 11 | 44 | 5:26 | 5:24 (ecart) |
| 90 | 12 | 45 | 5:40 | 5:42 (ecart) |
| 92 | 12 | 46 | 5:50 | 5:50 |
| 94 | 12 | 47 | 5:66 | 5:68 (ecart) |
| 96 | 12 | 48 | 5:81 | 5:83 (ecart) |
| 98 | 13 | 49 | 5:96 | 5:98 (ecart) |
| 100 | 13 | 50 | 5:108 | 5:112 (ecart) |

### Sourate 6 — Al-Anam (Les Bestiaux) (165 versets)

10 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 102 | 13 | 51 | 6:12 | 6:13 (ecart) |
| 104 | 13 | 52 | 6:35 | 6:36 (ecart) |
| 106 | 14 | 53 | 6:58 | 6:59 (ecart) |
| 108 | 14 | 54 | 6:73 | 6:80 (ecart) |
| 110 | 14 | 55 | 6:94 | 6:95 (ecart) |
| 112 | 14 | 56 | 6:110 | 6:111 (ecart) |
| 114 | 15 | 57 | 6:126 | 6:127 (ecart) |
| 116 | 15 | 58 | 6:140 | 6:141 (ecart) |
| 118 | 15 | 59 | 6:150 | 6:151 (ecart) |
| 120 | 15 | 60 | 6:165 | 6:167 (ecart) |

### Sourate 8 — Al-Anfal (Le Butin) (75 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 142 | 18 | 71 | 8:21 | 8:21 |
| 144 | 18 | 72 | 8:40 | 8:40 |
| 146 | 19 | 73 | 8:60 | 8:60 |
| 148 | 19 | 74 | 8:75 | 9:4 (ecart) |

### Sourate 9 — At-Tawbah (Le Repentir) (129 versets)

8 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 150 | 19 | 75 | 9:18 | 9:18 |
| 152 | 19 | 76 | 9:33 | 9:33 |
| 154 | 20 | 77 | 9:45 | 9:45 |
| 156 | 20 | 78 | 9:59 | 9:60 (ecart) |
| 158 | 20 | 79 | 9:74 | 9:75 (ecart) |
| 160 | 20 | 80 | 9:92 | 9:93 (ecart) |
| 162 | 21 | 81 | 9:110 | 9:111 (ecart) |
| 164 | 21 | 82 | 9:121 | 9:123 (ecart) |

### Sourate 11 — Hud (Hud) (123 versets)

5 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 178 | 23 | 89 | 11:23 | 11:23 |
| 180 | 23 | 90 | 11:40 | 11:40 |
| 182 | 23 | 91 | 11:60 | 11:60 |
| 184 | 23 | 92 | 11:83 | 11:82 (ecart) |
| 186 | 24 | 93 | 11:107 | 11:104 (ecart) |

### Sourate 12 — Yusuf (Joseph) (111 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 188 | 24 | 94 | 12:6 | 12:9 (ecart) |

### Sourate 13 — Ar-Rad (Le Tonnerre) (43 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 200 | 25 | 100 | 13:18 | 13:20 (ecart) |
| 202 | 26 | 101 | 13:34 | 13:35 (ecart) |

### Sourate 14 — Ibrahim (Abraham) (52 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 204 | 26 | 102 | 14:9 | 14:12 (ecart) |
| 206 | 26 | 103 | 14:27 | 14:29 (ecart) |
| 208 | 26 | 104 | 14:52 | 14:54 (ecart) |

### Sourate 17 — Al-Isra (Le Voyage Nocturne) (111 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 226 | 29 | 113 | 17:22 | 17:22 |
| 228 | 29 | 114 | 17:49 | 17:49 |
| 230 | 29 | 115 | 17:69 | 17:69 |
| 232 | 29 | 116 | 17:98 | 17:98 |

### Sourate 18 — Al-Kahf (La Caverne) (110 versets)

5 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 234 | 30 | 117 | 18:16 | 18:16 |
| 236 | 30 | 118 | 18:31 | 18:31 |
| 238 | 30 | 119 | 18:50 | 18:52 (ecart) |
| 240 | 30 | 120 | 18:74 | 18:73 (ecart) |
| 242 | 31 | 121 | 18:98 | 18:94 (ecart) |

### Sourate 19 — Maryam (Marie) (98 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 244 | 31 | 122 | 19:21 | 19:20 (ecart) |
| 246 | 31 | 123 | 19:58 | 19:58 |
| 248 | 31 | 124 | 19:98 | 19:99 (ecart) |

### Sourate 20 — Ta-Ha (Ta-Ha) (135 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 250 | 32 | 125 | 20:54 | 20:53 (ecart) |
| 252 | 32 | 126 | 20:82 | 20:80 (ecart) |
| 254 | 32 | 127 | 20:110 | 20:107 (ecart) |
| 256 | 32 | 128 | 20:135 | 20:134 (ecart) |

### Sourate 21 — Al-Anbiya (Les Prophetes) (112 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 258 | 33 | 129 | 21:28 | 21:29 (ecart) |
| 260 | 33 | 130 | 21:50 | 21:50 |
| 262 | 33 | 131 | 21:82 | 21:85 (ecart) |
| 264 | 33 | 132 | 21:112 | 21:111 (ecart) |

### Sourate 22 — Al-Hajj (Le Pelerinage) (78 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 266 | 34 | 133 | 22:18 | 22:18 |
| 268 | 34 | 134 | 22:37 | 22:35 (ecart) |
| 270 | 34 | 135 | 22:59 | 22:57 (ecart) |
| 272 | 34 | 136 | 22:78 | 22:76 (ecart) |

### Sourate 23 — Al-Muminun (Les Croyants) (118 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 274 | 35 | 137 | 23:35 | 23:35 |
| 276 | 35 | 138 | 23:74 | 23:75 (ecart) |
| 278 | 35 | 139 | 23:118 | 23:115 (ecart) |

### Sourate 24 — An-Nur (La Lumiere) (64 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 280 | 35 | 140 | 24:20 | 24:20 |
| 282 | 36 | 141 | 24:34 | 24:34 |
| 284 | 36 | 142 | 24:52 | 24:50 (ecart) |
| 286 | 36 | 143 | 24:64 | 24:60 (ecart) |

### Sourate 26 — Ash-Shuara (Les Poetes) (227 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 294 | 37 | 147 | 26:51 | 26:49 (ecart) |
| 296 | 37 | 148 | 26:110 | 26:110 |
| 298 | 38 | 149 | 26:180 | 26:180 |
| 300 | 38 | 150 | 26:227 | 27:5 (ecart) |

### Sourate 27 — An-Naml (Les Fourmis) (93 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 302 | 38 | 151 | 27:26 | 27:26 |
| 304 | 38 | 152 | 27:55 | 27:57 (ecart) |
| 306 | 39 | 153 | 27:81 | 27:83 (ecart) |

### Sourate 30 — Ar-Rum (Les Romains) (60 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 324 | 41 | 162 | 30:30 | 30:29 (ecart) |
| 326 | 41 | 163 | 30:53 | 30:52 (ecart) |

### Sourate 31 — Luqman (Luqman) (34 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 328 | 41 | 164 | 31:21 | 31:20 (ecart) |

### Sourate 32 — As-Sajdah (La Prosternation) (30 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 330 | 42 | 165 | 32:10 | 32:10 |

### Sourate 35 — Fatir (Le Createur) (45 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 348 | 44 | 174 | 35:14 | 35:14 |
| 350 | 44 | 175 | 35:40 | 35:39 (ecart) |

### Sourate 36 — Ya-Sin (Ya-Sin) (83 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 352 | 44 | 176 | 36:27 | 36:26 (ecart) |
| 354 | 45 | 177 | 36:59 | 36:58 (ecart) |

### Sourate 37 — As-Saffat (Les Ranges) (182 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 356 | 45 | 178 | 37:21 | 37:21 |

### Sourate 38 — Sad (Sad) (88 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 362 | 46 | 181 | 38:20 | 38:19 (ecart) |
| 364 | 46 | 182 | 38:51 | 38:50 (ecart) |

### Sourate 39 — Az-Zumar (Les Groupes) (75 versets)

4 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 366 | 46 | 183 | 39:7 | 39:8 (ecart) |
| 368 | 46 | 184 | 39:31 | 39:30 (ecart) |
| 370 | 47 | 185 | 39:52 | 39:49 (ecart) |
| 372 | 47 | 186 | 39:75 | 39:72 (ecart) |

### Sourate 40 — Ghafir (Le Pardonneur) (85 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 374 | 47 | 187 | 40:20 | 40:20 |
| 376 | 47 | 188 | 40:40 | 40:40 |
| 378 | 48 | 189 | 40:65 | 40:65 |

### Sourate 41 — Fussilat (Les Detailles) (54 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 380 | 48 | 190 | 41:8 | 41:7 (ecart) |
| 382 | 48 | 191 | 41:24 | 41:24 |
| 384 | 48 | 192 | 41:46 | 41:45 (ecart) |

### Sourate 42 — Ash-Shura (La Consultation) (53 versets)

3 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 386 | 49 | 193 | 42:12 | 42:10 (ecart) |
| 388 | 49 | 194 | 42:26 | 42:30 (ecart) |
| 390 | 49 | 195 | 42:50 | 42:47 (ecart) |

### Sourate 45 — Al-Jathiyah (L'Agenouillee) (37 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 398 | 50 | 199 | 45:11 | 45:9 (ecart) |
| 400 | 50 | 200 | 45:37 | 45:36 (ecart) |

### Sourate 46 — Al-Ahqaf (Al-Ahqaf) (35 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 402 | 51 | 201 | 46:20 | 46:19 (ecart) |

### Sourate 47 — Muhammad (Muhammad) (38 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 404 | 51 | 202 | 47:9 | 47:10 (ecart) |
| 406 | 51 | 203 | 47:32 | 47:33 (ecart) |

### Sourate 53 — An-Najm (L'Etoile) (62 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 420 | 53 | 210 | 53:25 | 53:25 |

### Sourate 54 — Al-Qamar (La Lune) (55 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 422 | 53 | 211 | 54:8 | 54:17 (ecart) |

### Sourate 55 — Ar-Rahman (Le Tout Misericordieux) (78 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 426 | 54 | 213 | 55:78 | 55:58 (ecart) |

### Sourate 56 — Al-Waqiah (L'Inevitable) (96 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 428 | 54 | 214 | 56:74 | 56:77 (ecart) |

### Sourate 57 — Al-Hadid (Le Fer) (29 versets)

2 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 430 | 54 | 215 | 57:15 | 57:14 (ecart) |
| 432 | 54 | 216 | 57:29 | 57:28 (ecart) |

### Sourate 58 — Al-Mujadilah (La Discussion) (22 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 434 | 55 | 217 | 58:13 | 58:13 |

### Sourate 67 — Al-Mulk (La Royaute) (30 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 450 | 57 | 225 | 67:30 | 68:18 (ecart) |

### Sourate 70 — Al-Maarij (Les Voies d'Ascension) (44 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 454 | 57 | 227 | 70:18 | 70:39 (ecart) |

### Sourate 71 — Nuh (Noe) (28 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 456 | 57 | 228 | 71:28 | 71:30 (ecart) |

### Sourate 74 — Al-Muddaththir (Le Couvert d'un Manteau) (56 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 460 | 58 | 230 | 74:56 | 74:55 (ecart) |

### Sourate 79 — An-Naziat (Les Anges qui Arrachent) (46 versets)

1 borne(s) estimee(s).

| Toumoun | Hizb | Rub' | Fin estimee | Reference Qaloun |
| ---: | ---: | ---: | --- | --- |
| 466 | 59 | 233 | 79:46 | 79:40 (ecart) |

## Traçabilite

| Element | Valeur |
| --- | --- |
| Recitation | Hafs an Asim |
| Texte coranique | Tanzil.net (texte Uthmani Hafs) |
| Donnees Hafs | quran-meta (npm) Hafs lists, source KFGQPC |
| Donnees Qaloun | quran-meta (npm) Qalun lists, source KFGQPC |
| Licence | MIT (quran-meta) / Tanzil Terms of Use |
| Genere le | 2026-09-22T00:58:29.192112 |
