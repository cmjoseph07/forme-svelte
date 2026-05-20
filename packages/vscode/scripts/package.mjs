import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

process.chdir(root);

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const version = pkg.version;

// Find esbuild-wasm version from monorepo
const rootNM = resolve(root, '../../node_modules');
const esbuildWasmVersion = JSON.parse(
  readFileSync(resolve(rootNM, 'esbuild-wasm/package.json'), 'utf-8'),
).version;

// 1. Build the extension
console.log('Building extension...');
execSync('npm run build', { stdio: 'inherit' });

// 2. Create staging dir
rmSync('staging', { recursive: true, force: true });
mkdirSync('staging/dist', { recursive: true });

// 3. Copy dist (bundled extension.js, preview HTML, forme_bg.wasm) and
// resources (icons). The bundled extension reads forme_bg.wasm from
// dist/ at runtime (it was at pkg/forme_bg.wasm pre-0.10.1).
cpSync('dist', 'staging/dist', { recursive: true });
cpSync('resources', 'staging/resources', { recursive: true });
cpSync('README.md', 'staging/README.md');
cpSync('CHANGELOG.md', 'staging/CHANGELOG.md');
cpSync('screenshot.png', 'staging/screenshot.png');
cpSync('LICENSE', 'staging/LICENSE');

// 4. Install esbuild-wasm into staging (pure WASM, no platform binary needed)
writeFileSync(
  'staging/package.json',
  JSON.stringify({
    name: 'forme-pdf-staging',
    private: true,
    dependencies: { 'esbuild-wasm': esbuildWasmVersion },
  }),
);
console.log(`Installing esbuild-wasm@${esbuildWasmVersion} in staging...`);
execSync('npm install', { cwd: 'staging', stdio: 'inherit' });

// 5. Copy package.json for vsce — renderer is bundled, esbuild-wasm is external
const stagingPkg = { ...pkg };
stagingPkg.dependencies = { 'esbuild-wasm': esbuildWasmVersion };
delete stagingPkg.devDependencies;
delete stagingPkg.scripts;
writeFileSync('staging/package.json', JSON.stringify(stagingPkg, null, 2));
cpSync('.vscodeignore', 'staging/.vscodeignore');

// 6. Package from staging
console.log('Packaging VSIX...');
execSync('npx @vscode/vsce package', { cwd: 'staging', stdio: 'inherit' });

// 7. Copy VSIX out
cpSync(`staging/forme-pdf-${version}.vsix`, `forme-pdf-${version}.vsix`);
rmSync('staging', { recursive: true, force: true });

console.log(`\nDone: forme-pdf-${version}.vsix`);
