const fs = require('fs');
const path = require('path');

console.log('Datasource Generator - Clean Output Directory\n');

let totalDeleted = 0;

// Function to recursively clean datasource files
function cleanDirectory(dirPath, indent = '') {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  let deletedCount = 0;
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      // Recursively clean subdirectories
      console.log(`${indent}Cleaning ${item}/...`);
      const subCount = cleanDirectory(itemPath, indent + '  ');
      deletedCount += subCount;
    } else if (item.startsWith('datasource_') && item.endsWith('.py')) {
      // Delete datasource_*.py files
      try {
        fs.unlinkSync(itemPath);
        console.log(`${indent}  ✓ Deleted: ${item}`);
        deletedCount++;
      } catch (error) {
        console.error(`${indent}  ✗ Error deleting ${item}: ${error.message}`);
      }
    }
  }
  
  return deletedCount;
}

// Clean the output directory
const outputDir = path.join(__dirname, 'output');
console.log('Cleaning output/...');
totalDeleted = cleanDirectory(outputDir);

console.log(`\nTotal files removed: ${totalDeleted}`);

if (totalDeleted === 0) {
  console.log('Directory was already clean.');
}
