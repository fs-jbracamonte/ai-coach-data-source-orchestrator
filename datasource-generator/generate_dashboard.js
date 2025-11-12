require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Load configuration (deferred)
const configModule = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError } = require('../lib/errors');
const { loadTeamMapping } = require('./lib/mapping-resolver');

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
  console.log('  node datasource-generator/generate_dashboard.js --team <team> --report dashboard');
  console.log('\nOptions:');
  console.log('  --team, -t     Team name (e.g., aicoach, engagepath)');
  console.log('  --report, -r   Report type (dashboard)');
  console.log('  --help, -h     Show this help');
  console.log('\nAvailable teams:', teams.length ? teams.join(', ') : '(none found)');
  console.log('Allowed report types: dashboard');
  console.log('\nExamples:');
  console.log('  node datasource-generator/generate_dashboard.js --team engagepath --report dashboard');
  console.log('  npm run engagepath:dashboard');
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
      if (args.report !== 'dashboard') {
        throw new ConfigurationError("Invalid report type for generate_dashboard.js. Expected 'dashboard'", {
          reportType: args.report,
          expected: 'dashboard'
        });
      }
      process.env.TEAM = args.team;
      process.env.REPORT_TYPE = 'dashboard';
      console.log(`[config] Using hierarchical config: TEAM=${args.team}, REPORT_TYPE=dashboard`);
      config = configModule.ConfigManager.loadForReportType(args.team, 'dashboard');
    } else {
      console.log(`[config] Using legacy single-file config: ${process.env.CONFIG_FILE || 'config.json'}`);
      config = configModule.load();
    }

    // Load team name mapping using shared resolver
    nameMapping = loadTeamMapping(config, __dirname);
  } catch (error) {
    handleError(error, {
      module: 'datasource-generator',
      operation: 'init-generate-dashboard',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
})();

class DashboardGenerator {
  constructor() {
    // Get project name from config or use projectFolder from mapping
    this.projectName = config.jira?.project || nameMapping.projectFolder || 'team';
    const { getProjectFolder } = require('../lib/project-folder');
    const pf = getProjectFolder(process.env.TEAM, config);
    this.outputDir = path.join(__dirname, 'output', pf);
    const pf2 = pf;
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output', pf2);
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output', pf2);
    this.dailyReportsDir = path.join(__dirname, '..', 'daily-reports', 'md-output', pf2);
    this.slackDir = path.join(__dirname, '..', 'slack', 'md-output', pf2, 'sanitized');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
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

      child.on('error', (error) => {
        console.error(`Error running ${command}:`, error);
        reject(error);
      });

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`${command} exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the most recent team report or epic tree file
   */
  getJiraFile() {
    if (!fs.existsSync(this.jiraDir)) {
      console.warn(`Jira output directory not found: ${this.jiraDir}`);
      return null;
    }

    // Prefer epic tree with changelog -> epic tree -> team report
    const files = fs.readdirSync(this.jiraDir)
      .filter(file => 
        file.startsWith('epic_tree_with_changelog_') || 
        file.startsWith('epic_tree_') || 
        file.includes('team_report.md')
      )
      .sort((a, b) => {
        // Prioritize enriched epic tree
        if (a.startsWith('epic_tree_with_changelog_') && !b.startsWith('epic_tree_with_changelog_')) return -1;
        if (b.startsWith('epic_tree_with_changelog_') && !a.startsWith('epic_tree_with_changelog_')) return 1;
        // Then regular epic tree
        if (a.startsWith('epic_tree_') && !b.startsWith('epic_tree_')) return -1;
        if (b.startsWith('epic_tree_') && !a.startsWith('epic_tree_')) return 1;
        // Sort by mtime
        const statA = fs.statSync(path.join(this.jiraDir, a));
        const statB = fs.statSync(path.join(this.jiraDir, b));
        return statB.mtime - statA.mtime;
      });

    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get all daily report files
   */
  getDailyReportFiles() {
    if (!fs.existsSync(this.dailyReportsDir)) {
      console.warn(`Daily reports directory not found: ${this.dailyReportsDir}`);
      return [];
    }

    return fs.readdirSync(this.dailyReportsDir)
      .filter(file => file.endsWith('.md'))
      .sort();
  }

  /**
   * Get all transcript files (with optional date filtering)
   */
  getTranscriptFiles() {
    if (!fs.existsSync(this.transcriptsDir)) {
      console.warn(`Transcripts directory not found: ${this.transcriptsDir}`);
      return [];
    }

    const { parseTranscriptDateFromFilename, isWithinRange } = require('./lib/date-range-filter');
    
    // Check if date filtering is enabled with fallback to Slack/JIRA dates
    const tf = config.transcripts?.dateFilter;
    const slackDF = config.slack?.dateFilter;
    const jiraDF = { start_date: config.jira?.start_date, end_date: config.jira?.end_date };

    let startDate = tf?.startDate || tf?.start_date;
    let endDate = tf?.endDate || tf?.end_date;
    let filterEnabled = tf?.enabled === true;

    if (!filterEnabled && slackDF?.start_date && slackDF?.end_date) {
      console.log('  Using Slack dateFilter as fallback for transcripts');
      filterEnabled = true;
      startDate = slackDF.start_date;
      endDate = slackDF.end_date;
    } else if (!filterEnabled && jiraDF.start_date && jiraDF.end_date) {
      console.log('  Using JIRA date range as fallback for transcripts');
      filterEnabled = true;
      startDate = jiraDF.start_date;
      endDate = jiraDF.end_date;
    }

    // Check if there are subdirectories (when organizeByFolder is true)
    const items = fs.readdirSync(this.transcriptsDir);
    const transcriptFiles = [];

    items.forEach(item => {
      const itemPath = path.join(this.transcriptsDir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        // If it's a directory, get all .md files from it
        const files = fs.readdirSync(itemPath)
          .filter(file => file.endsWith('.md'))
          .map(file => path.join(item, file));
        transcriptFiles.push(...files);
      } else if (item.endsWith('.md')) {
        // If it's a file, add it directly
        transcriptFiles.push(item);
      }
    });

    // Filter by date if enabled
    if (filterEnabled && startDate && endDate) {
      const filtered = transcriptFiles.filter(file => {
        const date = parseTranscriptDateFromFilename(file);
        if (!date) {
          console.warn(`  ⚠ Cannot parse date from transcript filename, excluding: ${file}`);
          return false;
        }
        return isWithinRange(date, startDate, endDate);
      });
      
      const excluded = transcriptFiles.length - filtered.length;
      if (excluded > 0) {
        console.log(`  Filtered transcripts: ${filtered.length} in range, ${excluded} excluded`);
      }
      
      return filtered.sort();
    }

    return transcriptFiles.sort();
  }

  /**
   * Get all Slack markdown files
   */
  getSlackFiles() {
    if (!fs.existsSync(this.slackDir)) {
      console.warn(`Slack sanitized directory not found: ${this.slackDir}`);
      return [];
    }

    return fs.readdirSync(this.slackDir)
      .filter(file => file.endsWith('.md'))
      .sort();
  }

  /**
   * Read file content or return empty string
   */
  readFileContent(filePath) {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.warn(`Could not read file ${filePath}:`, error.message);
      return '';
    }
  }

  /**
   * Get day of week name from ISO date string (UTC)
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {string} - Day name (Monday-Sunday) or 'Unknown'
   */
  getDayOfWeek(dateStr) {
    if (!dateStr) return 'Unknown';
    const d = new Date(dateStr + 'T00:00:00Z');
    if (isNaN(d.getTime())) return 'Unknown';
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return names[d.getUTCDay()];
  }

  /**
   * Resolve dashboard week bounds and normalize to Monday..Sunday frame.
   * Prefers transcripts.dateFilter, then slack.dateFilter, then JIRA start/end.
   * Returns { weekStartIso, weekEndIso } or {null,null} if not resolvable.
   */
  getDashboardWeekBounds() {
    const tf = config.transcripts?.dateFilter;
    const slackDF = config.slack?.dateFilter;
    const jiraDF = { start: config.jira?.start_date, end: config.jira?.end_date };

    let start = tf?.startDate || tf?.start_date || slackDF?.start_date || jiraDF.start || null;
    let end = tf?.endDate || tf?.end_date || slackDF?.end_date || jiraDF.end || null;
    if (!start || !end) return { weekStartIso: null, weekEndIso: null };

    // Normalize to the Monday of the start date, and Sunday at the end of that week
    const startDate = new Date(start + 'T00:00:00Z');
    const day = startDate.getUTCDay(); // 0=Sun..6=Sat
    const diffToMonday = (day + 6) % 7; // Monday=0
    const monday = new Date(startDate);
    monday.setUTCDate(startDate.getUTCDate() - diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const fmt = (x) => x.toISOString().slice(0,10);
    return { weekStartIso: fmt(monday), weekEndIso: fmt(sunday) };
  }

  /**
   * Build a stable Monday..Sunday frame [{day,date,transcripts:[]} x7]
   */
  buildWeeklyFrame(weekStartIso) {
    if (!weekStartIso) return [];
    const frame = [];
    const monday = new Date(weekStartIso + 'T00:00:00Z');
    const namesMonFirst = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setUTCDate(monday.getUTCDate() + i);
      const iso = d.toISOString().slice(0,10);
      frame.push({ day: namesMonFirst[i], date: iso, transcripts: [] });
    }
    return frame;
  }

  /**
   * Group transcripts by day of week
   * Returns: {byDay: Array, unknownDate: Array}
   * byDay format: [{day: 'Monday', date: '2025-09-15', transcripts: ['content1', ...]}, ...]
   */
  groupTranscriptsByDay(transcriptFiles) {
    const { parseTranscriptDateFromFilename } = require('./lib/date-range-filter');
    
    // Get week bounds and build stable frame
    const { weekStartIso } = this.getDashboardWeekBounds();
    const frame = this.buildWeeklyFrame(weekStartIso);
    const unknownDate = [];
    
    // Build a map for quick lookup
    const dateMap = new Map();
    frame.forEach(entry => {
      dateMap.set(entry.date, entry);
    });
    
    transcriptFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.transcriptsDir, file));
      if (!content) return;
      
      const date = parseTranscriptDateFromFilename(file);
      
      if (!date) {
        // Cannot parse date - add to unknown
        unknownDate.push({ filename: file, content });
        return;
      }
      
      // Add to the appropriate day if it exists in the week frame
      if (dateMap.has(date)) {
        dateMap.get(date).transcripts.push(content);
      }
    });
    
    return { byDay: frame, unknownDate };
  }

  /**
   * Convert plain Jira issue keys like [ABC-123] into clickable links
   */
  linkifyIssueKeys(content) {
    try {
      const host = config?.jira?.host ? String(config.jira.host) : '';
      if (!host) return content;
      const jiraHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const base = `https://${jiraHost}`;
      return content.replace(/(^|[^!])\[([A-Z][A-Z0-9]+-\d+)\](?!\()/g, (m, prefix, key) => `${prefix}[${key}](${base}/browse/${key})`);
    } catch (_) {
      return content;
    }
  }

  /**
   * Generate the dashboard datasource file
   */
  generateDashboard() {
    console.log(`\n=== Generating Dashboard for ${this.projectName} ===\n`);

    // Get Jira content
    const jiraFile = this.getJiraFile();
    let jiraContent = '';
    if (jiraFile) {
      console.log(`Found Jira file: ${jiraFile}`);
      jiraContent = this.readFileContent(path.join(this.jiraDir, jiraFile));
      jiraContent = this.linkifyIssueKeys(jiraContent);
    } else {
      console.warn('No JIRA file found');
    }

    // Get all daily report files
    const dailyReportFiles = this.getDailyReportFiles();
    console.log(`Found ${dailyReportFiles.length} daily report files`);

    // Combine all daily report content (with date range trimming)
    const { trimDailyMarkdownToRange } = require('./lib/date-range-filter');
    const startDate = config.dailyReports?.query?.report_date_start;
    const endDate = config.dailyReports?.query?.report_date_end;
    
    let dailyReportContent = '';
    let includedCount = 0;
    let excludedCount = 0;
    
    dailyReportFiles.forEach(file => {
      let content = this.readFileContent(path.join(this.dailyReportsDir, file));
      
      // Trim to date range if configured
      if (content && startDate && endDate) {
        content = trimDailyMarkdownToRange(content, startDate, endDate);
      }
      
      if (content) {
        dailyReportContent += content;
        dailyReportContent += '\n\n---\n\n';
        includedCount++;
      } else {
        excludedCount++;
      }
    });
    
    if (excludedCount > 0) {
      console.log(`  Filtered daily reports: ${includedCount} with in-range content, ${excludedCount} excluded`);
    }

    // Get all transcript files
    const transcriptFiles = this.getTranscriptFiles();
    console.log(`Found ${transcriptFiles.length} transcript files`);

    // Group transcripts by day for structured access
    const { byDay: transcriptsByDay, unknownDate: transcriptsUnknownDate } = 
      this.groupTranscriptsByDay(transcriptFiles);

    // Warn about unparseable dates
    if (transcriptsUnknownDate.length > 0) {
      console.warn(`⚠ Found ${transcriptsUnknownDate.length} transcript(s) with unparseable dates:`);
      transcriptsUnknownDate.forEach(t => console.warn(`  - ${t.filename}`));
    }

    // Build combined transcript content (existing format)
    let transcriptContent = '';
    transcriptFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.transcriptsDir, file));
      if (content) {
        transcriptContent += `\n# Transcript: ${file}\n\n`;
        transcriptContent += content;
        transcriptContent += '\n\n---\n\n';
      }
    });

    // Build per-day transcript content (new format - native Python)
    let transcriptByDayContent = JSON.stringify(transcriptsByDay, null, 2);

    // Build unknown date transcript content (new format)
    let transcriptUnknownDateContent = '';
    transcriptsUnknownDate.forEach(t => {
      transcriptUnknownDateContent += `\n# Transcript: ${t.filename}\n\n`;
      transcriptUnknownDateContent += t.content;
      transcriptUnknownDateContent += '\n\n---\n\n';
    });

    // Get all Slack files (optional)
    const slackFiles = this.getSlackFiles();
    console.log(`Found ${slackFiles.length} Slack files`);

    let slackContent = '';
    slackFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.slackDir, file));
      if (content) {
        slackContent += `\n# Slack: ${file}\n\n`;
        slackContent += content;
        slackContent += '\n\n---\n\n';
      }
    });

    // Create the Python datasource file
    let pythonContent = '';
    
    // Add header
    pythonContent += `# Dashboard Datasource for ${this.projectName}\n`;
    pythonContent += `# Generated on ${new Date().toLocaleString()}\n\n`;

    // Add JIRA data
    pythonContent += 'JIRA_DATA = """';
    pythonContent += jiraContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add daily reports data
    pythonContent += 'DAILY_REPORTS_DATA = """';
    pythonContent += dailyReportContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add transcript data
    pythonContent += 'TRANSCRIPT_DATA = """';
    pythonContent += transcriptContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add per-day transcript data (NEW - native Python list)
    pythonContent += '# Transcripts grouped by day of week (Monday-Sunday)\n';
    pythonContent += '# Format: [{"day": "Monday", "date": "YYYY-MM-DD", "transcripts": ["...", ...]}, ...]\n';
    pythonContent += 'TRANSCRIPT_DATA_BY_DAY = ';
    pythonContent += transcriptByDayContent;
    pythonContent += '\n\n';

    // Add unknown date transcripts (NEW)
    pythonContent += '# Transcripts with unparseable dates\n';
    pythonContent += 'TRANSCRIPTS_WITH_UNKNOWN_DATE = """';
    pythonContent += transcriptUnknownDateContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add Slack data
    pythonContent += 'SLACK_DATA = """';
    pythonContent += slackContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Write the file (configurable filename)
    const { buildFilename } = require('./lib/output-filename');
    const template = (config && config.outputFilenames && config.outputFilenames.dashboard) || null;
    const projectFolder = (typeof nameMapping?.projectFolder === 'string' && nameMapping.projectFolder) || this.projectName.toLowerCase();
    const outputFileName = buildFilename(template, {
      project: this.projectName,
      projectFolder,
      team: process.env.TEAM || '',
      reportType: 'dashboard',
      start_date: config?.jira?.start_date || config?.slack?.dateFilter?.start_date,
      end_date: config?.jira?.end_date || config?.slack?.dateFilter?.end_date
    });
    const outputPath = path.join(this.outputDir, outputFileName);
    
    fs.writeFileSync(outputPath, pythonContent);
    console.log(`\n✓ Generated dashboard datasource: ${outputPath}`);
    
    // Print summary
    console.log('\nSummary:');
    console.log(`- Project: ${this.projectName}`);
    console.log(`- JIRA content: ${jiraFile ? 'Included' : 'None'}`);
    console.log(`- Daily reports: ${dailyReportFiles.length} files included`);
    console.log(`- Transcripts: ${transcriptFiles.length} files included`);
    console.log(`  - By day: ${transcriptsByDay.length} days with transcripts`);
    console.log(`  - Unknown dates: ${transcriptsUnknownDate.length} files`);
    console.log(`- Slack: ${slackFiles.length} files included`);
    console.log(`- Output file: ${outputFileName}`);
    
    // Token estimates (roughly 4 chars per token)
    function estimateTokens(charCount) { return Math.ceil((charCount || 0) / 4); }
    const jiraChars = jiraContent.length;
    const dailyChars = dailyReportContent.length;
    const transcriptChars = transcriptContent.length;
    const transcriptByDayChars = transcriptByDayContent.length;
    const transcriptUnknownChars = transcriptUnknownDateContent.length;
    const slackChars = slackContent.length;
    const jiraTokens = estimateTokens(jiraChars);
    const dailyTokens = estimateTokens(dailyChars);
    const transcriptTokens = estimateTokens(transcriptChars);
    const transcriptByDayTokens = estimateTokens(transcriptByDayChars);
    const transcriptUnknownTokens = estimateTokens(transcriptUnknownChars);
    const slackTokens = estimateTokens(slackChars);
    console.log('- Token estimates (approx):');
    console.log(`  JIRA_DATA: ${jiraChars} chars ≈ ${jiraTokens} tokens`);
    console.log(`  DAILY_REPORTS_DATA: ${dailyChars} chars ≈ ${dailyTokens} tokens`);
    console.log(`  TRANSCRIPT_DATA: ${transcriptChars} chars ≈ ${transcriptTokens} tokens`);
    console.log(`  TRANSCRIPT_DATA_BY_DAY: ${transcriptByDayChars} chars ≈ ${transcriptByDayTokens} tokens`);
    console.log(`  TRANSCRIPTS_WITH_UNKNOWN_DATE: ${transcriptUnknownChars} chars ≈ ${transcriptUnknownTokens} tokens`);
    console.log(`  SLACK_DATA: ${slackChars} chars ≈ ${slackTokens} tokens`);
    console.log(`  Total: ≈ ${jiraTokens + dailyTokens + transcriptTokens + transcriptByDayTokens + transcriptUnknownTokens + slackTokens} tokens`);
    
    return outputPath;
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      console.log('Starting dashboard generation...\n');

      // Step 1: Run daily reports
      console.log('=== Step 1: Generating daily reports ===');
      await this.runCommand('npm', ['run', 'daily:all']);

      // Step 2: Generate JIRA team report and epic tree
      console.log('\n=== Step 2: Generating JIRA reports ===');
      await this.runCommand('npm', ['run', 'jira:team-all']);
      await this.runCommand('npm', ['run', 'jira:epic-tree']);
      await this.runCommand('node', ['jira/append-changelog-to-epic-tree.js']);

      // Step 3: Run transcripts:download
      console.log('\n=== Step 3: Downloading transcripts ===');
      await this.runCommand('npm', ['run', 'transcripts:download']);

      // Step 4: Run Slack download (if configured)
      if (config.slack && config.slack.botTokenEnv && config.slack.channels && config.slack.dateFilter) {
        console.log('\n=== Step 4: Downloading Slack data ===');
        try {
          await this.runCommand('npm', ['run', 'slack:all']);
        } catch (error) {
          console.warn('⚠ Slack download failed (continuing without Slack data):', error.message);
        }
      } else {
        console.log('\n=== Step 4: Slack not configured, skipping ===');
      }

      // Step 5: Generate the datasource file
      console.log('\n=== Step 5: Creating dashboard datasource file ===');
      const outputPath = this.generateDashboard();

      // Step 6: Extract Jira data and upload to Vercel Blob
      console.log('\n=== Step 6: Upload to Vercel Blob (if enabled) ===');
      await this.uploadToVercelBlob(outputPath);

      console.log('\n✓ Dashboard generation completed successfully!');
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-dashboard',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }

  /**
   * Upload markdown outputs and extracted Jira data to Vercel Blob
   */
  async uploadToVercelBlob(datasourcePath) {
    try {
      const { uploadAllData } = require('../lib/vercel-blob-uploader');
      const { extractAndSave } = require('../lib/jira-data-extractor');
      const { getProjectFolder } = require('../lib/project-folder');
      
      const projectFolder = getProjectFolder(process.env.TEAM, config);
      
      // Extract Jira data from datasource.py
      const jiraDataFile = extractAndSave(
        datasourcePath,
        this.jiraDir,
        config,
        'dashboard'
      );
      
      // Upload all data
      await uploadAllData({
        projectFolder,
        config,
        transcriptsDir: this.transcriptsDir,
        dailyReportsDir: this.dailyReportsDir,
        slackDir: this.slackDir,
        jiraDataFile
      });
    } catch (error) {
      console.warn('⚠ Vercel Blob upload failed (non-fatal):', error.message);
      console.warn('Continuing without upload...');
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DashboardGenerator();
  generator.run();
}

module.exports = DashboardGenerator;


