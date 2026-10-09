// Gera build-info.json dentro da pasta publicada do Hosting (predeploy do firebase.json).
// Contrato: { commit, dirty, branch, deployedAt, project } servido em /build-info.json.
// Falha (exit 1) se o build nao existir, para o deploy abortar.
//
// Uso: node scripts/write-build-info.mjs [projeto]
// Projeto: argumento, senao GCLOUD_PROJECT (definido pelo Firebase CLI), senao 'unknown'.

import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(REPO_ROOT, 'dist', 'erp-gaspareto', 'browser');
const OUTPUT_FILE = join(PUBLIC_DIR, 'build-info.json');
const UNKNOWN = 'unknown';
const DETACHED_BRANCH = 'HEAD';
const SHORT_SHA_LENGTH = 7;

function runGit(command) {
  try {
    return execSync(`git ${command}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readCommit() {
  const fullSha = runGit('rev-parse HEAD');
  return fullSha ? fullSha.slice(0, SHORT_SHA_LENGTH) : UNKNOWN;
}

function readBranch() {
  return runGit('rev-parse --abbrev-ref HEAD') || DETACHED_BRANCH;
}

function isWorkingTreeDirty() {
  const status = runGit('status --porcelain');
  return status === null ? false : status.length > 0;
}

function readProject() {
  return process.argv[2] || process.env.GCLOUD_PROJECT || UNKNOWN;
}

function buildInfo() {
  return {
    commit: readCommit(),
    dirty: isWorkingTreeDirty(),
    branch: readBranch(),
    deployedAt: new Date().toISOString(),
    project: readProject(),
  };
}

function ensurePublicDirExists() {
  if (!existsSync(PUBLIC_DIR)) {
    console.error(
      `ERRO: pasta ${PUBLIC_DIR} nao existe. Rode o build antes do deploy (npm run build).`,
    );
    process.exit(1);
  }
}

ensurePublicDirExists();
writeFileSync(OUTPUT_FILE, JSON.stringify(buildInfo(), null, 2) + '\n', 'utf8');
console.log(`build-info.json gravado em ${OUTPUT_FILE}`);
