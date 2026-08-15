# Datart

Application desktop locale pour réunir, filtrer et exporter des classeurs Excel. Les fichiers sont traités dans l’application et ne sont envoyés vers aucun serveur.

## Développement en direct

```powershell
node scripts/web-dev.mjs
```

Ouvrir ensuite http://localhost:3000. Les changements de code apparaissent automatiquement.

Ce mode est idéal pour itérer rapidement dans un navigateur (Chrome, Edge, Firefox), sans rester dans VS Code.

Pour lancer la fenêtre desktop Tauri avec le même rechargement automatique :

```powershell
node scripts/desktop-dev.mjs
```

En pratique :

- `web-dev` = itération la plus simple, dans le navigateur ;
- `desktop-dev` = test dans la vraie fenêtre application desktop.

## Environnement local

- Dépôt Git local initialisé dans ce dossier.
- Environnement Python créé avec uv : `.venv`.

Activation de la venv sous PowerShell :

```powershell
.venv\Scripts\Activate.ps1
```

## Production

```powershell
node scripts/web-build.mjs
node scripts/desktop-build.mjs
```

Le premier build desktop peut être long car Cargo télécharge et compile les dépendances Rust.

## Fonctionnement actuel

- dépôt de plusieurs fichiers ou dossiers `.xlsx` et `.xls` ;
- lecture de toutes les feuilles de chaque classeur ;
- import séquentiel avec barre de progression (plus robuste sur gros volumes) ;
- affichage des fichiers sources en liste déroulante au-delà de 5 fichiers ;
- détail des variables absentes de certaines feuilles ;
- panneau Colonnes en onglet déroulant pour préparer les données ;
- renommage et masquage de colonnes (mode tri) ;
- sauvegarde/chargement de configurations colonnes ;
- règles de suppression combinables, insensibles à la casse par défaut ;
- ajout de mots-clés plus ergonomique, avec compteur de lignes supprimées par mot ;
- sauvegarde/chargement de configurations de filtres ;
- aperçu de 3 exemples de contenu quand une variable de tri est sélectionnée ;
- correspondance par début de mot pour inclure les mots dérivés ;
- export d’une feuille unique avec les colonnes `_Fichier` et `_Feuille`.
- onglet Analyse textuelle avec corpus multi-variables, nuage de mots, histogramme, bigrams,
  corrélations de mots et corrélations entre variables ;
- stop words français retirés automatiquement en analyse textuelle ;
- bouton `Lancer l’analyse` pour déclencher explicitement le calcul.
- nuage de mots complémentaire après tri sur les variables filtrées ;
- mode Jour/Nuit (jour en palette rose/bleu/violet/jaune, nuit simplifié).