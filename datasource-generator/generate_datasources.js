const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration (deferred)
const configModule = require('../lib/config');
const { FileSystemError, ValidationError, ConfigurationError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');
const { loadTeamMapping, getShortName: getShortNameUtil } = require('./lib/mapping-resolver');

// CLI args and hierarchical config support
function parseArgs(argv) {
  const args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--team' || a === '-t') args.team = argv[++i];
    else if (a === '--report' || a === '-r') args.report = argv[++i];
  }
  return args;
}

function getAvailableTeams() {
  try {
    const configsDir = path.join(__dirname, '..', 'configs');
    if (!fs.existsSync(configsDir)) return [];
    return fs.readdirSync(configsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== 'shared')
      .map(d => d.name);
  } catch (_) { return []; }
}

function printHelp() {
  const teams = getAvailableTeams();
  console.log('\nUsage:');
  console.log('  node datasource-generator/generate_datasources.js --team <team> --report 1on1');
  console.log('\nOptions:');
  console.log('  --team, -t     Team name (e.g., rocks, engagepath)');
  console.log('  --report, -r   Report type (must be 1on1 for this script)');
  console.log('  --help, -h     Show this help');
  console.log('\nAvailable teams:', teams.length ? teams.join(', ') : '(none found)');
  console.log('Allowed report types: 1on1');
  console.log('\nExamples:');
  console.log('  node datasource-generator/generate_datasources.js --team rocks --report 1on1');
  console.log('  CONFIG_FILE=config.rocks.json node datasource-generator/generate_datasources.js');
}

let config;
let nameMapping;
(() => {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      printHelp();
      process.exit(0);
    }

    if (args.team && args.report) {
      if (args.report !== '1on1') {
        throw new ConfigurationError("Invalid report type for generate_datasources.js. Expected '1on1'", {
          reportType: args.report,
          expected: '1on1'
        });
      }
      process.env.TEAM = args.team;
      process.env.REPORT_TYPE = '1on1';
      console.log(`[config] Using hierarchical config: TEAM=${args.team}, REPORT_TYPE=1on1`);
      config = configModule.ConfigManager.loadForReportType(args.team, '1on1');
    } else {
      console.log(`[config] Using legacy single-file config: ${process.env.CONFIG_FILE || 'config.json'}`);
      config = configModule.load();
    }

    // Load team name mapping using shared resolver
    nameMapping = loadTeamMapping(config, __dirname);
  } catch (error) {
    handleError(error, {
      module: 'datasource-generator',
      operation: 'init-generate-datasources',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
})();

class DatasourceGenerator {
  constructor() {
    // Get project folder from config
    const { getProjectFolder } = require('../lib/project-folder');
    const projectFolder = getProjectFolder(process.env.TEAM, config) || nameMapping.projectFolder || 'default';
    this.outputDir = path.join(__dirname, 'output', projectFolder);
    this.templatePath = path.join(__dirname, 'templates', 'datasource_template.py');
    this.dailyReportsDir = path.join(__dirname, '..', 'daily-reports', 'md-output', projectFolder);
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output', projectFolder);
    this.jiraAssigneeDir = path.join(this.jiraDir, 'by-assignee');
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output', projectFolder);
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get the short name for a team member
   * 
   * Supports both mapping formats:
   * - Old format: "Team Member Name": "shortname"
   * - New format: "Team Member Name": { shortName: "shortname", fullName: "...", aliases: [...] }
   * 
   * @param {string} fullName - The full name of the team member
   * @returns {string} The short name identifier (lowercase with underscores)
   * 
   * @example
   * // With new format mapping:
   * getShortName("Mark Jerly Bundalian") // Returns: "mark"
   * 
   * // With old format mapping:
   * getShortName("John Doe") // Returns: "john"
   * 
   * // Without mapping:
   * getShortName("Jane Smith") // Returns: "jane_smith"
   */
  getShortName(fullName) {
    return getShortNameUtil(fullName, nameMapping);
  }

  /**
   * Run a command and wait for it to complete
   */
  async runCommand(command, args = []) {
    return new Promise((resolve, reject) => {
      console.log(`Running: ${command} ${args.join(' ')}`);
      const child = spawn(command, args, {
        stdio: 'inherit',
        shell: true,
        cwd: path.join(__dirname, '..')
      });

      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Step 1: Generate daily reports for all team members
   */
  async generateDailyReports() {
    console.log('\n=== Generating Daily Reports ===\n');
    
    // Use the configured employee IDs from config.json
    // The daily reports query will handle the employee filtering
    await this.runCommand('npm', ['run', 'daily:all']);
  }

  /**
   * Step 2: Generate JIRA reports for team members
   */
  async generateJiraReports() {
    console.log('\n=== Generating JIRA Reports ===\n');
    await this.runCommand('npm', ['run', 'jira:all']);
  }

  /**
   * Step 3: Generate transcript reports
   */
  async generateTranscriptReports() {
    console.log('\n=== Generating Transcript Reports ===\n');
    // Always use the unified transcripts pipeline which handles per-project scoping,
    // date filtering, and (optionally) team-member filtering.
    await this.runCommand('npm', ['run', 'transcripts:download']);
  }

  /**
   * Convert downloaded transcripts to markdown
   */
  async convertTranscriptsToMarkdown() {
    const transcriptToMarkdown = require('../transcripts/transcript-to-markdown');
    const downloadsDir = path.join(__dirname, '..', 'transcripts', 'downloads');
    const outputDir = path.join(__dirname, '..', 'transcripts', 'markdown-output');
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const txtFiles = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.txt'));
    
    for (const file of txtFiles) {
      const filePath = path.join(downloadsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const markdown = transcriptToMarkdown.convertToMarkdown(content, file);
      
      const mdFilename = file.replace('.txt', '.md');
      const mdPath = path.join(outputDir, mdFilename);
      fs.writeFileSync(mdPath, markdown);
      
      console.log(`  ✓ Converted: ${file} → ${mdFilename}`);
    }
  }

  /**
   * Read all markdown files from a directory and combine them
   */
  readMarkdownFiles(directory, filePattern = null) {
    if (!fs.existsSync(directory)) {
      console.warn(`Directory not found: ${directory}`);
      return '';
    }
    
    let files = fs.readdirSync(directory).filter(f => f.endsWith('.md'));
    
    if (filePattern) {
      files = files.filter(f => f.includes(filePattern));
    }
    
    const contents = [];
    for (const file of files.sort()) {
      const filePath = path.join(directory, file);
      const content = fs.readFileSync(filePath, 'utf8');
      contents.push(content.trim());
    }
    
    return contents.join('\n\n');
  }

  /**
   * Find markdown file for a specific team member
   */
  findTeamMemberMarkdown(directory, teamMemberName) {
    if (!fs.existsSync(directory)) {
      console.warn(`Directory not found: ${directory}`);
      return '';
    }

    const files = fs.readdirSync(directory).filter(f => f.endsWith('.md'));

    // Helpers
    const normalize = (s) => String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const toWordRegex = (phrase) => {
      const p = String(phrase || '').replace(/[^a-z0-9]+/gi, ' ').trim();
      if (!p) return null;
      // Word boundary for the whole phrase (spaces allowed inside)
      return new RegExp(`(^|[^A-Za-z0-9])${p.replace(/\s+/g, '[^A-Za-z0-9]+')}($|[^A-Za-z0-9])`, 'i');
    };

    // Build candidate variations
    const nameVariations = new Set();
    nameVariations.add(teamMemberName);
    nameVariations.add(teamMemberName.replace(/\s+/g, '_'));
    nameVariations.add(teamMemberName.replace(/\s+/g, '-'));
    nameVariations.add(teamMemberName.replace(/\s+/g, ' '));

    const mapping = nameMapping.mappings[teamMemberName];
    if (mapping && typeof mapping === 'object') {
      if (Array.isArray(mapping.aliases)) mapping.aliases.forEach(a => nameVariations.add(a));
      if (mapping.fullName) nameVariations.add(mapping.fullName);
    }

    const nameParts = teamMemberName.trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const rawLast = nameParts[nameParts.length - 1] || '';
    const suffixes = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
    const lastName = (suffixes.has(rawLast.toLowerCase()) && nameParts.length >= 2)
      ? nameParts[nameParts.length - 2]
      : rawLast;
    if (firstName && lastName) {
      nameVariations.add(`${firstName}-${lastName}`);
      nameVariations.add(`${firstName}_${lastName}`);
      nameVariations.add(`${firstName} ${lastName}`);
      if (nameParts.length === 3) {
        const middleName = nameParts[1];
        nameVariations.add(`${firstName} ${middleName}-${lastName}`);
        nameVariations.add(`${firstName}-${middleName}-${lastName}`);
        nameVariations.add(`${firstName}_${middleName}_${lastName}`);
      }
    }

    // Filter out too-short variations (avoid false positives like "Rey")
    const filteredVariations = Array.from(nameVariations).filter(v => (v || '').replace(/[^A-Za-z]/g, '').length >= 4);
    const variationRegexes = filteredVariations
      .map(v => toWordRegex(v))
      .filter(Boolean);

    // Content-based match: prefer files whose content's Employee/Assignee lines match
    const matchesContent = (content) => {
      const lines = String(content || '').split(/\r?\n/);
      const headers = lines.filter(line => /\*\*(Employee|Assignee)\*\*:\s*|^(Employee|Assignee):\s*/i.test(line));
      const candidates = headers.map(line => {
        const m = line.match(/\*\*(Employee|Assignee)\*\*:\s*(.+)$/i) || line.match(/^(Employee|Assignee):\s*(.+)$/i);
        return m ? m[2].trim() : '';
      }).filter(Boolean);
      if (candidates.length === 0) return false;

      const candidateNorms = candidates.map(c => normalize(c).replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, '').replace(/\s+/g, ' ').trim());
      const targetFull = normalize(teamMemberName).replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, '').replace(/\s+/g, ' ').trim();
      const targetFirst = normalize(firstName);
      const targetLast = normalize(lastName);

      for (const cand of candidateNorms) {
        // Exact full name check
        if (toWordRegex(teamMemberName)?.test(cand)) return true;
        // First+last check (both must appear as words)
        const firstOk = targetFirst && new RegExp(`(^|[^a-z0-9])${targetFirst}($|[^a-z0-9])`).test(cand);
        const lastOk = targetLast && new RegExp(`(^|[^a-z0-9])${targetLast}($|[^a-z0-9])`).test(cand);
        if (firstOk && lastOk) return true;
        // Any long alias phrase match
        for (const rx of variationRegexes) {
          if (rx.test(cand)) return true;
        }
      }
      return false;
    };

    // 1) Try content verification
    for (const file of files) {
      const p = path.join(directory, file);
      let text = '';
      try { text = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
      if (matchesContent(text)) {
        return text.trim();
      }
    }

    // 2) Fallback: filename-based, require both first and last name as word-bounded tokens
    const firstRx = firstName ? new RegExp(`(^|[^A-Za-z0-9])${firstName}($|[^A-Za-z0-9])`, 'i') : null;
    const lastRx = lastName ? new RegExp(`(^|[^A-Za-z0-9])${lastName}($|[^A-Za-z0-9])`, 'i') : null;
    const filenameCandidate = files.find(f => {
      const lower = f;
      const firstOk = firstRx ? firstRx.test(lower) : true;
      const lastOk = lastRx ? lastRx.test(lower) : true;
      return firstOk && lastOk;
    });
    if (filenameCandidate) {
      const p = path.join(directory, filenameCandidate);
      try { return fs.readFileSync(p, 'utf8').trim(); } catch (_) {}
    }

    console.log(`  No matching files found for ${teamMemberName} in ${directory}`);
    return '';
  }

  /**
   * Generate datasource file for a team member
   */
  async generateDatasourceForMember(teamMemberName) {
    console.log(`\nGenerating datasource for: ${teamMemberName}`);
    
    // Read template
    const template = fs.readFileSync(this.templatePath, 'utf8');
    
    // Get short name
    const shortName = this.getShortName(teamMemberName);
    
    // Collect data for this team member
    const dailyContent = this.findTeamMemberMarkdown(this.dailyReportsDir, teamMemberName) || 
                        '# Daily Reports\n\nNo daily reports found for this team member.';
    
    const jiraContent = this.findTeamMemberMarkdown(this.jiraAssigneeDir, teamMemberName) ||
                       this.findTeamMemberMarkdown(this.jiraDir, teamMemberName) ||
                       '# JIRA Tickets Report\n\nNo JIRA tickets found for this team member.';
    
    // Transcripts are shared across all team members
    const fathomContent = this.readMarkdownFiles(this.transcriptsDir) ||
                         '# Transcripts\n\nNo transcripts found.';
    
    // Replace placeholders in template
    let datasource = template
      .replace('{{DAILY_CONTENT}}', dailyContent)
      .replace('{{JIRA_CONTENT}}', jiraContent)
      .replace('{{FATHOM_CONTENT}}', fathomContent)
      .replace('{{TEAM_MEMBER_NAME}}', teamMemberName)
      .replace('{{GENERATED_DATE}}', new Date().toLocaleString());
    
    // Write output file (configurable filename)
    const { buildFilename } = require('./lib/output-filename');
    const filenameTemplate = (config && config.outputFilenames && config.outputFilenames.oneOnOne) || null;
    const projectFolder = (typeof nameMapping?.projectFolder === 'string' && nameMapping.projectFolder) || 'team';
    const outputFileName = buildFilename(filenameTemplate, {
      project: config.jira?.project || projectFolder,
      projectFolder,
      team: process.env.TEAM || '',
      reportType: '1on1',
      start_date: config?.jira?.start_date,
      end_date: config?.jira?.end_date,
      memberShort: shortName,
      memberFull: teamMemberName
    });
    const outputPath = path.join(this.outputDir, outputFileName);
    fs.writeFileSync(outputPath, datasource);
    
    console.log(`  ✓ Created: ${outputPath}`);
    
    return outputPath;
  }

  /**
   * Main generation process
   */
  async generate() {
    try {
      console.log('Starting datasource generation process...\n');
      
      // Get team members from config
      const teamMembers = config.jira.team_members || [];
      
      if (teamMembers.length === 0) {
        console.error('No team members configured in config.json');
        return;
      }
      
      console.log(`Found ${teamMembers.length} team members:`, teamMembers);
      
      // Step 1: Generate all reports
      await this.generateDailyReports();
      await this.generateJiraReports();
      await this.generateTranscriptReports();
      
      // Step 2: Generate datasource files for each team member
      console.log('\n=== Generating Datasource Files ===\n');
      
      const generatedFiles = [];
      for (const member of teamMembers) {
        const outputFile = await this.generateDatasourceForMember(member);
        generatedFiles.push(outputFile);
      }
      
      console.log('\n=== Generation Complete ===\n');
      console.log(`Generated ${generatedFiles.length} datasource files:`);
      generatedFiles.forEach(f => console.log(`  - ${path.basename(f)}`));
      
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-datasources',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DatasourceGenerator();
  generator.generate().catch(console.error);
}

module.exports = DatasourceGenerator;
