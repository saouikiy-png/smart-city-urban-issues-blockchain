# Smart City & Blockchain — Gestion décentralisée des signalements urbains

Application de démonstration pour signaler, suivre et gérer des problèmes urbains sur un registre Ethereum local. Le dépôt comprend un smart contract Solidity (AccessControl, OpenZeppelin), ses tests Hardhat complets, un frontend React/Vite/wagmi, l'import Excel/CSV et des fichiers de démonstration. La cible est exclusivement le réseau local Hardhat (chain ID `31337`).

---

## Architecture

```
smart-city-urban-issues/
├── contracts/
│   └── UrbanIssueRegistry.sol   # Contrat principal (AccessControl, 5 statuts, 4 priorités)
├── test/
│   └── UrbanIssueRegistry.test.ts  # 9 tests Hardhat/Chai
├── scripts/
│   ├── deploy.ts                # Déploiement → écrit frontend/src/contracts/UrbanIssueRegistry.json
│   ├── seed.ts                  # Données de démo (6 signalements à différents stades)
│   └── generate-sample-xlsx.ts # Génère les fichiers Excel de démonstration
├── sample-data/
│   ├── urban_issues.xlsx        # 15 lignes valides (Reported + Assigned)
│   ├── urban_issues.csv         # Même contenu en CSV
│   └── urban_issues_invalide.xlsx  # 8 lignes avec erreurs variées
├── frontend/
│   └── src/
│       ├── App.tsx              # Interface complète Smart City
│       ├── wagmi.ts             # Configuration réseau Hardhat local
│       ├── main.tsx             # Point d'entrée React
│       └── contracts/
│           └── UrbanIssueRegistry.json  # Généré par deploy.ts (adresse + ABI)
├── screenshots/                 # Captures à prendre après démo
└── README.md / DEMO.md
```

## Cycle des statuts

```
Reported → Assigned → InProgress → Resolved → Closed
```

- **Reported** : signalement créé par n'importe quel citoyen (sans wallet ou avec wallet).
- **Assigned** : équipe municipale affectée (MUNICIPAL_ROLE requis).
- **InProgress** : travaux commencés (MUNICIPAL_ROLE requis).
- **Resolved** : réparation terminée (MUNICIPAL_ROLE requis).
- **Closed** : dossier clôturé (MUNICIPAL_ROLE requis). État final, aucun retour en arrière.

Les transitions sont strictement séquentielles ; les sauts et les retours arrière sont rejetés par le contrat.

---

## Prérequis

- **Node.js 20+** et npm
- **MetaMask** pour les opérations avec wallet
- **Hardhat node** actif sur `http://127.0.0.1:8545`

---

## Installation

```powershell
# Racine du projet
npm install

# Frontend
cd frontend
npm install
cd ..
```

---

## Lancement

Ouvrez **trois terminaux** à la racine du projet.

### 1. Démarrer le nœud Hardhat

```powershell
npx hardhat node
```

### 2. Déployer le contrat

```powershell
npx hardhat run scripts/deploy.ts --network localhost
```

Le script affiche l'adresse du contrat et écrit `frontend/src/contracts/UrbanIssueRegistry.json` (adresse + ABI).

### 3. (Optionnel) Injecter les données de démo

```powershell
npx hardhat run scripts/seed.ts --network localhost
```

Crée 6 signalements de démonstration couvrant tous les statuts (Reported → Closed).

### 4. Lancer le frontend

```powershell
cd frontend
npm run dev
```

Ouvrez l'URL affichée (généralement `http://localhost:5173`).

---

## Configuration MetaMask (après chaque redémarrage du nœud)

> ⚠️ **À faire après chaque redémarrage du nœud** : redéployer le contrat ET effacer les données d'activité MetaMask (Paramètres → Avancé → Effacer les données de l'onglet Activité).

Ajoutez le réseau Hardhat local dans MetaMask :

| Paramètre | Valeur |
|-----------|--------|
| Nom du réseau | Hardhat Local |
| URL RPC | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Symbole de devise | `ETH` |

### Comptes de test

Le nœud Hardhat affiche 20 comptes avec leur clé privée au démarrage.

| Compte | Rôle | Usage |
|--------|------|-------|
| **#0** (premier) | DEFAULT_ADMIN_ROLE + MUNICIPAL_ROLE | Admin et municipalité — importer dans MetaMask |
| **#1 à #19** | Citoyen (aucun rôle spécial) | Peuvent créer des signalements |

> ⚠️ Ces clés sont publiques et destinées au développement local uniquement. Ne les utilisez jamais sur un réseau réel ni ne les versionez dans Git.

---

## Format Excel et règles de validation

### Colonnes exactes (ordre indifférent, tous les noms obligatoires)

| Colonne | Type | Contraintes |
|---------|------|-------------|
| `issueId` | Texte | Unique, max 64 cars, non vide |
| `issueType` | Texte | Max 64 cars, non vide |
| `location` | Texte | Max 200 cars, non vide |
| `description` | Texte | Max 500 cars, non vide |
| `reportDate` | Texte | Format ISO `YYYY-MM-DD` |
| `priority` | Texte | `Low` / `Medium` / `High` / `Critical` |
| `reportedBy` | Texte | Pseudonyme fictif, max 64 cars, non vide |
| `assignedTo` | Texte | Équipe, max 64 cars. Obligatoire si `status=Assigned` |
| `status` | Texte | `Reported` ou `Assigned` uniquement |

### Règles de cohérence

- `status=Assigned` exige `assignedTo` non vide.
- `status=Reported` : `assignedTo` peut être vide.
- Les valeurs `InProgress`, `Resolved`, `Closed` ne sont **pas** acceptées dans les fichiers (import uniquement possible depuis la municipalité).
- Les doublons d'`issueId` sont détectés dans le fichier ET on-chain avant tout envoi.

---

## Tests et gas

```powershell
npx hardhat test
```

**Résultats réels (Hardhat 2.22.17, Solidity 0.8.24) :**

| Test | Résultat |
|------|----------|
| Création avec historique et événement | ✓ |
| Rejets doublons (unitaire + batch) | ✓ |
| Rejets champs vides/trop longs/date invalide | ✓ |
| Assignation et refus non-municipal | ✓ |
| Cycle complet Reported→Closed avec historique | ✓ |
| Batch mixte, erreurs (trop grand, non-municipal) | ✓ |
| Lookups par ref et erreurs id inexistant | ✓ |
| Administration des rôles | ✓ |
| Gas batch 5 / 10 / 15 | ✓ |

**Consommation de gas réelle :**

| Taille du lot | Gas utilisé |
|:---:|---:|
| 5 | 2 725 313 |
| 10 | 5 244 345 |
| 15 | 7 920 462 |

**Build frontend :**

```powershell
cd frontend
npm run build
```

---

## Adresse du contrat local

L'adresse est générée à chaque déploiement et écrite dans `frontend/src/contracts/UrbanIssueRegistry.json`. Sur un nœud Hardhat neuf sans état préalable, le premier déploiement est généralement à `0x5FbDB2315678afecb367f032d93F642f64180aa3` — mais c'est l'adresse affichée par `deploy.ts` qui fait foi.

---

## Limites connues

- **Local uniquement** : les données et le contrat ne survivent pas à un arrêt du nœud Hardhat.
- **Spam de déclarations** : aucun mécanisme anti-spam ; n'importe quel compte peut créer autant de signalements qu'il veut.
- **Coût du texte on-chain** : les descriptions longues (jusqu'à 500 caractères) coûtent du gas. Sur un réseau public, chaque caractère a un coût.
- **Données publiques** : tous les champs stockés (y compris `reportedBy`) sont lisibles par quiconque inspecte la blockchain. Utiliser uniquement des pseudonymes fictifs.

---

## Passage à Sepolia (non réalisé)

Pour déployer sur Sepolia, il faudrait :
1. Ajouter le réseau dans `hardhat.config.ts` avec une URL RPC (Infura/Alchemy).
2. Gérer la clé privée de déploiement via `.env` (jamais versionné).
3. Vérifier le contrat sur Etherscan (`hardhat-verify`).
4. Adapter le frontend (chain ID 11155111, RPC public).

---

## Captures d'écran

Voir [DEMO.md](./DEMO.md) pour le scénario de démonstration et la liste des captures à prendre.

```
screenshots/
├── 01-liste-publique.png         # Page principale — liste des signalements
├── 02-filtres.png                # Filtres statut + priorité appliqués
├── 03-detail-historique.png      # Page détail avec chronologie complète
├── 04-declaration-formulaire.png # Formulaire de déclaration
├── 05-declaration-hash.png       # Hash de transaction après soumission
├── 06-municipality-role-check.png# Message "rôle absent" sur compte citoyen
├── 07-affectation.png            # Affectation d'une équipe
├── 08-avancement-statut.png      # Passage InProgress → Resolved
├── 09-import-invalide.png        # Import Excel avec erreurs ligne par ligne
└── 10-import-valide.png          # Import valide — aperçu et confirmation
```
