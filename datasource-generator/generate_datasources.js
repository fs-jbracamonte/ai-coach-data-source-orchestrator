const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Get config file path from environment or use default
const configPath = path.resolve(process.env.CONFIG_FILE || './config.json');
console.log(`Using config file: ${configPath}`);
const config = require(configPath);

// Load team name mapping
const nameMappingPath = path.join(__dirname, 'team-name-mapping.json');
const nameMapping = fs.existsSync(nameMappingPath) 
  ? require(nameMappingPath) 
  : { mappings: {} };

class DatasourceGenerator {
  constructor() {
    this.outputDir = path.join(__dirname, 'output');
    this.templatePath = path.join(__dirname, 'templates', 'datasource_template.py');
    this.dailyReportsDir = path.join(__dirname, '..', 'daily-reports', 'md-output');
    this.jiraDir = path.join(__dirname, '..', 'jira', 'md_output');
    this.transcriptsDir = path.join(__dirname, '..', 'transcripts', 'markdown-output');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get the short name for a team member
   */
  getShortName(fullName) {
    const shortName = nameMapping.mappings[fullName];
    if (shortName) {
      return shortName;
    }
    
    // If no mapping, use full name converted to lowercase with underscores
    return fullName.toLowerCase().replace(/\s+/g, '_');
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
    
    // Save original employee_id
    const originalEmployeeId = config.dailyReports.query.employee_id;
    
    // Set to empty to query all employees
    config.dailyReports.query.employee_id = "";
    
    // Write temporary config
    const tempConfigPath = path.join(__dirname, '..', 'temp-config.json');
    fs.writeFileSync(tempConfigPath, JSON.stringify(config, null, 2));
    
    try {
      // Run daily reports generation with temp config
      process.env.CONFIG_FILE = tempConfigPath;
      await this.runCommand('npm', ['run', 'daily:all']);
    } finally {
      // Restore original config
      config.dailyReports.query.employee_id = originalEmployeeId;
      if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
      delete process.env.CONFIG_FILE;
    }
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
    
    // Check if transcripts are already downloaded
    const downloadsDir = config.transcripts.downloadDir;
    const hasDownloads = fs.existsSync(downloadsDir) && 
                        fs.readdirSync(downloadsDir).filter(f => f.endsWith('.txt')).length > 0;
    
    if (!hasDownloads) {
      console.log('No transcript downloads found. Downloading from Google Drive...');
      await this.runCommand('npm', ['run', 'transcripts:download']);
    } else {
      console.log('Transcript downloads found. Converting to markdown...');
      // Just convert existing downloads
      await this.convertTranscriptsToMarkdown();
    }
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
    
    // Try to find file containing team member name (with underscores)
    const safeName = teamMemberName.replace(/\s+/g, '_');
    const matchingFiles = files.filter(f => 
      f.toLowerCase().includes(safeName.toLowerCase()) ||
      f.toLowerCase().includes(teamMemberName.toLowerCase().replace(/\s+/g, '_'))
    );
    
    if (matchingFiles.length > 0) {
      // Use the most recent file if multiple matches
      const filePath = path.join(directory, matchingFiles[0]);
      return fs.readFileSync(filePath, 'utf8').trim();
    }
    
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
    
    const jiraContent = this.findTeamMemberMarkdown(this.jiraDir, teamMemberName) ||
                       '# JIRA Tickets Report\n\nNo JIRA tickets found for this team member.';
    
    // Transcripts are shared across all team members
    const fathomContent = this.readMarkdownFiles(this.transcriptsDir) ||
                         '# Transcripts\n\nNo transcripts found.';
    
    // CLAAP is empty for now
    const claapContent = '';
    
    // Replace placeholders in template
    let datasource = template
      .replace('{{DAILY_CONTENT}}', dailyContent)
      .replace('{{JIRA_CONTENT}}', jiraContent)
      .replace('{{FATHOM_CONTENT}}', fathomContent)
      .replace('{{CLAAP_CONTENT}}', claapContent)
      .replace('{{TEAM_MEMBER_NAME}}', teamMemberName)
      .replace('{{GENERATED_DATE}}', new Date().toLocaleString());
    
    // Write output file
    const outputPath = path.join(this.outputDir, `datasource_${shortName}.py`);
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
      console.error('Error during generation:', error.message);
      process.exit(1);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const generator = new DatasourceGenerator();
  generator.generate().catch(console.error);
}

module.exports = DatasourceGenerator;
