/**
 * Runtime validators for configuration values
 * These provide more specific validation beyond basic type checking
 */

/**
 * Validates date string format (YYYY-MM-DD)
 * @param {string} dateStr - The date string to validate
 * @param {string} fieldName - Name of the field for error messages
 * @returns {boolean} True if valid
 * @throws {Error} If date format is invalid
 */
function validateDateFormat(dateStr, fieldName = 'date') {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (!dateRegex.test(dateStr)) {
    throw new Error(
      `Invalid ${fieldName} format: "${dateStr}"\n` +
      `Expected format: YYYY-MM-DD (e.g., "2025-01-31")`
    );
  }
  
  // Check if it's a valid date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid ${fieldName}: "${dateStr}" is not a valid date\n` +
      `Example: "2025-01-31"`
    );
  }
  
  return true;
}

/**
 * Validates date range (start_date must be before or equal to end_date)
 * @param {string} startDate - Start date string (YYYY-MM-DD)
 * @param {string} endDate - End date string (YYYY-MM-DD)
 * @param {string} context - Context for error messages (e.g., 'jira', 'dailyReports')
 * @returns {boolean} True if valid
 * @throws {Error} If date range is invalid
 */
function validateDateRange(startDate, endDate, context = '') {
  validateDateFormat(startDate, 'start_date');
  validateDateFormat(endDate, 'end_date');
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start > end) {
    const prefix = context ? `${context}: ` : '';
    throw new Error(
      `${prefix}Invalid date range: start_date (${startDate}) must be before or equal to end_date (${endDate})\n` +
      `Example: start_date: "2025-01-01", end_date: "2025-01-31"`
    );
  }
  
  return true;
}

/**
 * Validates employee_id format
 * Supports: "", "123", 123, [123, 456], "123,456"
 * @param {string|number|Array} employeeId - The employee ID(s) to validate
 * @returns {boolean} True if valid
 * @throws {Error} If format is invalid
 */
function validateEmployeeId(employeeId) {
  // Empty string is valid (means all employees)
  if (employeeId === '') {
    return true;
  }
  
  // Single number is valid
  if (typeof employeeId === 'number') {
    if (employeeId <= 0) {
      throw new Error(
        `Invalid employee_id: ${employeeId}\n` +
        `Employee IDs must be positive numbers`
      );
    }
    return true;
  }
  
  // Single string number is valid
  if (typeof employeeId === 'string') {
    // Check if it's a comma-separated list
    if (employeeId.includes(',')) {
      const ids = employeeId.split(',').map(id => id.trim());
      for (const id of ids) {
        if (!/^\d+$/.test(id) || parseInt(id) <= 0) {
          throw new Error(
            `Invalid employee_id in comma-separated list: "${id}"\n` +
            `Expected format: "123,456,789" (positive numbers only)`
          );
        }
      }
      return true;
    }
    
    // Single string number
    if (!/^\d+$/.test(employeeId) || parseInt(employeeId) <= 0) {
      throw new Error(
        `Invalid employee_id: "${employeeId}"\n` +
        `Expected formats:\n` +
        `  - Empty string: "" (all employees)\n` +
        `  - Single ID: "123" or 123\n` +
        `  - Multiple IDs (array): [123, 456, 789]\n` +
        `  - Multiple IDs (CSV): "123,456,789"`
      );
    }
    return true;
  }
  
  // Array of numbers is valid
  if (Array.isArray(employeeId)) {
    if (employeeId.length === 0) {
      throw new Error(
        `Invalid employee_id: empty array []\n` +
        `Use empty string "" for all employees, or provide employee IDs`
      );
    }
    
    for (const id of employeeId) {
      if (typeof id !== 'number' || id <= 0) {
        throw new Error(
          `Invalid employee_id in array: ${JSON.stringify(id)}\n` +
          `All employee IDs must be positive numbers\n` +
          `Example: [123, 456, 789]`
        );
      }
    }
    return true;
  }
  
  throw new Error(
    `Invalid employee_id type: ${typeof employeeId}\n` +
    `Expected formats:\n` +
    `  - Empty string: "" (all employees)\n` +
    `  - Single ID: "123" or 123\n` +
    `  - Multiple IDs (array): [123, 456, 789]\n` +
    `  - Multiple IDs (CSV): "123,456,789"`
  );
}

/**
 * Validates Jira host format (should be a valid domain)
 * @param {string} host - The Jira host to validate
 * @returns {boolean} True if valid
 * @throws {Error} If host format is invalid
 */
function validateJiraHost(host) {
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!domainRegex.test(host)) {
    throw new Error(
      `Invalid Jira host: "${host}"\n` +
      `Expected format: "yourcompany.atlassian.net" (domain only, no https://)\n` +
      `Example: "fullscale.atlassian.net"`
    );
  }
  
  // Warn if it looks like a URL instead of just a domain
  if (host.startsWith('http://') || host.startsWith('https://')) {
    throw new Error(
      `Invalid Jira host: "${host}"\n` +
      `Do not include protocol (http:// or https://)\n` +
      `Use domain only: "${host.replace(/^https?:\/\//, '')}"`
    );
  }
  
  // Warn if it's not an Atlassian domain (just a warning, not an error)
  if (!host.includes('atlassian.net') && !host.includes('jira')) {
    console.warn(
      `⚠️  Warning: Jira host "${host}" does not appear to be an Atlassian domain.\n` +
      `   Expected format: "yourcompany.atlassian.net"\n` +
      `   Make sure this is your Jira domain, not Bitbucket or other services.`
    );
  }
  
  return true;
}

/**
 * Validates Google Drive folder ID format
 * @param {string} folderId - The folder ID to validate
 * @returns {boolean} True if valid
 * @throws {Error} If folder ID format is invalid
 */
function validateFolderId(folderId) {
  // Google Drive folder IDs are typically 33 characters, alphanumeric with hyphens and underscores
  const folderIdRegex = /^[a-zA-Z0-9_-]{20,50}$/;
  
  if (!folderIdRegex.test(folderId)) {
    throw new Error(
      `Invalid Google Drive folder ID: "${folderId}"\n` +
      `Folder IDs should be 20-50 characters, containing letters, numbers, hyphens, and underscores\n` +
      `Example: "1BY06tq2GJ17mRr6-gTbRHscrdtWWmC_9"\n` +
      `You can find the folder ID in the Google Drive URL:\n` +
      `https://drive.google.com/drive/folders/YOUR_FOLDER_ID_HERE`
    );
  }
  
  return true;
}

/**
 * Validates an array of folder IDs
 * @param {Array} folderIds - Array of folder IDs to validate
 * @returns {boolean} True if valid
 * @throws {Error} If any folder ID is invalid
 */
function validateFolderIds(folderIds) {
  if (!Array.isArray(folderIds)) {
    throw new Error(
      `Invalid folder_ids: expected an array, got ${typeof folderIds}\n` +
      `Example: ["folder-id-1", "folder-id-2"]`
    );
  }
  
  if (folderIds.length === 0) {
    throw new Error(
      `Invalid folder_ids: array cannot be empty\n` +
      `Provide at least one Google Drive folder ID\n` +
      `Example: ["1BY06tq2GJ17mRr6-gTbRHscrdtWWmC_9"]`
    );
  }
  
  for (let i = 0; i < folderIds.length; i++) {
    try {
      validateFolderId(folderIds[i]);
    } catch (error) {
      throw new Error(
        `Invalid folder ID at index ${i}: ${error.message}`
      );
    }
  }
  
  return true;
}

module.exports = {
  validateDateFormat,
  validateDateRange,
  validateEmployeeId,
  validateJiraHost,
  validateFolderId,
  validateFolderIds
};
