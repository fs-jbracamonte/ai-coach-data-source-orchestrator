const assert = require('assert');

const { ChangelogClient } = require('../jira/lib/changelog-client');

// Mock https.request-like impl
function createMockRequest(pagesByPathSequence) {
  let callCount = 0;
  return function mockRequest(options, onResponse) {
    const path = options.path;
    const seq = pagesByPathSequence[path] || [];
    const idx = Math.min(callCount, seq.length - 1);
    const resp = seq[idx] || { statusCode: 200, body: JSON.stringify({ startAt: 0, maxResults: 0, total: 0, values: [] }) };
    callCount++;
    const events = {};
    const res = {
      statusCode: resp.statusCode,
      statusMessage: resp.statusMessage || '',
      on: (ev, cb) => {
        if (ev === 'data') setTimeout(() => cb(Buffer.from(resp.body || '')), 0);
        if (ev === 'end') setTimeout(cb, 0);
      }
    };
    setTimeout(() => onResponse(res), 0);
    return {
      on: (ev, cb) => { events[ev] = cb; },
      end: () => {},
      write: () => {}
    };
  };
}

async function testPaginationAndRetry() {
  const issueKey = 'TC-1';
  const base = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=`;
  const mock = createMockRequest({
    [`${base}0&maxResults=100`]: [
      // First attempt returns 429, then success
      { statusCode: 429, statusMessage: 'Too Many Requests', body: '' },
      { statusCode: 200, body: JSON.stringify({ startAt: 0, maxResults: 100, total: 2, values: [{ id: 'h1', items: [] }] }) }
    ],
    [`${base}1&maxResults=100`]: [
      { statusCode: 200, body: JSON.stringify({ startAt: 1, maxResults: 100, total: 2, values: [{ id: 'h2', items: [] }] }) }
    ]
  });

  const client = new ChangelogClient({ httpRequestImpl: mock, retryDelaysMs: [1, 1, 1] });
  const histories = await client.fetchChangelog(issueKey);
  assert.strictEqual(histories.length, 2, 'Should fetch two pages with retry');
}

async function testAuthErrorsNonFatal() {
  const issueKey = 'TC-2';
  const base = `/rest/api/3/issue/${encodeURIComponent(issueKey)}/changelog?startAt=0&maxResults=100`;
  const mock = createMockRequest({
    [base]: [{ statusCode: 401, statusMessage: 'Unauthorized', body: '' }]
  });
  const client = new ChangelogClient({ httpRequestImpl: mock });
  const histories = await client.fetchChangelog(issueKey);
  assert.strictEqual(histories.length, 0, '401 should yield empty histories');
}

async function run() {
  await testPaginationAndRetry();
  await testAuthErrorsNonFatal();
  console.log('✓ jira changelog client tests passed');
}

if (require.main === module) {
  run();
}

module.exports = run;


