// Focused tests for normalization of qualifiers and matching
const { normalizeNameForMatching, loadTeamMapping, filterParticipantsByTeam } = require('../lib/name-matcher');

let testsPassed = 0;
let testsFailed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${desc}`);
    testsPassed++;
  } catch (e) {
    console.log(`❌ FAIL: ${desc}`);
    console.log(`   Error: ${e.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- Normalization tests ---

test('Normalize removes (Full Scale) parenthetical', () => {
  const input = 'Jolony Tim Tangpuz (Full Scale)';
  const out = normalizeNameForMatching(input);
  assertEqual(out, 'jolony tim tangpuz', 'Should strip parenthetical and lowercase');
});

test('Normalize removes (2) numeric parenthetical', () => {
  const input = 'Christian Nunez (2)';
  const out = normalizeNameForMatching(input);
  assertEqual(out, 'christian nunez', 'Should strip numeric parenthetical');
});

test('Normalize removes [guest] bracketed qualifier', () => {
  const input = 'Harold Inacay [Guest]';
  const out = normalizeNameForMatching(input);
  assertEqual(out, 'harold inacay', 'Should strip bracketed qualifier');
});

// --- Matching tests with team mapping ---

let mapping;
try {
  mapping = loadTeamMapping('datasource-generator/team-name-mapping-timeclock.json');
} catch (_) {
  mapping = { projectFolder: 'timeclock', mappings: {} };
}

const teamMembers = [
  'Jolony Tim Tangpuz',
  'Harold Inacay',
  'Mark Christian Nunez'
];

test('Participants with qualifiers match team members', () => {
  const participants = [
    'Jolony Tim Tangpuz (Full Scale)',
    'Harold Inacay',
    'Christian Nunez (2)'
  ];
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  assertTrue(result.shouldInclude, 'Should include when at least two team members present');
  assertTrue(result.matchedCount >= 2, 'Should match at least 2 team members');
});

console.log('\nSUMMARY');
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);
if (testsFailed > 0) process.exit(1);






