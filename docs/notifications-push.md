# Les notifications push : ce qui est fait, ce qui manque, et dans quel ordre

Ce document répond à une demande précise : **ne pas prétendre que les
notifications iOS fonctionneront parce que l'IPA se compile.** Il dit donc
séparément ce qui est éprouvé, ce qui ne l'est pas, et ce qui reste à faire.

## 0. En une phrase

**Le code est écrit et éprouvé ; aucun envoi réel n'a encore eu lieu.** Quatre
choses manquent, et deux d'entre elles ne peuvent pas être faites sans vous :
un projet Expo relié, un secret partagé, un projet Firebase pour Android, et un
**compte Apple Developer payant** pour iOS. Le compte payant n'a pas de
contournement.

## 1. Ce qui est en place

| Élément | Fichier | État |
| --- | --- | --- |
| Table des appareils | `supabase/notifications.sql` | écrite |
| Préférences (six interrupteurs) | `supabase/notifications.sql` | écrites |
| Boîte d'envoi, et ses déclencheurs | `supabase/notifications.sql` | écrite |
| Fonction serveur d'envoi | `supabase/functions/envoyer-notifications/index.ts` | écrite, **jamais exécutée** |
| Ordonnanceur (toutes les 5 minutes) | `.github/workflows/notifications.yml` | écrit, **jamais déclenché** |
| Écran « Notifications » | `app/notifications.tsx` | écrit |
| Ouverture de la bonne conversation | `app/_layout.tsx`, `src/lib/notifications.ts` | écrit |

**Le point de conception qui compte.** La notification n'est pas déclenchée par
le téléphone de l'expéditeur : elle est écrite par un **déclencheur de la base**
au moment où le message est inséré, dans une file d'attente. C'est la seule
façon qu'un message écrit puis immédiatement suivi de la fermeture de
l'application soit quand même notifié. L'ordonnanceur se contente ensuite de
vider la file.

## 2. Ce qui a été éprouvé, et ce qui ne l'a pas été

| Élément | Comment | Ce que cela garantit |
| --- | --- | --- |
| Déclencheurs, préférences, appareils | 25 épreuves dans un vrai Postgres (PGlite), avec de vraies politiques RLS — **187 au total** dans le banc | couper une catégorie n'écrit **aucune** ligne ; masquer laisse la ligne sans le texte ; la file n'est lisible par personne — et son refus vient bien de la RLS, pas d'un droit manquant |
| Décisions (préférences, cible d'un appui) | 15 tests unitaires | un identifiant absent mène aux amis, jamais à un fil vide |
| Invariants de la fonction serveur, de l'ordonnanceur et de la déconnexion | 19 tests de forme, lisant la source | la porte au secret existe **et** est franchie avant toute lecture de la base ; le jeton d'appareil est retiré **avant** la fermeture de session |
| Tout ce qui précède | 37 mutations, **37 détectées** | chaque contrôle tombe quand on retire ce qu'il garde |

**Ce qui n'est éprouvé par rien, et il faut le dire :**

- **l'appel réel à Expo** (`exp.host`) — aucun envoi n'a jamais eu lieu ;
- **l'arrivée d'une notification sur un téléphone** ;
- **la réception côté APNs (iOS) et FCM (Android)** ;
- **le comportement de la fonction serveur à l'exécution** : c'est du Deno, et
  il n'y a pas de Deno dans `ci.yml`. Ce que les tests garantissent est que les
  invariants sont **présents dans la source**, pas que le code fait ce qu'il
  annonce.

Cette dernière ligne est la plus importante du document. Le jour où la fonction
tournera pour de vrai, ce sont les appels réels qu'il faudra mesurer — les
contrôles actuels ne les remplacent pas.

## 3. Pourquoi « l'IPA se compile » ne dit rien

L'IPA produit par `ios-unsigned.yml` est **non signé**, et il doit l'être : le
dépôt n'a pas de compte Apple Developer. Or une notification push iOS exige :

- une **autorisation de signature** (`aps-environment`) dans les droits de
  l'application ;
- un **profil de provisionnement** qui porte cette autorisation ;
- une **clé APNs** déposée du côté du service qui envoie.

Un binaire non signé n'a aucun des trois. Il s'installe et l'application
fonctionne, mais `getExpoPushTokenAsync` échouera — et l'écran des réglages
affichera le message technique d'Expo, ce qui est exactement le comportement
voulu : mieux vaut un message précis qu'un interrupteur qui semble marcher.

De la documentation officielle d'Expo, telle quelle :

> The 3 primary iOS credentials, all of which are associated with your Apple
> Developer account, are: Distribution Certificate, Provisioning Profiles,
> Push Notification Keys.

> A paid Apple Developer Account is required to generate credentials.

## 4. Les quatre choses qui manquent

### 4.1 Relier un projet Expo — **gratuit, et indispensable aux deux plateformes**

Sans identifiant de projet, `getExpoPushTokenAsync` refuse de travailler, et
l'application ne peut pas dire au serveur *où* faire sonner. C'est
indépendant du compte Apple et du projet Firebase.

1. Créer un compte sur <https://expo.dev> (gratuit).
2. Dans le dossier `hifdh-app/` :

   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```

3. Vérifier que `app.json` contient bien, dans `extra` :

   ```json
   "extra": { "eas": { "projectId": "…un-uuid…" } }
   ```

   C'est exactement l'endroit que lit `src/lib/push.ts` — la même expression que
   la documentation d'Expo. Si l'outil ne l'écrit pas, la valeur se recopie
   depuis le tableau de bord Expo.

**Rien d'autre ne dépend de cette étape**, et elle ne change aucune
compilation : on continue de produire l'APK et l'IPA par GitHub Actions.

**« Mais le projet n'utilise pas EAS » — et c'est toujours vrai.** La
distinction compte, et la documentation d'Expo la fait elle-même :

> The following steps in this guide use EAS Build. This is the easiest way to set
> up notifications since your EAS project will also contain the notification
> credentials. However, you can use the `expo-notifications` library without EAS
> Build by building your project locally.

> If you are not using EAS Build, run `eas credentials` manually.

Autrement dit, `eas-cli` sert ici de **coffre à identifiants**, pas de chaîne de
compilation. `eas build` n'est jamais lancé, `eas.json` reste absent — voir la
section « Pourquoi pas EAS » de `docs/SECRETS.md` — et l'APK comme l'IPA
continuent de sortir de GitHub Actions. Ce qui est enregistré chez Expo, ce sont
les clés qui permettent à **son** service de relayer vers FCM et APNs, et ce
service refuse d'envoyer sans elles :

> You will also get an error if there are no push credentials for your project
> or if you send push notifications for different projects in the same request.

Deux limites du service, pour mémoire : **100 messages par requête** — c'est
exactement la valeur de `MAX_PAR_REQUETE` dans la fonction, et la raison pour
laquelle elle découpe la file en tranches — et **600 notifications par seconde et
par projet**.

### 4.2 Le secret partagé, et le déploiement de la fonction

La fonction serveur refuse de s'exécuter si `NOTIFICATIONS_SECRET` fait moins
de 16 caractères. C'est délibéré : une fonction d'envoi ouverte laisserait
n'importe qui faire sonner les téléphones de tous les utilisateurs.

```bash
# 1. Fabriquer un secret solide (32 octets en hexadécimal)
python -c "import secrets; print(secrets.token_hex(32))"

# 2. Le poser dans Supabase, pour la fonction
npx supabase secrets set NOTIFICATIONS_SECRET="LA-VALEUR"

# 3. Le poser dans GitHub, pour l'ordonnanceur
gh secret set NOTIFICATIONS_SECRET --body "LA-VALEUR"

# 4. Déployer la fonction
npx supabase functions deploy envoyer-notifications
```

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement par
Supabase à l'intérieur d'une fonction : il n'y a rien à poser. Et la clé de
service ne doit **jamais** entrer dans le dépôt — un contrôle automatique
(`tests/notifications_envoi.test.mjs`) parcourt tout `src/` et tout `app/` pour
vérifier qu'aucune clé n'y a été recopiée.

Tant que le secret n'est pas posé, l'ordonnanceur sort en succès avec une
annotation « Notifications non configurées », plutôt qu'en rouge toutes les
cinq minutes.

### 4.3 Android : un projet Firebase

Sans lui, Android ne reçoit rien. C'est le chemin le plus court des deux.

1. Créer un projet sur <https://console.firebase.google.com>.
2. **Paramètres du projet → Comptes de service → Générer une nouvelle clé
   privée.** Un fichier JSON est téléchargé. **Il contient une clé privée : il
   ne doit jamais être versionné** — `.gitignore` l'exclut déjà sous ses deux
   noms usuels.
3. Le déposer dans EAS :

   ```bash
   npx eas-cli@latest credentials
   # Android > production > Google Service Account
   # > Manage your Google Service Account Key for Push Notifications (FCM V1)
   # > Set up … > Upload a new service account key
   ```

4. **Paramètres du projet → Vos applications → Ajouter une application
   Android**, avec le nom de paquet `com.hifdh.app`, puis télécharger
   `google-services.json` et le placer à la racine de `hifdh-app/`. Ce
   fichier-là **peut** être versionné : la documentation d'Expo dit qu'il
   « contient des identifiants publics ».
5. Déclarer le fichier dans `app.json`, dans le bloc `android` :

   ```json
   "googleServicesFile": "./google-services.json"
   ```

**Le piège à connaître**, cité de la documentation d'Expo : si la clé d'API de
`google-services.json` est restreinte, la restriction doit autoriser la *FCM
Registration API* et la *Firebase Installations API*, et l'empreinte SHA-1 doit
être celle du **certificat de signature de publication**, pas celle de la clé de
dépôt. Un désaccord fait répondre à Firebase :

> `403 PERMISSION_DENIED: Requests from this Android client application are
> blocked`

…et l'application ne reçoit **jamais** de jeton. Le symptôme est un écran de
réglages qui affiche une erreur technique sans dire pourquoi.

### 4.4 iOS : un compte Apple Developer payant

C'est la seule étape qui a un coût, et il n'y a pas de chemin de contournement
pour des notifications **distantes**.

1. Adhérer à l'Apple Developer Program (99 $/an). Un identifiant Apple ordinaire
   ne suffit pas.
2. Dans le portail Apple, **Identifiers → App IDs** : créer ou retrouver
   l'identifiant d'application `com.hifdh.app` — c'est celui de `app.json`
   (`ios.bundleIdentifier`) — et y **activer la capacité « Push
   Notifications »**. Un identifiant créé sans cette capacité produit un profil
   de provisionnement qui ne porte pas `aps-environment`, et le téléphone ne
   reçoit rien, sans que la compilation ait rien signalé.
3. Laisser EAS créer la clé APNs, ou la créer soi-même dans le portail Apple :

   ```bash
   npx eas-cli@latest credentials
   # iOS > production > Push Notifications
   ```

4. **Enregistrer le téléphone de test** auprès du compte : un profil de
   provisionnement de développement ne contient que les appareils déclarés.
5. Compiler un binaire **signé** — pas l'IPA non signé du dépôt. Cela demande
   soit `eas build -p ios`, soit un certificat et un profil déposés dans les
   secrets GitHub.

Points utiles, cités de la documentation :

> You can have a maximum of 2 APN keys associated with your Apple Developer
> account, and a single key can be used with any number of apps.

> Push notification keys do not expire.

> APN keys are used at run time.

Le dernier point explique pourquoi la clé APNs ne suffit pas à elle seule : le
**profil de provisionnement**, lui, est vérifié à la compilation, et c'est lui
qui porte l'autorisation `aps-environment`.

## 5. L'ordre conseillé

Chaque étape est indépendante et vérifiable seule. **Une à la fois** — et dites
où vous en êtes, je vérifie avec vous avant de passer à la suivante.

| # | Étape | Coût | Débloque |
| --- | --- | --- | --- |
| 1 | Relier un projet Expo (§4.1) | gratuit | les deux plateformes |
| 2 | Poser le secret et déployer la fonction (§4.2) | gratuit | les deux plateformes |
| 3 | Projet Firebase (§4.3) | gratuit | Android |
| 4 | Compte Apple Developer (§4.4) | 99 $/an | iOS |

Après l'étape 2, le chemin complet est déjà éprouvable **sur Android** dès
l'étape 3 — c'est pourquoi je conseille de commencer par là.

## 6. Éprouver pour de vrai

1. Installer l'application sur **deux téléphones**, avec **deux comptes
   différents**.
2. Sur chacun : Profil → Notifications → activer « Nouveaux messages ». C'est ce
   geste, et lui seul, qui demande l'autorisation du système.
3. Depuis l'un, écrire à l'autre **puis fermer immédiatement l'application**.
   C'est le cas que la boîte d'envoi existe pour couvrir.
4. Vérifier que la notification arrive, et qu'un appui ouvre **la bonne
   conversation**.
5. Vérifier la file côté base :

   ```sql
   select genre, traite_le, erreur from public.envois_notification
   order by id desc limit 10;
   ```

   Une ligne avec `traite_le` rempli et `erreur` vide est un envoi accepté par
   Expo. Une ligne avec `aucun appareil enregistre` dit que le destinataire n'a
   pas de jeton — donc que l'étape 4.1 ou 4.3 manque de son côté.

## 7. Ce qui n'est pas dans cette version

- **Les rappels d'apprentissage et de révision.** Les deux interrupteurs
  existent, leur valeur est enregistrée, et elle sera respectée le jour où
  l'application saura poser un rappel — mais **aucun rappel n'est envoyé
  aujourd'hui**. L'écran porte la mention « Bientôt » sur ces deux lignes, et le
  résumé ne les compte pas, précisément pour ne pas promettre ce qui n'arrive
  pas.
- **Le pastille sur l'icône de l'application.** Le compteur de non-lus vit dans
  l'application (l'icône d'en-tête de l'accueil), pas sur l'icône du téléphone.
- **Les groupes, les appels, l'envoi de fichiers.** Le cahier des charges les
  exclut de cette version, et la table des messages n'a d'ailleurs **aucune
  colonne** pour un fichier.
