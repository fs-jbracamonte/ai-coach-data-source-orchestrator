/**
 * Demo script for global team filter functionality
 * 
 * Shows how the TRANSCRIPTS_GLOBAL_TEAM_FILTER env flag works
 * and provides examples of different scenarios
 */

const {
  loadTeamMapping,
  filterParticipantsByTeam
} = require('../lib/name-matcher');
const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');

console.log('====================================================================');
console.log('DEMO: Global Team Filter');
console.log('====================================================================\n');

// Example transcript content
const transcript1on1 = `0:00 Ethan Patrick Bandebas: Hello, ready for the one on one?
0:15 Manager Name: Yes, let's discuss your performance.
0:30 Ethan Patrick Bandebas: I've been working on the project updates.`;

const transcriptTeamMeeting = `0:00 Ethan Patrick Bandebas: Let's start the standup.
0:15 Harold Inacay: I finished the backend changes.
0:30 Reymart Militante: Frontend is ready for testing.
0:45 Manager Name: Great progress everyone.`;

// Team members from timeclock config
const teamMembers = [
  'Ethan Patrick Bandebas',
  'Harold Inacay',
  'Reymart Militante',
  'Kentward Maratas',
  'Jeffrey Milanes'
];

// Load mapping
let mapping;
try {
  mapping = loadTeamMapping('datasource-generator/team-name-mapping-timeclock.json');
} catch (error) {
  console.error('⚠️ Could not load team mapping file');
  mapping = { projectFolder: 'timeclock', mappings: {} };
}

console.log('SCENARIO 1: 1:1 Manager Review (2 participants, 1 team member)\n');
console.log('Transcript content:');
console.log('  - Ethan Patrick Bandebas (team member)');
console.log('  - Manager Name (not a team member)\n');

const participants1on1 = transcriptToMarkdown.extractParticipants(transcript1on1);
console.log(`Extracted participants: ${participants1on1.join(', ')}\n`);

const result1on1_threshold1 = filterParticipantsByTeam(participants1on1, teamMembers, mapping, 1);
console.log(`With minimumTeamMembersRequired=1 (config.1on1.json):`);
console.log(`  shouldInclude: ${result1on1_threshold1.shouldInclude}`);
console.log(`  matchedCount: ${result1on1_threshold1.matchedCount}`);
console.log(`  matches: ${result1on1_threshold1.matches.join(', ')}`);
console.log(`  ➜ RESULT: ${result1on1_threshold1.shouldInclude ? '✅ INCLUDED' : '❌ EXCLUDED'}\n`);

const result1on1_threshold2 = filterParticipantsByTeam(participants1on1, teamMembers, mapping, 2);
console.log(`With minimumTeamMembersRequired=2 (config.json base):`);
console.log(`  shouldInclude: ${result1on1_threshold2.shouldInclude}`);
console.log(`  matchedCount: ${result1on1_threshold2.matchedCount}`);
console.log(`  matches: ${result1on1_threshold2.matches.join(', ')}`);
console.log(`  ➜ RESULT: ${result1on1_threshold2.shouldInclude ? '✅ INCLUDED' : '❌ EXCLUDED'}\n`);

console.log('─'.repeat(68) + '\n');

console.log('SCENARIO 2: Team Meeting (4 participants, 3 team members)\n');
console.log('Transcript content:');
console.log('  - Ethan Patrick Bandebas (team member)');
console.log('  - Harold Inacay (team member)');
console.log('  - Reymart Militante (team member)');
console.log('  - Manager Name (not a team member)\n');

const participantsTeam = transcriptToMarkdown.extractParticipants(transcriptTeamMeeting);
console.log(`Extracted participants: ${participantsTeam.join(', ')}\n`);

const resultTeam_threshold1 = filterParticipantsByTeam(participantsTeam, teamMembers, mapping, 1);
console.log(`With minimumTeamMembersRequired=1:`);
console.log(`  shouldInclude: ${resultTeam_threshold1.shouldInclude}`);
console.log(`  matchedCount: ${resultTeam_threshold1.matchedCount}`);
console.log(`  matches: ${resultTeam_threshold1.matches.join(', ')}`);
console.log(`  ➜ RESULT: ${resultTeam_threshold1.shouldInclude ? '✅ INCLUDED' : '❌ EXCLUDED'}\n`);

const resultTeam_threshold2 = filterParticipantsByTeam(participantsTeam, teamMembers, mapping, 2);
console.log(`With minimumTeamMembersRequired=2:`);
console.log(`  shouldInclude: ${resultTeam_threshold2.shouldInclude}`);
console.log(`  matchedCount: ${resultTeam_threshold2.matchedCount}`);
console.log(`  matches: ${resultTeam_threshold2.matches.join(', ')}`);
console.log(`  ➜ RESULT: ${resultTeam_threshold2.shouldInclude ? '✅ INCLUDED' : '❌ EXCLUDED'}\n`);

console.log('─'.repeat(68) + '\n');

console.log('USAGE EXAMPLES:\n');
console.log('1. Enable global filter for timeclock 1on1 (exclude 1:1 reviews):');
console.log('   cross-env TRANSCRIPTS_GLOBAL_TEAM_FILTER=true npm run timeclock:1on1\n');
console.log('   Set minimumTeamMembersRequired: 2 in configs/timeclock/config.1on1.json\n');

console.log('2. Keep global filter OFF (default behavior):');
console.log('   npm run timeclock:1on1\n');
console.log('   Only multiProjectFolders will use team filtering\n');

console.log('3. Test with different thresholds:');
console.log('   - minimumRequired=1: Includes transcripts with ≥1 team member');
console.log('   - minimumRequired=2: Excludes 1:1s, includes team meetings\n');

console.log('====================================================================');

