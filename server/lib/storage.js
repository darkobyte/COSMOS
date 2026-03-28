const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, '..', 'data', 'stargazers.json');

/**
 * Load stargazers from JSON file
 */
function loadStargazers() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return {
        last_synced: null,
        stargazers: []
      };
    }
    
    const data = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('  [Storage] Failed to load stargazers.json:', err.message);
    return {
      last_synced: null,
      stargazers: []
    };
  }
}

/**
 * Save stargazers to JSON file (atomic write)
 */
function saveStargazers(data) {
  try {
    const tmpFile = STORAGE_FILE + '.tmp';
    
    // Write to temp file first
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    
    // Atomic rename
    fs.renameSync(tmpFile, STORAGE_FILE);
    
    console.log(`  [Storage] Saved ${data.stargazers.length} stargazers to disk`);
  } catch (err) {
    console.error('  [Storage] Failed to save stargazers.json:', err.message);
  }
}

/**
 * Add or update a stargazer
 */
function addStargazer(data, stargazerData) {
  const existing = data.stargazers.find(s => s.github_id === stargazerData.github_id);
  
  if (existing) {
    // Update existing
    Object.assign(existing, stargazerData);
  } else {
    // Add new
    data.stargazers.push(stargazerData);
  }
  
  data.last_synced = new Date().toISOString();
  saveStargazers(data);
}

/**
 * Remove a stargazer by github_id
 */
function removeStargazer(data, githubId) {
  const index = data.stargazers.findIndex(s => s.github_id === githubId);
  
  if (index !== -1) {
    const removed = data.stargazers.splice(index, 1)[0];
    data.last_synced = new Date().toISOString();
    saveStargazers(data);
    return removed;
  }
  
  return null;
}

/**
 * Get stargazer by username
 */
function getStargazer(data, username) {
  return data.stargazers.find(s => s.username === username);
}

module.exports = {
  loadStargazers,
  saveStargazers,
  addStargazer,
  removeStargazer,
  getStargazer
};
