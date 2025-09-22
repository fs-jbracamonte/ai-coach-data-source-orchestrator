const mysql = require('mysql2/promise');
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { createObjectCsvWriter } = require('csv-writer');
require('dotenv').config();

// Load configuration
const config = require('../config.json');

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
        reject(new Error(`SSH connection error: ${err.message}`));
      });

      // Read the private key
      let privateKey;
      try {
        privateKey = fs.readFileSync(path.resolve(process.env.SSH_PRIVATE_KEY_PATH));
      } catch (err) {
        reject(new Error(`Failed to read private key: ${err.message}`));
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
      throw new Error(`Database connection error: ${err.message}`);
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
      throw new Error('Database connection not established');
    }
    
    try {
      const [results, fields] = await this.dbConnection.execute(query, params);
      return { results, fields };
    } catch (err) {
      throw new Error(`Query execution error: ${err.message}`);
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
          client_project_id = ?
          AND er.report_template_id = ?
          AND er.report_date BETWEEN ? AND ?
          ${hasEmployeeIds ? `AND er.employee_id IN (${employeeIds.map(() => '?').join(',')})` : ''}
      ORDER BY 
          er.employee_id, er.report_date DESC
    `;
    
    // Get parameters from config
    const params = [
      config.dailyReports.query.client_project_id,
      1,  // report_template_id is always 1
      config.dailyReports.query.report_date_start,
      config.dailyReports.query.report_date_end
    ];
    
    // Add employee IDs to params if they exist
    if (hasEmployeeIds) {
      params.push(...employeeIds);
    }
    
    console.log('\nQuery Parameters:');
    console.log(`  Client Project ID: ${config.dailyReports.query.client_project_id}`);
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
    console.error('Error:', err.message);
  } finally {
    // Always close the connection
    await db.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

// Export for use in other scripts
module.exports = DatabaseConnection;
