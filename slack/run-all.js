#!/usr/bin/env node
/**
 * Run All Slack Operations
 * 
 * Orchestrates the complete Slack pipeline:
 * 1. Download message history
 * 2. Convert to Markdown
 */

require('dotenv').config();
const { handleError } = require('../lib/error-handler');
const download = require('./download');
const convert = require('./convert-to-markdown');

async function main() {
  try {
    console.log('=== Running Slack Pipeline ===\n');

    // Step 1: Download messages
    console.log('Step 1: Downloading Slack messages...');
    await download();

    console.log('\n');

    // Step 2: Convert to Markdown
    console.log('Step 2: Converting to Markdown...');
    await convert();

    console.log('\n=== Slack Pipeline Complete ===');

  } catch (error) {
    handleError(error, {
      module: 'slack',
      operation: 'run-all',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


