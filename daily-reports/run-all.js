const { spawn } = require('child_process');
const path = require('path');

console.log('Daily Reports - Query and Convert\n');

// Function to run a command
function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: path.dirname(__dirname) // Run from project root
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function main() {
  try {
    // Step 1: Run the database query
    console.log('Step 1: Running database query...\n');
    await runCommand('npm', ['run', 'daily:query']);
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Step 2: Convert CSV to Markdown
    console.log('Step 2: Converting CSV files to Markdown...\n');
    await runCommand('npm', ['run', 'daily:convert']);
    
    console.log('\n' + '='.repeat(50) + '\n');
    console.log('✓ All tasks completed successfully!');
    console.log('\nCheck the following directories:');
    const team = process.env.TEAM || '';
    const { getProjectFolder } = require('../lib/project-folder');
    const cfg = require('../lib/config').load();
    const pf = getProjectFolder(team, cfg);
    console.log(`  - CSV files: daily-reports/data/${pf}/`);
    console.log(`  - Markdown files: daily-reports/md-output/${pf}/`);
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Run the main function
main();
