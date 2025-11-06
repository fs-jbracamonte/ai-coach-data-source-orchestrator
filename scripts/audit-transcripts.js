#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../lib/config');
const { getProjectFolder } = require('../lib/project-folder');
const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');
const { loadTeamMapping, filterParticipantsByTeam } = require('../lib/name-matcher');

function parseArgs(argv) {
  const args = { team: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--team' || a === '-t') args.team = argv[++i];
    else if (a === '--report' || a === '-r') args.report = argv[++i];
    else if (a === '--start') args.start = argv[++i];
    else if (a === '--end') args.end = argv[++i];
  }
  return args;
}

(async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.team || !args.report) {
      console.log('Usage: node scripts/audit-transcripts.js --team <team> --report <reportType> [--start YYYY-MM-DD --end YYYY-MM-DD]');
      process.exit(1);
    }

    const config = ConfigManager.loadForReportType(args.team, args.report);
    const projectFolder = getProjectFolder(args.team, config);
    const downloadsDir = path.join(__dirname, '..', 'transcripts', 'downloads', projectFolder);

    if (!fs.existsSync(downloadsDir)) {
      console.log(`Downloads directory not found: ${downloadsDir}`);
      process.exit(0);
    }

    const teamMembers = config.transcripts?.teamMembers || [];
    const minimumRequired = config.transcripts?.minimumTeamMembersRequired || 1;
    const mappingFile = config.transcripts?.teamMappingFile || 'datasource-generator/team-name-mapping.json';

    let mapping;
    try { mapping = loadTeamMapping(mappingFile); } catch (_) { mapping = { mappings: {} }; }

    const files = fs.readdirSync(downloadsDir).filter(f => f.toLowerCase().endsWith('.txt'));
    let total = 0, ones = 0, multiperson = 0, excluded = 0;

    console.log(`\nAuditing transcripts in: ${downloadsDir}`);
    console.log('filename,participants,matched,matchedNames,wouldExclude');

    for (const file of files) {
      const full = path.join(downloadsDir, file);
      let content = '';
      try { content = fs.readFileSync(full, 'utf8'); } catch (_) { continue; }

      const participants = transcriptToMarkdown.extractParticipants(content) || [];
      const result = filterParticipantsByTeam(participants, teamMembers, mapping, minimumRequired);

      const participantCount = participants.length;
      const matchedCount = result.matchedCount || 0;
      const matchedNames = (result.matches || []).join(';');

      // Default safeguard: only exclude when total participants ≤ 2
      let wouldExclude = matchedCount < minimumRequired && participantCount <= 2;

      total++;
      if (participantCount <= 2) ones++; else multiperson++;
      if (wouldExclude) excluded++;

      console.log(`${file},${participantCount},${matchedCount},"${matchedNames}",${wouldExclude}`);
    }

    console.log('\nSummary');
    console.log(`  Total files: ${total}`);
    console.log(`  1:1 (<=2 participants): ${ones}`);
    console.log(`  Multi-person (>=3 participants): ${multiperson}`);
    console.log(`  Would exclude (under current rules): ${excluded}`);
  } catch (err) {
    console.error('Audit error:', err.message);
    process.exit(1);
  }
})();






