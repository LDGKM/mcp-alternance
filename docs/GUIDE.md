# Guide d'installation pas à pas

Ce guide part de zéro et va jusqu'au premier appel depuis Claude. Comptez environ une heure, dont une partie d'attente (validation des comptes).

**Règle d'or** : vos clés et identifiants ne passent jamais par une conversation, un fichier versionné ou une capture d'écran. Vous les saisissez vous-même, uniquement dans le terminal (commande `wrangler secret put`, qui masque la saisie) ou sur la page d'autorisation du serveur.

Les intitulés de boutons cités ici sont ceux relevés en novembre 2026 ; ils peuvent légèrement changer.

---

## Étape 0 — Prérequis

1. **Node.js 22.13 ou plus récent** : vérifiez avec `node -v`. Sinon, installez la version LTS depuis nodejs.org.
2. **Git** (facultatif mais conseillé pour publier le projet sur GitHub).
3. Décompressez le projet, ouvrez un terminal dans le dossier `mcp-alternance`, puis :

   ```bash
   npm install
   npm run verifier   # types + 57 tests + construction : tout doit être vert
   ```

4. *(Portfolio)* Publiez le dépôt sur GitHub :

   ```bash
   git init && git add . && git commit -m "Serveur MCP de recherche d'alternance"
   git branch -M main
   git remote add origin https://github.com/LDGKM/mcp-alternance.git   # créez d'abord le dépôt vide sur GitHub
   git push -u origin main
   ```

   Le fichier `.gitignore` exclut déjà `.dev.vars` (secrets locaux). Le workflow `.github/workflows/ci.yml` lancera les tests à chaque push.

---

## Étape 1 — France Travail (API Offres d'emploi) : sur demande

⚠️ **Depuis octobre 2026, l'API Offres d'emploi n'est plus proposée en libre-service** dans le catalogue de francetravail.io. D'après sa fiche sur data.gouv.fr (mise à jour le 20/10/2026), France Travail a retiré l'API le temps d'analyser ses conditions de réutilisation, après des usages automatisés massifs par des outils d'IA. L'accès se demande via le formulaire **francetravail.io/contact**.

Le serveur fonctionne sans elle : la recherche d'alternance passe par La bonne alternance, qui reprend déjà les offres d'alternance de France Travail parmi ses sources partenaires. Ce qui manque sans France Travail : la recherche de **stages**.

Si vous voulez demander l'accès :

1. Créez un compte sur **francetravail.io** et une **application** (champ URL : `https://github.com/LDGKM/mcp-alternance`).
2. Notez l'**identifiant client** et la **clé secrète**, affichée une seule fois à la création. Si vous ne l'avez pas notée : bouton **Renouveler** sur la fiche de l'application.
3. Envoyez une demande via **francetravail.io/contact** : usage personnel d'un étudiant, quelques recherches par jour, sans stockage ni rediffusion des offres, dans le respect de la licence.
4. Une fois l'accès accordé, l'API Offres d'emploi apparaît dans votre application, et vous saisissez les secrets `FT_CLIENT_ID` et `FT_CLIENT_SECRET` (étape 3.4).

Les identifiants expirent un an après leur création : renouvelez-les avant cette date.

---

## Étape 2 — La bonne alternance

1. Allez sur **api.apprentissage.beta.gouv.fr**, puis **« Connexion / Inscription »** (page `compte/profil`).
2. Créez votre compte et validez-le.
3. Générez une **clé d'API** et choisissez le type **production**.
   ⚠️ Une clé « sandbox » interroge l'environnement de recette, avec des offres de test qui ne sont pas les vraies.
4. Copiez la clé dans votre gestionnaire de mots de passe.

L'usage est gratuit et réservé aux usages non commerciaux, ce qui est le cas ici.

---

## Étape 3 — Cloudflare Workers

### 3.1 Compte et connexion

1. Créez un compte gratuit sur **dash.cloudflare.com** (offre Free).
2. Dans le tableau de bord, ouvrez **Workers & Pages** : Cloudflare vous fait choisir votre sous-domaine `*.workers.dev` (par exemple `deogratias`). Votre serveur sera à `https://mcp-alternance.<sous-domaine>.workers.dev`.
3. Dans le terminal, à la racine du projet :

   ```bash
   npx wrangler login
   ```

   Un navigateur s'ouvre : autorisez Wrangler.

### 3.2 Stockages gratuits

```bash
npx wrangler kv namespace create OAUTH_KV
npx wrangler d1 create mcp-alternance
```

Chaque commande affiche un identifiant (`id` pour le KV, `database_id` pour D1). Ouvrez `wrangler.jsonc` et remplacez :

- `A_REMPLACER_PAR_L_ID_DU_KV` par l'id du KV ;
- `A_REMPLACER_PAR_L_ID_DE_LA_BASE` par l'id de la base D1.

Ces identifiants ne sont pas secrets : ils peuvent être versionnés.

Créez ensuite la table des candidatures :

```bash
npm run db:migrer
```

### 3.3 Clé d'accès personnelle

C'est la clé qui protège votre serveur. Générez-la sur votre machine (32 caractères minimum ; la commande en produit 48) :

```bash
node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"
```

Copiez le résultat dans votre gestionnaire de mots de passe.

### 3.4 Secrets

Saisissez chaque secret ; Wrangler demande la valeur et masque la saisie :

```bash
npx wrangler secret put CLE_ACCES          # la clé générée en 3.3
npx wrangler secret put LBA_API_KEY        # clé La bonne alternance (étape 2)
npx wrangler secret put FT_CLIENT_ID       # identifiant client France Travail (étape 1), seulement si l'accès est accordé
npx wrangler secret put FT_CLIENT_SECRET   # clé secrète France Travail (étape 1), idem
```

Sans les secrets France Travail, le serveur interroge seulement La bonne alternance et le signale dans ses réponses.

Au premier `secret put`, Wrangler peut proposer de créer le Worker : répondez oui.

### 3.5 Déploiement

```bash
npm run deploy
```

La commande affiche l'URL du Worker. Ouvrez-la dans un navigateur : le message « Serveur MCP personnel de recherche d'alternance. Accès réservé. » confirme que tout est en ligne.

L'URL du connecteur est cette adresse suivie de **`/mcp`**, par exemple :
`https://mcp-alternance.<sous-domaine>.workers.dev/mcp`

---

## Étape 4 — Connecter Claude

1. Dans Claude (web ou application de bureau), ouvrez **Personnaliser → Connecteurs**.
2. Cliquez sur **+**, puis **Ajouter un connecteur personnalisé**.
3. Nom : « Recherche d'alternance ». URL : l'adresse `…/mcp` de l'étape 3.5. Validez avec **Ajouter**.
4. Cliquez sur **Connecter** : une page « Recherche d'alternance — accès privé » s'ouvre.
5. Saisissez votre **clé d'accès** (étape 3.3) et cliquez sur **Autoriser**. Vous revenez dans Claude, connecteur actif.
6. Dans une conversation, vérifiez que le connecteur est activé (menu des outils de la zone de saisie).

Notes :

- Avec l'offre gratuite de Claude, un seul connecteur personnalisé est autorisé.
- Une fois ajouté sur le web, le connecteur est aussi disponible dans les applications mobiles.
- Claude renouvelle seul son jeton d'accès ; vous ne ressaisirez la clé que si vous supprimez et rajoutez le connecteur.

### Premier essai

> Cherche des alternances de data analyst autour de Mulhouse, rayon 40 km, début à partir de 2027-09.

Puis : « évalue la deuxième offre », « ajoute-la à mes candidatures, envoyée aujourd'hui », « qu'est-ce que je dois relancer ? ».

---

## Étape 5 — Vérifier mon profil

Ouvrez `src/domaine/profil.ts` : les compétences, langues et projets viennent de votre CV de novembre 2026.

**Un réglage est à confirmer** : votre CV dit « alternance pour 2027-2028 » sans mois de début. La fenêtre a été réglée sur **juillet–décembre 2027**. Ajustez `debutAuPlusTot` et `debutAuPlusTard` dès que le calendrier de votre M2 est connu, puis redéployez (`npm run deploy`).

Quand vous ajoutez une compétence au CV, ajoutez-la aussi dans ce fichier.

---

## Étape 6 (facultative) — Sous-domaine `mcp.deogratias-loutou.fr`

Un domaine personnalisé sur un Worker exige que le domaine soit une **zone active chez Cloudflare**, c'est-à-dire que ses serveurs DNS soient ceux de Cloudflare. Votre domaine et votre hébergement restent chez OVH : seule la gestion DNS change de place. L'offre gratuite de Cloudflare suffit.

⚠️ Cette opération touche à votre site et à vos e-mails. Suivez l'ordre exactement.

### 6.1 Ajouter le domaine à Cloudflare

1. Tableau de bord Cloudflare → **Ajouter un domaine** → `deogratias-loutou.fr` → offre **Free**.
2. Cloudflare importe les enregistrements DNS actuels. **Comparez-les** avec la zone DNS affichée chez OVH (Espace client OVH → Web Cloud → Noms de domaine → `deogratias-loutou.fr` → **Zone DNS**). Doivent être présents : les enregistrements `A`/`AAAA` du site, les `MX` et `TXT` (SPF) de la messagerie s'il y en a. Ajoutez à la main tout ce qui manque.
3. Pour que votre site OVH se comporte exactement comme avant, passez les enregistrements existants en **« DNS uniquement »** (nuage gris).
4. Cloudflare affiche **deux serveurs DNS** (du type `xxx.ns.cloudflare.com`). Notez-les.

### 6.2 Changer les serveurs DNS chez OVH

1. Espace client OVH → Web Cloud → Noms de domaine → `deogratias-loutou.fr` → onglet **Serveurs DNS** → **Modifier les serveurs DNS**.
2. Remplacez les serveurs OVH par les deux serveurs Cloudflare, puis validez.
3. Attendez que Cloudflare indique la zone **Active** (de quelques minutes à 24 h ; Cloudflare envoie un e-mail).
4. Vérifiez que `https://deogratias-loutou.fr` fonctionne toujours.

### 6.3 Brancher le sous-domaine sur le Worker

1. Cloudflare → **Workers & Pages** → `mcp-alternance` → **Settings** → **Domains & Routes** → **Add** → **Custom Domain**.
2. Saisissez `mcp.deogratias-loutou.fr` et validez. Cloudflare crée l'enregistrement DNS et le certificat HTTPS.
3. Après quelques minutes, `https://mcp.deogratias-loutou.fr` doit afficher le message « Accès réservé ».

### 6.4 Mettre à jour Claude

Un connecteur ne se modifie pas : **supprimez-le** puis **rajoutez-le** avec l'URL `https://mcp.deogratias-loutou.fr/mcp`, et ressaisissez la clé d'accès.

---

## Entretien

| Besoin | Commande ou action |
| --- | --- |
| Mettre en ligne une modification | `npm run deploy` |
| Changer une clé d'API | `npx wrangler secret put <NOM>` (effet immédiat, sans redéployer) |
| Changer la clé d'accès | `npx wrangler secret put CLE_ACCES`. Les connexions déjà autorisées restent valides ; pour les couper, supprimez le connecteur dans Claude et videz l'espace KV `OAUTH_KV` (tableau de bord → Storage & Databases → KV). |
| Voir les journaux en direct | `npx wrangler tail` |
| Sauvegarder les candidatures | `npx wrangler d1 export mcp-alternance --remote --output candidatures.sql` |

Les quotas gratuits de Cloudflare (Workers, KV, D1) dépassent largement un usage personnel.

## Dépannage

| Symptôme | Cause probable |
| --- | --- |
| Page « Serveur non configuré » | Le secret `CLE_ACCES` est absent ou fait moins de 32 caractères (étape 3.3). |
| « Clé incorrecte » | Faute de frappe : copiez-collez la clé depuis votre gestionnaire de mots de passe. |
| Claude : « Couldn't reach the MCP server » | URL sans `/mcp` à la fin, ou Worker non déployé. Ouvrez l'URL de base dans un navigateur. |
| « La clé d'API La bonne alternance n'est pas configurée » | Secret `LBA_API_KEY` manquant (étape 3.4). |
| Offres La bonne alternance étranges ou peu nombreuses | Clé de type « sandbox » au lieu de « production » (étape 2.3). |
| « accès refusé » côté France Travail | Identifiants erronés, ou accès à l'API Offres d'emploi pas encore accordé (étape 1). |
| « Ville introuvable » | Essayez le code postal (`68100`) ou le nom exact de la commune. |
| Erreur après `npm run deploy` sur les liaisons | Les identifiants KV ou D1 de `wrangler.jsonc` n'ont pas été remplacés (étape 3.2). |
