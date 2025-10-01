/**
 * Test suite for lib/name-matcher.js
 * 
 * Tests all name matching functionality including:
 * - Loading team mappings
 * - Name normalization
 * - Alias retrieval
 * - Team member matching
 * - Participant filtering
 */

const {
  loadTeamMapping,
  normalizeNameForMatching,
  getAllAliases,
  findMatchingTeamMember,
  filterParticipantsByTeam,
  clearCache
} = require('../lib/name-matcher');

console.log('====================================================================');
console.log('TEST SUITE: Name Matcher Module');
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

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\n  Expected: ${expectedStr}\n  Actual: ${actualStr}`);
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
// Test 1: Name Normalization
// ====================================================================

console.log('TEST GROUP 1: Name Normalization\n');

test('normalizeNameForMatching - basic name', () => {
  const result = normalizeNameForMatching('John Doe');
  assertEqual(result, 'john doe', 'Should convert to lowercase and trim');
});

test('normalizeNameForMatching - with punctuation', () => {
  const result = normalizeNameForMatching('John Doe, Jr.');
  assertEqual(result, 'john doe jr', 'Should remove periods and commas');
});

test('normalizeNameForMatching - with multiple spaces', () => {
  const result = normalizeNameForMatching('John   Doe');
  assertEqual(result, 'john doe', 'Should collapse multiple spaces');
});

test('normalizeNameForMatching - with hyphens', () => {
  const result = normalizeNameForMatching('Allan-Arneil');
  assertEqual(result, 'allan arneil', 'Should replace hyphens with spaces');
});

test('normalizeNameForMatching - with underscores', () => {
  const result = normalizeNameForMatching('Allan_Sheldon_Iba_ez');
  assertEqual(result, 'allan sheldon iba ez', 'Should replace underscores with spaces');
});

test('normalizeNameForMatching - empty string', () => {
  const result = normalizeNameForMatching('');
  assertEqual(result, '', 'Should handle empty string');
});

test('normalizeNameForMatching - null/undefined', () => {
  assertEqual(normalizeNameForMatching(null), '', 'Should handle null');
  assertEqual(normalizeNameForMatching(undefined), '', 'Should handle undefined');
});

test('normalizeNameForMatching - leading/trailing whitespace', () => {
  const result = normalizeNameForMatching('  John Doe  ');
  assertEqual(result, 'john doe', 'Should trim whitespace');
});

// ====================================================================
// Test 2: Loading Team Mappings
// ====================================================================

console.log('\nTEST GROUP 2: Loading Team Mappings\n');

test('loadTeamMapping - AI Coach mapping', () => {
  clearCache();
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  assertTrue(mapping.projectFolder === 'ai-coach', 'Should load AI Coach project folder');
  assertTrue(mapping.mappings['Jamnilloh Bracamonte'], 'Should have Jamnilloh mapping');
  assertTrue(mapping.mappings['Mark Jerly Bundalian'], 'Should have Mark mapping');
});

test('loadTeamMapping - Rocks mapping', () => {
  clearCache();
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
  assertTrue(mapping.projectFolder === 'rocks', 'Should load Rocks project folder');
  assertTrue(mapping.mappings['Allan Sheldon Ibañez'], 'Should have Allan mapping');
  assertTrue(Object.keys(mapping.mappings).length > 5, 'Should have multiple team members');
});

test('loadTeamMapping - caching works', () => {
  clearCache();
  const mapping1 = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const mapping2 = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  assertTrue(mapping1 === mapping2, 'Should return cached mapping (same reference)');
});

test('loadTeamMapping - missing file throws error', () => {
  clearCache();
  try {
    loadTeamMapping('non-existent-file.json');
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertTrue(error.name === 'FileSystemError', 'Should throw FileSystemError');
    assertTrue(error.message.includes('not found'), 'Error should mention file not found');
  }
});

test('loadTeamMapping - missing parameter throws error', () => {
  try {
    loadTeamMapping();
    throw new Error('Should have thrown an error');
  } catch (error) {
    assertTrue(error.name === 'ConfigurationError', 'Should throw ConfigurationError');
  }
});

// ====================================================================
// Test 3: Get All Aliases
// ====================================================================

console.log('\nTEST GROUP 3: Get All Aliases\n');

test('getAllAliases - AI Coach member', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const aliases = getAllAliases('Jamnilloh Bracamonte', mapping);
  
  assertTrue(aliases.length > 0, 'Should return aliases');
  assertTrue(aliases.includes('jamnilloh bracamonte'), 'Should include full name normalized');
  assertTrue(aliases.includes('jam'), 'Should include nickname');
  assertTrue(aliases.includes('jamnilloh'), 'Should include first name');
  assertTrue(aliases.includes('bracamonte'), 'Should include last name');
});

test('getAllAliases - Rocks member with many aliases', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
  const aliases = getAllAliases('Michael Roy M. Otilla', mapping);
  
  assertTrue(aliases.length > 10, 'Michael should have many aliases');
  assertTrue(aliases.includes('michael'), 'Should include first name');
  assertTrue(aliases.includes('mike'), 'Should include nickname');
  assertTrue(aliases.includes('otilla'), 'Should include last name');
});

test('getAllAliases - handles accent marks', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
  const aliases = getAllAliases('Allan Sheldon Ibañez', mapping);
  
  assertTrue(aliases.some(a => a.includes('ibanez')), 'Should include version without accent');
});

test('getAllAliases - non-existent member', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const aliases = getAllAliases('Non Existent Person', mapping);
  
  assertTrue(aliases.length === 1, 'Should return normalized key only');
  assertEqual(aliases[0], 'non existent person', 'Should return normalized version of key');
});

test('getAllAliases - invalid inputs', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  
  const result1 = getAllAliases(null, mapping);
  assertTrue(Array.isArray(result1) && result1.length === 0, 'Should handle null key');
  
  const result2 = getAllAliases('Name', null);
  assertTrue(Array.isArray(result2) && result2.length === 0, 'Should handle null mapping');
});

// ====================================================================
// Test 4: Find Matching Team Member
// ====================================================================

console.log('\nTEST GROUP 4: Find Matching Team Member\n');

test('findMatchingTeamMember - exact match', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  
  const result = findMatchingTeamMember('Jamnilloh Bracamonte', teamMembers, mapping);
  assertTrue(result !== null, 'Should find match');
  assertEqual(result.teamMember, 'Jamnilloh Bracamonte', 'Should match full name');
});

test('findMatchingTeamMember - first name only', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  
  const result = findMatchingTeamMember('Mark', teamMembers, mapping);
  assertTrue(result !== null, 'Should find match');
  assertEqual(result.teamMember, 'Mark Jerly Bundalian', 'Should match by first name');
  assertEqual(result.matchedVia, 'mark', 'Should indicate matched via first name');
});

test('findMatchingTeamMember - nickname', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  
  const result = findMatchingTeamMember('Jam', teamMembers, mapping);
  assertTrue(result !== null, 'Should find match');
  assertEqual(result.teamMember, 'Jamnilloh Bracamonte', 'Should match by nickname');
});

test('findMatchingTeamMember - case insensitive', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte'];
  
  const result = findMatchingTeamMember('JAMNILLOH', teamMembers, mapping);
  assertTrue(result !== null, 'Should find match case-insensitively');
});

test('findMatchingTeamMember - with punctuation', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Mark Jerly Bundalian'];
  
  const result = findMatchingTeamMember('M. Bundalian', teamMembers, mapping);
  assertTrue(result !== null, 'Should find match with punctuation');
});

test('findMatchingTeamMember - no match', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  
  const result = findMatchingTeamMember('Unknown Person', teamMembers, mapping);
  assertTrue(result === null, 'Should return null for no match');
});

test('findMatchingTeamMember - invalid inputs', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  
  const result1 = findMatchingTeamMember(null, ['Name'], mapping);
  assertTrue(result1 === null, 'Should handle null participant');
  
  const result2 = findMatchingTeamMember('Name', null, mapping);
  assertTrue(result2 === null, 'Should handle null team members');
  
  const result3 = findMatchingTeamMember('Name', ['Name'], null);
  assertTrue(result3 === null, 'Should handle null mapping');
});

// ====================================================================
// Test 5: Filter Participants by Team
// ====================================================================

console.log('\nTEST GROUP 5: Filter Participants by Team\n');

test('filterParticipantsByTeam - meets minimum (1 required, 1 found)', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  const participants = ['Mark', 'Unknown Person', 'Another Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should include transcript');
  assertEqual(result.matchedCount, 1, 'Should find 1 match');
  assertTrue(result.matches.includes('Mark Jerly Bundalian'), 'Should match Mark');
  assertEqual(result.participantCount, 3, 'Should count all participants');
});

test('filterParticipantsByTeam - meets minimum (2 required, 2 found)', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  const participants = ['Jam', 'Mark', 'Unknown Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertTrue(result.shouldInclude, 'Should include transcript');
  assertEqual(result.matchedCount, 2, 'Should find 2 matches');
  assertTrue(result.matches.includes('Jamnilloh Bracamonte'), 'Should match Jam');
  assertTrue(result.matches.includes('Mark Jerly Bundalian'), 'Should match Mark');
});

test('filterParticipantsByTeam - does not meet minimum (2 required, 1 found)', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  const participants = ['Mark', 'Unknown Person', 'Another Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertFalse(result.shouldInclude, 'Should not include transcript');
  assertEqual(result.matchedCount, 1, 'Should find only 1 match');
});

test('filterParticipantsByTeam - no matches', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  const participants = ['Unknown Person', 'Another Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertFalse(result.shouldInclude, 'Should not include transcript');
  assertEqual(result.matchedCount, 0, 'Should find no matches');
  assertEqual(result.matches.length, 0, 'Matches array should be empty');
});

test('filterParticipantsByTeam - handles duplicates', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Mark Jerly Bundalian'];
  const participants = ['Mark', 'Mark Bundalian', 'M. Bundalian']; // All resolve to same person
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should include transcript');
  assertEqual(result.matchedCount, 1, 'Should count as 1 unique match (not 3)');
  assertEqual(result.matches.length, 1, 'Should have 1 unique match');
});

test('filterParticipantsByTeam - default minimum is 1', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Mark Jerly Bundalian'];
  const participants = ['Mark'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping); // No minimum specified
  
  assertTrue(result.shouldInclude, 'Should include with default minimum of 1');
});

test('filterParticipantsByTeam - invalid inputs', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  
  const result1 = filterParticipantsByTeam(null, ['Name'], mapping, 1);
  assertFalse(result1.shouldInclude, 'Should handle null participants');
  assertEqual(result1.matchedCount, 0, 'Should return 0 matches');
  
  const result2 = filterParticipantsByTeam(['Name'], null, mapping, 1);
  assertFalse(result2.shouldInclude, 'Should handle null team members');
  
  const result3 = filterParticipantsByTeam(['Name'], ['Name'], null, 1);
  assertFalse(result3.shouldInclude, 'Should handle null mapping');
});

// ====================================================================
// Test 6: Real-World Scenarios
// ====================================================================

console.log('\nTEST GROUP 6: Real-World Scenarios\n');

test('Real-world - AI Coach team meeting', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
  const teamMembers = ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian'];
  
  // Simulate a transcript with various name formats
  const participants = [
    'Mark',
    'Jam',
    'Client Name',
    'External Consultant',
    'J. Bracamonte'
  ];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 2);
  
  assertTrue(result.shouldInclude, 'Should include meeting with both team members');
  assertEqual(result.matchedCount, 2, 'Should find both team members');
});

test('Real-world - Rocks team with accent marks', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
  const teamMembers = ['Allan Sheldon Ibañez'];
  
  // Transcript might have name without accent
  const participants = ['Allan Ibanez', 'Other Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should match despite accent differences');
  assertTrue(result.matches.includes('Allan Sheldon Ibañez'), 'Should match Allan');
});

test('Real-world - nickname matching', () => {
  const mapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
  const teamMembers = ['Jong']; // Key in mapping is "Jong"
  
  // Transcript uses various forms
  const participants = ['Junelito', 'Team Lead', 'Other Person'];
  
  const result = filterParticipantsByTeam(participants, teamMembers, mapping, 1);
  
  assertTrue(result.shouldInclude, 'Should match by full name "Junelito"');
  assertTrue(result.matches.includes('Jong'), 'Should identify as Jong (key in mapping)');
});

// ====================================================================
// Test Summary
// ====================================================================

console.log('\n====================================================================');
console.log('TEST SUMMARY');
console.log('====================================================================');
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log('====================================================================\n');

if (testsFailed === 0) {
  console.log('🎉 All tests passed!\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Please review the errors above.\n');
  process.exit(1);
}

