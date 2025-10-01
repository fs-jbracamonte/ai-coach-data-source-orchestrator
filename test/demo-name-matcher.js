/**
 * Demonstration of lib/name-matcher.js functionality
 * 
 * This script shows real-world usage examples of the name matching utility
 */

const {
  loadTeamMapping,
  normalizeNameForMatching,
  getAllAliases,
  findMatchingTeamMember,
  filterParticipantsByTeam
} = require('../lib/name-matcher');

console.log('====================================================================');
console.log('NAME MATCHER DEMONSTRATION');
console.log('====================================================================\n');

// ====================================================================
// Example 1: Load Team Mapping
// ====================================================================

console.log('📂 EXAMPLE 1: Loading Team Mappings\n');

const aiCoachMapping = loadTeamMapping('datasource-generator/team-name-mapping-ai-coach.json');
console.log(`Loaded AI Coach mapping: ${aiCoachMapping.projectFolder}`);
console.log(`Team members: ${Object.keys(aiCoachMapping.mappings).length}`);

const rocksMapping = loadTeamMapping('datasource-generator/team-name-mapping.json');
console.log(`Loaded Rocks mapping: ${rocksMapping.projectFolder}`);
console.log(`Team members: ${Object.keys(rocksMapping.mappings).length}\n`);

// ====================================================================
// Example 2: Name Normalization
// ====================================================================

console.log('📝 EXAMPLE 2: Name Normalization\n');

const testNames = [
  'Mark Jerly Bundalian',
  'M. Bundalian',
  'Mark   J.  Smith',
  'Allan-Arneil',
  'Jong',
  'JAMNILLOH BRACAMONTE'
];

console.log('Original Name → Normalized Name');
console.log('-'.repeat(50));
testNames.forEach(name => {
  const normalized = normalizeNameForMatching(name);
  console.log(`${name.padEnd(30)} → ${normalized}`);
});
console.log();

// ====================================================================
// Example 3: Get All Aliases
// ====================================================================

console.log('🔍 EXAMPLE 3: Get All Aliases for Team Members\n');

console.log('Mark Jerly Bundalian aliases:');
const markAliases = getAllAliases('Mark Jerly Bundalian', aiCoachMapping);
console.log(`  Found ${markAliases.length} variations:`);
markAliases.slice(0, 8).forEach(alias => console.log(`    - "${alias}"`));
if (markAliases.length > 8) {
  console.log(`    ... and ${markAliases.length - 8} more`);
}
console.log();

console.log('Michael Roy M. Otilla aliases:');
const michaelAliases = getAllAliases('Michael Roy M. Otilla', rocksMapping);
console.log(`  Found ${michaelAliases.length} variations:`);
michaelAliases.slice(0, 8).forEach(alias => console.log(`    - "${alias}"`));
if (michaelAliases.length > 8) {
  console.log(`    ... and ${michaelAliases.length - 8} more`);
}
console.log();

// ====================================================================
// Example 4: Find Matching Team Member
// ====================================================================

console.log('🎯 EXAMPLE 4: Finding Team Member Matches\n');

const teamMembers = ['Mark Jerly Bundalian', 'Jamnilloh Bracamonte'];

const testParticipants = [
  'Mark',
  'Jam',
  'M. Bundalian',
  'Jamnilloh',
  'Unknown Person'
];

console.log('Participant Name → Matched Team Member');
console.log('-'.repeat(70));
testParticipants.forEach(participant => {
  const match = findMatchingTeamMember(participant, teamMembers, aiCoachMapping);
  if (match) {
    console.log(`${participant.padEnd(25)} → ${match.teamMember} (via "${match.matchedVia}")`);
  } else {
    console.log(`${participant.padEnd(25)} → No match found`);
  }
});
console.log();

// ====================================================================
// Example 5: Filter Transcript Participants
// ====================================================================

console.log('🔎 EXAMPLE 5: Filtering Transcript Participants\n');

// Simulate a transcript with various attendees
const transcriptScenarios = [
  {
    name: 'Team Meeting (Both Members Present)',
    participants: ['Mark', 'Jam', 'Client Name', 'External Consultant'],
    minimumRequired: 2
  },
  {
    name: 'Client Call (One Member Present)',
    participants: ['M. Bundalian', 'Client Name', 'Another Client'],
    minimumRequired: 2
  },
  {
    name: 'Internal Standup (Both Members)',
    participants: ['Jamnilloh Bracamonte', 'Mark Jerly Bundalian', 'Team Lead'],
    minimumRequired: 1
  },
  {
    name: 'External Meeting (No Team Members)',
    participants: ['Client A', 'Client B', 'Vendor C'],
    minimumRequired: 1
  }
];

transcriptScenarios.forEach((scenario, index) => {
  console.log(`Scenario ${index + 1}: ${scenario.name}`);
  console.log(`  Participants: ${scenario.participants.join(', ')}`);
  console.log(`  Minimum required: ${scenario.minimumRequired}`);
  
  const result = filterParticipantsByTeam(
    scenario.participants,
    teamMembers,
    aiCoachMapping,
    scenario.minimumRequired
  );
  
  console.log(`  Result: ${result.shouldInclude ? '✅ INCLUDE' : '⏭️  SKIP'}`);
  console.log(`  Team members found: ${result.matchedCount}/${teamMembers.length}`);
  if (result.matches.length > 0) {
    console.log(`  Matched: ${result.matches.join(', ')}`);
  }
  console.log();
});

// ====================================================================
// Example 6: Real-World Integration Example
// ====================================================================

console.log('🚀 EXAMPLE 6: Real-World Integration\n');

console.log('Simulating transcript filtering workflow:\n');

// Mock transcript data
const mockTranscripts = [
  { id: 'transcript-001', title: 'AI Coach Sprint Planning', attendees: ['Mark', 'Jam', 'Product Owner'] },
  { id: 'transcript-002', title: 'Client Demo', attendees: ['M. Bundalian', 'Client Team'] },
  { id: 'transcript-003', title: 'Team Retrospective', attendees: ['Mark Jerly Bundalian', 'Jamnilloh Bracamonte', 'Scrum Master'] },
  { id: 'transcript-004', title: 'External Conference', attendees: ['Speaker A', 'Speaker B', 'Attendee C'] }
];

// Mock config
const mockConfig = {
  transcripts: {
    teamMembers: ['Mark Jerly Bundalian', 'Jamnilloh Bracamonte'],
    filterByTeamMembers: true,
    minimumTeamMembersRequired: 2,
    teamMappingFile: 'datasource-generator/team-name-mapping-ai-coach.json'
  }
};

// Load mapping
const mapping = loadTeamMapping(mockConfig.transcripts.teamMappingFile);

console.log(`Configuration:`);
console.log(`  Team Members: ${mockConfig.transcripts.teamMembers.join(', ')}`);
console.log(`  Minimum Required: ${mockConfig.transcripts.minimumTeamMembersRequired}`);
console.log(`  Filter Enabled: ${mockConfig.transcripts.filterByTeamMembers}\n`);

console.log('Processing transcripts:\n');

let included = 0;
let skipped = 0;

mockTranscripts.forEach(transcript => {
  const result = filterParticipantsByTeam(
    transcript.attendees,
    mockConfig.transcripts.teamMembers,
    mapping,
    mockConfig.transcripts.minimumTeamMembersRequired
  );
  
  if (result.shouldInclude) {
    console.log(`✅ DOWNLOAD: ${transcript.title}`);
    console.log(`   ID: ${transcript.id}`);
    console.log(`   Attendees: ${transcript.attendees.join(', ')}`);
    console.log(`   Team members found: ${result.matchedCount} (${result.matches.join(', ')})`);
    included++;
  } else {
    console.log(`⏭️  SKIP: ${transcript.title}`);
    console.log(`   Reason: Only ${result.matchedCount} team member(s) found, need ${mockConfig.transcripts.minimumTeamMembersRequired}`);
    skipped++;
  }
  console.log();
});

console.log('====================================================================');
console.log('SUMMARY');
console.log('====================================================================');
console.log(`Total Transcripts: ${mockTranscripts.length}`);
console.log(`✅ To Download: ${included}`);
console.log(`⏭️  To Skip: ${skipped}`);
console.log(`Efficiency: ${((skipped / mockTranscripts.length) * 100).toFixed(1)}% reduction in downloads`);
console.log('====================================================================\n');

