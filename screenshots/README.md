# Captures d'écran — Smart City & Blockchain

Ce dossier doit contenir les captures prises **après** le démarrage du nœud, le déploiement et la connexion MetaMask.

## Liste des captures à prendre

| Fichier | Page | Description |
|---------|------|-------------|
| `01-liste-publique.png` | `/` | Liste des signalements avec plusieurs statuts |
| `02-filtres.png` | `/` | Filtre "En cours" appliqué — 1 résultat |
| `03-detail-historique.png` | `/issue/:id` | Page détail CITY-2026-905 — chronologie 5 entrées |
| `04-declaration-formulaire.png` | `/declare` | Formulaire rempli (StreetLight, Citizen42) |
| `05-declaration-hash.png` | `/declare` | Hash de transaction affiché après confirmation |
| `06-municipality-role-check.png` | `/municipality` | Message rouge "rôle absent" sur compte citoyen |
| `07-affectation.png` | `/municipality` | Équipe UrbanTeam01 affectée — statut Affecté |
| `08-avancement-statut.png` | `/municipality` | Statut Clôturé atteint — historique visible |
| `09-import-invalide.png` | `/municipality` | Import urban_issues_invalide.xlsx — erreurs lignes |
| `10-import-valide.png` | `/municipality` | Import urban_issues.xlsx — lots confirmés |

## Instructions

1. Démarrer le nœud : `npx hardhat node`
2. Déployer : `npx hardhat run scripts/deploy.ts --network localhost`
3. Seed : `npx hardhat run scripts/seed.ts --network localhost`
4. Frontend : `cd frontend && npm run dev`
5. Prendre les captures dans l'ordre du scénario DEMO.md
