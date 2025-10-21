#!/usr/bin/env node
/**
 * List Slack Channels
 * 
 * Lists all available channels for the configured Slack bot token.
 * Useful for discovering channel IDs and names to add to config.
 */

require('dotenv').config();
const { ConfigManager } = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError, NetworkError } = require('../lib/errors');
const { fetchAllChannels } = require('./lib/api');

async function main() {
  try {
    // Load configuration
    const team = process.env.TEAM;
    const reportType = process.env.REPORT_TYPE;
    
    let config;
    if (team && reportType) {
      console.log(`Loading config for team=${team}, reportType=${reportType}\n`);
      config = ConfigManager.loadForReportType(team, reportType);
    } else {
      console.log('Loading config from CONFIG_FILE\n');
      config = ConfigManager.load();
    }

    // Validate Slack configuration
    if (!config.slack) {
      throw new ConfigurationError(
        'Slack configuration not found in config file.\n' +
        'Please add a "slack" section with botTokenEnv and channels.',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    const { botTokenEnv, types = 'public_channel,private_channel' } = config.slack;
    
    if (!botTokenEnv) {
      throw new ConfigurationError(
        'slack.botTokenEnv is required in configuration',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    // Get token from environment
    const token = process.env[botTokenEnv];
    if (!token) {
      throw new ConfigurationError(
        `Slack bot token not found in environment variable: ${botTokenEnv}\n` +
        `Please set ${botTokenEnv} in your .env file or environment.`,
        {
          envVar: botTokenEnv,
          resolutionSteps: [
            `Add ${botTokenEnv}=xoxb-your-token-here to your .env file`,
            'Ensure the token is a valid Slack bot token (starts with xoxb-)',
            'Verify the bot has appropriate permissions'
          ]
        }
      );
    }

    console.log('Fetching channels from Slack API...\n');

    const debug = process.env.DEBUG === 'true';
    const channels = await fetchAllChannels(token, types, true, debug);

    if (channels.length === 0) {
      console.log('No channels found.');
      return;
    }

    console.log(`Found ${channels.length} channels:\n`);
    console.log('─'.repeat(80));

    channels.forEach(channel => {
      const name = channel.name || channel.name_normalized || '';
      const id = channel.id || '';
      const purpose = channel.purpose?.value || '';
      const topic = channel.topic?.value || '';
      const description = purpose || topic;
      
      console.log(`${name} (${id})`);
      if (description) {
        console.log(`  ${description}`);
      }
      console.log('');
    });

    console.log('─'.repeat(80));
    console.log(`\nTotal: ${channels.length} channels`);
    console.log('\nTo use a channel, add its name or ID to config.slack.channels:');
    console.log('  "channels": ["channel-name", "C01234567"]');

  } catch (error) {
    handleError(error, {
      module: 'slack',
      operation: 'list-channels',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


