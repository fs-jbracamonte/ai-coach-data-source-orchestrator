const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function discoverTeams() {
  if (process.env.RUN_TEAMS) return process.env.RUN_TEAMS.split(',').map(s => s.trim()).filter(Boolean);
  const root = path.join(__dirname, '..', 'configs');
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'shared')
      .map(d => d.name);
  } catch (_) {
    return [];
  }
}

function sleep(ms) {
  if (!ms) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const delayMs = Number(process.env.INTER_PROJECT_DELAY_MS || 0);
const teams = discoverTeams();

console.log(`Discovered teams: ${teams.length ? teams.join(', ') : '(none)'}`);

for (const team of teams) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', `${team}:1on1`];
  const cwd = path.join(__dirname, '..');
  const env = { ...process.env };
  console.log(`\n=== Running ${team}:1on1 ===`);
  console.log(`[orchestrator] cwd=${cwd}`);
  console.log(`[orchestrator] exec: ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', env, cwd, shell: true });
  if (res.error) {
    console.error(`[orchestrator] Error spawning ${team}:1on1 →`, res.error.message);
    process.exit(1);
  }
  console.log(`[orchestrator] ${team}:1on1 exited with status ${res.status}`);
  if (res.status !== 0) {
    console.error(`[orchestrator] Aborting due to non-zero exit for ${team}:1on1`);
    process.exit(res.status || 1);
  }
  if (delayMs) {
    console.log(`[orchestrator] Sleeping ${delayMs} ms before next team...`);
    sleep(delayMs);
  }
}

console.log('\n✓ All 1on1 workflows completed.');


