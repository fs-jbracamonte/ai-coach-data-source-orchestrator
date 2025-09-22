# Daily Reports - Remote MariaDB Query Tool

This tool allows you to connect to a remote MariaDB database through an SSH tunnel and execute queries.

## Setup Instructions

### 1. Install Required Dependencies

Navigate to the project root directory and run:

```bash
cd D:\repo\data-source-orchestrator
npm install
```

This will install all dependencies including `mysql2` and `ssh2` needed for database connections.

### 2. Configure SSH and Database Connection

1. Copy the example files from the main folder:
   ```bash
   copy ../example.env ../.env
   copy ../config.example.jsonc ../config.json
   ```

2. Edit `../.env` with your SSH and database connection details:
   - **SSH Configuration:**
     - `host`: Your SSH server hostname or IP
     - `port`: SSH port (usually 22)
     - `username`: Your SSH username
     - `privateKeyPath`: Path to your SSH private key file
     - `passphrase`: Private key passphrase (leave empty if none)
   
   - **Database Configuration:**
     - `host`: Database host (**Important**: Use "localhost" or "127.0.0.1" when tunneling through SSH)
     - `port`: Database port (default MariaDB port is 3306)
     - `user`: Database username
     - `password`: Database password
     - `database`: Database name to connect to
     
     **Note**: The database host should be "localhost" because you're connecting through the SSH tunnel, not directly to the remote database server.
   
   - **Query Parameters:**
     - `client_project_id`: The client project ID to filter reports (required)
     - `employee_id`: The employee ID to filter reports (optional - leave empty to query all employees)
     - `report_date_start`: Start date for the report range (YYYY-MM-DD format)
     - `report_date_end`: End date for the report range (YYYY-MM-DD format)

### 3. Set Up SSH Key

1. Create a directory for your SSH key:
   ```bash
   mkdir ssh-keys
   ```

2. Copy your SSH private key to the `ssh-keys` directory:
   ```bash
   # For PEM files (common with AWS EC2, etc.)
   copy C:\path\to\your\key.pem ssh-keys\your-key.pem
   
   # For standard SSH keys
   copy C:\path\to\your\id_rsa ssh-keys\id_rsa
   ```

3. The script supports various key formats:
   - **.pem files** (commonly used by AWS EC2, Google Cloud, etc.)
   - **OpenSSH private keys** (id_rsa, id_ed25519)
   - **PuTTY private keys** (.ppk - will need conversion)
   
   Note: If using PuTTY keys (.ppk), convert to OpenSSH format first using PuTTYgen

### 4. Test the Connection

Run the test query from the project root:
```bash
npm run daily:query
```

Or if you're in the daily-reports directory:
```bash
node db-query.js
```

If successful, you should see:
```
SSH connection established
SSH tunnel established on local port [PORT]
Connected to MariaDB database
Query results: [ { test: 1 } ]
Database connection closed
SSH connection closed
```

## Usage

### Running the Employee Reports Query

The script is configured to run an employee reports query that joins multiple tables to extract comprehensive report data. Simply run:

```bash
npm run daily:query
```

This will:
1. Connect to the database via SSH tunnel
2. Execute a query that retrieves employee reports with:
   - Employee information (ID, first name, last name)
   - Report content and todo items
   - Report dates
   - Report template names
   - Client project information
3. Filter results based on the parameters in `config.json` under `dailyReports.query`:
   - Specific client project
   - Specific employee (or all employees if left empty)
   - Date range
4. Export results to CSV file(s):
   - **Single employee**: `data/daily-reports-John-Doe-2025-08-01-to-2025-08-31.csv`
   - **All employees**: Separate CSV files for each employee with the same naming format

#### Query Examples:

**Single Employee Query Output:**
```
Query returned 22 rows
✓ Results saved to: daily-reports/data/daily-reports-John-Doe-2025-08-01-to-2025-08-31.csv
```

**All Employees Query Output:**
```
Query returned 156 rows

Processing reports for 5 employees...
  - John Doe: 22 entries
  - Jane Smith: 31 entries
  - Bob Johnson: 28 entries
  - Alice Brown: 40 entries
  - Mike Davis: 35 entries

✓ Created 5 CSV files
```

### Converting CSV to Markdown

After running the query, you can convert the CSV results to formatted Markdown files:

```bash
npm run daily:convert
```

This will:
1. Find all CSV files in the `data/` directory
2. Convert each one to a beautifully formatted Markdown document
3. Save the results in the `md-output/` directory
4. Preserve the same filenames but with `.md` extension

**Note**: If you queried all employees, this will convert all individual employee CSV files to separate Markdown files.

The Markdown output includes:
- Employee and project information header
- Reports organized by date
- Tasks Done section (with HTML content converted to clean Markdown)
- To Do section (with proper bullet points)
- Additional details like project ID and employee ID

### Running Both Query and Conversion

To run both the database query and CSV-to-Markdown conversion in one command:

```bash
npm run daily:all
```

This combines both steps automatically:
1. Queries the database and saves to CSV
2. Converts the CSV to formatted Markdown

### Cleaning Output Directories

To remove all generated CSV and Markdown files:

```bash
npm run daily:clean
```

This will delete all `.csv` files from `data/` and all `.md` files from `md-output/` while preserving the directories and `.gitkeep` files.

### Modifying Query Parameters

To change which reports are retrieved, update the `dailyReports.query` section in `config.json`:

```json
// Query single employee
"query": {
  "client_project_id": 522,
  "employee_id": 42,
  "report_date_start": "2025-08-01",
  "report_date_end": "2025-08-31"
}

// Query multiple specific employees (array format)
"query": {
  "client_project_id": 522,
  "employee_id": [42, 56, 78],      // Array of employee IDs
  "report_date_start": "2025-08-01",
  "report_date_end": "2025-08-31"
}

// Query multiple employees (comma-separated string)
"query": {
  "client_project_id": 522,
  "employee_id": "42,56,78",        // Comma-separated string
  "report_date_start": "2025-08-01",
  "report_date_end": "2025-08-31"
}

// Query all employees in project
"query": {
  "client_project_id": 522,
  "employee_id": "",               // Leave empty for all employees
  "report_date_start": "2025-08-01",
  "report_date_end": "2025-08-31"
}
```

### Running Custom Queries

To run different queries, edit the `main()` function in `db-query.js`:

```javascript
// Example: Get user data
const { results } = await db.executeQuery(
  'SELECT id, name, email FROM users WHERE created_at > ?',
  ['2024-01-01']
);
console.log('Users:', results);
```

### Using as a Module

You can also import the DatabaseConnection class in other scripts:

```javascript
const DatabaseConnection = require('./db-query');

async function generateReport() {
  const db = new DatabaseConnection();
  
  try {
    await db.connect();
    
    // Your queries here
    const { results } = await db.executeQuery('SELECT * FROM orders');
    
    // Process results...
    
  } finally {
    await db.close();
  }
}
```

## Security Notes

1. **Never commit `.env` or `config.json`** - They contain sensitive credentials
2. **Keep SSH keys secure** - The `ssh-keys` directory is gitignored
3. **Use environment variables** for production deployments
4. **Restrict database user permissions** to only what's needed
5. **PEM file permissions** - On Unix/Linux systems, ensure your PEM file has restricted permissions:
   ```bash
   chmod 600 ssh-keys/your-key.pem
   ```

## Troubleshooting

### SSH Connection Failed
- Verify SSH credentials and server details
- Check if the SSH key has correct permissions (600)
- Ensure the SSH server allows key-based authentication

### Database Connection Failed
- Verify database credentials
- Check if the database server allows connections from the SSH server
- Ensure the database user has necessary permissions

### Port Forwarding Issues
- The script automatically assigns a local port for the tunnel
- If you have firewall restrictions, you may need to configure exceptions

## Examples

### Export Query Results to CSV

```javascript
const fs = require('fs');
const { results } = await db.executeQuery('SELECT * FROM daily_reports');

// Convert to CSV
const csv = [
  Object.keys(results[0]).join(','),
  ...results.map(row => Object.values(row).join(','))
].join('\n');

fs.writeFileSync('report.csv', csv);
```
