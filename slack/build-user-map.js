#!/usr/bin/env node
"use strict";

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ConfigManager } = require('../lib/config');
const { handleError } = require('../lib/error-handler');
const { ConfigurationError } = require('../lib/errors');
const { fetchUserMap } = require('./lib/api');
const { getProjectFolder } = require('../lib/project-folder');

async function main() {
  try {
    // Load configuration
    const team = process.env.TEAM;
    const reportType = process.env.REPORT_TYPE;

    let config;
    if (team && reportType) {
      console.log(`Loading config for team=${team}, reportType=${reportType}`);
      config = ConfigManager.loadForReportType(team, reportType);
    } else {
      console.log('Loading config from CONFIG_FILE');
      config = ConfigManager.load();
    }

    if (!config.slack) {
      throw new ConfigurationError('Slack configuration not found in config file.', {
        configFile: process.env.CONFIG_FILE
      });
    }

    const { botTokenEnv, userMapFile } = config.slack;
    if (!botTokenEnv) {
      throw new ConfigurationError('slack.botTokenEnv is required in configuration', {
        configFile: process.env.CONFIG_FILE
      });
    }

    const token = process.env[botTokenEnv];
    if (!token) {
      throw new ConfigurationError(`Slack bot token not found in environment variable: ${botTokenEnv}`, {
        envVar: botTokenEnv
      });
    }

    const projectFolder = getProjectFolder(team, config);
    const defaultPath = path.join(__dirname, 'data', projectFolder, 'users.json');
    const outPath = userMapFile ? path.resolve(process.cwd(), userMapFile) : defaultPath;

    console.log(`Building Slack user map → ${outPath}`);
    const debug = process.env.DEBUG === 'true';
    const map = await fetchUserMap(token, outPath, debug);

    const count = Object.keys(map).length;
    console.log(`\n✓ Wrote ${count} users to ${outPath}`);
  } catch (error) {
    handleError(error, {
      module: 'slack',
      operation: 'build-user-map',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  }
}

if (require.main === module) {
  main();
}

module.exports = main;


