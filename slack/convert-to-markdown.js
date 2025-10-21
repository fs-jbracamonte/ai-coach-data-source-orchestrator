#!/usr/bin/env node
/**
 * Convert Slack JSON to Markdown
 * 
 * Converts downloaded Slack message JSON files to readable Markdown format.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError, FileSystemError } = require('../lib/errors');
const { messagesToMarkdown } = require('./lib/format');
const { fetchUserMap } = require('./lib/api');
const { getProjectFolder } = require('../lib/project-folder');
const { sanitizeMarkdown } = require('./lib/sanitizer');

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
        'Slack configuration not found in config file.',
        { configFile: process.env.CONFIG_FILE }
      );
    }

    const {
      includeThreads = true,
      includeReactions = true,
      resolveUserNames = true,
      userMapFile
    } = config.slack;

    // Set up directories
    const projectFolder = getProjectFolder(team, config);
    const dataDir = path.join(__dirname, 'data', projectFolder);
    const outputDir = path.join(__dirname, 'md-output', projectFolder);
    const sanitizedDir = path.join(outputDir, 'sanitized');

    if (!fs.existsSync(dataDir)) {
      throw new FileSystemError(
        `Data directory not found: ${dataDir}\n` +
        'Please run "npm run slack:download" first to download message data.',
        {
          operation: 'read',
          path: dataDir,
          resolutionSteps: [
            'Run "npm run slack:download" to download messages',
            'Ensure Slack configuration is correct',
            'Check that bot token has appropriate permissions'
          ]
        }
      );
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(sanitizedDir)) {
      fs.mkdirSync(sanitizedDir, { recursive: true });
    }

    console.log(`Converting Slack JSON to Markdown`);
    console.log(`Input directory: ${dataDir}`);
    console.log(`Output directory: ${outputDir}\n`);

    // Find all channel directories
    const channelDirs = fs.readdirSync(dataDir, { withFileTypes: true })
      .filter(item => item.isDirectory())
      .map(item => item.name);

    if (channelDirs.length === 0) {
      console.warn('No channel data found.');
      console.warn('Run "npm run slack:download" first to download messages.');
      return;
    }

    let totalConverted = 0;

    // Convert each channel's JSON files
    for (const channelId of channelDirs) {
      const channelDir = path.join(dataDir, channelId);
      const jsonFiles = fs.readdirSync(channelDir)
        .filter(file => file.endsWith('.json'))
        .sort();

      console.log(`\n─── Channel: ${channelId} ───`);
      console.log(`  Found ${jsonFiles.length} JSON file(s)`);

      for (const jsonFile of jsonFiles) {
        try {
          const jsonPath = path.join(channelDir, jsonFile);
          const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

          const channelName = data.channel?.name || channelId;
          const startDate = data.dateRange?.start || 'unknown';
          const endDate = data.dateRange?.end || 'unknown';
          const messages = data.messages || [];

          if (messages.length === 0) {
            console.log(`  ⚠ ${jsonFile}: No messages`);
            continue;
          }

          // Resolve user map if enabled
          let userMap = {};
          if (resolveUserNames) {
            try {
              const projectFolder = require('../lib/project-folder').getProjectFolder(team, config);
              const defaultMapPath = path.join(__dirname, 'data', projectFolder, 'users.json');
              const mapPath = userMapFile ? path.resolve(process.cwd(), userMapFile) : defaultMapPath;
              if (fs.existsSync(mapPath)) {
                userMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')) || {};
              }
            } catch (_) {
              // ignore missing/parse errors; fall back to IDs
            }
          }

          // Convert to markdown
          const markdown = messagesToMarkdown(
            messages,
            channelName,
            startDate,
            endDate,
            {
              includeReactions,
              includeThreads,
              userMap
            }
          );

          // Apply sanitization
          const sanitization = config.slack?.sanitization || {};
          let promptDenylist = Array.isArray(sanitization.promptDenylist) ? sanitization.promptDenylist.slice() : [];
          if (sanitization.promptDenylistFile) {
            try {
              const p = path.isAbsolute(sanitization.promptDenylistFile)
                ? sanitization.promptDenylistFile
                : path.resolve(process.cwd(), sanitization.promptDenylistFile);
              if (fs.existsSync(p)) {
                const fileList = JSON.parse(fs.readFileSync(p, 'utf8'));
                if (Array.isArray(fileList)) {
                  promptDenylist.push(...fileList.filter(s => typeof s === 'string'));
                }
              }
            } catch (_) {
              // ignore file load errors and continue with inline list
            }
          }
          const sanitized = await sanitizeMarkdown(markdown, {
            redactCodeBlocks: sanitization.redactCodeBlocks !== false,
            redactInlineCode: sanitization.redactInlineCode !== false,
            maskSecrets: sanitization.maskSecrets !== false,
            promptDenylist,
            useSecretlint: true
          });

          // Generate output filename
          const outputFilename = `${channelName}_${startDate}_${endDate}.md`;
          const outputPath = path.join(outputDir, outputFilename);
          const sanitizedPath = path.join(sanitizedDir, outputFilename);

          fs.writeFileSync(outputPath, markdown);
          fs.writeFileSync(sanitizedPath, sanitized);
          console.log(`  ✓ ${jsonFile} → ${outputFilename} (${messages.length} messages) [sanitized]`);
          totalConverted++;

        } catch (error) {
          console.error(`  ✗ Error converting ${jsonFile}: ${error.message}`);
        }
      }
    }

    console.log(`\n✓ Conversion complete!`);
    console.log(`Converted ${totalConverted} file(s) to Markdown`);

  } catch (error) {
    handleError(error, {
      module: 'slack',
      operation: 'convert-to-markdown',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


