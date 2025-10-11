const mysql = require('mysql2/promise');
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { createObjectCsvWriter } = require('csv-writer');
require('dotenv').config();

// Load configuration
const config = require('../lib/config').load();
const { DatabaseConnectionError, FileSystemError } = require('../lib/errors');
const { handleError } = require('../lib/error-handler');

class DatabaseConnection {
  constructor() {
    this.sshClient = null;
    this.dbConnection = null;
    this.server = null;
  }

  async createSSHTunnel() {
    return new Promise((resolve, reject) => {
      const sshClient = new Client();
      
      sshClient.on('ready', () => {
        console.log('SSH connection established');
        
        // Create a local server to handle the tunnel
        const server = net.createServer((sock) => {
          sshClient.forwardOut(
            sock.remoteAddress,
            sock.remotePort,
            process.env.DB_HOST,
            parseInt(process.env.DB_PORT),
            (err, stream) => {
              if (err) {
                sock.end();
                return console.error('Forward error:', err);
              }
              sock.pipe(stream).pipe(sock);
            }
          );
        });
        
        // Listen on a random port
        server.listen(0, '127.0.0.1', () => {
          const localPort = server.address().port;
          this.server = server;
          this.sshClient = sshClient;
          
          console.log(`SSH tunnel established on local port ${localPort}`);
          resolve(localPort);
        });
        
        server.on('error', (err) => {
          reject(new Error(`Server error: ${err.message}`));
        });
      });

      sshClient.on('error', (err) => {
        reject(new DatabaseConnectionError(`SSH connection error: ${err.message}`, {
          host: process.env.SSH_HOST,
          port: process.env.SSH_PORT,
          username: process.env.SSH_USERNAME,
          resolutionSteps: [
            'Verify SSH credentials in .env file',
            'Check that SSH_HOST and SSH_PORT are correct',
            'Ensure the remote host is accessible',
            'Verify your SSH username is correct',
            'Check firewall settings'
          ]
        }));
      });

      // Read the private key
      let privateKey;
      try {
        privateKey = fs.readFileSync(path.resolve(process.env.SSH_PRIVATE_KEY_PATH));
      } catch (err) {
        reject(new FileSystemError(`Failed to read private key: ${err.message}`, {
          operation: 'read',
          path: process.env.SSH_PRIVATE_KEY_PATH,
          resolutionSteps: [
            'Verify SSH_PRIVATE_KEY_PATH in .env file is correct',
            'Check that the private key file exists',
            'Ensure you have read permissions for the key file',
            'Verify the path is absolute or relative to project root'
          ]
        }));
        return;
      }

      // Connect via SSH
      sshClient.connect({
        host: process.env.SSH_HOST,
        port: parseInt(process.env.SSH_PORT),
        username: process.env.SSH_USERNAME,
        privateKey: privateKey,
        passphrase: process.env.SSH_PASSPHRASE || undefined
      });
    });
  }

  async connectToDatabase(localPort) {
    try {
      // Connect to localhost because SSH tunnel forwards the connection
      // from localhost:localPort to config.database.host:config.database.port
      this.dbConnection = await mysql.createConnection({
        host: '127.0.0.1',
        port: localPort,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE
      });
      
      console.log('Connected to MariaDB database');
      return this.dbConnection;
    } catch (err) {
      throw new DatabaseConnectionError(`Database connection error: ${err.message}`, {
        host: '127.0.0.1',
        port: localPort,
        user: process.env.DB_USER,
        database: process.env.DB_DATABASE,
        resolutionSteps: [
          'Verify database credentials in .env file (DB_USER, DB_PASSWORD, DB_DATABASE)',
          'Ensure the SSH tunnel is established',
          'Check that the remote database is running',
          'Verify database host and port in .env',
          'Check database user permissions'
        ]
      });
    }
  }

  async connect() {
    try {
      console.log('Establishing SSH tunnel...');
      const localPort = await this.createSSHTunnel();
      
      console.log('Connecting to database...');
      await this.connectToDatabase(localPort);
      
      return this.dbConnection;
    } catch (err) {
      await this.close();
      throw err;
    }
  }

  async executeQuery(query, params = []) {
    if (!this.dbConnection) {
      throw new DatabaseConnectionError('Database connection not established', {
        resolutionSteps: [
          'Ensure connect() is called before executing queries',
          'Check that the SSH tunnel is active',
          'Verify database credentials'
        ]
      });
    }
    
    try {
      const [results, fields] = await this.dbConnection.execute(query, params);
      return { results, fields };
    } catch (err) {
      throw new DatabaseConnectionError(`Query execution error: ${err.message}`, {
        query: query.substring(0, 200) + '...', // First 200 chars
        params: params.length,
        resolutionSteps: [
          'Check SQL query syntax',
          'Verify table and column names',
          'Ensure query parameters match placeholders',
          'Check database user permissions for the query'
        ]
      });
    }
  }

  async close() {
    if (this.dbConnection) {
      await this.dbConnection.end();
      console.log('Database connection closed');
    }
    
    if (this.server) {
      this.server.close();
      console.log('Local tunnel server closed');
    }
    
    if (this.sshClient) {
      this.sshClient.end();
      console.log('SSH connection closed');
    }
  }
}

// Utility function to save results as CSV
async function saveResultsAsCSV(results, filename) {
  if (!results || results.length === 0) {
    console.log('No results to save');
    return;
  }

  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Created data directory');
  }

  // Generate filename with timestamp if not provided
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const csvFilename = filename || `query-results-${timestamp}.csv`;
  const filepath = path.join(dataDir, csvFilename);

  // Get headers from the first row
  const headers = Object.keys(results[0]).map(key => ({
    id: key,
    title: key
  }));

  // Create CSV writer
  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: headers
  });

  // Write the data
  await csvWriter.writeRecords(results);
  console.log(`\nResults saved to: ${filepath}`);
  console.log(`Total rows exported: ${results.length}`);
}

// Example usage
async function main() {
  const db = new DatabaseConnection();
  
  try {
    // Connect to the database
    await db.connect();
    
    // Build the employee reports query using config parameters
    // Handle employee_id as array, comma-separated string, or single value
    let employeeIds = [];
    const employeeIdConfig = config.dailyReports.query.employee_id;
    
    if (employeeIdConfig) {
      if (Array.isArray(employeeIdConfig)) {
        employeeIds = employeeIdConfig.filter(id => id !== '');
      } else if (typeof employeeIdConfig === 'string' && employeeIdConfig.trim() !== '') {
        // Handle comma-separated string
        employeeIds = employeeIdConfig.split(',').map(id => id.trim()).filter(id => id !== '');
      }
    }
    
    const hasEmployeeIds = employeeIds.length > 0;

    // Build optional per-employee project overrides map from config
    const overridesConfig = (config.dailyReports.query.employeeProjectOverrides || []).map(o => ({
      employee_id: typeof o.employee_id === 'string' ? parseInt(o.employee_id, 10) : o.employee_id,
      client_project_ids: Array.isArray(o.client_project_ids) ? o.client_project_ids : [o.client_project_ids]
    }));

    const hasOverrides = overridesConfig.length > 0;

    // Construct WHERE clause dynamically to support overrides
    const baseProjectId = config.dailyReports.query.client_project_id;
    let whereClauses = [
      'er.report_template_id = ?',
      'er.report_date BETWEEN ? AND ?'
    ];

    // Employee filter if provided
    if (hasEmployeeIds) {
      whereClauses.push(`er.employee_id IN (${employeeIds.map(() => '?').join(',')})`);
    }

    // Project filter: either simple equality or (base OR any overrides per employee)
    let projectFilterSql = 'er.client_project_id = ?';
    const params = [
      1, // report_template_id fixed
      config.dailyReports.query.report_date_start,
      config.dailyReports.query.report_date_end
    ];

    if (hasEmployeeIds) {
      params.push(...employeeIds);
    }

    if (!hasOverrides) {
      // Simple case: single project
      params.unshift(baseProjectId); // place before report_template_id
    } else {
      // Advanced case: allow base project or per-employee overrides
      // Build an OR group like:
      // (er.client_project_id = ? OR (er.employee_id = ? AND er.client_project_id IN (?,...)) OR ...)
      const orParts = ['er.client_project_id = ?'];
      let overrideParams = [baseProjectId];

      for (const ov of overridesConfig) {
        if (!ov || !ov.employee_id || !ov.client_project_ids || ov.client_project_ids.length === 0) continue;
        orParts.push(`(er.employee_id = ? AND er.client_project_id IN (${ov.client_project_ids.map(() => '?').join(',')}))`);
        overrideParams.push(ov.employee_id, ...ov.client_project_ids);
      }

      projectFilterSql = `(${orParts.join(' OR ')})`;
      // Insert project/override params at the beginning so order matches placeholders
      params.unshift(...overrideParams);
    }

    // Final SQL
    const query = `
      SELECT 
          e.id AS employee_id, 
          e.first_name AS employee_first_name,
          e.last_name AS employee_last_name,
          er.content,
          er.todo,
          er.report_date,
          rt.name AS report_template_name,
          cp.id AS client_project_id,
          cp.project_name AS client_project_name
      FROM 
          employee_reports AS er
      INNER JOIN 
          employees AS e ON er.employee_id = e.id
      INNER JOIN 
          report_templates AS rt ON er.report_template_id = rt.id
      INNER JOIN  
          client_projects AS cp ON er.client_project_id = cp.id
      WHERE 
          ${projectFilterSql}
          AND ${whereClauses.join(' AND ')}
      ORDER BY 
          er.employee_id, er.report_date DESC
    `;
    
    console.log('\nQuery Parameters:');
    console.log(`  Client Project ID: ${config.dailyReports.query.client_project_id}`);
    if (hasOverrides) {
      console.log(`  Overrides:`);
      overridesConfig.forEach(ov => {
        console.log(`    - employee_id ${ov.employee_id} -> project_ids [${ov.client_project_ids.join(', ')}]`);
      });
    }
    console.log(`  Employee ID(s): ${hasEmployeeIds ? employeeIds.join(', ') : 'ALL EMPLOYEES'}`);
    console.log(`  Date Range: ${config.dailyReports.query.report_date_start} to ${config.dailyReports.query.report_date_end}`);
    console.log(`  Report Template ID: 1 (fixed)`);
    
    console.log('\nExecuting employee reports query...');
    
    const { results } = await db.executeQuery(query, params);
    console.log(`\nQuery returned ${results.length} rows`);
    
    if (results.length > 0) {
      if (hasEmployeeIds && employeeIds.length === 1) {
        // Single employee - save as before
        const firstName = results[0].employee_first_name;
        const lastName = results[0].employee_last_name;
        
        // Generate filename with employee name and date range
        const filename = `daily-reports-${firstName}-${lastName}-${config.dailyReports.query.report_date_start}-to-${config.dailyReports.query.report_date_end}.csv`;
        
        // Save all results to CSV
        await saveResultsAsCSV(results, filename);
      } else {
        // Multiple employees - group by employee_id and save separately
        const employeeGroups = {};
        
        // Group results by employee_id
        for (const row of results) {
          const empId = row.employee_id;
          if (!employeeGroups[empId]) {
            employeeGroups[empId] = {
              firstName: row.employee_first_name,
              lastName: row.employee_last_name,
              rows: []
            };
          }
          employeeGroups[empId].rows.push(row);
        }
        
        console.log(`\nProcessing reports for ${Object.keys(employeeGroups).length} employees...`);
        
        // Save each employee's data to a separate CSV
        for (const [empId, empData] of Object.entries(employeeGroups)) {
          const filename = `daily-reports-${empData.firstName}-${empData.lastName}-${config.dailyReports.query.report_date_start}-to-${config.dailyReports.query.report_date_end}.csv`;
          await saveResultsAsCSV(empData.rows, filename);
          console.log(`  - ${empData.firstName} ${empData.lastName}: ${empData.rows.length} entries`);
        }
        
        console.log(`\n✓ Created ${Object.keys(employeeGroups).length} CSV files`);
      }
    } else {
      console.log('No results found for the specified criteria');
    }
    
  } catch (err) {
    handleError(err, {
      module: 'daily-reports',
      operation: 'db-query',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  } finally {
    // Always close the connection
    await db.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(err => {
    handleError(err, {
      module: 'daily-reports',
      operation: 'db-query',
      configFile: process.env.CONFIG_FILE || 'config.json'
    });
  });
}

// Export for use in other scripts
module.exports = DatabaseConnection;
