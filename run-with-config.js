#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node run-with-config.js <config-file> <npm-script>');
  console.log('');
  console.log('Examples:');
  console.log('  node run-with-config.js config.project1.json daily:all');
  console.log('  node run-with-config.js config.client-xyz.json jira:export');
  console.log('  node run-with-config.js config.custom.json all');
  process.exit(1);
}

const configFile = args[0];
const npmScript = args.slice(1).join(' ');

console.log(`Using config file: ${configFile}`);
console.log(`Running: npm run ${npmScript}`);
console.log('');

// Set the CONFIG_FILE environment variable and run the npm script
const env = { ...process.env, CONFIG_FILE: configFile };
const child = spawn('npm', ['run', ...args.slice(1)], {
  env,
  stdio: 'inherit',
  shell: true
});

child.on('error', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});


