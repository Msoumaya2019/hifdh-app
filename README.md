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
│   └── components/         # Composants réutilisables
├── data/quran/             # Données coraniques (texte, divisions, thumn)
├── assets/                 # Polices (Amiri), images
├── supabase/               # Schéma SQL Supabase
├── .github/workflows/      # CI/CD GitHub Actions
└── docs/                   # Documentation
```

## Données coraniques

- **Texte**: Tanzil / AlQuran Cloud (Uthmani, Hafs an Asim, 6236 versets)
- **Divisions**: 30 juz, 60 hizb, 240 rub' al-hizb (quran-meta, source KFGQPC)
- **480 toumoun**: générés depuis les données Qaloun de quran-meta, mappés vers Hafs
  - 240 limites de rub' (verified_hafs) - directement depuis les données Hafs
  - 89 limites intermédiaires (verified) - sourates au nombre de versets identique
  - 151 limites intermédiaires (estimated_offset) - à vérifier manuellement
- **Licence**: MIT (quran-meta), Tanzil Terms of Use (texte)

## Installation

```bash
npm install
npx expo start
```

## Compilation

```bash
# APK Android
eas build --platform android --profile preview

# IPA iOS
eas build --platform ios --profile preview
```

Voir `docs/SECRETS.md` pour la configuration des secrets et certificats.

## Design

- Vert profond (#0B4D3B), blanc cassé (#FAF8F4), beige, doré discret (#C4A35A)
- Police arabe: Amiri Quran / Amiri (Google Fonts)
- Cartes aux coins arrondis, transitions légères, interface épurée
