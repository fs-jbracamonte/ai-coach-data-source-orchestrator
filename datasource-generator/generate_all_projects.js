const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Generate datasources for all projects in the config directory
 */
async function generateAllProjects() {
  const configDir = path.join(__dirname, '..', 'config');
  
  if (!fs.existsSync(configDir)) {
    console.error('Config directory not found:', configDir);
    process.exit(1);
  }
  
  // Get all JSON files in config directory
  const configFiles = fs.readdirSync(configDir)
    .filter(file => file.endsWith('.json'))
    .map(file => path.join(configDir, file));
  
  if (configFiles.length === 0) {
    console.error('No config files found in:', configDir);
    process.exit(1);
  }
  
  console.log(`Found ${configFiles.length} config files:`, configFiles.map(f => path.basename(f)));
  console.log('\n=== Generating Datasources for All Projects ===\n');
  
  const results = [];
  
  for (const configFile of configFiles) {
    const projectName = path.basename(configFile, '.json');
    console.log(`\n--- Processing Project: ${projectName} ---\n`);
    
    try {
      await runDatasourceGeneration(configFile);
      results.push({ project: projectName, status: 'success' });
      console.log(`✓ Successfully generated datasources for ${projectName}`);
    } catch (error) {
      results.push({ project: projectName, status: 'error', error: error.message });
      console.error(`✗ Failed to generate datasources for ${projectName}:`, error.message);
    }
  }
  
  // Summary
  console.log('\n=== Generation Summary ===\n');
  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'error');
  
  console.log(`✓ Successful: ${successful.length} projects`);
  successful.forEach(r => console.log(`  - ${r.project}`));
  
  if (failed.length > 0) {
    console.log(`\n✗ Failed: ${failed.length} projects`);
    failed.forEach(r => console.log(`  - ${r.project}: ${r.error}`));
  }
  
  console.log(`\nTotal projects processed: ${results.length}`);
  
  if (failed.length > 0) {
    process.exit(1);
  }
}

/**
 * Run datasource generation for a specific config file
 */
async function runDatasourceGeneration(configFile) {
  return new Promise((resolve, reject) => {
    console.log(`Running datasource generation with config: ${configFile}`);
    
    const child = spawn('node', ['datasource-generator/generate_datasources.js'], {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        CONFIG_FILE: configFile
      }
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Datasource generation failed with exit code ${code}`));
      }
    });
  });
}

// Run if called directly
if (require.main === module) {
  generateAllProjects().catch(console.error);
}

module.exports = generateAllProjects;
