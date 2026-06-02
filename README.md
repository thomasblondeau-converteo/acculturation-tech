# Le Voyage de la Donnée — Converteo Tech Academy

Module de formation interactif (data, IA, agents, RAG/MCP…) avec exercices gamifiés,
quiz final et tracking SCORM 1.2 pour import dans un LMS.

Le code source est **découpé en plusieurs fichiers** pour faciliter l'édition du contenu.
Un script de build réassemble le tout en un **package SCORM** importable dans le LMS.

---

## 🗂 Structure du repo

```
.
├── src/                      ← LE CODE SOURCE (à éditer)
│   ├── index.html            ← structure de la page (sections, contenu HTML)
│   ├── css/
│   │   └── styles.css         ← tout le style (couleurs, layout, animations)
│   ├── content/
│   │   └── quiz-data.js       ← ⭐ LES QUESTIONS DU QUIZ (éditez ici en priorité)
│   └── js/
│       ├── quiz.js            ← logique du quiz + complétion SCORM
│       ├── exercises.js       ← les 8 exercices interactifs (gamification)
│       └── app.js             ← animations, observers, barre de progression
│
├── scorm/
│   └── scorm-api.js          ← runtime SCORM (LMS). ⚠️ NE PAS MODIFIER sans raison
│
├── schemas/                  ← schémas XSD SCORM 1.2 (requis par le package)
├── imsmanifest.xml           ← manifeste SCORM (source) — voir note plus bas
│
├── scripts/
│   └── build.js              ← assemble src/ → dist/ (package SCORM)
│
├── dist/                     ← GÉNÉRÉ par le build (ne pas éditer à la main)
│   └── scorm-package.zip      ← le fichier à importer dans le LMS
│
├── package.json
└── README.md
```

---

## ✏️ Pour les consultants : éditer le contenu

**Les questions du quiz** → `src/content/quiz-data.js`
Chaque question suit ce format :
```js
{
  q: "L'énoncé de la question ?",
  opts: ["Option A", "Option B", "Option C"],
  ok: 1,            // index (0-based) de la bonne réponse -> ici "Option B"
  exp: "Explication affichée après la réponse."
}
```
Ajoutez/retirez des objets dans le tableau `QUIZ`. Le score s'adapte automatiquement
au nombre de questions.

**Le contenu des sections** (textes, titres) → `src/index.html`

**Le contenu des exercices interactifs** → `src/js/exercises.js`
(les libellés, bonnes réponses et explications sont dans les objets de config en haut
de chaque exercice `ex1`…`ex8`).

**Le style** (couleurs, espacements) → `src/css/styles.css`

> 💡 Vous n'avez **jamais** besoin de toucher à `scorm/scorm-api.js`. C'est la plomberie
> qui parle au LMS ; elle est testée et stable.

---

## 👀 Prévisualiser pendant l'édition

```bash
npm run serve
# ouvre http://localhost:8000  (sert le dossier src/)
```
La page fonctionne **en standalone** : sans LMS, le SCORM passe en *standalone mode*
(message dans la console : « SCORM API not found — standalone mode ») et tout le reste
marche normalement. Vous pouvez donc développer/relire sans LMS.

> Servez via `npm run serve` plutôt que d'ouvrir le fichier en `file://` : les navigateurs
> bloquent le chargement des fichiers JS/CSS externes en `file://`.

---

## 📦 Générer le package SCORM (pour le LMS)

```bash
npm run build
```
Cela produit `dist/scorm-package.zip` : un `index.html` **autonome** (CSS + JS inlinés)
+ `scorm-api.js` + `imsmanifest.xml` + schémas, le tout avec le manifeste **à la racine**
du zip (requis par les LMS).

Importez `dist/scorm-package.zip` directement dans le LMS (Moodle, 360Learning, etc.).

Pour tester le rendu du build localement :
```bash
npm run serve:dist   # http://localhost:8001
```

---

## ⚙️ Comment fonctionne le tracking SCORM (résumé)

- Au lancement : `LMSInitialize` → `lesson_status = incomplete`.
- À la **réussite du quiz final** (≥ 70 %) : envoi immédiat de `score.raw`,
  `lesson_status = passed` puis `completed`, `LMSCommit`, `LMSFinish`.
  → le LMS valide l'activité **sans attendre la fermeture de la fenêtre**.
- Échec au quiz : la tentative est enregistrée, la session reste ouverte pour réessayer.
- Avoir complété **les 8 exercices** valide aussi le module (voie alternative).
- Repli : `LMSFinish` est aussi appelé à la fermeture (`beforeunload`/`pagehide`).

Seuil de réussite : `PASS_THRESHOLD` en haut de `scorm/scorm-api.js` (défaut 70).

### Debug dans la console du navigateur (dans le LMS)
```js
ConverteoSCORM.debug();         // API trouvée ? statut ? score ?
ConverteoSCORM.getStatus();     // statut/score courant côté LMS
ConverteoSCORM.finalizeQuiz(90);// rejoue la séquence de complétion (test)
```

---

## ⚠️ Note sur `imsmanifest.xml`

Le manifeste liste les fichiers du package. La version à la racine du repo référence le
**build** (`index.html` + `scorm-api.js` inlinés). Si vous ajoutez de **nouveaux fichiers
qui doivent finir dans le package** (rare — le build inline déjà tout), pensez à les
déclarer dans `<resources>`. Pour l'usage normal (éditer questions/contenu/style), le
build s'occupe de tout : **rien à changer dans le manifeste**.

---

## 🔤 Polices

Les polices (Space Grotesk, Inter, DM Mono) sont chargées depuis Google Fonts.
Pour un LMS hors-ligne / air-gapped, il faudrait les self-héberger (évolution possible).
