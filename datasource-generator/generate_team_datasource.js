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
  console.log('  node datasource-generator/generate_team_datasource.js --team <team> --report team');
  console.log('\nOptions:');
  console.log('  --team, -t     Team name (e.g., rocks, engagepath)');
  console.log('  --report, -r   Report type (must be team for this script)');
  console.log('  --help, -h     Show this help');
  console.log('\nAvailable teams:', teams.length ? teams.join(', ') : '(none found)');
  console.log('Allowed report types: team');
  console.log('\nExamples:');
  console.log('  node datasource-generator/generate_team_datasource.js --team engagepath --report team');
  console.log('  CONFIG_FILE=config.engagepath.json node datasource-generator/generate_team_datasource.js');
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
      if (args.report !== 'team') {
        throw new ConfigurationError("Invalid report type for generate_team_datasource.js. Expected 'team'", {
          reportType: args.report,
          expected: 'team'
        });
      }
      process.env.TEAM = args.team;
      process.env.REPORT_TYPE = 'team';
      console.log(`[config] Using hierarchical config: TEAM=${args.team}, REPORT_TYPE=team`);
      config = configModule.ConfigManager.loadForReportType(args.team, 'team');
    } else {
      console.log(`[config] Using legacy single-file config: ${process.env.CONFIG_FILE || 'config.json'}`);
      config = configModule.load();
    }

    // Load team name mapping using shared resolver
    nameMapping = loadTeamMapping(config, __dirname);
  } catch (error) {
    handleError(error, {
      module: 'datasource-generator',
      operation: 'init-generate-team-datasource',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
})();

class TeamDatasourceGenerator {
  constructor() {
    // Get project name from config or use projectFolder from mapping
    this.projectName = config.jira?.project || nameMapping.projectFolder || 'team';
    const { getProjectFolder } = require('../lib/project-folder');
    const pf = getProjectFolder(process.env.TEAM, config);
    this.outputDir = path.join(__dirname, 'output', pf);
    this.templatePath = path.join(__dirname, 'templates', 'team_datasource_template.py');
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output', pf);
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output', pf);
    
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
   * Get the most recent team report file
   */
  getTeamReportFile() {
    if (!fs.existsSync(this.jiraDir)) {
      console.warn(`Jira output directory not found: ${this.jiraDir}`);
      return null;
    }

    const files = fs.readdirSync(this.jiraDir)
      .filter(file => file.includes('team_report.md'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(this.jiraDir, a));
        const statB = fs.statSync(path.join(this.jiraDir, b));
        return statB.mtime - statA.mtime;
      });

    return files.length > 0 ? files[0] : null;
  }

  /**
   * Get all transcript files
   */
  getTranscriptFiles() {
    if (!fs.existsSync(this.transcriptsDir)) {
      console.warn(`Transcripts directory not found: ${this.transcriptsDir}`);
      return [];
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

    return transcriptFiles.sort();
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
   * Generate the team datasource file
   */
  generateTeamDatasource() {
    console.log(`\n=== Generating Team Datasource for ${this.projectName} ===\n`);

    // Get the team report
    const teamReportFile = this.getTeamReportFile();
    let jiraContent = '';
    
    if (teamReportFile) {
      console.log(`Found team report: ${teamReportFile}`);
      jiraContent = this.readFileContent(path.join(this.jiraDir, teamReportFile));
    } else {
      console.warn('No team report found');
    }

    // Get all transcript files
    const transcriptFiles = this.getTranscriptFiles();
    console.log(`Found ${transcriptFiles.length} transcript files`);

    // Combine all transcript content
    let transcriptContent = '';
    transcriptFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.transcriptsDir, file));
      if (content) {
        // Add file header
        transcriptContent += `\n# Transcript: ${file}\n\n`;
        transcriptContent += content;
        transcriptContent += '\n\n---\n\n';
      }
    });

    // Create the Python datasource file
    let pythonContent = '';
    
    // Add header
    pythonContent += `# Team Datasource for ${this.projectName}\n`;
    pythonContent += `# Generated on ${new Date().toLocaleString()}\n\n`;

    // Add JIRA data
    pythonContent += 'JIRA_DATA = """';
    pythonContent += jiraContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add transcript data
    pythonContent += 'TRANSCRIPT_DATA = """';
    pythonContent += transcriptContent.replace(/"""/g, '\\"""');
    pythonContent += '"""\n\n';

    // Add helper functions
    pythonContent += `def get_team_data():
    """Returns all data sources for the team."""
    return {
        "project": "${this.projectName}",
        "jira_data": JIRA_DATA,
        "transcript_data": TRANSCRIPT_DATA,
        "generated_date": "${new Date().toISOString()}"
    }

def get_jira_summary():
    """Extracts summary statistics from JIRA data."""
    import re
    
    # Extract ticket counts by status
    status_pattern = r'### ([^(]+) \\((\\d+)\\)'
    statuses = re.findall(status_pattern, JIRA_DATA)
    
    # Extract total tickets
    total_pattern = r'\\*\\*Total Tickets\\*\\*: (\\d+)'
    total_match = re.search(total_pattern, JIRA_DATA)
    total_tickets = int(total_match.group(1)) if total_match else 0
    
    return {
        "total_tickets": total_tickets,
        "by_status": {status.strip(): int(count) for status, count in statuses}
    }

def get_transcript_count():
    """Returns the number of transcripts included."""
    import re
    pattern = r'# Transcript: '
    return len(re.findall(pattern, TRANSCRIPT_DATA))

def search_content(keyword, data_type="all"):
    """Search for a keyword in the specified data type."""
    keyword_lower = keyword.lower()
    results = []
    
    if data_type in ["all", "jira"]:
        for line in JIRA_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("JIRA", line.strip()))
    
    if data_type in ["all", "transcript"]:
        for line in TRANSCRIPT_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("Transcript", line.strip()))
    
    return results
`;

    // Write the file (configurable filename)
    const { buildFilename } = require('./lib/output-filename');
    const template = (config && config.outputFilenames && config.outputFilenames.team) || null;
    const projectFolder = (typeof nameMapping?.projectFolder === 'string' && nameMapping.projectFolder) || this.projectName.toLowerCase();
    const outputFileName = buildFilename(template, {
      project: this.projectName,
      projectFolder,
      team: process.env.TEAM || '',
      reportType: 'team',
      start_date: config?.jira?.start_date,
      end_date: config?.jira?.end_date
    });
    const outputPath = path.join(this.outputDir, outputFileName);
    
    fs.writeFileSync(outputPath, pythonContent);
    console.log(`\n✓ Generated team datasource: ${outputPath}`);
    
    // Print summary
    console.log('\nSummary:');
    console.log(`- Project: ${this.projectName}`);
    console.log(`- JIRA content: ${jiraContent ? 'Included' : 'Not found'}`);
    console.log(`- Transcripts: ${transcriptFiles.length} files included`);
    console.log(`- Output file: ${outputFileName}`);
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      console.log('Starting team datasource generation...\n');

      // Step 1: Run jira:team-all
      console.log('=== Step 1: Generating JIRA team report ===');
      await this.runCommand('npm', ['run', 'jira:team-all']);

      // Step 2: Run transcripts:download
      console.log('\n=== Step 2: Downloading transcripts ===');
      await this.runCommand('npm', ['run', 'transcripts:download']);

      // Step 3: Generate the datasource file
      console.log('\n=== Step 3: Creating team datasource file ===');
      this.generateTeamDatasource();

      console.log('\n✓ Team datasource generation completed successfully!');
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-team-datasource',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new TeamDatasourceGenerator();
  generator.run();
}

module.exports = TeamDatasourceGenerator;
