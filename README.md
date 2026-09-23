# Hifdh - Application de mémorisation du Coran

Application mobile iOS/Android permettant aux adultes de mémoriser progressivement le Coran (récitation Hafs an Asim) grâce à un programme personnalisé et un suivi de progression.

## Technologies

- **React Native** + **Expo** (SDK 52) + **TypeScript**
- **expo-router** pour la navigation par onglets
- **expo-sqlite** pour le stockage local hors ligne
- **Supabase** pour l'authentification et la synchronisation
- **GitHub Actions** pour la compilation, par la chaîne d'outils native (sans EAS)

## Structure du projet

```
hifdh-app/
├── app/                    # Écrans (Expo Router)
│   ├── (tabs)/             # 5 onglets: Accueil, Coran, Programme, Progrès, Profil
│   ├── onboarding.tsx      # Questionnaire initial (4 questions)
│   ├── lecteur.tsx         # Lecteur du Coran
│   └── _layout.tsx         # Layout racine
├── src/
│   ├── theme/              # Design system (couleurs, typographie)
│   ├── types/              # Types TypeScript
│   ├── data/               # Accès aux données coraniques
│   ├── lib/                # Logique métier (algorithme, DB, SRS, Supabase)
│   │   └── sync/           # Sauvegarde en ligne : instantané, validation, dépôts
│   └── components/         # Composants réutilisables
├── data/quran/             # Données coraniques (texte, divisions, thumn)
│   ├── quran_text_uthmani.json       # Texte + juz, page, hizbQuarter
│   ├── moushaf_layout.json           # Où chaque mot tombe : 604 pages × 15 lignes
│   ├── largeurs_pages.json           # La largeur naturelle des 15 lignes, page par page
│   ├── polices_pages.json            # Taille et empreinte des 604 polices de page
│   ├── verifier_pages.py             # Contrôle des 604 pages du moushaf
│   └── rapport_divisions_estimees.py # Engendre docs/divisions-estimees.md
├── assets/                 # Polices (Amiri, images) — et les 604 polices de page
│   └── polices-pages/                # p001.ttf … p604.ttf (95 Mo, QCF v1, KFGQPC)
├── pages-moushaf/          # Les 604 images du moushaf (112,7 Mo), copiées à l'octet
│   └── EMPREINTES.txt                # Le SHA-256 de chaque page (`sha256sum -c`)
├── supabase/               # Schéma SQL Supabase
│   ├── schema.sql                    # Tables, politiques RLS (rejouable)
│   └── administration.sql            # Rôles, vérification des toumoun (rejouable)
├── scripts/                # Vérifications exécutables (schéma, flux, données)
├── tests/                  # Tests (node:test)
├── .github/workflows/      # CI/CD GitHub Actions
└── docs/                   # Documentation
    ├── SECRETS.md              # Configuration, compilation, installation
    ├── mise-en-page-moushaf.md # La mise en page confrontée aux images (mesuré)
    └── divisions-estimees.md   # Les limites non vérifiées (engendré)
```

## Données coraniques

- **Texte** : Tanzil Quran Text (Uthmani, Version 1.1, Hafs 'an Asim, 6 236 versets),
  téléchargé depuis la source officielle. Licence CC-BY 3.0, notice reproduite
  dans `data/quran/TANZIL_LICENSE.txt`.
- **Divisions** : 30 juz', 60 hizb, 240 rub' al-hizb (quran-meta, source KFGQPC)
- **480 toumoun** : dérivés, chaque entrée portant son propre statut de vérification
  - 240 limites de rub' (`verified_hafs`) — lues directement dans les données Hafs
  - 89 limites intermédiaires (`verified`) — sourates au nombre de versets identique
  - 151 limites intermédiaires (`estimated_offset`) — **à vérifier manuellement**.
    La liste précise, sourate par sourate, avec la référence Qaloun dont chaque
    borne est issue, est dans **`docs/divisions-estimees.md`**. Ce document est
    **engendré** par `data/quran/rapport_divisions_estimees.py` ; le contrôle
    `npm run verifier:rapport` refuse qu'il dérive des données sans que personne
    ne le voie.
  - 0 limite relue (`relue`) — lue sur un moushaf Hafs imprimé, puis appliquée par
    `data/quran/appliquer_corrections.py`. Ce décompte monte à mesure que le
    travail de relecture avance, et `estimated_offset` baisse d'autant ; le
    tableau de bord `admin/` sert à le mener.
- **Pagination du moushaf** : les 604 pages du moushaf de Médine. Le champ `page`
  est porté par chaque verset ; il était présent depuis l'import mais n'était lu
  par aucun code. `npm run verifier:pages` en établit la cohérence (6 236 versets
  répartis sur 604 pages, dans l'ordre, sans saut ni recul) et le recoupement avec
  `divisions.json` — les 30 transitions de juz' et les 240 de rub' tombent
  exactement au même endroit, deux sources indépendantes. `npm run recouper:pages`
  compare en outre les 6 236 versets à l'API de quran.com : **aucun écart**.
  Les **bornes** de page sont donc exactes ; la coupure des **lignes** ne suit
  pas l'écran, elle suit la page imprimée (voir ci-dessous).
- **Mise en page du moushaf** : où chaque mot tombe, sur les 604 pages. Les
  numéros de ligne viennent de l'API quran.com (`mushaf=1`) ; le texte, lui,
  reste celui de Tanzil, et `moushaf_layout.json` ne porte donc que des
  **intervalles de jetons**, jamais une lettre. La coupure publiée est recoupée
  par les avances de la police de page : une ligne plus large que sa page de
  plus de 5 % n'a pas pu être imprimée, et deux pages ont ainsi été corrigées
  (177 et 443), chacune vérifiée sur le moushaf imprimé. `npm run verifier:layout`
  contrôle l'ensemble hors ligne.
- **Polices de page** : les 604 polices QCF v1 du complexe KFGQPC, une par page.
  Elles ne dessinent pas des lettres mais **des mots** — chaque mot imprimé y est
  un seul point de code, dont l'avance est celle du calligraphe. C'est ce qui
  permet à l'écran de page d'être la page imprimée : mêmes coupures, mêmes
  places, même justification, sans recomposition. Elles sont recopiées octet
  pour octet, jamais modifiées ; `data/quran/polices_pages.json` en porte la
  taille et l'empreinte SHA-256, et `npm run verifier:polices` confronte chaque
  code employé au dessin de sa police.
- **Ornements de la page** : le médaillon de verset, le bandeau de sourate, le
  cartouche du numéro et les filets d'encadrement, dessinés en SVG dans
  `src/components/ornementsMoushaf.tsx`, aux teintes relevées sur la page
  imprimée. Le médaillon est le cas intéressant : son ovale est un **support**, et
  le caractère du numéro est celui que la police de page dessine déjà — on pose
  donc la forme autour du glyphe, on ne redessine pas le glyphe. Le treillis de
  fleurons qui court dans l'encadrement n'est **pas** reproduit : inventé, il ne
  serait plus celui du moushaf. Le mode page n'a pas de réglage de taille et ne
  défile pas, comme une page ne se réagence pas ; le masquage y porte sur le
  **verset** (il devient transparent et garde sa place), non sur le mot, parce que
  cacher mot à mot demande de défaire le collage des codes.
- **Licences et provenance** : voir `NOTICE.md`

Le texte coranique n'est jamais modifié ni généré : il est recopié de la source
officielle par `data/quran/import_tanzil_text.py`, qui n'altère que le champ
`text`. Les champs `juz`, `page` et `hizbQuarter` portent la structure des
divisions et ne dépendent pas du texte.

## Configuration (Supabase)

La sauvegarde en ligne est **facultative** : l'application fonctionne entièrement
hors ligne et n'exige un compte que pour sauvegarder. Pour l'activer, deux
valeurs doivent être connues **au moment de la compilation** :

| Nom | Valeur |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<référence>.supabase.co` — **sans** `/rest/v1/` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | la clé publique du projet (onglet API Keys) |

Ces deux valeurs sont **publiques par nature** : la clé `anon` est embarquée dans
l'application distribuée. Ce sont donc des **variables** de dépôt — `Settings >
Secrets and variables > Actions > Variables` — et non des secrets : les mettre en
secrets n'apporterait aucune protection et empêcherait de les relire. La clé
`service_role`, elle, ne doit **jamais** approcher l'application.

En développement, un fichier `.env` non versionné suffit. Les deux flux de
compilation **échouent** si les variables sont absentes : un binaire sans
configuration compile parfaitement et ne le dit pas.

Le schéma de la base se trouve dans `supabase/schema.sql` : tables, politiques
RLS et fonction d'enregistrement. Il est rejouable tel quel. Aucun secret n'y
figure — les politiques s'appuient sur `auth.uid()`.

## Installation

```bash
npm install
npx expo start
```

## Vérifications

```bash
npm run typecheck          # TypeScript, sans émission
npm test                   # node:test, sans transpileur
npm run verifier:donnees   # cohérence des divisions coraniques
npm run verifier:pages     # cohérence de la pagination du moushaf (604 pages)
npm run recouper:pages     # recoupement des 6 236 pages avec l'API quran.com
npm run verifier:layout    # mise en page du moushaf : 604 pages × 15 lignes
npm run verifier:polices   # chaque code est-il dessiné par la police de sa page ?
npm run verifier:polices-ts # la table des 604 chemins suit son manifeste
npm run verifier:rapport   # le rapport des bornes estimées suit les données
npm run verifier:flux      # analyse statique des flux GitHub Actions
npm run verifier:supabase  # schéma Supabase sous Postgres réel (PGlite)
npm run falsifier:pages    # éprouve les contrôles de pagination
npm run falsifier:layout   # éprouve les contrôles de mise en page
npm run falsifier:polices  # éprouve les contrôles de codes de police
npm run falsifier:moushaf  # éprouve les contrôles de la page du moushaf et de ses ornements
npm run falsifier:renforcement  # éprouve les contrôles de « À renforcer »
```

`falsifier:*` mute réellement le fichier pour vérifier que le contrôle **détecte**
la faute qu'il prétend couvrir, puis restaure les octets d'origine (empreinte
SHA-256 à l'appui). Un contrôle vert que rien ne ferait rougir ne prouve rien.

`recouper:pages` interroge le réseau : il n'est donc **pas** dans la CI, où un
site tiers indisponible ferait passer une pagination correcte pour fautive.

## Compilation

Les binaires sont produits par **GitHub Actions**, sans compte ni service
externe : `expo prebuild` génère les projets natifs, puis la chaîne d'outils
native compile. Aucun certificat n'est nécessaire.

```bash
# Déclencher les deux compilations
gh workflow run android-apk.yml
gh workflow run ios-unsigned.yml

# … ou publier une version : les deux flux se déclenchent sur une étiquette
git tag -a v1.1.0 -m "Description" && git push origin v1.1.0
```

Le nom du fichier produit vient de `app.json` (`hifdh-1.1.0.apk`), celui de la version publiée de
l'étiquette : **gardez les deux alignés**, sinon le binaire et sa version portent deux numéros
différents.

Les binaires sont attachés à la *release* GitHub, dont le téléchargement est
anonyme — contrairement à un artefact de flux, qui exige une connexion.

- **APK** : installable directement sur un téléphone Android. Signé avec la clé
  de **débogage**, ce qui suffit pour essayer mais pas pour un store — Android
  interdit de changer de clé ensuite pour une même application.
- **IPA non signé** : iOS refuse tout ce qui n'est pas signé. Cet IPA est un
  produit intermédiaire, à re-signer avec Sideloadly ou AltStore. La marche à
  suivre s'affiche à la fin de la compilation.

**Pourquoi pas EAS Build** : EAS refuse une compilation iOS pour appareil sans
identifiants Apple, et ne produit jamais d'IPA non signé. `xcodebuild` avec la
signature désactivée, lui, produit l'archive.

Chaque compilation **vérifie le contenu du paquet** : l'adresse et la clé
publique attendues doivent s'y trouver littéralement. Sans ce contrôle, un
binaire compilé sans configuration passerait pour complet.

## Design

- Vert profond (#0B4D3B), blanc cassé (#FAF8F4), beige, doré discret (#C4A35A)
- Police arabe: Amiri Quran / Amiri (Google Fonts)
- Cartes aux coins arrondis, transitions légères, interface épurée
