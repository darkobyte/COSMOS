const http = require('http');
const { WebSocketServer } = require('ws');
const GitHubClient = require('./lib/github');
const { generatePlanet } = require('./lib/planetGenerator');
const OrbitalAllocator = require('./lib/orbitalAllocator');
const { loadStargazers, saveStargazers, addStargazer, removeStargazer } = require('./lib/storage');

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
const GITHUB_REPO = process.env.GITHUB_REPO || 'darkobyte/COSMOS';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL) || 10000; // 10 seconds
const DEV_MODE = process.env.DEV_MODE === 'true'; // Skip GitHub sync in dev mode
const DEV_POPULATE_COUNT = parseInt(process.env.DEV_POPULATE_COUNT) || 50; // Number of fake planets to generate

// ─── State ──────────────────────────────────────────────────────────────────

const bodies = new Map();   // id -> { body: {...}, ws: null }
const viewers = new Set();  // browser connections
let stargazersData = { last_synced: null, stargazers: [] };

const githubClient = new GitHubClient(GITHUB_REPO);

// ─── Helpers ────────────────────────────────────────────────────────────────

function broadcastToViewers(msg) {
  const data = JSON.stringify(msg);
  for (const viewer of viewers) {
    if (viewer.readyState === 1) viewer.send(data);
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function getBodySnapshot(entry) {
  return { ...entry.body, online: true }; // GitHub planets are always "online"
}

// ─── COSMOS X (Central Star) ────────────────────────────────────────────────

function createCosmosX() {
  const cosmosX = {
    id: 'cosmos_x',
    name: 'COSMOS X',
    type: 'star',
    size: 4,
    elements: ['dark_matter', 'fire'],
    orbit_parent_id: null,
    orbit_radius: 0,
    orbit_speed: 0,
    orbit_angle_start: 0,
    registered_at: Date.now(),
    info: 'The central star of our solar system. An unusual mixture of dark matter and fire.',
    fixed_offset: { x: 0, y: 0 }
  };

  bodies.set('cosmos_x', { body: cosmosX, ws: null });
  console.log('  [★] COSMOS X initialized at center');
}

// ─── GitHub Sync ────────────────────────────────────────────────────────────

async function syncGitHubStars() {
  try {
    console.log('\n  [GitHub] Syncing stargazers...');
    
    const stargazers = await githubClient.fetchStargazers();
    
    if (stargazers === null) {
      // No changes (304)
      return;
    }

    // Build set of current GitHub user IDs
    const currentGitHubIds = new Set(stargazers.map(s => s.id));
    const storedGitHubIds = new Set(stargazersData.stargazers.map(s => s.github_id));

    // Find removed stars (unstars)
    for (const stored of stargazersData.stargazers) {
      if (!currentGitHubIds.has(stored.github_id)) {
        const planetId = stored.planet.id;
        
        // Remove planet
        if (bodies.has(planetId)) {
          bodies.delete(planetId);
          broadcastToViewers({ type: 'body_removed', id: planetId });
          console.log(`  [-] Removed planet: ${planetId} (user unstarred)`);
        }
        
        // Remove from storage
        removeStargazer(stargazersData, stored.github_id);
      }
    }

    // Find new stars
    for (const stargazer of stargazers) {
      if (!storedGitHubIds.has(stargazer.id)) {
        await addNewPlanet(stargazer);
      }
    }

    stargazersData.last_synced = new Date().toISOString();
    saveStargazers(stargazersData);
    
  } catch (err) {
    console.error('  [GitHub] Sync failed:', err.message);
  }
}

async function addNewPlanet(stargazer) {
  try {
    // Generate planet config
    const planet = generatePlanet(stargazer);
    
    // Allocate orbit
    const allocator = new OrbitalAllocator(bodies);
    const orbit = allocator.allocateOrbit(planet);
    
    // Create full body
    const body = {
      id: planet.id,
      name: planet.name,
      type: planet.type,
      size: planet.size,
      elements: planet.elements,
      orbit_parent_id: orbit.orbit_parent_id,
      orbit_radius: orbit.orbit_radius,
      orbit_speed: orbit.orbit_speed,
      orbit_angle_start: Math.random() * Math.PI * 2,
      registered_at: Date.now(),
      info: planet.info,
      github_url: planet.github_url,
      avatar_url: planet.avatar_url,
      colors: planet.colors
    };

    // Add to bodies
    bodies.set(body.id, { body, ws: null });

    // Save to storage
    const stargazerRecord = {
      github_id: stargazer.id,
      username: stargazer.login,
      avatar_url: stargazer.avatar_url,
      profile_url: stargazer.html_url,
      starred_at: new Date().toISOString(),
      planet: body
    };
    addStargazer(stargazersData, stargazerRecord);

    // Broadcast to viewers
    broadcastToViewers({ type: 'body_added', body: getBodySnapshot({ body, ws: null }) });
    
    console.log(`  [+] New planet: ${body.id} (${body.name}) parent=${orbit.orbit_parent_id}`);
    
  } catch (err) {
    console.error(`  [!] Failed to add planet for ${stargazer.login}:`, err.message);
  }
}

// ─── Restore from Storage ───────────────────────────────────────────────────

function restorePlanetsFromStorage() {
  console.log('\n  [Storage] Restoring planets from disk...');
  
  stargazersData = loadStargazers();
  
  for (const record of stargazersData.stargazers) {
    const body = record.planet;
    bodies.set(body.id, { body, ws: null });
    console.log(`  [↻] Restored: ${body.id} (${body.name})`);
  }
  
  console.log(`  [Storage] Restored ${stargazersData.stargazers.length} planets`);
}

// ─── Dev Mode Auto-Populate ─────────────────────────────────────────────────

async function devAutoPopulate() {
  if (!DEV_MODE) return;

  const existingCount = stargazersData.stargazers.length;
  if (existingCount >= DEV_POPULATE_COUNT) {
    console.log(`  [DEV] Skipping auto-populate (${existingCount} planets already exist)`);
    return;
  }

  console.log(`  [DEV] Auto-populating to ${DEV_POPULATE_COUNT} planets (currently ${existingCount})...`);

  const names = [
    'alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'henry',
    'iris', 'jack', 'kate', 'leo', 'maria', 'noah', 'olivia', 'paul',
    'quinn', 'ruby', 'sam', 'tina', 'uma', 'victor', 'wendy', 'xander',
    'yara', 'zack', 'anna', 'ben', 'cara', 'dan', 'ella', 'finn',
    'gina', 'hugo', 'ivy', 'jake', 'lily', 'max', 'nina', 'owen',
    'pia', 'rex', 'sara', 'tom', 'una', 'vince', 'willa', 'xena',
    'york', 'zara', 'ash', 'blair', 'cruz', 'drew', 'ember'
  ];

  for (let i = 0; i < DEV_POPULATE_COUNT; i++) {
    const name = names[i % names.length] + (i >= names.length ? i : '');
    const fakeStargazer = {
      id: 1000000 + i,
      login: name,
      avatar_url: `https://avatars.githubusercontent.com/u/${1000000 + i}?v=4`,
      html_url: `https://github.com/${name}`
    };

    const exists = stargazersData.stargazers.find(s => s.github_id === fakeStargazer.id);
    if (exists) continue;

    await addNewPlanet(fakeStargazer);
  }

  console.log(`  [DEV] Auto-populate complete! ${stargazersData.stargazers.length} total planets\n`);
}

// ─── WebSocket Server ───────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      bodies: bodies.size, 
      viewers: viewers.size,
      last_sync: stargazersData.last_synced 
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let role = 'viewer';

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── viewer identify ──
    if (msg.type === 'viewer') {
      role = 'viewer';
      viewers.add(ws);
      const snapshot = [];
      for (const [, entry] of bodies) {
        snapshot.push(getBodySnapshot(entry));
      }
      send(ws, { type: 'init', bodies: snapshot });
      console.log(`  [V] Viewer connected. Total: ${viewers.size}`);
      return;
    }

    // ── heartbeat ──
    if (msg.type === 'heartbeat') {
      send(ws, { type: 'pong' });
      return;
    }
  });

  ws.on('close', () => {
    if (role === 'viewer') {
      viewers.delete(ws);
      console.log(`  [V] Viewer disconnected. Total: ${viewers.size}`);
    }
  });

  ws.on('error', (err) => {
    console.error(`  [!] WS error:`, err.message);
  });
});

// ─── Startup ────────────────────────────────────────────────────────────────

async function startup() {
  console.log('╔══════════════════════════════════╗');
  console.log('║   COSMOS//SERVER v2.0 (GitHub)   ║');
  console.log(`║   Port: ${PORT}                    ║`);
  console.log(`║   Repo: ${GITHUB_REPO}   ║`);
  if (DEV_MODE) {
    console.log('║   Mode: DEV (No GitHub Sync)     ║');
  }
  console.log('╚══════════════════════════════════╝');
  console.log('');

  // Create COSMOS X
  createCosmosX();

  // Restore planets from storage
  restorePlanetsFromStorage();

  // Dev mode auto-populate
  if (DEV_MODE) {
    await devAutoPopulate();
  }

  if (!DEV_MODE) {
    // Initial sync
    await syncGitHubStars();

    // Start periodic sync
    setInterval(syncGitHubStars, SYNC_INTERVAL);
    console.log(`\n  [GitHub] Sync interval: ${SYNC_INTERVAL / 1000}s`);
  } else {
    console.log('  [DEV] GitHub sync disabled');
  }

  // Start server
  server.listen(PORT, () => {
    console.log(`\n  [✓] Server ready on port ${PORT}\n`);
  });
}

startup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
