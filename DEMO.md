# DEMO.md — Scénario de démonstration vidéo

**Durée cible : 4 à 5 minutes**

---

## Prérequis avant d'enregistrer

1. `npx hardhat node` actif dans un terminal
2. `npx hardhat run scripts/deploy.ts --network localhost` exécuté
3. `npx hardhat run scripts/seed.ts --network localhost` exécuté (données de démo)
4. MetaMask configuré sur Hardhat Local (chain ID 31337), **données d'activité effacées**
5. Compte #0 (admin + municipal) importé dans MetaMask
6. `cd frontend && npm run dev` actif, frontend ouvert sur `http://localhost:5173`

---

## Scénario minuté

### 0:00 – Introduction (20 s)

> « Voici le mini-projet Smart City & Blockchain. L'objectif : gérer des signalements urbains de façon décentralisée, sans base de données centrale. Tout est enregistré sur un contrat Ethereum local. »

- Montrer brièvement la page d'accueil avec la liste des signalements existants (données seed).

---

### 0:20 – Consultation publique (45 s)

> « La consultation est publique, sans wallet. »

1. **Sur la page Signalements** : montrer les cartes (statuts colorés : Signalé, Affecté, En cours, Résolu, Clôturé).
2. Utiliser le **filtre Statut → "En cours"** : seul CITY-2026-903 s'affiche.
3. Remettre le filtre sur "Tous".
4. **Cliquer sur CITY-2026-905** (Closed / TrafficLight) → page détail.
5. Montrer la **chronologie complète** de l'historique : chaque entrée affiche statut, date, équipe et commentaire.
6. Revenir à la liste.

---

### 1:05 – Déclaration d'une panne d'éclairage (60 s)

> « N'importe quel citoyen peut signaler un problème avec un wallet. »

1. Cliquer sur **Déclarer** dans le menu.
2. Lire l'avertissement en jaune : *Aucune donnée personnelle*.
3. Connecter MetaMask (compte #0 ou n'importe quel compte).
4. Remplir le formulaire :
   - **Type** : StreetLight
   - **Localisation** : Avenue des Palmiers, Ville Fictive
   - **Description** : Panne d'éclairage public, lampadaire n°12 éteint depuis 3 jours.
   - **Date** : aujourd'hui
   - **Priorité** : Élevé
   - **Pseudonyme** : Citizen42
5. Cliquer **Soumettre le signalement** → MetaMask s'ouvre → **Confirmer**.
6. Montrer le **hash de transaction** affiché sous le formulaire.
7. Revenir à la liste → le nouveau signalement apparaît avec le statut **Signalé**.

---

### 2:05 – Espace Municipalité — Affectation (40 s)

> « Seul un compte avec le rôle Municipalité peut agir ici. »

1. Cliquer sur **Municipalité** dans le menu.
2. **Montrer le message d'erreur** si vous êtes sur un compte citoyen : *"Ce compte ne possède pas le rôle Municipalité."*
3. Basculer MetaMask sur le **compte #0** (admin + municipal).
4. La bannière rouge disparaît. Onglet **"Affecter / Avancer un statut"**.
5. Saisir le nouvel issueId (ex. `CITY-2026-XXXX`) → **Charger**.
6. Remplir **Équipe** : `UrbanTeam01` et **Commentaire** : `Affectation suite à signalement prioritaire.`
7. Cliquer **Affecter** → MetaMask → **Confirmer**.
8. Le statut passe à **Affecté**, le hash est affiché.

---

### 2:45 – Avancement du statut : InProgress → Resolved → Closed (40 s)

> « Le statut avance séquentiellement ; aucun saut ni retour en arrière n'est possible. »

1. Toujours sur le même signalement chargé, changer le commentaire : `Intervention démarrée.`
2. Cliquer **Passer à "En cours"** → confirmer dans MetaMask.
3. Commentaire : `Réparation du lampadaire terminée.` → **Passer à "Résolu"** → confirmer.
4. Commentaire : `Dossier clôturé après vérification.` → **Passer à "Clôturé"** → confirmer.
5. Revenir à la **page détail** du signalement → montrer l'historique complet : **5 entrées** (Signalé → Affecté → En cours → Résolu → Clôturé) avec dates, équipe et acteur.

---

### 3:25 – Import Excel invalide puis valide (60 s)

> « La municipalité peut importer des lots. La validation côté client bloque les erreurs avant tout envoi. »

1. Onglet **Import Excel / CSV** dans l'espace Municipalité.
2. Charger **`sample-data/urban_issues_invalide.xlsx`**.
3. Montrer le tableau avec les lignes en rouge et les **erreurs ligne par ligne** :
   - description vide, date invalide, priorité inconnue, statut invalide, doublon issueId, Assigned sans equipe, description trop longue.
4. Montrer que les lignes invalides ont leur **case à cocher désactivée**.
5. Fermer et charger **`sample-data/urban_issues.xlsx`** (fichier valide, 15 lignes).
6. Montrer le message vert : *"15 ligne(s) lue(s), N valide(s)."*
7. Cliquer **Tout sélectionner** puis **Importer X ligne(s)**.
8. Laisser les lots s'envoyer, montrer les **hashs de transaction** confirmés.

---

### 4:25 – Conclusion (15 s)

> « Toutes les données sont publiques, permanentes et vérifiables sur la blockchain locale. Le contrat est couvert par 9 tests automatisés. »

- Montrer brièvement `npx hardhat test` dans un terminal (optionnel si déjà filmé).
- Fin.

---

## Captures d'écran à prendre

| Fichier | Moment |
|---------|--------|
| `01-liste-publique.png` | Page principale avec plusieurs cartes de statuts variés |
| `02-filtres.png` | Filtre "En cours" appliqué |
| `03-detail-historique.png` | Page détail de CITY-2026-905 avec 5 entrées d'historique |
| `04-declaration-formulaire.png` | Formulaire rempli avant soumission |
| `05-declaration-hash.png` | Hash de transaction affiché après confirmation |
| `06-municipality-role-check.png` | Message rouge "rôle absent" sur compte citoyen |
| `07-affectation.png` | Affectation UrbanTeam01 confirmée |
| `08-avancement-statut.png` | Statut Clôturé atteint, historique visible |
| `09-import-invalide.png` | Import invalide avec erreurs ligne par ligne |
| `10-import-valide.png` | Import valide — lots confirmés avec hash |
