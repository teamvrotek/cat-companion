import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { unzipSync, zipSync } from 'fflate';

const project = dirname(fileURLToPath(import.meta.url));
const uuid = 'com.teamvrotek.catattention';
const directoryName = `${uuid}.sdPlugin`;
const source = join(project, directoryName);
const release = join(project, 'Release');
const cli = join(project, 'node_modules', '@elgato', 'cli', 'bin', 'streamdeck.mjs');
const manifestBytes = readFileSync(join(source, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const { VERSION, CATS, MODES, renderKey } = await import('./com.teamvrotek.catattention.sdPlugin/lib/renderer.js');

if (manifest.Version !== '2.0' || VERSION !== '2.0') throw new Error('Cat Companion must remain version 2.0.');
if (manifest.UUID !== uuid) throw new Error('Unexpected plugin identity.');
if (!existsSync(cli)) throw new Error('Run npm ci before npm run build.');
for (const path of ['package.json', `${directoryName}/package.json`]) {
  if (JSON.parse(readFileSync(join(project, path))).version !== '2.0.0') throw new Error(`Unexpected npm version in ${path}.`);
}

const temporary = mkdtempSync(join(tmpdir(), 'cat-companion-build-'));
const staged = join(temporary, directoryName);
const run = (command, args, cwd = project) => execFileSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
const runCli = args => run(process.execPath, [cli, ...args]);

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${path}`);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
}

const localDirectories = new Set([
  '.git', '.codex', '.claude', '.cursor', '.ai', 'ai', '.local', 'local', '.idea', '.vscode',
  'preview', 'tools', 'tests', 'output', 'tmp', 'marketplace', 'Release', 'coverage', 'logs',
]);
function isLocalPart(part) {
  return localDirectories.has(part) || ['AGENTS.md', 'CLAUDE.md', '.DS_Store'].includes(part)
    || part.startsWith('._') || part === '.env' || part.startsWith('.env.')
    || /\.(log|tmp|bak|streamDeckPlugin)$/.test(part) || part.endsWith('~');
}

function safeEntry(entry) {
  const segments = entry.split('/');
  if (!entry.startsWith(`${directoryName}/`) || segments.includes('..') || entry.includes('\\') || entry.includes('\0')) {
    throw new Error(`Unexpected package path: ${entry}`);
  }
  if (segments.some(isLocalPart)) {
    throw new Error(`Development material in package: ${entry}`);
  }
}

try {
  cpSync(source, staged, { recursive: true, filter(path) {
    const parts = relative(source, path).split(/[\\/]/);
    return !parts.some(part => part === 'node_modules' || isLocalPart(part));
  } });
  cpSync(join(project, 'LICENSE'), join(staged, 'LICENSE'));
  filesIn(staged);

  console.log('Installing the locked runtime dependencies into the staging directory.');
  // npm_execpath is supplied by npm run on macOS and Windows.
  if (process.env.npm_execpath) run(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], staged);
  // Direct node invocations need a command interpreter for Windows npm.cmd.
  else if (process.platform === 'win32') run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund'], staged);
  else run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], staged);

  for (const cat of CATS) for (const mode of MODES) {
    const svg = renderKey({ cat: cat.id, mode: mode.id, phase: .25 });
    if (!svg.includes(`data-cat="${cat.id}"`) || !svg.includes(`data-mode="${mode.id}"`) || /NaN|undefined|Infinity/.test(svg)) {
      throw new Error(`Invalid frame: ${cat.id}, ${mode.id}`);
    }
  }

  runCli(['pack', staged, '--output', temporary, '--force', '--no-file-list', '--no-update-check']);
  const packedPath = join(temporary, `${uuid}.streamDeckPlugin`);
  const entries = unzipSync(readFileSync(packedPath));
  const manifestEntry = `${directoryName}/manifest.json`;
  if (!entries[manifestEntry]) throw new Error('Packager omitted the manifest.');
  const packedManifest = JSON.parse(Buffer.from(entries[manifestEntry]));
  // Elgato's checker pads the version. Only its disposable copy may retain this.
  packedManifest.Version = manifest.Version;
  if (!isDeepStrictEqual(packedManifest, manifest)) throw new Error('Packager changed unexpected manifest fields.');
  entries[manifestEntry] = new Uint8Array(manifestBytes);
  writeFileSync(join(staged, 'manifest.json'), manifestBytes);

  const extracted = join(temporary, 'verified');
  let count = 0;
  for (const [entry, bytes] of Object.entries(entries)) {
    safeEntry(entry);
    if (entry.endsWith('/')) continue;
    const stagedFile = join(temporary, entry);
    if (!lstatSync(stagedFile).isFile() || !Buffer.from(bytes).equals(readFileSync(stagedFile))) {
      throw new Error(`Packaged file differs from the staged source: ${entry}`);
    }
    const target = join(extracted, entry);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    count++;
  }
  const extractedPlugin = join(extracted, directoryName);
  for (const path of ['plugin.js', 'controller.js', 'config.js', 'session.js', 'LICENSE', 'ui/property-inspector.html', 'ui/property-inspector.css', 'ui/property-inspector.js', 'lib/renderer.js', 'lib/behavior.js', 'lib/press.js', 'lib/image-rate.js', 'lib/routine.js', 'lib/social.js', 'lib/adventures.js', 'lib/biscuits.js', 'lib/personality.js', 'lib/appetite.js', 'lib/care-constants.js', 'lib/care-feedback.js', 'resources.js', 'ui/resource-inspector.html', 'ui/resource-inspector.js']) {
    if (!existsSync(join(extractedPlugin, path))) throw new Error(`Required runtime file missing: ${path}`);
  }

  run(process.execPath, ['--input-type=module', '-e', "await import('@elgato/streamdeck'); await import('./controller.js'); await import('./config.js'); await import('./session.js');"], extractedPlugin);
  const schemaPlugin = join(temporary, 'schema', directoryName);
  cpSync(extractedPlugin, schemaPlugin, { recursive: true });
  writeFileSync(join(schemaPlugin, 'manifest.json'), JSON.stringify({ ...manifest, Version: '2.0.0.0' }, null, 2) + '\n');
  runCli(['validate', schemaPlugin, '--no-update-check']);

  const installer = Buffer.from(zipSync(entries, { level: 6 }));
  const shippedManifest = unzipSync(installer)[manifestEntry];
  if (!Buffer.from(shippedManifest).equals(manifestBytes)) throw new Error('Final installer did not preserve the exact 2.0 manifest.');
  if (!readFileSync(join(source, 'manifest.json')).equals(manifestBytes)) throw new Error('Source manifest changed during the build.');
  mkdirSync(release, { recursive: true });
  const output = join(release, `${uuid}.streamDeckPlugin`);
  const pending = join(release, `${uuid}.streamDeckPlugin.tmp`);
  writeFileSync(pending, installer);
  renameSync(pending, output);
  const checksum = createHash('sha256').update(installer).digest('hex');
  writeFileSync(`${output}.sha256`, `${checksum}  ${basename(output)}\n`);
  console.log(`Verified ${count} packaged files and ${CATS.length * MODES.length} cat frames.`);
  console.log(`Built ${relative(project, output)} with exact Version 2.0.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
