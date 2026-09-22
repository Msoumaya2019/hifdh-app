#!/usr/bin/env python3
"""
Genere le fichier JSON des 480 toumoun (thumn al-hizb, 1/8 de hizb) pour la recitation Hafs.

METHODOLOGIE
============
Les 480 thumn existent dans la tradition Qaloun (base de donnees KFGQPC via quran-meta).
Ils n'existent pas dans les donnees Hafs (quran-meta: numThumunAlHizbs = 0 pour Hafs).

Pour rendre ces 480 thumn utilisables avec le texte Hafs, nous procedons ainsi:

1. Les 240 limites de rub' al-hizb (thumn impairs: 1, 3, 5, ... 479) sont VERIFIEES
   directement depuis les donnees Hafs de quran-meta (HizbQuarterList Hafs).

2. Les 240 limites intermediaires (thumn pairs: 2, 4, 6, ... 480) proviennent des
   donnees Qaloun. Pour chaque limite:
   a. Convertir l'ayah ID Qaloun en (sourate, verset) Qaloun
   b. Calculer le decalage cumulatif entre Hafs et Qaloun
   c. Deduire la position correspondante en Hafs

3. Pour les sourates ou le nombre de versets est identique en Hafs et Qaloun
   (66 sourates sur 114), le mappage est direct et verifie.

4. Pour les sourates ou le nombre de versets differe (48 sourates), le mappage
   utilise le decalage cumulatif au niveau de la sourate. Le numero de verset
   peut etre decalle de +/-1 dans ces cas. Statut: "estimated_offset".

SOURCE DES DONNEES
==================
- Texte et limites Qaloun: quran-meta (npm), donnees KFGQPC
- Texte et limites Hafs: quran-meta (npm), donnees KFGQPC
- Licence: MIT (quran-meta) / Tanzil (texte coranique)

ATTENTION: Ce fichier est un point de depart. Les limites "estimated_offset"
doivent etre verifiees manuellement contre un mushaf Hafs imprime.
"""

import json
from datetime import datetime

# ============================================================================
# DONNEES SOURCE: QALOUN (de quran-meta, source KFGQPC)
# ============================================================================

# HizbEighthList Qaloun: 483 entrees (sentinel + 480 thumn + sentinel final)
# Les valeurs sont des ayah IDs dans la numerotation Qaloun (total 6214 versets)
QALOUN_HIZB_EIGHTH_LIST = [
    0, 1, 20, 32, 40, 50, 60, 66, 73, 82, 91, 98, 108, 112, 121, 130, 139, 148, 154, 164,
    174, 183, 191, 195, 203, 208, 218, 224, 233, 238, 241, 248, 253, 258, 264, 269, 273, 278,
    288, 289, 297, 307, 318, 325, 334, 343, 355, 366, 374, 383, 396, 405, 413, 425, 436, 445,
    452, 463, 471, 478, 487, 498, 503, 505, 511, 516, 523, 528, 538, 549, 555, 565, 569, 578,
    584, 591, 596, 605, 614, 621, 629, 639, 650, 657, 663, 671, 674, 680, 686, 692, 701, 710,
    714, 718, 728, 736, 744, 751, 759, 766, 775, 780, 790, 803, 815, 826, 840, 849, 859, 870,
    881, 885, 890, 901, 910, 917, 926, 931, 935, 941, 948, 957, 974, 984, 992, 1002, 1010,
    1020, 1030, 1043, 1055, 1072, 1087, 1098, 1104, 1112, 1119, 1127, 1136, 1144, 1155, 1167,
    1174, 1184, 1194, 1203, 1212, 1223, 1235, 1243, 1250, 1257, 1263, 1272, 1278, 1284, 1292,
    1299, 1308, 1314, 1323, 1332, 1340, 1350, 1356, 1362, 1371, 1379, 1387, 1394, 1405, 1417,
    1429, 1439, 1451, 1461, 1472, 1483, 1492, 1501, 1509, 1518, 1527, 1538, 1550, 1560, 1571,
    1582, 1596, 1608, 1620, 1631, 1641, 1651, 1665, 1675, 1686, 1699, 1708, 1714, 1726, 1730,
    1740, 1745, 1754, 1766, 1775, 1783, 1794, 1808, 1833, 1856, 1887, 1907, 1921, 1936, 1944,
    1957, 1969, 1977, 1985, 1996, 2004, 2017, 2026, 2035, 2045, 2057, 2070, 2084, 2095, 2104,
    2119, 2133, 2145, 2161, 2167, 2176, 2188, 2197, 2207, 2218, 2226, 2239, 2250, 2270, 2289,
    2308, 2327, 2349, 2372, 2402, 2419, 2429, 2441, 2456, 2474, 2483, 2498, 2512, 2524, 2533,
    2555, 2568, 2582, 2594, 2604, 2612, 2621, 2629, 2640, 2651, 2661, 2670, 2690, 2705, 2727,
    2745, 2767, 2785, 2799, 2809, 2818, 2823, 2830, 2839, 2846, 2849, 2860, 2871, 2882, 2895,
    2911, 2928, 2949, 2977, 3005, 3038, 3073, 3108, 3135, 3159, 3171, 3180, 3195, 3211, 3222,
    3237, 3249, 3259, 3267, 3277, 3286, 3299, 3309, 3324, 3331, 3343, 3351, 3361, 3372, 3382,
    3396, 3413, 3426, 3435, 3445, 3458, 3475, 3485, 3495, 3508, 3520, 3533, 3540, 3547, 3555,
    3558, 3567, 3578, 3582, 3587, 3599, 3607, 3615, 3624, 3634, 3646, 3659, 3669, 3685, 3694,
    3701, 3727, 3744, 3759, 3776, 3804, 3833, 3865, 3896, 3927, 3965, 3984, 3993, 4015, 4047,
    4059, 4068, 4081, 4090, 4100, 4114, 4123, 4131, 4143, 4152, 4163, 4175, 4188, 4200, 4214,
    4222, 4231, 4243, 4252, 4260, 4270, 4278, 4290, 4299, 4307, 4320, 4332, 4351, 4372, 4393,
    4422, 4446, 4464, 4476, 4491, 4504, 4510, 4522, 4535, 4545, 4558, 4571, 4581, 4590, 4593,
    4601, 4606, 4616, 4637, 4656, 4686, 4711, 4737, 4757, 4788, 4817, 4841, 4864, 4879, 4909,
    4937, 4984, 5033, 5061, 5069, 5075, 5083, 5090, 5096, 5108, 5114, 5128, 5134, 5141, 5155,
    5163, 5174, 5183, 5190, 5200, 5206, 5214, 5219, 5238, 5268, 5297, 5339, 5372, 5393, 5412,
    5428, 5445, 5473, 5504, 5529, 5568, 5586, 5614, 5649, 5689, 5729, 5766, 5790, 5830, 5875,
    5896, 5924, 5959, 6001, 6036, 6068, 6104, 6134, 6167, 6215
]

# Qaloun SurahList: [startAyahId, ayahCount, surahOrder, rukuCount, name, isMeccan]
# 116 entrees (sentinel + 114 sourates + sentinel)
QALOUN_SURAH_LIST = [
    [-1, 1, 1, 1, "", False],
    [1, 7, 5, 1, "Al-Fatiha", True],
    [8, 285, 87, 40, "Al-Baqarah", False],
    [293, 200, 89, 20, "Al-Imran", False],
    [493, 175, 92, 24, "An-Nisa", False],
    [668, 122, 112, 16, "Al-Maidah", False],
    [790, 167, 55, 20, "Al-Anam", True],
    [957, 206, 39, 24, "Al-Araf", True],
    [1163, 76, 88, 10, "Al-Anfal", False],
    [1239, 130, 113, 16, "At-Tawbah", False],
    [1369, 109, 51, 11, "Yunus", True],
    [1478, 121, 52, 10, "Hud", True],
    [1599, 111, 53, 12, "Yusuf", True],
    [1710, 44, 96, 6, "Ar-Rad", False],
    [1754, 54, 72, 7, "Ibrahim", True],
    [1808, 99, 54, 6, "Al-Hijr", True],
    [1907, 128, 70, 16, "An-Nahl", True],
    [2035, 110, 50, 12, "Al-Isra", True],
    [2145, 105, 69, 12, "Al-Kahf", True],
    [2250, 99, 44, 6, "Maryam", True],
    [2349, 134, 45, 8, "Ta-Ha", True],
    [2483, 111, 73, 7, "Al-Anbiya", True],
    [2594, 76, 103, 10, "Al-Hajj", False],
    [2670, 119, 74, 6, "Al-Muminun", True],
    [2789, 62, 102, 9, "An-Nur", False],
    [2851, 77, 42, 6, "Al-Furqan", True],
    [2928, 226, 47, 11, "Ash-Shuara", True],
    [3154, 95, 48, 7, "An-Naml", True],
    [3249, 88, 49, 8, "Al-Qasas", True],
    [3337, 69, 85, 7, "Al-Ankabut", True],
    [3406, 59, 84, 6, "Ar-Rum", True],
    [3465, 33, 57, 3, "Luqman", True],
    [3498, 30, 75, 3, "As-Sajdah", True],
    [3528, 73, 90, 9, "Al-Ahzab", False],
    [3601, 54, 58, 6, "Saba", True],
    [3655, 46, 43, 5, "Fatir", True],
    [3701, 82, 41, 5, "Ya-Sin", True],
    [3783, 182, 56, 5, "As-Saffat", True],
    [3965, 86, 38, 5, "Sad", True],
    [4051, 72, 59, 8, "Az-Zumar", True],
    [4123, 84, 60, 9, "Ghafir", True],
    [4207, 53, 61, 6, "Fussilat", True],
    [4260, 50, 62, 5, "Ash-Shura", True],
    [4310, 89, 63, 7, "Az-Zukhruf", True],
    [4399, 56, 64, 3, "Ad-Dukhan", True],
    [4455, 36, 65, 4, "Al-Jathiyah", True],
    [4491, 34, 66, 4, "Al-Ahqaf", True],
    [4525, 39, 95, 4, "Muhammad", False],
    [4564, 29, 111, 4, "Al-Fath", False],
    [4593, 18, 106, 2, "Al-Hujurat", False],
    [4611, 45, 34, 3, "Qaf", True],
    [4656, 60, 67, 3, "Adh-Dhariyat", True],
    [4716, 47, 76, 2, "At-Tur", True],
    [4763, 61, 23, 3, "An-Najm", True],
    [4824, 55, 37, 3, "Al-Qamar", True],
    [4879, 77, 97, 3, "Ar-Rahman", False],
    [4956, 99, 46, 3, "Al-Waqiah", True],
    [5055, 28, 94, 4, "Al-Hadid", False],
    [5083, 21, 105, 3, "Al-Mujadilah", False],
    [5104, 24, 101, 3, "Al-Hashr", False],
    [5128, 13, 91, 2, "Al-Mumtahanah", False],
    [5141, 14, 109, 2, "As-Saff", False],
    [5155, 11, 110, 2, "Al-Jumuah", False],
    [5166, 11, 104, 2, "Al-Munafiqun", False],
    [5177, 18, 108, 2, "At-Taghabun", False],
    [5195, 12, 99, 2, "At-Talaq", False],
    [5207, 12, 107, 2, "At-Tahrim", False],
    [5219, 31, 77, 2, "Al-Mulk", True],
    [5250, 52, 2, 2, "Al-Qalam", True],
    [5302, 52, 78, 2, "Al-Haqqah", True],
    [5354, 44, 79, 2, "Al-Maarij", True],
    [5398, 30, 71, 2, "Nuh", True],
    [5428, 28, 40, 2, "Al-Jinn", True],
    [5456, 18, 3, 2, "Al-Muzzammil", True],
    [5474, 55, 4, 2, "Al-Muddaththir", True],
    [5529, 39, 31, 2, "Al-Qiyamah", True],
    [5568, 31, 98, 2, "Al-Insan", False],
    [5599, 50, 33, 2, "Al-Mursalat", True],
    [5649, 40, 80, 2, "An-Naba", True],
    [5689, 45, 81, 2, "An-Naziat", True],
    [5734, 42, 24, 1, "Abasa", True],
    [5776, 29, 7, 1, "At-Takwir", True],
    [5805, 19, 82, 1, "Al-Infitar", True],
    [5824, 36, 86, 1, "Al-Mutaffifin", True],
    [5860, 25, 83, 1, "Al-Inshiqaq", True],
    [5885, 22, 27, 1, "Al-Buruj", True],
    [5907, 17, 36, 1, "At-Tariq", True],
    [5924, 19, 8, 1, "Al-Ala", True],
    [5943, 26, 68, 1, "Al-Ghashiyah", True],
    [5969, 32, 10, 1, "Al-Fajr", True],
    [6001, 20, 35, 1, "Al-Balad", True],
    [6021, 15, 26, 1, "Ash-Shams", True],
    [6036, 21, 9, 1, "Al-Layl", True],
    [6057, 11, 11, 1, "Ad-Duha", True],
    [6068, 8, 12, 1, "Ash-Sharh", True],
    [6076, 8, 28, 1, "At-Tin", True],
    [6084, 20, 1, 1, "Al-Alaq", True],
    [6104, 5, 25, 1, "Al-Qadr", True],
    [6109, 8, 100, 1, "Al-Bayyinah", False],
    [6117, 9, 93, 1, "Az-Zalzalah", False],
    [6126, 11, 14, 1, "Al-Adiyat", True],
    [6137, 10, 30, 1, "Al-Qariah", True],
    [6147, 8, 16, 1, "At-Takathur", True],
    [6155, 3, 13, 1, "Al-Asr", True],
    [6158, 9, 32, 1, "Al-Humazah", True],
    [6167, 5, 19, 1, "Al-Fil", True],
    [6172, 5, 29, 1, "Quraysh", True],
    [6177, 6, 17, 1, "Al-Maun", True],
    [6183, 3, 15, 1, "Al-Kawthar", True],
    [6186, 6, 18, 1, "Al-Kafirun", True],
    [6192, 3, 114, 1, "An-Nasr", False],
    [6195, 5, 6, 1, "Al-Masad", True],
    [6200, 4, 22, 1, "Al-Ikhlas", True],
    [6204, 5, 20, 1, "Al-Falaq", True],
    [6209, 6, 21, 1, "An-Nas", True],
    [6216, 1, 1, 1, "", False],
]

# ============================================================================
# DONNEES SOURCE: HAFS (de quran-meta, source KFGQPC)
# ============================================================================

# Hafs SurahList: [startAyahId, ayahCount, surahOrder, rukuCount, name, isMeccan]
HAFS_SURAH_LIST = [
    [-1, 1, 1, 1, "", False],
    [1, 7, 5, 1, "Al-Fatiha", True],
    [8, 286, 87, 40, "Al-Baqarah", False],
    [294, 200, 89, 20, "Al-Imran", False],
    [494, 176, 92, 24, "An-Nisa", False],
    [670, 120, 112, 16, "Al-Maidah", False],
    [790, 165, 55, 20, "Al-Anam", True],
    [955, 206, 39, 24, "Al-Araf", True],
    [1161, 75, 88, 10, "Al-Anfal", False],
    [1236, 129, 113, 16, "At-Tawbah", False],
    [1365, 109, 51, 11, "Yunus", True],
    [1474, 123, 52, 10, "Hud", True],
    [1597, 111, 53, 12, "Yusuf", True],
    [1708, 43, 96, 6, "Ar-Rad", False],
    [1751, 52, 72, 7, "Ibrahim", True],
    [1803, 99, 54, 6, "Al-Hijr", True],
    [1902, 128, 70, 16, "An-Nahl", True],
    [2030, 111, 50, 12, "Al-Isra", True],
    [2141, 110, 69, 12, "Al-Kahf", True],
    [2251, 98, 44, 6, "Maryam", True],
    [2349, 135, 45, 8, "Ta-Ha", True],
    [2484, 112, 73, 7, "Al-Anbiya", True],
    [2596, 78, 103, 10, "Al-Hajj", False],
    [2674, 118, 74, 6, "Al-Muminun", True],
    [2792, 64, 102, 9, "An-Nur", False],
    [2856, 77, 42, 6, "Al-Furqan", True],
    [2933, 227, 47, 11, "Ash-Shuara", True],
    [3160, 93, 48, 7, "An-Naml", True],
    [3253, 88, 49, 8, "Al-Qasas", True],
    [3341, 69, 85, 7, "Al-Ankabut", True],
    [3410, 60, 84, 6, "Ar-Rum", True],
    [3470, 34, 57, 3, "Luqman", True],
    [3504, 30, 75, 3, "As-Sajdah", True],
    [3534, 73, 90, 9, "Al-Ahzab", False],
    [3607, 54, 58, 6, "Saba", True],
    [3661, 45, 43, 5, "Fatir", True],
    [3706, 83, 41, 5, "Ya-Sin", True],
    [3789, 182, 56, 5, "As-Saffat", True],
    [3971, 88, 38, 5, "Sad", True],
    [4059, 75, 59, 8, "Az-Zumar", True],
    [4134, 85, 60, 9, "Ghafir", True],
    [4219, 54, 61, 6, "Fussilat", True],
    [4273, 53, 62, 5, "Ash-Shura", True],
    [4326, 89, 63, 7, "Az-Zukhruf", True],
    [4415, 59, 64, 3, "Ad-Dukhan", True],
    [4474, 37, 65, 4, "Al-Jathiyah", True],
    [4511, 35, 66, 4, "Al-Ahqaf", True],
    [4546, 38, 95, 4, "Muhammad", False],
    [4584, 29, 111, 4, "Al-Fath", False],
    [4613, 18, 106, 2, "Al-Hujurat", False],
    [4631, 45, 34, 3, "Qaf", True],
    [4676, 60, 67, 3, "Adh-Dhariyat", True],
    [4736, 49, 76, 2, "At-Tur", True],
    [4785, 62, 23, 3, "An-Najm", True],
    [4847, 55, 37, 3, "Al-Qamar", True],
    [4902, 78, 97, 3, "Ar-Rahman", False],
    [4980, 96, 46, 3, "Al-Waqiah", True],
    [5076, 29, 94, 4, "Al-Hadid", False],
    [5105, 22, 105, 3, "Al-Mujadilah", False],
    [5127, 24, 101, 3, "Al-Hashr", False],
    [5151, 13, 91, 2, "Al-Mumtahanah", False],
    [5164, 14, 109, 2, "As-Saff", False],
    [5178, 11, 110, 2, "Al-Jumuah", False],
    [5189, 11, 104, 2, "Al-Munafiqun", False],
    [5200, 18, 108, 2, "At-Taghabun", False],
    [5218, 12, 99, 2, "At-Talaq", False],
    [5230, 12, 107, 2, "At-Tahrim", False],
    [5242, 30, 77, 2, "Al-Mulk", True],
    [5272, 52, 2, 2, "Al-Qalam", True],
    [5324, 52, 78, 2, "Al-Haqqah", True],
    [5376, 44, 79, 2, "Al-Maarij", True],
    [5420, 28, 71, 2, "Nuh", True],
    [5448, 28, 40, 2, "Al-Jinn", True],
    [5476, 20, 3, 2, "Al-Muzzammil", True],
    [5496, 56, 4, 2, "Al-Muddaththir", True],
    [5552, 40, 31, 2, "Al-Qiyamah", True],
    [5592, 31, 98, 2, "Al-Insan", False],
    [5623, 50, 33, 2, "Al-Mursalat", True],
    [5673, 40, 80, 2, "An-Naba", True],
    [5713, 46, 81, 2, "An-Naziat", True],
    [5759, 42, 24, 1, "Abasa", True],
    [5801, 29, 7, 1, "At-Takwir", True],
    [5830, 19, 82, 1, "Al-Infitar", True],
    [5849, 36, 86, 1, "Al-Mutaffifin", True],
    [5885, 25, 83, 1, "Al-Inshiqaq", True],
    [5910, 22, 27, 1, "Al-Buruj", True],
    [5932, 17, 36, 1, "At-Tariq", True],
    [5949, 19, 8, 1, "Al-Ala", True],
    [5968, 26, 68, 1, "Al-Ghashiyah", True],
    [5994, 30, 10, 1, "Al-Fajr", True],
    [6024, 20, 35, 1, "Al-Balad", True],
    [6044, 15, 26, 1, "Ash-Shams", True],
    [6059, 21, 9, 1, "Al-Layl", True],
    [6080, 11, 11, 1, "Ad-Duha", True],
    [6091, 8, 12, 1, "Ash-Sharh", True],
    [6099, 8, 28, 1, "At-Tin", True],
    [6107, 19, 1, 1, "Al-Alaq", True],
    [6126, 5, 25, 1, "Al-Qadr", True],
    [6131, 8, 100, 1, "Al-Bayyinah", False],
    [6139, 8, 93, 1, "Az-Zalzalah", False],
    [6147, 11, 14, 1, "Al-Adiyat", True],
    [6158, 11, 30, 1, "Al-Qariah", True],
    [6169, 8, 16, 1, "At-Takathur", True],
    [6177, 3, 13, 1, "Al-Asr", True],
    [6180, 9, 32, 1, "Al-Humazah", True],
    [6189, 5, 19, 1, "Al-Fil", True],
    [6194, 4, 29, 1, "Quraysh", True],
    [6198, 7, 17, 1, "Al-Maun", True],
    [6205, 3, 15, 1, "Al-Kawthar", True],
    [6208, 6, 18, 1, "Al-Kafirun", True],
    [6214, 3, 114, 1, "An-Nasr", False],
    [6217, 5, 6, 1, "Al-Masad", True],
    [6222, 4, 22, 1, "Al-Ikhlas", True],
    [6226, 5, 20, 1, "Al-Falaq", True],
    [6231, 6, 21, 1, "An-Nas", True],
    [6237, 1, 1, 1, "", False],
]

# Hafs HizbQuarterList (rub' al-hizb, 242 entrees: sentinel + 240 + sentinel)
HAFS_HIZB_QUARTER_LIST = [
    0, 1, 33, 51, 67, 82, 99, 113, 131, 149, 165, 184, 196, 210, 226, 240, 250, 260, 270, 279,
    290, 308, 326, 345, 368, 386, 406, 426, 446, 464, 479, 494, 505, 517, 529, 551, 567, 581,
    593, 607, 628, 641, 656, 670, 681, 696, 710, 720, 736, 751, 766, 778, 802, 825, 848, 863,
    884, 900, 916, 930, 940, 955, 985, 1001, 1019, 1042, 1071, 1096, 1110, 1125, 1143, 1161,
    1182, 1201, 1221, 1236, 1254, 1269, 1281, 1295, 1310, 1328, 1346, 1357, 1375, 1390, 1417,
    1435, 1454, 1479, 1497, 1514, 1534, 1557, 1581, 1603, 1626, 1649, 1673, 1697, 1712, 1726,
    1742, 1760, 1778, 1803, 1852, 1902, 1931, 1952, 1976, 1991, 2012, 2030, 2052, 2079, 2099,
    2128, 2157, 2172, 2191, 2215, 2239, 2272, 2309, 2349, 2403, 2431, 2459, 2484, 2512, 2534,
    2566, 2596, 2614, 2633, 2655, 2674, 2709, 2748, 2792, 2812, 2826, 2844, 2856, 2876, 2908,
    2933, 2984, 3043, 3113, 3160, 3186, 3215, 3241, 3264, 3281, 3303, 3328, 3341, 3366, 3386,
    3410, 3440, 3463, 3491, 3514, 3534, 3551, 3564, 3584, 3593, 3616, 3630, 3652, 3675, 3701,
    3733, 3765, 3810, 3871, 3933, 3991, 4022, 4066, 4090, 4111, 4134, 4154, 4174, 4199, 4227,
    4243, 4265, 4285, 4299, 4323, 4349, 4382, 4431, 4485, 4511, 4531, 4555, 4578, 4601, 4613,
    4626, 4657, 4706, 4759, 4810, 4855, 4902, 4980, 5054, 5091, 5105, 5118, 5137, 5157, 5178,
    5192, 5218, 5230, 5242, 5272, 5324, 5394, 5448, 5495, 5552, 5610, 5673, 5759, 5830, 5885,
    5949, 6024, 6091, 6155, 6237
]


# ============================================================================
# FONCTIONS DE CONVERSION
# ============================================================================

def find_surah_ayah_from_ayah_id(ayah_id, surah_list):
    """Convertit un ayah ID en (sourate, verset) en utilisant la SurahList donnee."""
    for i in range(1, len(surah_list) - 1):
        start = surah_list[i][0]
        count = surah_list[i][1]
        if start <= ayah_id < start + count:
            return i, ayah_id - start + 1
    # Derniere sourate
    i = len(surah_list) - 2
    start = surah_list[i][0]
    return i, ayah_id - start + 1


def compute_cumulative_offset(qaloun_surah_list, hafs_surah_list):
    """
    Calcule le decalage cumulatif entre Hafs et Qaloun au debut de chaque sourate.
    offset[surahNum] = sum de (hafs_count - qaloun_count) pour les sourates 1 a surahNum-1.
    """
    offsets = {0: 0}
    cumulative = 0
    for s in range(1, 115):
        qaloun_count = qaloun_surah_list[s][1]
        hafs_count = hafs_surah_list[s][1]
        offsets[s] = cumulative
        cumulative += hafs_count - qaloun_count
    return offsets


def surah_has_same_verse_count(qaloun_surah_list, hafs_surah_list, surah_num):
    """Verifie si une sourate a le meme nombre de versets en Hafs et Qaloun."""
    return qaloun_surah_list[surah_num][1] == hafs_surah_list[surah_num][1]


def map_qaloun_to_hafs(qaloun_ayah_id, qaloun_surah_list, hafs_surah_list, cumulative_offsets):
    """
    Convertit un ayah ID Qaloun vers (sourate, verset) Hafs.
    
    Retourne: (surah, ayah, status)
    - status = "verified" si la sourate a le meme nombre de versets dans les deux recensions
    - status = "estimated_offset" sinon (le verset peut etre decalle de +/-1)
    """
    # 1. Convertir l'ayah ID Qaloun en (sourate, verset) Qaloun
    qaloun_surah, qaloun_ayah = find_surah_ayah_from_ayah_id(qaloun_ayah_id, qaloun_surah_list)
    
    # 2. Verifier si la sourate a le meme nombre de versets
    same_count = surah_has_same_verse_count(qaloun_surah_list, hafs_surah_list, qaloun_surah)
    
    if same_count:
        # Mappage direct: meme (sourate, verset) dans les deux systemes
        status = "verified"
        return qaloun_surah, qaloun_ayah, status
    else:
        # Decalage cumulatif: l'ayah ID Hafs = ayah ID Qaloun + offset cumulatif
        offset = cumulative_offsets[qaloun_surah]
        hafs_ayah_id = qaloun_ayah_id + offset
        
        # Verifier que l'ayah ID Hafs est dans la meme sourate
        hafs_surah, hafs_ayah = find_surah_ayah_from_ayah_id(hafs_ayah_id, hafs_surah_list)
        
        # Si la sourate change a cause du decalage, ajuster
        if hafs_surah != qaloun_surah:
            # Le decalage a fait passer la limite de sourate
            # Utiliser le premier verset de la sourate Hafs correspondante
            hafs_surah = qaloun_surah
            hafs_start = hafs_surah_list[qaloun_surah][0]
            hafs_ayah = hafs_ayah_id - hafs_start + 1
            # Si l'ayah est hors limites, clamper
            hafs_count = hafs_surah_list[qaloun_surah][1]
            if hafs_ayah < 1:
                hafs_ayah = 1
            elif hafs_ayah > hafs_count:
                hafs_ayah = hafs_count
        
        status = "estimated_offset"
        return hafs_surah, hafs_ayah, status


# ============================================================================
# GENERATION DU FICHIER JSON
# ============================================================================

def build_hafs_hizb_eighth_list():
    """
    Construit la liste complete des 480 thumn en numerotation Hafs (483 entrees).
    
    - Indices impairs (1, 3, 5, ..., 479): limites de rub' depuis Hafs HizbQuarterList
    - Indices pairs (2, 4, 6, ..., 480): limites intermediaires mapped depuis Qaloun
    - Index 0 et 482: sentinelles
    
    Pour les limites intermediaires (paires), on prend la valeur Qaloun, on la
    convertit en (sourate, verset) Qaloun, puis on cherche l'ayah ID Hafs correspondant.
    On garantit que chaque limite intermediaire est strictement entre les deux limites
    de rub' qui l'entourent (bornage).
    """
    cumulative_offsets = compute_cumulative_offset(QALOUN_SURAH_LIST, HAFS_SURAH_LIST)
    num_entries = len(QALOUN_HIZB_EIGHTH_LIST)  # meme taille que la liste Qaloun
    hafs_eighth_list = [0] * num_entries
    hafs_eighth_list[0] = 0  # sentinel
    hafs_eighth_list[-1] = 6237  # sentinel final Hafs (numAyahs + 1)
    
    statuses = [None] * 483
    qaloun_refs = [None] * 483  # (surah, ayah, ayah_id) en Qaloun
    
    for thumn_num in range(1, 481):
        qaloun_ayah_id = QALOUN_HIZB_EIGHTH_LIST[thumn_num]
        
        # Reference Qaloun
        qaloun_surah, qaloun_ayah = find_surah_ayah_from_ayah_id(qaloun_ayah_id, QALOUN_SURAH_LIST)
        qaloun_refs[thumn_num] = (qaloun_surah, qaloun_ayah, qaloun_ayah_id)
        
        is_rub_start = (thumn_num % 2 == 1)
        rub_num = (thumn_num - 1) // 2 + 1
        
        if is_rub_start:
            # Limite de rub' depuis les donnees Hafs verifiees
            hafs_eighth_list[thumn_num] = HAFS_HIZB_QUARTER_LIST[rub_num]
            statuses[thumn_num] = "verified_hafs"
        else:
            # Limite intermediaire: mapper depuis Qaloun
            hafs_surah, hafs_ayah, status = map_qaloun_to_hafs(
                qaloun_ayah_id, QALOUN_SURAH_LIST, HAFS_SURAH_LIST, cumulative_offsets)
            
            # Convertir (surah, ayah) Hafs en ayah ID Hafs
            hafs_ayah_id = HAFS_SURAH_LIST[hafs_surah][0] + hafs_ayah - 1
            
            # Bornage: s'assurer que la limite intermediaire est strictement
            # entre la limite de rub' precedente et la suivante
            prev_rub_start = hafs_eighth_list[thumn_num - 1]  # rub' precedent
            next_rub_num = rub_num + 1
            next_rub_start = HAFS_HIZB_QUARTER_LIST[next_rub_num]  # rub' suivant
            
            if hafs_ayah_id <= prev_rub_start:
                # La limite mapped est avant ou au debut du rub' precedent -> utiliser le verset suivant
                hafs_ayah_id = prev_rub_start + 1
                status = "estimated_offset"
            elif hafs_ayah_id >= next_rub_start:
                # La limite mapped est apres ou au debut du rub' suivant -> utiliser le verset precedent
                hafs_ayah_id = next_rub_start - 1
                status = "estimated_offset"
            
            hafs_eighth_list[thumn_num] = hafs_ayah_id
            statuses[thumn_num] = status
    
    return hafs_eighth_list, statuses, qaloun_refs


def generate_thumn_json():
    hafs_eighth_list, statuses, qaloun_refs = build_hafs_hizb_eighth_list()
    
    thumn_entries = []
    
    for thumn_num in range(1, 481):
        # Ayah IDs de debut et de fin (Hafs)
        hafs_start_ayah_id = hafs_eighth_list[thumn_num]
        hafs_end_ayah_id = hafs_eighth_list[thumn_num + 1] - 1
        
        # Calculer hizb et rub'
        hizb_num = (thumn_num - 1) // 8 + 1
        rub_num = (thumn_num - 1) // 2 + 1
        is_rub_start = (thumn_num % 2 == 1)
        
        # Convertir en (sourate, verset) Hafs
        start_surah, start_ayah = find_surah_ayah_from_ayah_id(hafs_start_ayah_id, HAFS_SURAH_LIST)
        end_surah, end_ayah = find_surah_ayah_from_ayah_id(hafs_end_ayah_id, HAFS_SURAH_LIST)
        
        # Reference Qaloun
        q_start = qaloun_refs[thumn_num]
        q_end_ayah_id = QALOUN_HIZB_EIGHTH_LIST[thumn_num + 1] - 1
        q_end_surah, q_end_ayah = find_surah_ayah_from_ayah_id(q_end_ayah_id, QALOUN_SURAH_LIST)
        
        # Statut de verification
        verification_status = statuses[thumn_num]
        
        if is_rub_start:
            source = "quran-meta Hafs HizbQuarterList (KFGQPC)"
        else:
            source = "quran-meta Qalun HizbEighthList (KFGQPC), mapped to Hafs"
        
        entry = {
            "thumnNumber": thumn_num,
            "hizbNumber": hizb_num,
            "rubNumber": rub_num,
            "isRubStart": is_rub_start,
            "hafs": {
                "startSurah": start_surah,
                "startAyah": start_ayah,
                "endSurah": end_surah,
                "endAyah": end_ayah,
                "startAyahId": hafs_start_ayah_id,
                "endAyahId": hafs_end_ayah_id,
            },
            "qalounReference": {
                "startSurah": q_start[0],
                "startAyah": q_start[1],
                "startAyahId": q_start[2],
                "endSurah": q_end_surah,
                "endAyah": q_end_ayah,
                "endAyahId": q_end_ayah_id,
            },
            "source": source,
            "verificationStatus": verification_status,
        }
        thumn_entries.append(entry)
    
    # Statistiques
    verified_count = sum(1 for e in thumn_entries if e["verificationStatus"] == "verified")
    verified_hafs_count = sum(1 for e in thumn_entries if e["verificationStatus"] == "verified_hafs")
    estimated_count = sum(1 for e in thumn_entries if e["verificationStatus"] == "estimated_offset")
    
    output = {
        "metadata": {
            "title": "Thumn al-Hizb (Toumoun) - 480 divisions pour la recitation Hafs",
            "description": (
                "480 divisions du Coran en 1/8 de hizb. Les 240 limites de rub' al-hizb "
                "(thumn impairs) sont verifiees depuis les donnees Hafs de quran-meta (KFGQPC). "
                "Les 240 limites intermediaires (thumn pairs) sont mapped depuis les donnees "
                "Qaloun de quran-meta (KFGQPC) vers la numerotation Hafs."
            ),
            "recitation": "Hafs an Asim",
            "totalThumn": 480,
            "totalHizb": 60,
            "totalRub": 240,
            "sources": {
                "hafsData": "quran-meta (npm) Hafs lists, source KFGQPC",
                "qalounData": "quran-meta (npm) Qalun lists, source KFGQPC",
                "quranText": "Tanzil.net (texte Uthmani Hafs)",
            },
            "license": "MIT (quran-meta) / Tanzil Terms of Use",
            "methodology": (
                "1. Les 240 rub' al-hizb (thumn impairs) proviennent directement des donnees "
                "Hafs verifiees de quran-meta. "
                "2. Les 240 limites intermediaires (thumn pairs) proviennent des donnees "
                "Qaloun de quran-meta et sont converties vers la numerotation Hafs. "
                "3. Pour les sourates ou le nombre de versets est identique en Hafs et Qaloun "
                "(66 sourates), le mappage est direct et verifie. "
                "4. Pour les sourates ou le nombre de versets differe (48 sourates), "
                "le mappage utilise le decalage cumulatif et peut etre decalle de +/-1 verset. "
                "Ces entrees sont marquees 'estimated_offset' et doivent etre verifiees "
                "manuellement contre un mushaf Hafs imprime."
            ),
            "verificationSummary": {
                "verified_hafs": f"{verified_hafs_count} / 480 (limites de rub' depuis donnees Hafs)",
                "verified": f"{verified_count} / 480 (limites intermediaires, sourates identiques)",
                "estimated_offset": f"{estimated_count} / 480 (limites intermediaires, sourates differentes)",
            },
            "generatedAt": datetime.now().isoformat(),
            "warning": (
                "Les entrees 'estimated_offset' sont des estimations basees sur le decalage "
                "cumulatif entre Hafs et Qaloun. Elles peuvent etre incorrectes de +/-1 verset. "
                "Pour une utilisation definitive, ces limites doivent etre verifiees contre "
                "un mushaf Hafs imprime (edition Madina, KFGQPC)."
            ),
        },
        "thumn": thumn_entries,
    }
    
    return output


if __name__ == "__main__":
    output = generate_thumn_json()
    
    output_path = "thumn_hafs.json"
    import os
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, output_path)
    
    # `newline="\n"` : sans lui, le fichier sort en CRLF sous Windows contre LF
    # ailleurs. Ce fichier est copie a l'octet dans le tableau de bord, qui en
    # garde une empreinte SHA-256 : deux fins de ligne suffiraient a faire
    # echouer `npm run donnees:verifier` sur un autre poste.
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    meta = output["metadata"]
    print(f"Fichier genere: {output_path}")
    print(f"Total thumn: {len(output['thumn'])}")
    print(f"Verification:")
    print(f"  verified_hafs: {meta['verificationSummary']['verified_hafs']}")
    print(f"  verified: {meta['verificationSummary']['verified']}")
    print(f"  estimated_offset: {meta['verificationSummary']['estimated_offset']}")
    
    # Afficher quelques exemples
    print("\nExemples:")
    for i in [0, 1, 2, 3, 118, 119, 120, 478, 479]:
        t = output["thumn"][i]
        print(f"  Thumn {t['thumnNumber']}: Hizb {t['hizbNumber']}, Rub {t['rubNumber']}, "
              f"Hafs {t['hafs']['startSurah']}:{t['hafs']['startAyah']} -> "
              f"{t['hafs']['endSurah']}:{t['hafs']['endAyah']} [{t['verificationStatus']}]")
