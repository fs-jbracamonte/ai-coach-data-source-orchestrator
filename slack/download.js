#!/usr/bin/env node
/**
 * Download Slack Message History
 * 
 * Downloads message history for configured channels with date filtering.
 * Optionally fetches thread replies.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError, FileSystemError } = require('../lib/errors');
const { fetchAllChannels, fetchChannelHistory, fetchThreadReplies, dateToUnixTimestamp } = require('./lib/api');
const { getProjectFolder } = require('../lib/project-folder');

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
        'Please add a "slack" section with botTokenEnv, channels, and dateFilter.',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    const {
      botTokenEnv,
      channels: configuredChannels = [],
      limit = 15,
      includeThreads = true,
      dateFilter
    } = config.slack;
    
    // Validate required fields
    if (!botTokenEnv) {
      throw new ConfigurationError(
        'slack.botTokenEnv is required in configuration',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    if (!configuredChannels || configuredChannels.length === 0) {
      throw new ConfigurationError(
        'slack.channels is required and must contain at least one channel',
        {
          configFile: process.env.CONFIG_FILE,
          resolutionSteps: [
            'Run "npm run slack:list" to see available channels',
            'Add channel IDs or names to config.slack.channels array'
          ]
        }
      );
    }

    if (!dateFilter || !dateFilter.start_date || !dateFilter.end_date) {
      throw new ConfigurationError(
        'slack.dateFilter with start_date and end_date is required',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    const { start_date, end_date } = dateFilter;

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
            'Verify the bot has appropriate permissions (channels:history, channels:read)'
          ]
        }
      );
    }

    // Set up output directory
    const projectFolder = getProjectFolder(team, config);
    const outputDir = path.join(__dirname, 'data', projectFolder);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    console.log(`Downloading Slack messages for ${configuredChannels.length} channels`);
    console.log(`Date range: ${start_date} to ${end_date}`);
    console.log(`Output directory: ${outputDir}\n`);

    const debug = process.env.DEBUG === 'true';

    // Fetch all available channels first to resolve names to IDs
    console.log('Fetching channel list...');
    const allChannels = await fetchAllChannels(token, 'public_channel,private_channel', true, debug);
    console.log(`Found ${allChannels.length} channels accessible to bot\n`);

    // Resolve configured channels to IDs
    const channelMap = new Map();
    allChannels.forEach(ch => {
      channelMap.set(ch.id, ch);
      if (ch.name) {
        channelMap.set(ch.name, ch);
      }
      if (ch.name_normalized) {
        channelMap.set(ch.name_normalized, ch);
      }
    });

    const resolvedChannels = [];
    for (const channelIdentifier of configuredChannels) {
      const channel = channelMap.get(channelIdentifier);
      if (!channel) {
        console.warn(`⚠ Channel not found or not accessible: ${channelIdentifier}`);
        console.warn('  Run "npm run slack:list" to see available channels');
        continue;
      }
      resolvedChannels.push(channel);
    }

    if (resolvedChannels.length === 0) {
      throw new ConfigurationError(
        'No valid channels found. Check that configured channels exist and bot has access.',
        {
          configuredChannels,
          resolutionSteps: [
            'Run "npm run slack:list" to see available channels',
            'Verify channel names or IDs in config.slack.channels',
            'Ensure bot has been added to private channels'
          ]
        }
      );
    }

    // Download messages for each channel
    for (const channel of resolvedChannels) {
      const channelName = channel.name || channel.id;
      console.log(`\n─── Channel: ${channelName} (${channel.id}) ───`);

      try {
        // Fetch message history
        const messages = await fetchChannelHistory(
          token,
          channel.id,
          start_date,
          end_date,
          limit,
          debug
        );

        console.log(`  Downloaded ${messages.length} messages`);

        // Fetch thread replies if enabled
        if (includeThreads) {
          const threadsToFetch = messages.filter(m => m.thread_ts === m.ts && m.reply_count > 0);
          
          if (threadsToFetch.length > 0) {
            console.log(`  Fetching ${threadsToFetch.length} threads...`);
            
            const oldest = dateToUnixTimestamp(start_date, true);
            const latest = dateToUnixTimestamp(end_date, false);

            for (const parentMessage of threadsToFetch) {
              const replies = await fetchThreadReplies(
                token,
                channel.id,
                parentMessage.thread_ts,
                oldest,
                latest,
                debug
              );
              
              // Attach replies to parent message
              parentMessage.replies = replies;
            }
            
            console.log(`  ✓ Fetched thread replies`);
          }
        }

        // Save to file
        const channelDir = path.join(outputDir, channel.id);
        if (!fs.existsSync(channelDir)) {
          fs.mkdirSync(channelDir, { recursive: true });
        }

        const filename = `history_${start_date}_${end_date}.json`;
        const filepath = path.join(channelDir, filename);

        const data = {
          channel: {
            id: channel.id,
            name: channel.name,
            purpose: channel.purpose?.value || '',
            topic: channel.topic?.value || ''
          },
          dateRange: {
            start: start_date,
            end: end_date
          },
          messageCount: messages.length,
          includeThreads,
          downloadedAt: new Date().toISOString(),
          messages
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`  ✓ Saved to: ${filepath}`);

      } catch (error) {
        console.error(`  ✗ Error downloading channel ${channelName}: ${error.message}`);
        if (debug) {
          console.error(error);
        }
      }
    }

    console.log('\n✓ Download complete!');
    console.log(`Downloaded ${resolvedChannels.length} of ${configuredChannels.length} configured channels`);

  } catch (error) {
    handleError(error, {
      module: 'slack',
      operation: 'download',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


