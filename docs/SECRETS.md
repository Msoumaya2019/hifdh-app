# Configuration, compilation et installation

Ce document dit **ce qui est déjà en place**, **ce qui exige votre intervention**, et **où
cliquer**.

Il remplace une version antérieure qui décrivait une chaîne de compilation par EAS. Cette chaîne a
été abandonnée : voir « Pourquoi pas EAS » en fin de document.

## 1. Ce qui est déjà en place

| Élément | État |
| --- | --- |
| Dépôt | `https://github.com/Msoumaya2019/hifdh-app` (public) |
| Variables de dépôt | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Schéma Supabase | `supabase/schema.sql`, écrit et appliqué |
| Flux de compilation | `ci.yml`, `android-apk.yml`, `ios-unsigned.yml` |

Aucune action n'est requise de votre part pour cette partie.

## 2. Les deux valeurs publiques du projet Supabase

L'adresse du projet et la clé `anon` sont **publiques par nature** : elles sont embarquées dans
l'application, et quiconque a le paquet peut les lire. Ce ne sont donc **pas** des secrets GitHub,
mais des **variables**.

La distinction n'est pas cosmétique : un secret est masqué dans les journaux, une variable est
lisible. Traiter comme secrète une valeur qui ne l'est pas donne une fausse impression de
protection — et fait perdre du temps à chercher pourquoi une valeur « secrète » apparaît en clair
dans un binaire.

C'est la clé `service_role` qui ne doit **jamais** approcher l'application : elle contourne toutes
les politiques RLS.

Pour les lire ou les corriger :

```bash
gh variable list

gh variable set EXPO_PUBLIC_SUPABASE_URL      --body "https://VOTRE-PROJET.supabase.co"
gh variable set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "eyJhbGciOi..."
```

Les deux flux de compilation **échouent** si l'une des deux manque, et ils vérifient ensuite que la
valeur se retrouve bien dans le binaire produit. C'est délibéré : une compilation verte qui livre un
paquet sans configuration est plus dangereuse qu'une compilation rouge.

## 3. Compiler

Rien à installer en local : les deux compilations tournent sur les exécuteurs de GitHub.

```bash
# à la demande
gh workflow run android-apk.yml      # APK Android
gh workflow run ios-unsigned.yml     # IPA non signé

# ou en publiant une version
git tag -a v1.0.3 -m "Hifdh 1.0.3"
git push origin v1.0.3               # déclenche LES DEUX flux
```

Le nom du fichier produit vient de `app.json` (`hifdh-1.0.3.apk`) ; le nom de la version publiée
vient de l'étiquette. **Gardez les deux alignés** — sans quoi le fichier et sa version portent deux
numéros différents, et l'on ne sait plus quel binaire correspond à quelle étiquette.

Suivre une compilation :

```bash
gh run list --limit 5
gh run watch <identifiant>
```

Les fichiers sont attachés à la version, dans l'onglet **Releases** du dépôt.

## 4. Installer l'APK (Android)

1. Téléchargez `hifdh-<version>.apk` depuis l'onglet **Releases**.
2. Ouvrez le fichier sur le téléphone. Android demande d'autoriser l'installation depuis cette
   source : acceptez.
3. Si une version précédente est installée avec une **autre** signature, désinstallez-la d'abord.

**Cet APK est signé avec la clé de débogage**, pas avec une clé de publication. Cela suffit pour
essayer l'application ; cela ne suffit pas pour la publier. Le jour où elle irait sur le Play Store,
il faudrait une clé de release — et Android **interdit** d'en changer ensuite pour une même
application : cette décision se prend avant la première publication, pas après.

## 5. Installer l'IPA (iPhone)

**Un IPA non signé ne s'installe pas tel quel.** iOS vérifie la signature et refuse tout ce qui n'en
a pas. Il faut donc le re-signer sur votre machine, avec un identifiant Apple.

- **Sideloadly** (Windows et macOS), ou **AltStore** / **SideStore**.
- Sous Windows, installez **iTunes depuis le site d'Apple**, et non depuis le Microsoft Store : la
  version du Store ne fournit pas les pilotes nécessaires à la communication avec l'iPhone.
- Sur iOS 16 et suivants, activez le **mode développeur** :
  `Réglages > Confidentialité et sécurité > Mode développeur`, puis redémarrez le téléphone.
- L'outil demande votre mot de passe Apple pour obtenir un certificat de développement. Il est saisi
  dans l'outil, sur votre machine : **ne le communiquez à personne** et n'en faites pas un secret
  GitHub.

Limites d'Apple avec un **compte gratuit** — elles viennent d'Apple, pas de l'outil :

| Contrainte | Compte gratuit | Compte développeur (99 $/an) |
| --- | --- | --- |
| Validité de la signature | **7 jours** | 1 an |
| Applications installées à la fois | **3** | davantage |

Passé le délai, l'application cesse de s'ouvrir : il faut re-signer. AltStore et SideStore savent le
faire automatiquement, y compris sans fil.

## 6. Supabase

Le schéma est dans `supabase/schema.sql` : tables, déclencheurs, politiques RLS. Il ne contient
**aucun secret**, et reste donc versionné.

Pour l'appliquer : `Supabase > SQL Editor > New query`, collez le fichier, exécutez.

Pour éprouver le schéma **sans Docker ni projet distant** :

```bash
npm run verifier:supabase
```

Ce banc le joue sous PGlite — Postgres compilé en WebAssembly — et vérifie les politiques RLS, les
clés primaires composites et les transactions.

## 7. Sécurité

- Aucun secret dans le dépôt : ni certificat, ni mot de passe, ni clé `service_role`, ni jeton.
- `.env` est dans `.gitignore`.
- La clé `anon` est publique **et** protégée par les politiques RLS — les deux, pas l'un ou l'autre.
- Les certificats Apple ne vont **jamais** dans le dépôt.

### Un secret à retirer : `EXPO_TOKEN`

Un secret `EXPO_TOKEN` subsiste dans les secrets du dépôt, hérité de la chaîne EAS abandonnée.
**Aucun flux ne le lit.** Un identifiant inutilisé est une exposition sans contrepartie.

Pour le supprimer : `Settings > Secrets and variables > Actions > EXPO_TOKEN > Remove`. À conserver
uniquement si vous prévoyez de revenir à EAS.

## Pourquoi pas EAS

`eas build` exige un projet EAS enregistré (`extra.eas.projectId`) et un compte Expo. La chaîne
native, elle, ne demande rien : `expo prebuild` génère le projet, `xcodebuild` ou Gradle le
compilent, et `gh release` publie le fichier. C'est exactement ce que font les deux flux.

Le fichier `eas.json` a été retiré pour cette raison : il décrivait une chaîne qui ne peut pas
fonctionner ici, et sa présence laissait croire le contraire.
