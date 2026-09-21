# Configuration des secrets et certifications

Ce document explique ce qui nécessite votre intervention pour finaliser l'application.

## 1. GitHub - Dépôt et Actions

### Créer le dépôt
1. Créez un dépôt **public** sur GitHub (ex: `hifdh-app`)
2. Initialisez git et poussez le code:
```bash
cd hifdh-app
git init
git add .
git commit -m "Initial commit - Hifdh app"
git remote add origin https://github.com/VOTRE-UTILISATEUR/hifdh-app.git
git push -u origin main
```

### Secrets GitHub Actions à configurer
Allez dans: `Settings > Secrets and variables > Actions > New repository secret`

| Secret | Description | Obligatoire |
|--------|-------------|-------------|
| `EXPO_TOKEN` | Token Expo (https://expo.dev/accounts/[user]/settings/access-tokens) | Oui |
| `SUPABASE_URL` | URL du projet Supabase | Oui (sync) |
| `SUPABASE_ANON_KEY` | Clé anon Supabase | Oui (sync) |

## 2. Expo EAS

### Lier le projet EAS
```bash
eas login
eas init --id [PROJECT_ID]
```
Le PROJECT_ID sera automatiquement ajouté à `app.json` > `extra.eas.projectId`.

### Compiler
```bash
# APK Android
eas build --platform android --profile preview

# IPA iOS (non signée, à signer côté Apple)
eas build --platform ios --profile preview
```

## 3. Supabase

### Créer le projet
1. Allez sur https://supabase.com et créez un nouveau projet
2. Récupérez l'URL et la clé anon dans `Project Settings > API`
3. Ajoutez-les dans les secrets GitHub et dans un fichier `.env` local:
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
```

### Schéma SQL à exécuter
Le schéma SQL pour Supabase sera fourni dans `supabase/schema.sql`.
Les politiques RLS (Row Level Security) doivent garantir que chaque utilisateur
ne voit que ses propres données.

## 4. Apple (iOS)

Pour signer l'IPA ou la publier sur l'App Store:

### Option A: Signature automatique via EAS
Si vous avez un compte Apple Developer ($99/an):
1. `eas credentials` → suivez les instructions
2. EAS gère les certificats et profils automatiquement

### Option B: IPA non signée (installation manuelle)
1. L'IPA est construite sans signature
2. Signez-la avec votre certificat Apple Developer
3. Installez via Xcode, Sideloadly ou AltStore

### Fichiers à fournir si signature manuelle
- Certificat de distribution (.p12)
- Profil de provisionnement (.mobileprovision)
- Mot de passe du .p12

Ces fichiers vont dans les secrets GitHub:
- `EXPO_APPLE_ID` (votre Apple ID)
- `EXPO_APPLE_PASSWORD` (mot de passe d'app)
- `EXPO_APPLE_TEAM_ID` (Team ID)

## 5. Sécurité

- Aucune clé secrète n'est dans le code source
- Le fichier `.env` est dans `.gitignore`
- Les clés Supabase anon sont sûres à exposer côté client (RLS protège les données)
- Les certificats Apple ne sont jamais dans le dépôt
