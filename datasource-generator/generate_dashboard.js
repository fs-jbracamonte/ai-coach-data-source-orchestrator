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
    
    // Check if date filtering is enabled
    const dateFilter = config.transcripts?.dateFilter;
    const filterEnabled = dateFilter?.enabled === true;
    const startDate = dateFilter?.startDate;
    const endDate = dateFilter?.endDate;

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

    let transcriptContent = '';
    transcriptFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.transcriptsDir, file));
      if (content) {
        transcriptContent += `\n# Transcript: ${file}\n\n`;
        transcriptContent += content;
        transcriptContent += '\n\n---\n\n';
      }
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
    console.log(`- Slack: ${slackFiles.length} files included`);
    console.log(`- Output file: ${outputFileName}`);
    
    // Token estimates (roughly 4 chars per token)
    function estimateTokens(charCount) { return Math.ceil((charCount || 0) / 4); }
    const jiraChars = jiraContent.length;
    const dailyChars = dailyReportContent.length;
    const transcriptChars = transcriptContent.length;
    const slackChars = slackContent.length;
    const jiraTokens = estimateTokens(jiraChars);
    const dailyTokens = estimateTokens(dailyChars);
    const transcriptTokens = estimateTokens(transcriptChars);
    const slackTokens = estimateTokens(slackChars);
    console.log('- Token estimates (approx):');
    console.log(`  JIRA_DATA: ${jiraChars} chars ≈ ${jiraTokens} tokens`);
    console.log(`  DAILY_REPORTS_DATA: ${dailyChars} chars ≈ ${dailyTokens} tokens`);
    console.log(`  TRANSCRIPT_DATA: ${transcriptChars} chars ≈ ${transcriptTokens} tokens`);
    console.log(`  SLACK_DATA: ${slackChars} chars ≈ ${slackTokens} tokens`);
    console.log(`  Total: ≈ ${jiraTokens + dailyTokens + transcriptTokens + slackTokens} tokens`);
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
      if (config.slack) {
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
      this.generateDashboard();

      console.log('\n✓ Dashboard generation completed successfully!');
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-dashboard',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DashboardGenerator();
  generator.run();
}

module.exports = DashboardGenerator;


