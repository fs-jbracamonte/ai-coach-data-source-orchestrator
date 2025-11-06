/**
 * Test suite for global team filter functionality
 * 
 * Tests the TRANSCRIPTS_GLOBAL_TEAM_FILTER env flag behavior:
 * - Filtering transcripts by matched team members before markdown conversion
 * - Respecting minimumTeamMembersRequired threshold
 * - Integration with name-matcher and transcript-to-markdown modules
 */

const fs = require('fs');
const path = require('path');
const {
  loadTeamMapping,
  filterParticipantsByTeam
} = require('../lib/name-matcher');
const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');

console.log('====================================================================');
console.log('TEST SUITE: Global Team Filter');
console.log('====================================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function test(description, testFn) {
  try {
    testFn();
    console.log(`✅ PASS: ${description}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAIL: ${description}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFalse(condition, message) {
  if (condition) {
    throw new Error(message);
  }
}

// ====================================================================
// Test Setup: Mock transcript content
// ====================================================================

const mockTranscript1on1 = `0:00 Ethan Patrick Bandebas: Hello, ready for the one on one?

0:15 Manager Name: Yes, let's discuss your performance.

0:30 Ethan Patrick Bandebas: I've been working on the project updates.`;

const mockTranscriptTeamMeeting = `0:00 Ethan Patrick Bandebas: Let's start the standup.

0:15 Harold Inacay: I finished the backend changes.

0:30 Reymart Militante: Frontend is ready for testing.

0:45 Manager Name: Great progress everyone.`;

const mockTranscriptExternalMeeting = `0:00 External Person: Welcome to the meeting.

0:15 Client Representative: Thanks for joining.

0:30 External Person: Let's discuss the requirements.`;

// ====================================================================
// Test Group 1: Participant Extraction
// ====================================================================

console.log('TEST GROUP 1: Participant Extraction from Transcripts\n');

test('Extract participants from 1:1 transcript', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscript1on1);
  assertEqual(participants.length, 2, 'Should extract 2 participants');
  assertTrue(participants.includes('Ethan Patrick Bandebas'), 'Should include team member');
  assertTrue(participants.includes('Manager Name'), 'Should include manager');
});

test('Extract participants from team meeting', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptTeamMeeting);
  assertEqual(participants.length, 4, 'Should extract 4 participants');
  assertTrue(participants.includes('Ethan Patrick Bandebas'), 'Should include Ethan');
  assertTrue(participants.includes('Harold Inacay'), 'Should include Harold');
  assertTrue(participants.includes('Reymart Militante'), 'Should include Reymart');
});

test('Extract participants from external meeting', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptExternalMeeting);
  assertEqual(participants.length, 2, 'Should extract 2 participants');
  assertFalse(participants.some(p => p.includes('Team Member')), 'Should not include team members');
});

// ====================================================================
// Test Group 2: Team Member Filtering with Different Thresholds
// ====================================================================

console.log('\nTEST GROUP 2: Team Member Filtering Logic\n');

const teamMembers = [
  'Ethan Patrick Bandebas',
  'Harold Inacay',
  'Reymart Militante',
  'Kentward Maratas',
  'Jeffrey Milanes'
];

// Load mapping file
let mapping;
try {
  mapping = loadTeamMapping('datasource-generator/team-name-mapping-timeclock.json');
} catch (error) {
  console.error('⚠️ Could not load team mapping file, using empty mapping');
  mapping = { projectFolder: 'timeclock', mappings: {} };
}

test('Filter 1:1 with minimumRequired=1 (should include)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscript1on1);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should include with threshold 1');
  assertEqual(result.matchedCount, 1, 'Should match 1 team member');
  assertTrue(result.matches.includes('Ethan Patrick Bandebas'), 'Should match Ethan');
});

test('Filter 1:1 with minimumRequired=2 (should exclude)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscript1on1);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertFalse(result.shouldInclude, 'Should exclude with threshold 2');
  assertEqual(result.matchedCount, 1, 'Should only match 1 team member');
});

test('Filter team meeting with minimumRequired=1 (should include)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptTeamMeeting);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should include with threshold 1');
  assertTrue(result.matchedCount >= 3, 'Should match at least 3 team members');
});

test('Filter team meeting with minimumRequired=2 (should include)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptTeamMeeting);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertTrue(result.shouldInclude, 'Should include with threshold 2');
  assertTrue(result.matchedCount >= 3, 'Should match at least 3 team members');
});

test('Filter external meeting with minimumRequired=1 (should exclude)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptExternalMeeting);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertFalse(result.shouldInclude, 'Should exclude - no team members');
  assertEqual(result.matchedCount, 0, 'Should match 0 team members');
});

// ====================================================================
// Test Group 3: Edge Cases
// ====================================================================

console.log('\nTEST GROUP 3: Edge Cases\n');

test('Empty participants array (should exclude)', () => {
  const result = filterParticipantsByTeam([], teamMembers, mapping, 1);
  assertFalse(result.shouldInclude, 'Should exclude with empty participants');
  assertEqual(result.matchedCount, 0, 'Should match 0');
});

test('Empty team members array (should include - fail-open)', () => {
  const participants = ['John Doe', 'Jane Smith'];
  const result = filterParticipantsByTeam(participants, [], mapping, 1);
  assertTrue(result.shouldInclude, 'Should include (fail-open) with empty team members');
  assertTrue(result.warning, 'Should include warning');
});

test('Threshold higher than team members available (should exclude)', () => {
  const participants = ['Ethan Patrick Bandebas'];
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 5);
  assertFalse(result.shouldInclude, 'Should exclude when threshold > matched');
  assertEqual(result.matchedCount, 1, 'Should match 1');
});

// ====================================================================
// Test Group 4: Config-based Scenarios
// ====================================================================

console.log('\nTEST GROUP 4: Real-world Config Scenarios\n');

test('Timeclock 1on1 config (minimumRequired=1) with 1:1 meeting', () => {
  // configs/timeclock/config.1on1.json has minimumRequired: 1
  const participants = transcriptToMarkdown.extractParticipants(mockTranscript1on1);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  assertTrue(result.shouldInclude, '1on1 config with threshold 1 should include 1:1 meetings');
});

test('Timeclock base config (minimumRequired=2) with 1:1 meeting', () => {
  // configs/timeclock/config.json has minimumRequired: 2
  const participants = transcriptToMarkdown.extractParticipants(mockTranscript1on1);
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  assertFalse(result.shouldInclude, 'Base config with threshold 2 should exclude 1:1 meetings');
});

test('Weekly config with team meeting (should always include)', () => {
  const participants = transcriptToMarkdown.extractParticipants(mockTranscriptTeamMeeting);
  const resultWith1 = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  const resultWith2 = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertTrue(resultWith1.shouldInclude, 'Should include with threshold 1');
  assertTrue(resultWith2.shouldInclude, 'Should include with threshold 2');
});

// ====================================================================
// Test Summary
// ====================================================================

console.log('\n====================================================================');
console.log('TEST SUMMARY');
console.log('====================================================================');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`Total Tests: ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}

