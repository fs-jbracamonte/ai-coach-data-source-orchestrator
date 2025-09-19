const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Jira data export pipeline...\n');

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

// Run all scripts in sequence
async function runAll() {
  try {
    // Step 1: Export data from Jira
    await runScript('export-to-csv.js', 'Step 1: Export data from Jira');
    
    // Step 2: Split by assignee
    await runScript('split-by-assignee.js', 'Step 2: Split CSV by assignee');
    
    // Step 3: Convert to markdown
    await runScript('csv-to-markdown.js', 'Step 3: Convert to markdown');
    
    console.log('\n=== All steps completed successfully! ===');
    console.log('\nOutput locations:');
    console.log('  - Main export: jira/data/');
    console.log('  - Split CSVs: jira/data/by-assignee/');
    console.log('  - Markdown reports: jira/md_output/');
    
  } catch (error) {
    console.error('\n=== Pipeline failed ===');
    console.error(error.message);
    process.exit(1);
  }
}

// Run the pipeline
runAll();
