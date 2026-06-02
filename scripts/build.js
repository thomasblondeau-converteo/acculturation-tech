#!/usr/bin/env node
/* =============================================================================
   BUILD — assemble src/ into a SCORM-ready package in dist/
   -----------------------------------------------------------------------------
   What it does:
     1. Reads src/index.html
     2. Inlines css/styles.css into a <style> block
     3. Inlines content/quiz-data.js + js/*.js into <script> blocks (correct order)
     4. Rewrites the scorm-api.js path to sit next to index.html in the package
     5. Copies scorm-api.js, imsmanifest.xml, and the SCORM schemas
     6. Zips everything at the ROOT of dist/scorm-package.zip (LMS-importable)

   The inlined dist/index.html is fully self-contained and also works standalone.
   Run:  npm run build     (or)     node scripts/build.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SCHEMAS = path.join(ROOT, 'schemas');

function read(p) { return fs.readFileSync(p, 'utf8'); }
function log(...a) { console.log('[build]', ...a); }

// --- reset dist ---
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// --- load source pieces ---
let html = read(path.join(SRC, 'index.html'));
const css = read(path.join(SRC, 'css/styles.css'));
const quizData  = read(path.join(SRC, 'content/quiz-data.js'));
const quizJs    = read(path.join(SRC, 'js/quiz.js'));
const exercises = read(path.join(SRC, 'js/exercises.js'));
const appJs     = read(path.join(SRC, 'js/app.js'));

// --- 1) inline CSS: replace the <link rel="stylesheet" href="css/styles.css"> ---
html = html.replace(
  /<link rel="stylesheet" href="css\/styles\.css">/,
  `<style>\n${css}\n</style>`
);

// --- 2) keep scorm-api.js as a sibling file in the package (../scorm -> ./) ---
html = html.replace(
  /<script src="\.\.\/scorm\/scorm-api\.js"><\/script>/,
  `<script src="scorm-api.js"></script>`
);

// --- 3) inline the 4 app scripts (replace the whole block) ---
const scriptBlockRe = /<script src="content\/quiz-data\.js"><\/script>[\s\S]*?<script src="js\/app\.js"><\/script>/;
const inlined =
`<script>\n${quizData}\n</script>
<script>\n${quizJs}\n</script>
<script>\n${exercises}\n</script>
<script>\n${appJs}\n</script>`;
if (!scriptBlockRe.test(html)) {
  throw new Error('Could not find the script block to inline. Did src/index.html change?');
}
html = html.replace(scriptBlockRe, inlined);

// --- write dist/index.html ---
fs.writeFileSync(path.join(DIST, 'index.html'), html);
log('dist/index.html written (self-contained).');

// --- 4) copy SCORM runtime + manifest + schemas to dist root ---
fs.copyFileSync(path.join(ROOT, 'scorm/scorm-api.js'), path.join(DIST, 'scorm-api.js'));
fs.copyFileSync(path.join(ROOT, 'imsmanifest.xml'), path.join(DIST, 'imsmanifest.xml'));
for (const xsd of fs.readdirSync(SCHEMAS)) {
  fs.copyFileSync(path.join(SCHEMAS, xsd), path.join(DIST, xsd));
}
log('Copied scorm-api.js, imsmanifest.xml, and schemas.');

// --- 5) zip everything at the ROOT of the archive ---
const ZIP = path.join(DIST, 'scorm-package.zip');
try {
  // -j is NOT used: we keep files at root by running zip from inside dist/
  execSync(
    `cd "${DIST}" && zip -r -X scorm-package.zip imsmanifest.xml *.xsd index.html scorm-api.js`,
    { stdio: 'pipe' }
  );
  log('Created dist/scorm-package.zip');
} catch (e) {
  console.warn('[build] zip command failed (is "zip" installed?). Files are ready in dist/ — zip them manually with imsmanifest.xml at the ROOT.');
}

log('Build complete. Import dist/scorm-package.zip into the LMS.');
