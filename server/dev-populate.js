/**
 * Dev Mode: Populate with fake stargazers for testing
 * Usage: node dev-populate.js [count]
 */

const { loadStargazers, saveStargazers, addStargazer } = require('./lib/storage');
const { generatePlanet } = require('./lib/planetGenerator');
const OrbitalAllocator = require('./lib/orbitalAllocator');

const COUNT = parseInt(process.argv[2]) || 50;

// Fake stargazer data generator
function generateFakeStargazer(index) {
  const names = [
    'alice', 'bob', 'charlie', 'diana', 'eve', 'frank', 'grace', 'henry',
    'iris', 'jack', 'kate', 'leo', 'maria', 'noah', 'olivia', 'paul',
    'quinn', 'ruby', 'sam', 'tina', 'uma', 'victor', 'wendy', 'xander',
    'yara', 'zack', 'anna', 'ben', 'cara', 'dan', 'ella', 'finn',
    'gina', 'hugo', 'ivy', 'jake', 'lily', 'max', 'nina', 'owen',
    'pia', 'rex', 'sara', 'tom', 'una', 'vince', 'willa', 'xena',
    'york', 'zara', 'ash', 'blair', 'cruz', 'drew', 'ember'
  ];
  
  const name = names[index % names.length] + (index > names.length ? index : '');
  
  return {
    id: 1000000 + index,
    login: name,
    avatar_url: `https://avatars.githubusercontent.com/u/${1000000 + index}?v=4`,
    html_url: `https://github.com/${name}`
  };
}

async function populate() {
  console.log('╔══════════════════════════════════╗');
  console.log('║   DEV MODE: Stargazer Simulator  ║');
  console.log(`║   Generating ${COUNT} stargazers...   ║`);
  console.log('╚══════════════════════════════════╝\n');

  // Load existing data
  let stargazersData = loadStargazers();
  
  // Create bodies map for orbital allocation
  const bodies = new Map();
  
  // Add COSMOS X
  bodies.set('cosmos_x', {
    body: {
      id: 'cosmos_x',
      name: 'COSMOS X',
      type: 'star',
      size: 4,
      orbit_parent_id: null
    }
  });
  
  // Restore existing planets
  for (const record of stargazersData.stargazers) {
    bodies.set(record.planet.id, { body: record.planet });
  }
  
  console.log(`Existing planets: ${stargazersData.stargazers.length}`);
  console.log(`Adding ${COUNT} new planets...\n`);
  
  // Generate new stargazers
  for (let i = 0; i < COUNT; i++) {
    const fakeStargazer = generateFakeStargazer(i);
    
    // Check if already exists
    const exists = stargazersData.stargazers.find(s => s.github_id === fakeStargazer.id);
    if (exists) {
      console.log(`  [~] Skipping ${fakeStargazer.login} (already exists)`);
      continue;
    }
    
    // Generate planet
    const planet = generatePlanet(fakeStargazer);
    
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
    
    // Add to bodies map
    bodies.set(body.id, { body });
    
    // Create stargazer record
    const stargazerRecord = {
      github_id: fakeStargazer.id,
      username: fakeStargazer.login,
      avatar_url: fakeStargazer.avatar_url,
      profile_url: fakeStargazer.html_url,
      starred_at: new Date().toISOString(),
      planet: body
    };
    
    // Add to data
    stargazersData.stargazers.push(stargazerRecord);
    
    // Log progress
    const parentInfo = orbit.orbit_parent_id === 'cosmos_x' 
      ? 'COSMOS X' 
      : orbit.orbit_parent_id.replace('github_', '');
    
    console.log(`  [${i + 1}/${COUNT}] ${body.name} → orbiting ${parentInfo} (r=${orbit.orbit_radius.toFixed(1)})`);
  }
  
  // Save to disk
  stargazersData.last_synced = new Date().toISOString();
  saveStargazers(stargazersData);
  
  console.log('\n✓ Done!');
  console.log(`Total planets: ${stargazersData.stargazers.length}`);
  
  // Stats
  const cosmosChildren = stargazersData.stargazers.filter(s => s.planet.orbit_parent_id === 'cosmos_x');
  const moons = stargazersData.stargazers.filter(s => s.planet.orbit_parent_id !== 'cosmos_x');
  
  console.log(`  - Direct children of COSMOS X: ${cosmosChildren.length}`);
  console.log(`  - Moons (orbiting planets): ${moons.length}`);
  
  if (moons.length > 0) {
    console.log('\nMoon distribution:');
    const moonParents = {};
    for (const moon of moons) {
      const parent = moon.planet.orbit_parent_id.replace('github_', '');
      moonParents[parent] = (moonParents[parent] || 0) + 1;
    }
    for (const [parent, count] of Object.entries(moonParents)) {
      console.log(`  - ${parent}: ${count} moon(s)`);
    }
  }
}

populate().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
