const assert = require('assert');

const { flattenChangelogs } = require('../jira/lib/changelog-flatten');

function sampleHistories() {
  return [
    {
      id: '1',
      created: '2025-08-07T21:00:00.000Z',
      author: { displayName: 'cleo' },
      items: [
        { field: 'description', fromString: '', toString: '{noformat}Updated body{noformat}' }
      ]
    },
    {
      id: '2',
      created: '2025-08-15T00:14:00.000Z',
      author: { displayName: 'Ismael Jr. Cristal' },
      items: [
        { field: 'status', fromString: 'Backlog', toString: 'In Progress' }
      ]
    },
    {
      id: '3',
      created: '2025-08-27T16:15:00.000Z',
      author: { displayName: 'Crystal Selina Bandalan' },
      items: [
        { field: 'Sprint', fromString: 'MVP Sprint 5', toString: 'Proposed Sprint 6' }
      ]
    },
    {
      id: '4',
      created: '2025-08-10T10:00:00.000Z',
      author: { displayName: 'System' },
      items: [
        { field: 'labels', fromString: 'alpha,beta', toString: 'alpha,gamma' }
      ]
    },
    {
      id: '5',
      created: '2025-08-11T13:00:00.000Z',
      author: { displayName: 'Bot' },
      items: [
        { field: 'IssueParentAssociation', fromString: 'OLD-1', toString: 'NEW-2' }
      ]
    },
    {
      id: '6',
      created: '2025-08-12T09:00:00.000Z',
      author: { displayName: 'PM' },
      items: [
        { field: 'Link', fromString: '', toString: 'blocks TC-123' }
      ]
    },
    {
      id: '7',
      created: '2025-08-13T09:00:00.000Z',
      author: { displayName: 'Lead' },
      items: [
        { field: 'Rank', fromString: '', toString: 'Ranked higher' }
      ]
    },
    {
      id: '8',
      created: '2025-08-14T09:00:00.000Z',
      author: { displayName: 'User' },
      items: [
        { field: 'assignee', fromString: '-', toString: 'Alice' },
        { field: 'priority', fromString: 'Low', toString: 'High' },
      ]
    }
  ];
}

function run() {
  const entries = flattenChangelogs(sampleHistories());
  // Sorted ascending by date
  const dates = entries.map(e => e.date);
  const sorted = dates.slice().sort();
  assert.deepStrictEqual(dates, sorted, 'Entries should be sorted ascending by date');

  // Presence of compact summaries
  const lines = entries.map(e => e.summary);
  assert(lines.find(s => s.includes('status: Backlog → In Progress')));
  assert(lines.find(s => s.includes('Sprint: +Proposed Sprint 6 -MVP Sprint 5')));
  assert(lines.find(s => s.includes('labels: +gamma -beta')));
  assert(lines.find(s => s.includes('description: [updated;')));
  assert(lines.find(s => s.includes('parent: OLD-1 → NEW-2')));
  assert(lines.find(s => s.includes('Link: blocks TC-123')));
  assert(lines.find(s => s.includes('Rank: Ranked higher')));
  assert(lines.find(s => s.includes('assignee: - → Alice')));
  assert(lines.find(s => s.includes('priority: Low → High')));

  console.log('✓ changelog flatten tests passed');
}

if (require.main === module) {
  run();
}

module.exports = run;


