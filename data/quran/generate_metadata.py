#!/usr/bin/env python3
"""
Genere les fichiers JSON de metadonnees coraniques depuis les donnees Hafs de quran-meta.
- surahs.json: metadonnees des 114 sourates
- divisions.json: limites de juz (30), hizb (60), rub' (240) en numerotation Hafs
"""

import json
import os

# Hafs SurahList (de quran-meta)
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

HAFS_JUZ_LIST = [
    0, 1, 149, 260, 386, 517, 641, 751, 900, 1042, 1201, 1328, 1479, 1649, 1803, 2030,
    2215, 2484, 2674, 2876, 3215, 3386, 3564, 3733, 4090, 4265, 4511, 4706, 5105, 5242, 5673, 6237
]

# Noms des sourates en arabe (du SurahList) et en francais
SOURAH_NOMS_FR = [
    "", "Al-Fatiha (L'Ouverture)", "Al-Baqarah (La Vache)", "Al-Imran (La Famille d'Imran)",
    "An-Nisa (Les Femmes)", "Al-Maidah (La Table Servie)", "Al-Anam (Les Bestiaux)",
    "Al-Araf (Les Murailles)", "Al-Anfal (Le Butin)", "At-Tawbah (Le Repentir)",
    "Yunus (Jonas)", "Hud (Hud)", "Yusuf (Joseph)", "Ar-Rad (Le Tonnerre)",
    "Ibrahim (Abraham)", "Al-Hijr (Al-Hijr)", "An-Nahl (Les Abeilles)",
    "Al-Isra (Le Voyage Nocturne)", "Al-Kahf (La Caverne)", "Maryam (Marie)",
    "Ta-Ha (Ta-Ha)", "Al-Anbiya (Les Prophetes)", "Al-Hajj (Le Pelerinage)",
    "Al-Muminun (Les Croyants)", "An-Nur (La Lumiere)", "Al-Furqan (Le Discernement)",
    "Ash-Shuara (Les Poetes)", "An-Naml (Les Fourmis)", "Al-Qasas (Le Recit)",
    "Al-Ankabut (L'Araignee)", "Ar-Rum (Les Romains)", "Luqman (Luqman)",
    "As-Sajdah (La Prosternation)", "Al-Ahzab (Les Coalises)", "Saba (Saba)",
    "Fatir (Le Createur)", "Ya-Sin (Ya-Sin)", "As-Saffat (Les Ranges)",
    "Sad (Sad)", "Az-Zumar (Les Groupes)", "Ghafir (Le Pardonneur)",
    "Fussilat (Les Detailles)", "Ash-Shura (La Consultation)", "Az-Zukhruf (L'Ornement)",
    "Ad-Dukhan (La Fumee)", "Al-Jathiyah (L'Agenouillee)", "Al-Ahqaf (Al-Ahqaf)",
    "Muhammad (Muhammad)", "Al-Fath (La Victoire Eclatante)", "Al-Hujurat (Les Appartements)",
    "Qaf (Qaf)", "Adh-Dhariyat (Qui Eparpillent)", "At-Tur (Le Mont)",
    "An-Najm (L'Etoile)", "Al-Qamar (La Lune)", "Ar-Rahman (Le Tout Misericordieux)",
    "Al-Waqiah (L'Inevitable)", "Al-Hadid (Le Fer)", "Al-Mujadilah (La Discussion)",
    "Al-Hashr (L'Exode)", "Al-Mumtahanah (L'Eprouvee)", "As-Saff (Les Rangs)",
    "Al-Jumuah (Le Vendredi)", "Al-Munafiqun (Les Hypocrites)", "At-Taghabun (La Grande Perte)",
    "At-Talaq (Le Divorce)", "At-Tahrim (L'Interdiction)", "Al-Mulk (La Royaute)",
    "Al-Qalam (La Plume)", "Al-Haqqah (L'Ineluctable)", "Al-Maarij (Les Voies d'Ascension)",
    "Nuh (Noe)", "Al-Jinn (Les Djinns)", "Al-Muzzammil (L'Enveloppe)",
    "Al-Muddaththir (Le Couvert d'un Manteau)", "Al-Qiyamah (La Resurrection)",
    "Al-Insan (L'Homme)", "Al-Mursalat (Les Envoyees)", "An-Naba (La Nouvelle)",
    "An-Naziat (Les Anges qui Arrachent)", "Abasa (Il s'est Fronce les Sourcils)",
    "At-Takwir (L'Obscurcissement)", "Al-Infitar (La Rupture)", "Al-Mutaffifin (Les Fraudeurs)",
    "Al-Inshiqaq (La Dechirure)", "Al-Buruj (Les Constellations)", "At-Tariq (L'Astre Nocturne)",
    "Al-Ala (Le Très-Haut)", "Al-Ghashiyah (L'Enveloppante)", "Al-Fajr (L'Aube)",
    "Al-Balad (La Cite)", "Ash-Shams (Le Soleil)", "Al-Layl (La Nuit)",
    "Ad-Duha (Le Jour Montant)", "Ash-Sharh (L'Ecartement)", "At-Tin (Le Figuier)",
    "Al-Alaq (L'Adherence)", "Al-Qadr (La Destinee)", "Al-Bayyinah (La Preuve Evidente)",
    "Az-Zalzalah (La Secousse)", "Al-Adiyat (Les Coursiers)", "Al-Qariah (Le Fracas)",
    "At-Takathur (La Course a La Richesse)", "Al-Asr (Le Temps)", "Al-Humazah (Les Calomniateurs)",
    "Al-Fil (L'Elephant)", "Quraysh (Quraysh)", "Al-Maun (Le Petit Service)",
    "Al-Kawthar (L'Abondance)", "Al-Kafirun (Les Mecreants)", "An-Nasr (Le Secours)",
    "Al-Masad (Les Fibres)", "Al-Ikhlas (Le Culte Pur)", "Al-Falaq (L'Aube Naissante)",
    "An-Nas (Les Hommes)",
]

def ayah_id_to_surah_ayah(ayah_id, surah_list):
    for i in range(1, len(surah_list) - 1):
        start = surah_list[i][0]
        count = surah_list[i][1]
        if start <= ayah_id < start + count:
            return i, ayah_id - start + 1
    return None, None

def generate_surahs_json():
    surahs = []
    for i in range(1, 115):
        entry = HAFS_SURAH_LIST[i]
        surahs.append({
            "number": i,
            "name": entry[4],
            "nameFr": SOURAH_NOMS_FR[i],
            "ayahCount": entry[1],
            "startAyahId": entry[0],
            "surahOrder": entry[2],
            "rukuCount": entry[3],
            "isMeccan": entry[5],
        })
    return surahs

def generate_divisions_json():
    # Juz (30)
    juz = []
    for j in range(1, 31):
        start_id = HAFS_JUZ_LIST[j]
        end_id = HAFS_JUZ_LIST[j + 1] - 1
        start_s, start_a = ayah_id_to_surah_ayah(start_id, HAFS_SURAH_LIST)
        end_s, end_a = ayah_id_to_surah_ayah(end_id, HAFS_SURAH_LIST)
        juz.append({
            "juzNumber": j,
            "start": {"surah": start_s, "ayah": start_a, "ayahId": start_id},
            "end": {"surah": end_s, "ayah": end_a, "ayahId": end_id},
        })
    
    # Hizb (60) - chaque hizb = 2 rub'
    hizb = []
    for h in range(1, 61):
        rub_start = (h - 1) * 4 + 1  # premier rub' du hizb
        rub_end = h * 4  # dernier rub' du hizb
        start_id = HAFS_HIZB_QUARTER_LIST[rub_start]
        end_id = HAFS_HIZB_QUARTER_LIST[rub_end + 1] - 1
        start_s, start_a = ayah_id_to_surah_ayah(start_id, HAFS_SURAH_LIST)
        end_s, end_a = ayah_id_to_surah_ayah(end_id, HAFS_SURAH_LIST)
        hizb.append({
            "hizbNumber": h,
            "start": {"surah": start_s, "ayah": start_a, "ayahId": start_id},
            "end": {"surah": end_s, "ayah": end_a, "ayahId": end_id},
        })
    
    # Rub' al-hizb (240)
    rub = []
    for r in range(1, 241):
        start_id = HAFS_HIZB_QUARTER_LIST[r]
        end_id = HAFS_HIZB_QUARTER_LIST[r + 1] - 1
        start_s, start_a = ayah_id_to_surah_ayah(start_id, HAFS_SURAH_LIST)
        end_s, end_a = ayah_id_to_surah_ayah(end_id, HAFS_SURAH_LIST)
        hizb_num = (r - 1) // 4 + 1
        juz_num = (r - 1) // 8 + 1
        rub.append({
            "rubNumber": r,
            "hizbNumber": hizb_num,
            "juzNumber": juz_num,
            "start": {"surah": start_s, "ayah": start_a, "ayahId": start_id},
            "end": {"surah": end_s, "ayah": end_a, "ayahId": end_id},
        })
    
    return {"juz": juz, "hizb": hizb, "rub": rub}

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    surahs = generate_surahs_json()
    # `newline="\n"` n'est pas cosmetique. Sans lui, Python traduit les fins de
    # ligne a l'ecriture : le fichier sort en CRLF sous Windows contre LF
    # ailleurs, et le meme script, sur la meme donnee, produit deux fichiers de
    # tailles differentes selon la machine. Le tableau de bord en garde une copie
    # a l'octet et une empreinte SHA-256 : une regeneration sous Windows suivie
    # d'un commit ferait echouer `npm run donnees:verifier` sur un autre poste,
    # sans que personne n'ait rien change.
    with open(os.path.join(script_dir, "surahs.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(surahs, f, ensure_ascii=False, indent=2)
    print(f"surahs.json: {len(surahs)} sourates")
    
    divisions = generate_divisions_json()
    with open(os.path.join(script_dir, "divisions.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(divisions, f, ensure_ascii=False, indent=2)
    print(f"divisions.json: {len(divisions['juz'])} juz, {len(divisions['hizb'])} hizb, {len(divisions['rub'])} rub'")
    
    # Verifications
    print(f"\nVerifications:")
    print(f"  Juz 1: {divisions['juz'][0]['start']['surah']}:{divisions['juz'][0]['start']['ayah']} -> {divisions['juz'][0]['end']['surah']}:{divisions['juz'][0]['end']['ayah']}")
    print(f"  Juz 30: {divisions['juz'][29]['start']['surah']}:{divisions['juz'][29]['start']['ayah']} -> {divisions['juz'][29]['end']['surah']}:{divisions['juz'][29]['end']['ayah']}")
    print(f"  Hizb 1: {divisions['hizb'][0]['start']['surah']}:{divisions['hizb'][0]['start']['ayah']} -> {divisions['hizb'][0]['end']['surah']}:{divisions['hizb'][0]['end']['ayah']}")
    print(f"  Rub 1: {divisions['rub'][0]['start']['surah']}:{divisions['rub'][0]['start']['ayah']} -> {divisions['rub'][0]['end']['surah']}:{divisions['rub'][0]['end']['ayah']}")
