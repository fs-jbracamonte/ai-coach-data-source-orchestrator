const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Jira team report generation...\n');

// Function to run a script and return a promise
function runScript(scriptName, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== ${description} ===`);
    console.log(`Running: node jira/${scriptName}`);
    
    const child = spawn('node', [path.join(__dirname, scriptName)], {
      stdio: 'inherit',
      shell: true
    });

    child.on('error', (error) => {
      console.error(`Error running ${scriptName}:`, error);
      reject(error);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`${scriptName} exited with code ${code}`);
        reject(new Error(`${scriptName} failed with exit code ${code}`));
      } else {
        console.log(`✓ ${description} completed successfully`);
        resolve();
      }
    });
  });
}

// Run team report workflow
async function runTeamReport() {
  try {
    // Step 1: Export data from Jira
    await runScript('export-to-csv.js', 'Step 1: Export data from Jira');
    
    // Step 2: Generate team report
    await runScript('team-report.js', 'Step 2: Generate team report');
    
    console.log('\n=== Team report generation completed successfully! ===');
    console.log('\nOutput locations:');
    console.log('  - CSV export: jira/data/');
    console.log('  - Team report: jira/md_output/');
    
  } catch (error) {
    console.error('\n=== Team report generation failed ===');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the workflow
runTeamReport();
