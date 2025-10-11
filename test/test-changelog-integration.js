const assert = require('assert');

const { getChangelogBullets } = require('../jira/lib/changelog-markdown');
const { flattenChangelogs } = require('../jira/lib/changelog-flatten');

function run() {
  const histories = [
    { id: '1', created: '2025-08-15T00:14:00.000Z', author: { displayName: 'Tester' }, items: [ { field: 'status', fromString: 'Backlog', toString: 'In Progress' } ] }
  ];
  // Simulate cache by writing a temp file
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'jira', 'data', 'changelogs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'TC-99.json'), JSON.stringify(histories, null, 2));

  const bullets = getChangelogBullets('TC-99');
  assert(bullets.length > 0, 'Expected bullets from cached changelog');
  const line = bullets[0];
  assert(line.includes('Tester'));
  assert(line.includes('status: Backlog → In Progress'));
  console.log('✓ changelog integration test passed');
}

if (require.main === module) {
  run();
}

module.exports = run;


