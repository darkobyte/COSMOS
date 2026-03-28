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

const syncState = {
  lastAttemptAtMs: null,
  nextSyncAtMs: null,
  rateLimited: false,
  rateLimitResetAtMs: null,
  lastError: null,
};

function toIso(ms) {
  return ms ? new Date(ms).toISOString() : null;
}

function getSyncStats() {
  return {
    interval_ms: SYNC_INTERVAL,
    last_attempt: toIso(syncState.lastAttemptAtMs),
    last_success: stargazersData.last_synced,
    next_sync: toIso(syncState.nextSyncAtMs),
    rate_limited: syncState.rateLimited,
    rate_limit_reset: toIso(syncState.rateLimitResetAtMs),
    last_error: syncState.lastError,
    dev_mode: DEV_MODE,
  };
}

function broadcastStats() {
  broadcastToViewers({
    type: 'stats',
    viewers: viewers.size,
    bodies: bodies.size,
    sync: getSyncStats(),
  });
}

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

// ─── Solar System (Hidden Easter Egg) ──────────────────────────────────────

function createSolarSystem() {
  // Only create if not already exists
  if (bodies.has('sol')) return;

  console.log('  [🌟] Initializing real Solar System...');

  // Create the Sun (Sol) - orbits COSMOS X
  const allocator = new OrbitalAllocator(bodies);
  const sunOrbit = allocator.calculateSafeRadius('cosmos_x', 3, 'sol');
  
  const sun = {
    id: 'sol',
    name: 'Sol',
    type: 'star', 
    size: 3,
    elements: ['fire', 'gas'],
    orbit_parent_id: 'cosmos_x',
    orbit_radius: 400,
    orbit_speed: 0.0008,
    orbit_angle_start: Math.random() * Math.PI * 2,
    registered_at: Date.now(),
    info: 'Our Sun - the real star of the Solar System 🌟',
    colors: ['#FDB813', '#FF8C00', '#FFD700']
  };

  bodies.set('sol', { body: sun, ws: null });

  // Real planets in order from Sun
  const realPlanets = [
    { 
      name: 'Mercury', size: 1, elements: ['rock', 'iron'], radius: 45, speed: 0.012, 
      color: '#8C7853', info: 'Closest to the Sun ☿️', moons: [] 
    },
    { 
      name: 'Venus', size: 1, elements: ['rock', 'gas'], radius: 65, speed: 0.009, 
      color: '#FFC649', info: 'Hottest planet ♀️', moons: [] 
    },
    { 
      name: 'Earth', size: 2, elements: ['water', 'rock'], radius: 85, speed: 0.007, 
      color: '#6B93D6', info: 'Our home planet 🌍',
      moons: [
        { name: 'Moon', size: 1, radius: 25, speed: 0.025, color: '#C0C0C0', info: 'Earth\'s natural satellite 🌙' }
      ]
    },
    { 
      name: 'Mars', size: 1, elements: ['rock', 'iron'], radius: 105, speed: 0.005, 
      color: '#CD5C5C', info: 'The Red Planet ♂️',
      moons: [
        { name: 'Phobos', size: 1, radius: 20, speed: 0.035, color: '#8B7355', info: 'Mars\' inner moon' },
        { name: 'Deimos', size: 1, radius: 35, speed: 0.018, color: '#A0826D', info: 'Mars\' outer moon' }
      ]
    },
    { 
      name: 'Jupiter', size: 4, elements: ['gas', 'nitrogen'], radius: 150, speed: 0.003, 
      color: '#D8CA9D', info: 'Largest planet ♃',
      moons: [
        { name: 'Io', size: 1, radius: 40, speed: 0.032, color: '#FFD700', info: 'Volcanic moon ⚡' },
        { name: 'Europa', size: 1, radius: 60, speed: 0.022, color: '#E8D8B8', info: 'Icy ocean moon 🧊' },
        { name: 'Ganymede', size: 2, radius: 85, speed: 0.015, color: '#B0A080', info: 'Largest moon 🌍' },
        { name: 'Callisto', size: 2, radius: 110, speed: 0.010, color: '#8B8680', info: 'Ancient surface' }
      ]
    },
    { 
      name: 'Saturn', size: 3, elements: ['gas', 'ice'], radius: 190, speed: 0.002, 
      color: '#FAD5A5', info: 'The ringed planet ♄',
      moons: [
        { name: 'Mimas', size: 1, radius: 35, speed: 0.028, color: '#FFFACD', info: 'The death star moon' },
        { name: 'Enceladus', size: 1, radius: 55, speed: 0.019, color: '#F0F8FF', info: 'Icy geysers 🌊' },
        { name: 'Rhea', size: 1, radius: 75, speed: 0.013, color: '#E0E6FF', info: 'Saturn\'s 2nd largest' },
        { name: 'Titan', size: 2, radius: 105, speed: 0.008, color: '#FF8C00', info: 'Thick atmosphere 🌫️' },
        { name: 'Iapetus', size: 1, radius: 130, speed: 0.005, color: '#DCDCDC', info: 'Two-toned moon' }
      ]
    },
    { 
      name: 'Uranus', size: 2, elements: ['ice', 'gas'], radius: 230, speed: 0.0015, 
      color: '#4FD0E7', info: 'Ice giant ♅',
      moons: [
        { name: 'Ariel', size: 1, radius: 35, speed: 0.025, color: '#B0C4DE', info: 'Bright moon' },
        { name: 'Umbriel', size: 1, radius: 50, speed: 0.017, color: '#36454F', info: 'Dark moon' },
        { name: 'Titania', size: 1, radius: 70, speed: 0.011, color: '#C0C0C0', info: 'Largest of Uranus' },
        { name: 'Oberon', size: 1, radius: 90, speed: 0.008, color: '#8B8B83', info: 'Cratered surface' },
        { name: 'Miranda', size: 1, radius: 35, speed: 0.026, color: '#696969', info: 'Shattered moon' }
      ]
    },
    { 
      name: 'Neptune', size: 2, elements: ['ice', 'gas'], radius: 270, speed: 0.001, 
      color: '#4B70DD', info: 'Farthest planet ♆',
      moons: [
        { name: 'Triton', size: 2, radius: 50, speed: 0.020, color: '#E6F3FF', info: 'Retrograde orbit 🌀' },
        { name: 'Proteus', size: 1, radius: 75, speed: 0.012, color: '#2F4F7F', info: 'Irregular shape' }
      ]
    }
  ];

  // Create each planet and its moons
  let moonCount = 0;
  realPlanets.forEach(planetData => {
    const planet = {
      id: `sol_${planetData.name.toLowerCase()}`,
      name: planetData.name,
      type: 'planet',
      size: planetData.size,
      elements: planetData.elements,
      orbit_parent_id: 'sol',
      orbit_radius: planetData.radius,
      orbit_speed: planetData.speed,
      orbit_angle_start: Math.random() * Math.PI * 2,
      registered_at: Date.now(),
      info: planetData.info,
      colors: [planetData.color, planetData.color, planetData.color]
    };

    bodies.set(planet.id, { body: planet, ws: null });

    // Create moons for this planet
    if (planetData.moons && planetData.moons.length > 0) {
      planetData.moons.forEach((moonData, idx) => {
        const moon = {
          id: `sol_${planetData.name.toLowerCase()}_${moonData.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: moonData.name,
          type: 'moon',
          size: moonData.size || 1,
          elements: ['rock', 'ice'],
          orbit_parent_id: planet.id,
          orbit_radius: moonData.radius,
          orbit_speed: moonData.speed,
          orbit_angle_start: Math.random() * Math.PI * 2,
          registered_at: Date.now(),
          info: moonData.info,
          colors: [moonData.color, moonData.color, moonData.color]
        };

        bodies.set(moon.id, { body: moon, ws: null });
        moonCount++;
      });
    }
  });

  console.log(`  [🪐] Added ${realPlanets.length} real planets to Solar System`);
  console.log(`  [🌙] Added ${moonCount} moons to solar system`);
}

// ─── GitHub Sync ────────────────────────────────────────────────────────────

async function syncGitHubStars() {
  if (DEV_MODE) return;

  const now = Date.now();

  // If currently rate-limited, don't attempt again until GitHub says it's safe.
  if (syncState.rateLimitResetAtMs && now < syncState.rateLimitResetAtMs) {
    syncState.rateLimited = true;
    syncState.nextSyncAtMs = syncState.rateLimitResetAtMs;
    syncState.lastError = 'Rate limit exceeded';
    broadcastStats();
    return;
  }

  // Clear old rate-limit window once we're past it.
  if (syncState.rateLimitResetAtMs && now >= syncState.rateLimitResetAtMs) {
    syncState.rateLimitResetAtMs = null;
    syncState.rateLimited = false;
  }

  syncState.lastAttemptAtMs = now;
  syncState.nextSyncAtMs = now + SYNC_INTERVAL;

  try {
    console.log('\n  [GitHub] Syncing stargazers...');

    const stargazers = await githubClient.fetchStargazers();

    if (stargazers === null) {
      // No changes (304) — still a successful sync attempt.
      syncState.lastError = null;
      broadcastStats();
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

    syncState.lastError = null;
    broadcastStats();

  } catch (err) {
    if (err && err.code === 'RATE_LIMIT' && err.resetAtMs) {
      syncState.rateLimited = true;
      syncState.rateLimitResetAtMs = err.resetAtMs;
      syncState.nextSyncAtMs = err.resetAtMs;
    }

    syncState.lastError = (err && err.message) ? err.message : 'Sync failed';
    console.error('  [GitHub] Sync failed:', syncState.lastError);
    broadcastStats();
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
      last_sync: stargazersData.last_synced,
      sync: getSyncStats(),
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
      broadcastStats();
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
      broadcastStats();
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

  // Create our real Solar System (hidden easter egg)
  createSolarSystem();

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
