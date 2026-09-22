# Hifdh - Application de mémorisation du Coran

Application mobile iOS/Android permettant aux adultes de mémoriser progressivement le Coran (récitation Hafs an Asim) grâce à un programme personnalisé et un suivi de progression.

## Technologies

- **React Native** + **Expo** (SDK 52) + **TypeScript**
- **expo-router** pour la navigation par onglets
- **expo-sqlite** pour le stockage local hors ligne
- **Supabase** pour l'authentification et la synchronisation
- **EAS Build** + **GitHub Actions** pour la compilation

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
├── assets/                 # Polices (Amiri), images
├── supabase/               # Schéma SQL Supabase
├── scripts/                # Vérifications exécutables (schéma, flux, données)
├── tests/                  # Tests (node:test)
├── .github/workflows/      # CI/CD GitHub Actions
└── docs/                   # Documentation
```

## Données coraniques

- **Texte** : Tanzil Quran Text (Uthmani, Version 1.1, Hafs 'an Asim, 6 236 versets),
  téléchargé depuis la source officielle. Licence CC-BY 3.0, notice reproduite
  dans `data/quran/TANZIL_LICENSE.txt`.
- **Divisions** : 30 juz', 60 hizb, 240 rub' al-hizb (quran-meta, source KFGQPC)
- **480 toumoun** : dérivés, chaque entrée portant son propre statut de vérification
  - 240 limites de rub' (`verified_hafs`) — lues directement dans les données Hafs
  - 89 limites intermédiaires (`verified`) — sourates au nombre de versets identique
  - 151 limites intermédiaires (`estimated_offset`) — **à vérifier manuellement**
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
npm run verifier:flux      # analyse statique des flux GitHub Actions
npm run verifier:supabase  # schéma Supabase sous Postgres réel (PGlite)
```

## Compilation

Les binaires sont produits par **GitHub Actions**, sans compte ni service
externe : `expo prebuild` génère les projets natifs, puis la chaîne d'outils
native compile. Aucun certificat n'est nécessaire.

```bash
# Déclencher les deux compilations
gh workflow run android-apk.yml
gh workflow run ios-unsigned.yml

# … ou publier une version : les deux flux se déclenchent sur une étiquette
git tag -a v1.0.1 -m "Description" && git push origin v1.0.1
```

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
