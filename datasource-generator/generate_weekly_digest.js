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
  console.log('  node datasource-generator/generate_weekly_digest.js --team <team> --report weekly');
  console.log('\nOptions:');
  console.log('  --team, -t     Team name (e.g., rocks, engagepath)');
  console.log('  --report, -r   Report type (must be weekly for this script)');
  console.log('  --help, -h     Show this help');
  console.log('\nAvailable teams:', teams.length ? teams.join(', ') : '(none found)');
  console.log('Allowed report types: weekly');
  console.log('\nExamples:');
  console.log('  node datasource-generator/generate_weekly_digest.js --team rocks --report weekly');
  console.log('  CONFIG_FILE=config.rocks.json node datasource-generator/generate_weekly_digest.js');
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
      if (args.report !== 'weekly') {
        throw new ConfigurationError("Invalid report type for generate_weekly_digest.js. Expected 'weekly'", {
          reportType: args.report,
          expected: 'weekly'
        });
      }
      process.env.TEAM = args.team;
      process.env.REPORT_TYPE = 'weekly';
      console.log(`[config] Using hierarchical config: TEAM=${args.team}, REPORT_TYPE=weekly`);
      config = configModule.ConfigManager.loadForReportType(args.team, 'weekly');
    } else {
      console.log(`[config] Using legacy single-file config: ${process.env.CONFIG_FILE || 'config.json'}`);
      config = configModule.load();
    }

    // Load team name mapping using shared resolver
    nameMapping = loadTeamMapping(config, __dirname);
  } catch (error) {
    handleError(error, {
      module: 'datasource-generator',
      operation: 'init-generate-weekly-digest',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
    process.exit(1);
  }
})();

class WeeklyDigestGenerator {
  constructor() {
    // Get project name from config or use projectFolder from mapping
    this.projectName = config.jira?.project || nameMapping.projectFolder || 'team';
    this.outputDir = path.join(__dirname, 'output');
    this.templatePath = path.join(__dirname, 'templates', 'team_datasource_template.py');
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output');
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output');
    this.dailyReportsDir = path.join(__dirname, '..', 'daily-reports', 'md-output');
    
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
   * Get all individual assignee markdown files from by-assignee directory
   */
  getIndividualAssigneeFiles() {
    const byAssigneeDir = path.join(this.jiraDir, 'by-assignee');
    
    if (!fs.existsSync(byAssigneeDir)) {
      console.warn(`By-assignee directory not found: ${byAssigneeDir}`);
      return [];
    }

    return fs.readdirSync(byAssigneeDir)
      .filter(file => file.endsWith('.md'))
      .sort();
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
   * Generate the weekly digest datasource file
   */
  generateWeeklyDigest() {
    console.log(`\n=== Generating Weekly Digest for ${this.projectName} ===\n`);

    // Get all individual assignee files
    const assigneeFiles = this.getIndividualAssigneeFiles();
    let jiraContent = '';
    
    if (assigneeFiles.length > 0) {
      console.log(`Found ${assigneeFiles.length} individual assignee reports`);
      
      // Create a header for the combined JIRA content
      jiraContent = `# JIRA Reports - ${this.projectName}\n\n`;
      jiraContent += `**Project**: ${this.projectName}\n`;
      jiraContent += `**Date Range**: ${config.jira?.start_date || 'N/A'} to ${config.jira?.end_date || 'N/A'}\n`;
      jiraContent += `**Generated**: ${new Date().toLocaleString()}\n\n`;
      
      // Combine all individual assignee reports
      assigneeFiles.forEach((file, index) => {
        const content = this.readFileContent(path.join(this.jiraDir, 'by-assignee', file));
        if (content) {
          // Extract assignee name from filename (format: ROCKS_2025-09-22_to_2025-09-26_FirstName_LastName.md)
          const assigneeName = file.replace(/^.*?_to_.*?_(.+)\.md$/, '$1').replace(/_/g, ' ');
          
          jiraContent += `## ${assigneeName}\n\n`;
          jiraContent += content;
          if (index < assigneeFiles.length - 1) {
            jiraContent += '\n\n---\n\n';
          }
        }
      });
    } else {
      console.warn('No individual assignee reports found');
    }

    // Get all daily report files
    const dailyReportFiles = this.getDailyReportFiles();
    console.log(`Found ${dailyReportFiles.length} daily report files`);

    // Combine all daily report content
    let dailyReportContent = '';
    dailyReportFiles.forEach(file => {
      const content = this.readFileContent(path.join(this.dailyReportsDir, file));
      if (content) {
        // Add file header
        dailyReportContent += `\n# Daily Report: ${file}\n\n`;
        dailyReportContent += content;
        dailyReportContent += '\n\n---\n\n';
      }
    });

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
    pythonContent += `# Weekly Digest Datasource for ${this.projectName}\n`;
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

    // Add helper functions
    pythonContent += `def get_weekly_digest_data():
    """Returns all data sources for the weekly digest."""
    return {
        "project": "${this.projectName}",
        "jira_data": JIRA_DATA,
        "daily_reports_data": DAILY_REPORTS_DATA,
        "transcript_data": TRANSCRIPT_DATA,
        "generated_date": "${new Date().toISOString()}"
    }

def get_jira_summary():
    """Extracts summary statistics from JIRA data."""
    import re
    
    # Count total tickets across all assignees
    ticket_pattern = r'\\[([A-Z]+-\\d+)\\]'
    all_tickets = set(re.findall(ticket_pattern, JIRA_DATA))
    
    # Count tickets by status
    status_counts = {}
    current_status = None
    
    for line in JIRA_DATA.split('\\n'):
        # Look for status headers like "### In Progress (1)"
        status_match = re.match(r'### ([^(]+) \\((\\d+)\\)', line)
        if status_match:
            current_status = status_match.group(1).strip()
            if current_status not in status_counts:
                status_counts[current_status] = 0
        # Count tickets under each status
        elif current_status and re.match(r'\\[([A-Z]+-\\d+)\\]', line):
            status_counts[current_status] += 1
    
    # Count tickets by assignee
    assignee_counts = {}
    current_assignee = None
    
    for line in JIRA_DATA.split('\\n'):
        # Look for assignee headers
        if line.startswith('## ') and not line.startswith('## Tickets by Status'):
            current_assignee = line.replace('## ', '').strip()
            assignee_counts[current_assignee] = 0
        # Count tickets for current assignee
        elif current_assignee and re.match(r'\\[([A-Z]+-\\d+)\\]', line):
            assignee_counts[current_assignee] += 1
    
    return {
        "total_tickets": len(all_tickets),
        "by_status": status_counts,
        "by_assignee": assignee_counts
    }

def get_daily_reports_summary():
    """Returns summary of daily reports included."""
    import re
    
    # Count unique employees
    employee_pattern = r'\\*\\*Employee\\*\\*: ([^\\n]+)'
    employees = set(re.findall(employee_pattern, DAILY_REPORTS_DATA))
    
    # Count report entries
    report_pattern = r'# Daily Report: '
    report_count = len(re.findall(report_pattern, DAILY_REPORTS_DATA))
    
    # Count dates
    date_pattern = r'## (\\d{4}-\\d{2}-\\d{2})'
    dates = set(re.findall(date_pattern, DAILY_REPORTS_DATA))
    
    return {
        "total_reports": report_count,
        "unique_employees": len(employees),
        "employee_names": list(employees),
        "date_range": {
            "start": min(dates) if dates else None,
            "end": max(dates) if dates else None,
            "total_days": len(dates)
        }
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
    
    if data_type in ["all", "daily"]:
        for line in DAILY_REPORTS_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("Daily Report", line.strip()))
    
    if data_type in ["all", "transcript"]:
        for line in TRANSCRIPT_DATA.split('\\n'):
            if keyword_lower in line.lower():
                results.append(("Transcript", line.strip()))
    
    return results

def get_employee_reports(employee_name):
    """Get all daily report entries for a specific employee."""
    import re
    
    entries = []
    current_entry = None
    in_employee_section = False
    
    for line in DAILY_REPORTS_DATA.split('\\n'):
        if '**Employee**:' in line and employee_name.lower() in line.lower():
            in_employee_section = True
            current_entry = {"employee": line, "content": []}
        elif in_employee_section:
            if line.startswith('## ') or line.startswith('# Daily Report:'):
                if current_entry and current_entry["content"]:
                    entries.append(current_entry)
                in_employee_section = False
                current_entry = None
            elif current_entry:
                current_entry["content"].append(line)
    
    if current_entry and current_entry["content"]:
        entries.append(current_entry)
    
    return entries
`;

    // Write the file
    const outputFileName = `datasource_weekly_${this.projectName.toLowerCase()}.py`;
    const outputPath = path.join(this.outputDir, outputFileName);
    
    fs.writeFileSync(outputPath, pythonContent);
    console.log(`\n✓ Generated weekly digest datasource: ${outputPath}`);
    
    // Print summary
    console.log('\nSummary:');
    console.log(`- Project: ${this.projectName}`);
    console.log(`- JIRA individual reports: ${assigneeFiles.length} assignees included`);
    console.log(`- Daily reports: ${dailyReportFiles.length} files included`);
    console.log(`- Transcripts: ${transcriptFiles.length} files included`);
    console.log(`- Output file: ${outputFileName}`);
  }

  /**
   * Main execution flow
   */
  async run() {
    try {
      console.log('Starting weekly digest generation...\n');

      // Step 1: Run daily reports
      console.log('=== Step 1: Generating daily reports ===');
      await this.runCommand('npm', ['run', 'daily:all']);

      // Step 2: Run jira:all (individual reports)
      console.log('\n=== Step 2: Generating individual JIRA reports ===');
      await this.runCommand('npm', ['run', 'jira:all']);

      // Step 3: Run transcripts:download
      console.log('\n=== Step 3: Downloading transcripts ===');
      await this.runCommand('npm', ['run', 'transcripts:download']);

      // Step 4: Generate the datasource file
      console.log('\n=== Step 4: Creating weekly digest datasource file ===');
      this.generateWeeklyDigest();

      console.log('\n✓ Weekly digest generation completed successfully!');
    } catch (error) {
      handleError(error, {
        module: 'datasource-generator',
        operation: 'generate-weekly-digest',
        configFile: process.env.CONFIG_FILE || 'config.json'
      });
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new WeeklyDigestGenerator();
  generator.run();
}

module.exports = WeeklyDigestGenerator;
