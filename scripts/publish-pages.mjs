// Build and publish the production site to the gh-pages branch (compiled output at its root).
// Keeps gh-pages history (one commit per deploy) and only touches that branch.
// Usage: npm run publish:pages            (build + commit + push)
//        npm run publish:pages -- --no-push (build + commit locally, for inspection)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const BRANCH = 'gh-pages';
const WT = '.pages-worktree';
const push = !process.argv.includes('--no-push');
const sh = (cmd, opts = {}) => (execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }) ?? '').trim();

sh('npm run build', { stdio: 'inherit' });
const { version } = JSON.parse(readFileSync('dist/version.json', 'utf8'));
const source = sh('git rev-parse --short HEAD');

if (existsSync(WT)) sh(`git worktree remove --force ${WT}`);
sh('git worktree prune');
let remoteHas = false;
try { sh(`git fetch origin ${BRANCH}`); remoteHas = true; } catch { /* first deploy */ }
if (remoteHas) {
  sh(`git worktree add -B ${BRANCH} ${WT} FETCH_HEAD`);
} else {
  sh(`git worktree add --detach ${WT}`);
  sh(`git checkout --orphan ${BRANCH}`, { cwd: WT });
  sh('git rm -rf --quiet .', { cwd: WT });
}
// Replace the published files with this build (keep .git).
for (const f of readdirSync(WT)) if (f !== '.git') rmSync(join(WT, f), { recursive: true, force: true });
cpSync('dist', WT, { recursive: true });
sh('git add -A', { cwd: WT });
const changed = sh('git status --porcelain', { cwd: WT });
if (!changed) {
  console.log('No changes to publish.');
} else {
  sh(`git commit -m "Deploy Rev Up ${version} from ${source}"`, { cwd: WT });
  console.log(`Committed deploy ${version} (source ${source}) on ${BRANCH}.`);
}
if (push) {
  let tries = 0;
  for (;;) {
    try { sh(`git push origin ${BRANCH}`, { cwd: WT, stdio: 'inherit' }); break; } catch (e) {
      if (++tries >= 4) throw e;
      execSync(`sleep ${2 ** tries}`);
    }
  }
  console.log(`Pushed ${BRANCH}. GitHub Pages (Deploy from a branch → ${BRANCH} → /(root)) will publish it.`);
}
sh(`git worktree remove --force ${WT}`);
