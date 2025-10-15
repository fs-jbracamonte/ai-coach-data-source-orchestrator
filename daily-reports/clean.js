const fs = require('fs');
const path = require('path');

// Directories to clean
const { getProjectFolder } = require('../lib/project-folder');
const cfg = require('../lib/config').load();
const PF = getProjectFolder(process.env.TEAM, cfg);
const dirsToClean = [path.join('data', PF), path.join('md-output', PF)];

console.log('Daily Reports - Clean Output Directories\n');

let totalDeleted = 0;

for (const dir of dirsToClean) {
  const dirPath = path.join(__dirname, dir);
  
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dir}`);
    continue;
  }
  
  console.log(`Cleaning ${dir}/...`);
  
  const files = fs.readdirSync(dirPath).filter(file => {
    // Keep .gitkeep files
    if (file === '.gitkeep') return false;
    
    // Remove CSV and MD files
    return file.endsWith('.csv') || file.endsWith('.md');
  });
  
  let deletedCount = 0;
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    try {
      fs.unlinkSync(filePath);
      console.log(`  ✓ Deleted: ${file}`);
      deletedCount++;
    } catch (error) {
      console.error(`  ✗ Error deleting ${file}: ${error.message}`);
    }
  }
  
  console.log(`  Removed ${deletedCount} file(s) from ${dir}/\n`);
  totalDeleted += deletedCount;
}

console.log(`\nTotal files removed: ${totalDeleted}`);

if (totalDeleted === 0) {
  console.log('Directories were already clean.');
}
