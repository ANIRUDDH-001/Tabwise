// D-36 run guard. R1 runs only on a GitHub-hosted Windows Actions runner, and only from a clean checkout
// that nothing changes during the run. git is injected (args -> stdout), so the tests use fakes.

// [] only on a GitHub-hosted Windows runner (GitHub docs: GITHUB_ACTIONS is always "true" in Actions,
// RUNNER_ENVIRONMENT is "github-hosted" on GitHub-hosted runners). There is no override.
export function ciGuardErrors(env) {
  const out = [];
  if (env.GITHUB_ACTIONS !== 'true') out.push('not in GitHub Actions (GITHUB_ACTIONS != "true")');
  if (env.RUNNER_ENVIRONMENT !== 'github-hosted') out.push(`runner is not GitHub-hosted (RUNNER_ENVIRONMENT=${env.RUNNER_ENVIRONMENT ?? 'unset'})`);
  if (env.RUNNER_OS !== 'Windows') out.push(`runner OS is not Windows (RUNNER_OS=${env.RUNNER_OS ?? 'unset'})`);
  return out;
}

// S-02: the approved workflow only: manual dispatch of r1.yml on main of this repository, at the checked-out
// commit (GitHub docs, "Variables" reference). Inside Actions these come from the runner; outside it they
// are caller-controlled, so this guards against accidental use and does not attest a machine.
export const APPROVED = { repository: 'ANIRUDDH-001/Tabwise', ref: 'refs/heads/main', workflow: '.github/workflows/r1.yml' };
export function workflowGuardErrors(env, head, approved = APPROVED) {
  const out = [];
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '')) out.push(`GITHUB_SHA is not a commit SHA (${env.GITHUB_SHA ?? 'unset'})`);
  else if (env.GITHUB_SHA !== head) out.push(`checkout HEAD ${head} is not GITHUB_SHA ${env.GITHUB_SHA}`);
  if (env.GITHUB_EVENT_NAME !== 'workflow_dispatch') out.push(`event is not workflow_dispatch (${env.GITHUB_EVENT_NAME ?? 'unset'})`);
  if (env.GITHUB_REPOSITORY !== approved.repository) out.push(`repository is not ${approved.repository} (${env.GITHUB_REPOSITORY ?? 'unset'})`);
  if (env.GITHUB_REF !== approved.ref) out.push(`ref is not ${approved.ref} (${env.GITHUB_REF ?? 'unset'})`);
  const wf = `${approved.repository}/${approved.workflow}@${approved.ref}`;
  if (env.GITHUB_WORKFLOW_REF !== wf) out.push(`workflow is not ${wf} (${env.GITHUB_WORKFLOW_REF ?? 'unset'})`);
  return out;
}

// HEAD, uncommitted or untracked paths (except `ignore`, a folder prefix, when given), lock and test hashes.
export function repoSnapshot({ git, hashes, tests, ignore = null }) {
  const snap = { head: null, dirty: [], hashes, tests, errors: [] };
  try { snap.head = String(git(['rev-parse', 'HEAD'])).trim(); } catch (e) { snap.errors.push(`git rev-parse: ${e.message}`); }
  try {
    snap.dirty = String(git(['status', '--porcelain', '--untracked-files=all'])).split('\n')
      .filter((l) => l.trim() && !(ignore && l.slice(3).replace(/\\/g, '/').startsWith(ignore)));
  } catch (e) { snap.errors.push(`git status: ${e.message}`); }
  return snap;
}

// What changed between two snapshots; a git failure or a dirty tree counts as a change.
export function repoChanges(before, after) {
  const out = [...after.errors];
  if (after.head !== before.head) out.push(`HEAD ${before.head} -> ${after.head}`);
  out.push(...after.dirty.filter((l) => !before.dirty.includes(l)));
  for (const [kind, a, b] of [['lock', before.hashes, after.hashes], ['test', before.tests, after.tests]]) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.push(`${kind} hash changed: ${k}`);
  }
  return out;
}
