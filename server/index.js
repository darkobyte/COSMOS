/**
 * COSMOS//SERVER v3.0 - Multi-Solar System Architecture
 * 
 * Architecture Overview:
 * - COSMOS X: Central star at the origin
 * - Sol: Our real solar system (protected, orbits COSMOS X at fixed radius ~300)
 * - Generated Solar Systems: GitHub users form mini solar systems with generated suns
 * - Black Holes: Randomly spawned (5% chance per 10 users)
 * 
 * User Assignment:
 * - Each GitHub stargazer is assigned to a solar system
 * - First users per system become planets orbiting the system's sun (max 5 planets)
 * - Additional users have 30% chance to become moons (max 3 moons per system) orbiting existing planets
 * - Systems are created dynamically as needed
 * 
 * Orbital Hierarchy:
 * - Generated Suns → orbit COSMOS X (radius 400-2500, avoiding Sol's protected zone)
 * - Planets → orbit their system's sun (radius 40-250)
 * - Moons → orbit planets (radius 20-80)
 * - Black Holes → orbit COSMOS X (radius 600-2800)
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const GitHubClient = require('./lib/github');
const { generatePlanet } = require('./lib/planetGenerator');
const SolarSystemManager = require('./lib/solarSystemManager');
const OrbitalAllocatorV2 = require('./lib/orbitalAllocator_v2');
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
let stargazersData = { last_synced: null, stargazers: [], systems: null }; // Added systems to storage

const githubClient = new GitHubClient(GITHUB_REPO);
const solarSystemManager = new SolarSystemManager();

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
    systems: solarSystemManager.systems.size,
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

  // Create the Sun (Sol) - orbits COSMOS X at a protected fixed distance
  const sun = {
    id: 'sol',
    name: 'Sol',
    type: 'star', 
    size: 3,
    elements: ['fire', 'gas'],
    orbit_parent_id: 'cosmos_x',
    orbit_radius: 300,
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

// ─── System Body Creators ───────────────────────────────────────────────────

/**
 * Create a generated sun body for a solar system
 */
function createSystemSun(sunData, orbit) {
  return {
    id: sunData.id,
    name: sunData.name,
    type: sunData.type,
    size: sunData.size,
    elements: sunData.elements,
    colors: sunData.colors,
    orbit_parent_id: orbit.orbit_parent_id,
    orbit_radius: orbit.orbit_radius,
    orbit_speed: orbit.orbit_speed,
    orbit_angle_start: orbit.orbit_angle_start,
    registered_at: sunData.registered_at,
    info: sunData.info,
    system_id: sunData.system_id
  };
}

/**
 * Create a planet body from a GitHub user
 */
function createPlanetBody(stargazer, planet, orbit) {
  return {
    id: planet.id,
    name: planet.name,
    type: 'planet',
    size: planet.size,
    elements: planet.elements,
    colors: planet.colors,
    orbit_parent_id: orbit.orbit_parent_id,
    orbit_radius: orbit.orbit_radius,
    orbit_speed: orbit.orbit_speed,
    orbit_angle_start: orbit.orbit_angle_start,
    registered_at: Date.now(),
    info: planet.info,
    github_url: planet.github_url,
    avatar_url: planet.avatar_url
  };
}

/**
 * Create a moon body from a GitHub user
 */
function createMoonBody(stargazer, planet, orbit) {
  return {
    id: planet.id,
    name: planet.name,
    type: 'moon',
    size: planet.size,
    elements: planet.elements,
    colors: planet.colors,
    orbit_parent_id: orbit.orbit_parent_id,
    orbit_radius: orbit.orbit_radius,
    orbit_speed: orbit.orbit_speed,
    orbit_angle_start: orbit.orbit_angle_start,
    registered_at: Date.now(),
    info: planet.info,
    github_url: planet.github_url,
    avatar_url: planet.avatar_url
  };
}

/**
 * Create a black hole body
 */
function createBlackHole(blackHoleData, orbit) {
  return {
    id: blackHoleData.id,
    name: blackHoleData.name,
    type: blackHoleData.type,
    size: blackHoleData.size,
    elements: blackHoleData.elements,
    colors: blackHoleData.colors,
    orbit_parent_id: orbit.orbit_parent_id,
    orbit_radius: orbit.orbit_radius,
    orbit_speed: orbit.orbit_speed,
    orbit_angle_start: orbit.orbit_angle_start,
    registered_at: blackHoleData.registered_at,
    info: blackHoleData.info
  };
}

// ─── GitHub Sync V2 (Multi-Solar System) ───────────────────────────────────

async function syncGitHubStarsV2() {
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
        await handleUserUnstar(stored);
      }
    }

    // Find new stars
    for (const stargazer of stargazers) {
      if (!storedGitHubIds.has(stargazer.id)) {
        await handleUserStar(stargazer);
      }
    }

    // Check for black hole spawning
    if (solarSystemManager.shouldSpawnBlackHole(stargazersData.stargazers.length)) {
      await spawnBlackHole();
    }

    // Save state
    stargazersData.last_synced = new Date().toISOString();
    stargazersData.systems = solarSystemManager.exportState();
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

/**
 * Handle a new user starring the repo
 */
async function handleUserStar(stargazer) {
  try {
    // Generate planet config
    const planet = generatePlanet(stargazer);
    
    // Assign user to a solar system
    const assignment = solarSystemManager.assignUserToSystem(stargazer.id, planet);
    const system = solarSystemManager.getSystemForUser(stargazer.id);
    
    const allocator = new OrbitalAllocatorV2(bodies);

    // If this is a new system, create and add the sun
    if (!bodies.has(system.sun.id)) {
      const sunOrbit = allocator.allocateSunOrbit();
      const sunBody = createSystemSun(system.sun, sunOrbit);
      bodies.set(sunBody.id, { body: sunBody, ws: null });
      broadcastToViewers({ type: 'body_added', body: getBodySnapshot({ body: sunBody, ws: null }) });
      console.log(`  [☀️] New sun: ${sunBody.id} (${sunBody.name}) at radius ${sunOrbit.orbit_radius.toFixed(0)}`);
    }

    let body;
    if (assignment.isMoon) {
      // Create as moon orbiting a planet
      const parentPlanetUserId = system.moons.find(m => m.userId === stargazer.id).parentPlanetId;
      const parentPlanetRecord = stargazersData.stargazers.find(s => s.github_id === parentPlanetUserId);
      const parentPlanetId = parentPlanetRecord.planet.id;
      
      const moonOrbit = allocator.allocateMoonOrbit(parentPlanetId, planet.size);
      body = createMoonBody(stargazer, planet, moonOrbit);
      
      console.log(`  [🌙] New moon: ${body.id} (${body.name}) orbiting ${parentPlanetId}`);
    } else {
      // Create as planet orbiting the sun
      const planetOrbit = allocator.allocatePlanetOrbit(system.sun.id, planet.size);
      body = createPlanetBody(stargazer, planet, planetOrbit);
      
      console.log(`  [🪐] New planet: ${body.id} (${body.name}) in system ${assignment.systemId}`);
    }

    // Add to bodies
    bodies.set(body.id, { body, ws: null });

    // Save to storage
    const stargazerRecord = {
      github_id: stargazer.id,
      username: stargazer.login,
      avatar_url: stargazer.avatar_url,
      profile_url: stargazer.html_url,
      starred_at: new Date().toISOString(),
      planet: body,
      system_id: assignment.systemId,
      is_moon: assignment.isMoon
    };
    addStargazer(stargazersData, stargazerRecord);

    // Broadcast to viewers
    broadcastToViewers({ type: 'body_added', body: getBodySnapshot({ body, ws: null }) });
    
  } catch (err) {
    console.error(`  [!] Failed to add planet for ${stargazer.login}:`, err.message);
  }
}

/**
 * Handle a user unstarring the repo
 */
async function handleUserUnstar(stored) {
  try {
    const planetId = stored.planet.id;

    // Remove from solar system manager
    const result = solarSystemManager.removeUserFromSystem(stored.github_id);

    // Remove user's body
    if (bodies.has(planetId)) {
      bodies.delete(planetId);
      broadcastToViewers({ type: 'body_removed', id: planetId });
      console.log(`  [-] Removed ${stored.is_moon ? 'moon' : 'planet'}: ${planetId} (user unstarred)`);
    }

    // If this was a planet with moons, remove all its moons
    if (!stored.is_moon) {
      const moonsToRemove = stargazersData.stargazers.filter(s => 
        s.is_moon && s.planet.orbit_parent_id === planetId
      );
      
      for (const moon of moonsToRemove) {
        if (bodies.has(moon.planet.id)) {
          bodies.delete(moon.planet.id);
          broadcastToViewers({ type: 'body_removed', id: moon.planet.id });
          console.log(`  [-] Removed moon: ${moon.planet.id} (parent planet removed)`);
        }
        removeStargazer(stargazersData, moon.github_id);
      }
    }

    // If system was removed (empty), remove the sun
    if (result && result.systemRemoved) {
      const sunId = `sun_${result.systemId}`;
      if (bodies.has(sunId)) {
        bodies.delete(sunId);
        broadcastToViewers({ type: 'body_removed', id: sunId });
        console.log(`  [☀️] Removed sun: ${sunId} (system empty)`);
      }
    }

    // Remove from storage
    removeStargazer(stargazersData, stored.github_id);
    
  } catch (err) {
    console.error(`  [!] Failed to remove user ${stored.github_id}:`, err.message);
  }
}

/**
 * Spawn a black hole
 */
async function spawnBlackHole() {
  try {
    const blackHoleData = solarSystemManager.generateBlackHole();
    const allocator = new OrbitalAllocatorV2(bodies);
    const orbit = allocator.allocateBlackHoleOrbit();
    
    const blackHole = createBlackHole(blackHoleData, orbit);
    bodies.set(blackHole.id, { body: blackHole, ws: null });
    
    broadcastToViewers({ type: 'body_added', body: getBodySnapshot({ body: blackHole, ws: null }) });
    console.log(`  [🕳️] Black hole spawned: ${blackHole.id} at radius ${orbit.orbit_radius.toFixed(0)}`);
    
  } catch (err) {
    console.error(`  [!] Failed to spawn black hole:`, err.message);
  }
}

// ─── Restore from Storage ───────────────────────────────────────────────────

/**
 * Initialize solar systems from storage
 */
function initializeSolarSystems() {
  console.log('\n  [Systems] Initializing solar systems...');
  
  // Load stargazers data
  stargazersData = loadStargazers();
  
  // Restore solar system manager state
  if (stargazersData.systems) {
    solarSystemManager.importState(stargazersData.systems);
    console.log(`  [Systems] Restored ${solarSystemManager.systems.size} solar systems`);
  }
  
  // Restore all bodies from stargazers
  const allocator = new OrbitalAllocatorV2(bodies);
  
  // First, create all suns
  const systems = solarSystemManager.getAllSystems();
  for (const system of systems) {
    if (!bodies.has(system.sun.id)) {
      const sunOrbit = allocator.allocateSunOrbit();
      const sunBody = createSystemSun(system.sun, sunOrbit);
      bodies.set(sunBody.id, { body: sunBody, ws: null });
      console.log(`  [☀️] Restored sun: ${sunBody.id} (${sunBody.name})`);
    }
  }
  
  // Then, create all planets and moons
  for (const record of stargazersData.stargazers) {
    const body = record.planet;
    bodies.set(body.id, { body, ws: null });
    
    const emoji = body.type === 'moon' ? '🌙' : '🪐';
    console.log(`  [${emoji}] Restored ${body.type}: ${body.id} (${body.name})`);
  }
  
  // Restore black holes (they're stored in bodies but not in stargazers)
  const bodyEntries = Array.from(bodies.values());
  const blackHoles = bodyEntries.filter(entry => entry.body.type === 'blackhole');
  
  console.log(`  [Storage] Restored ${stargazersData.stargazers.length} user bodies, ${systems.length} suns, ${blackHoles.length} black holes`);
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

    await handleUserStar(fakeStargazer);
  }

  // Save after populating
  stargazersData.systems = solarSystemManager.exportState();
  saveStargazers(stargazersData);

  console.log(`  [DEV] Auto-populate complete! ${stargazersData.stargazers.length} total planets in ${solarSystemManager.systems.size} systems\n`);
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
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   COSMOS//SERVER v3.0 (Multi-Solar)  ║');
  console.log(`║   Port: ${PORT}                         ║`);
  console.log(`║   Repo: ${GITHUB_REPO}      ║`);
  if (DEV_MODE) {
    console.log('║   Mode: DEV (No GitHub Sync)          ║');
  }
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  // Create COSMOS X
  createCosmosX();

  // Create our real Solar System (hidden easter egg)
  createSolarSystem();

  // Initialize solar systems and restore from storage
  initializeSolarSystems();

  // Dev mode auto-populate
  if (DEV_MODE) {
    await devAutoPopulate();
  }

  if (!DEV_MODE) {
    // Initial sync
    await syncGitHubStarsV2();

    // Start periodic sync
    setInterval(syncGitHubStarsV2, SYNC_INTERVAL);
    console.log(`\n  [GitHub] Sync interval: ${SYNC_INTERVAL / 1000}s`);
  } else {
    console.log('  [DEV] GitHub sync disabled');
  }

  // Start server
  server.listen(PORT, () => {
    console.log(`\n  [✓] Server ready on port ${PORT}`);
    console.log(`  [✓] Solar Systems: ${solarSystemManager.systems.size}`);
    console.log(`  [✓] Total Bodies: ${bodies.size}\n`);
  });
}

startup().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
