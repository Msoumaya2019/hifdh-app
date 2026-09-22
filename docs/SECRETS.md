# Configuration, compilation, installation et mise en service

Ce document dit **ce qui est déjà en place**, **ce qui exige votre intervention**, et **où
cliquer**.

## 0. Ce qui vous revient, dans l'ordre

Cinq gestes, et aucun ne peut être fait à votre place : ils demandent votre compte Supabase, votre
identifiant Apple, vos réglages GitHub ou votre hébergeur.

| # | À faire | Pourquoi vous seul | Section |
| --- | --- | --- | --- |
| 1 | Exécuter `supabase/administration.sql` | demande l'accès à votre projet Supabase | §3 |
| 2 | Nommer le premier administrateur | la politique interdit à un apprenant de s'élever tout seul | §3 |
| 3 | Déployer le tableau de bord | demande votre compte d'hébergement | §7 |
| 4 | Installer l'application (Android ou iPhone) | se fait sur votre téléphone | §5 et §6 |
| 5 | Retirer le secret `EXPO_TOKEN` | réglages du dépôt | §8 |

**L'ordre compte pour 1 → 2 → 3** : le tableau de bord lit `resume_apprenants` et
`division_verifications`, que le point 1 crée, et il refuse d'entrer pour un compte qui n'est pas
administrateur — ce que le point 2 règle. Le point 4 est indépendant.

## 1. Ce qui est déjà en place

| Élément | État |
| --- | --- |
| Dépôt | `https://github.com/Msoumaya2019/hifdh-app` (public) |
| Variables de dépôt | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| Schéma Supabase | `supabase/schema.sql`, écrit et appliqué |
| Administration Supabase | `supabase/administration.sql`, écrit — **pas encore appliqué** (§3) |
| Flux de vérification | `ci.yml` : types, tests, données, bornes, falsificateurs, et la construction du tableau de bord |
| Flux de compilation | `android-apk.yml`, `ios-unsigned.yml` |
| Version publiée | `v1.2.0` — `hifdh-1.2.0.apk` et `hifdh-1.2.0-non-signe.ipa` |

## 2. Les deux valeurs publiques du projet Supabase

L'adresse du projet et la clé `anon` sont **publiques par nature** : elles sont embarquées dans
l'application, et quiconque a le paquet peut les lire. Ce ne sont donc **pas** des secrets GitHub,
mais des **variables**.

La distinction n'est pas cosmétique : un secret est masqué dans les journaux, une variable est
lisible. Traiter comme secrète une valeur qui ne l'est pas donne une fausse impression de
protection — et fait perdre du temps à chercher pourquoi une valeur « secrète » apparaît en clair
dans un binaire.

C'est la clé `service_role` qui ne doit **jamais** approcher l'application ni le tableau de bord :
elle contourne toutes les politiques RLS.

Pour les lire ou les corriger :

```bash
gh variable list

gh variable set EXPO_PUBLIC_SUPABASE_URL      --body "https://VOTRE-PROJET.supabase.co"
gh variable set EXPO_PUBLIC_SUPABASE_ANON_KEY --body "eyJhbGciOi..."
```

Les deux flux de compilation **échouent** si l'une des deux manque, et ils vérifient ensuite que la
valeur se retrouve bien dans le binaire produit. C'est délibéré : une compilation verte qui livre un
paquet sans configuration est plus dangereuse qu'une compilation rouge.

## 3. Supabase : le schéma, puis l'administration

Deux fichiers, dans cet ordre. Les deux ne contiennent **aucun secret** et sont donc versionnés.

| Fichier | Ce qu'il pose |
| --- | --- |
| `supabase/schema.sql` | les tables, les déclencheurs, les politiques RLS de base |
| `supabase/administration.sql` | le rôle, les politiques d'administration, la table des vérifications de bornes, la synthèse par apprenant |

### 3.1 Appliquer `administration.sql`

1. Ouvrez votre projet sur [supabase.com](https://supabase.com), puis **SQL Editor** dans la barre
   de gauche, puis **New query**.
2. Ouvrez `supabase/administration.sql` dans le dépôt, copiez **tout** le fichier, collez-le dans
   l'éditeur.
3. Cliquez **Run**. Vous devez lire `Success. No rows returned`.

Le fichier est **rejouable** : chaque instruction est gardée par `if not exists`, par un
`drop ... if exists` préalable, ou par un bloc qui interroge le catalogue. Une exécution
interrompue se reprend en le relançant — sans risque de doublon.

Ce qu'il apporte, et qui n'existait pas avant :

- une colonne `display_name` et une colonne `role` (`apprenant` par défaut) sur `profiles` ;
- la fonction `est_administrateur()`, et l'**interdiction de se promouvoir soi-même** ;
- la lecture des données de tous les apprenants, pour un administrateur seulement — il observe, il
  ne corrige la progression de personne ;
- la table `division_verifications`, où un administrateur enregistre une borne de toumoun corrigée ;
- la fonction `resume_apprenants(date)`, qui alimente l'écran de suivi.

### 3.2 Nommer le premier administrateur

C'est le seul geste qui ne peut pas passer par l'interface : la politique du point 3 interdit à un
apprenant de s'élever, et il n'existe encore aucun administrateur pour autoriser le changement.
C'est voulu — le premier administrateur se nomme par le propriétaire de la base.

**a. Créez le compte.** Le plus simple est de créer un compte dans l'application mobile
(inscription par e-mail et mot de passe). Sinon, dans Supabase : **Authentication > Users > Add
user**, en cochant la confirmation automatique pour éviter l'e-mail de vérification.

**b. Donnez-lui le rôle.** Dans **SQL Editor > New query**, collez ceci en remplaçant l'adresse par
la vôtre :

```sql
UPDATE public.profiles
   SET role = 'administrateur'
 WHERE id = (SELECT id FROM auth.users WHERE email = 'adresse@exemple.fr');
```

**c. Vérifiez.** Cette requête doit rendre exactement une ligne `administrateur` :

```sql
SELECT p.role, u.email
  FROM public.profiles p JOIN auth.users u ON u.id = p.id
 ORDER BY p.role, u.email;
```

Sans le rôle, le tableau de bord s'ouvre et affiche que le compte est `apprenant` — c'est le
comportement prévu, pas une panne.

### 3.3 Éprouver le schéma sans y toucher

```bash
npm run verifier:supabase
```

Ce banc joue `schema.sql` **puis** `administration.sql` sous PGlite — Postgres compilé en
WebAssembly, sans Docker ni projet distant — et vérifie les politiques RLS des deux côtés, les clés
primaires composites, la reprise d'une migration, et le fait que l'administration se rejoue sans
erreur.

## 4. Compiler

Rien à installer en local : les deux compilations tournent sur les exécuteurs de GitHub.

```bash
# à la demande
gh workflow run android-apk.yml      # APK Android
gh workflow run ios-unsigned.yml     # IPA non signé

# ou en publiant une version : l'étiquette déclenche LES DEUX flux
git tag -a vX.Y.Z -m "Hifdh X.Y.Z"
git push origin vX.Y.Z
```

Suivre une compilation :

```bash
gh run list --limit 5
gh run watch <identifiant>
```

Les fichiers sont attachés à la version, dans l'onglet **Releases** du dépôt.

### La version vit dans quatre endroits, et ils bougent ensemble

| Endroit | Rôle |
| --- | --- |
| `app.json` (`expo.version`) | **c'est lui qui nomme l'artefact** (`hifdh-X.Y.Z.apk`) |
| `package.json` | tenu en accord avec le précédent par `tests/versions.test.mjs` |
| `app.json` (`expo.android.versionCode`) | ce qu'Android compare, pas le nom affiché |
| `app.json` (`expo.ios.buildNumber`) | l'équivalent côté iOS |

N'en monter qu'un ne se voit pas à l'œil : le test d'accord fait échouer `npm test`, donc **les deux
compilations, avant même de compiler**. Sans `versionCode`, deux binaires de versions différentes
portent le même code et Android ne les distingue pas.

Gardez aussi l'étiquette et `app.json` alignés : sans quoi le fichier et sa version portent deux
numéros différents, et l'on ne sait plus quel binaire correspond à quelle étiquette.

## 5. Installer l'APK (Android)

1. Téléchargez `hifdh-<version>.apk` depuis l'onglet **Releases**.
2. Ouvrez le fichier sur le téléphone. Android demande d'autoriser l'installation depuis cette
   source : acceptez.
3. Si une version précédente est installée avec une **autre** signature, désinstallez-la d'abord —
   et **exportez une sauvegarde avant**, la désinstallation efface les données locales.

**Cet APK est signé avec la clé de débogage**, pas avec une clé de publication. Cela suffit pour
essayer l'application ; cela ne suffit pas pour la publier. Le jour où elle irait sur le Play Store,
il faudrait une clé de release — et Android **interdit** d'en changer ensuite pour une même
application : cette décision se prend avant la première publication, pas après.

## 6. Installer l'IPA (iPhone)

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

## 7. Déployer le tableau de bord

Le tableau de bord vit dans `admin/`. Il ne détient **aucun secret** : son autorisation vient des
politiques RLS de la base et du rôle administrateur, pas d'une clé. Une fois en ligne, sa page de
connexion est publique — c'est normal, et ce qui protège les données est la base.

### 7.1 Le préparer

```bash
cd admin
npm ci
npm run build      # la construction de production
npm start          # pour l'essayer en local, sur http://localhost:3000
```

Pour l'essayer en local, copiez `admin/.env.example` en `admin/.env.local` et remplissez les deux
valeurs de §2.

### 7.2 Le mettre en ligne (Vercel)

Vercel exécute Next.js sans configuration supplémentaire. Les libellés ci-dessous sont ceux de son
interface.

1. Sur [vercel.com](https://vercel.com), **Add New… > Project**.
2. Dans **Import Git Repository**, repérez `Msoumaya2019/hifdh-app` et cliquez **Import**.
3. **Le réglage qui compte** : à côté de **Root Directory**, cliquez **Edit** et choisissez
   **`admin`**. Sans cela, Vercel prend la racine du dépôt — qui est l'application Expo — et la
   construction échoue.
4. Dépliez **Environment Variables** et ajoutez **deux** variables, avec **ces noms exacts** :

   | Key | Value | Type |
   | --- | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | l'adresse du projet | **Config** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé `anon` | **Config** |

   **Le préfixe n'est pas celui des variables du dépôt, et c'est le piège.** Le dépôt porte
   `EXPO_PUBLIC_*` : ce sont les noms que lit l'**application mobile**. Le tableau de bord est une
   application Next.js, et Next.js ne publie au navigateur que ce qui commence par `NEXT_PUBLIC_`.
   Une variable nommée `EXPO_PUBLIC_*` sur Vercel **n'est pas lue** : le tableau de bord se
   déploierait en annonçant « non configuré ». Le flux de vérification fait la traduction à votre
   place pour la compilation ; sur Vercel, il n'y a pas de traduction — c'est le nom de Next.js
   qu'il faut écrire. En cas d'erreur, l'écran déployé nomme lui-même les deux variables attendues.

   **Choisissez `Config` avant d'enregistrer.** Une valeur enregistrée en `Secret` devient
   illisible et **ne peut plus être repassée en `Config`** : Vercel l'annonce dans la fenêtre
   (« Saved secrets are write-only, so this variable can't be changed to Config »). La seule
   correction est alors de supprimer la variable et de la recréer. Ce n'est pas une perte : ces deux
   valeurs sont publiques, elles sont déjà dans l'application livrée.

   Cochez au moins **Production**.
5. Cliquez **Deploy**.

### 7.3 Deux pièges, mesurés

- **Ces variables sont lues à la construction, pas à l'exécution.** Next.js les inscrit dans le
  paquet du navigateur : si elles sont absentes, le tableau de bord se déploie sans configuration et
  affichera « non configuré » — sans qu'aucun journal ne le signale. Le flux de vérification
  construit donc le tableau de bord à chaque poussée et **cherche les deux valeurs dans le paquet
  produit** : c'est le seul contrôle qui dise qu'un déploiement serait configuré.
- **Après avoir modifié une variable, il faut redéployer.** Une modification ne s'applique pas aux
  déploiements déjà faits, seulement aux nouveaux.

### 7.4 Se connecter

Ouvrez l'adresse donnée par Vercel, puis **Connexion** : l'adresse et le mot de passe du compte
nommé administrateur en §3.2. Un compte `apprenant` est refusé, et l'écran dit pourquoi.

## 8. Sécurité

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
