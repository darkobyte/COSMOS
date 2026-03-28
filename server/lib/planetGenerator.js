/**
 * Generate planet configuration from GitHub user data
 */

const PLANET_TYPES = {
  COMMON: ['planet'],           // 70%
  UNCOMMON: ['moon', 'asteroid'], // 20%
  RARE: ['planet'],             // 9% (special visual variant)
  VERY_RARE: ['blackhole']      // 1%
};

const ELEMENTS_POOL = ['water', 'rock', 'iron', 'gas', 'ice', 'fire', 'nitrogen', 'gold', 'dark_matter'];

/**
 * Hash string to number (for consistent randomness per user)
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Pseudo-random number generator seeded by username
 */
function seededRandom(seed, min, max) {
  const x = Math.sin(seed) * 10000;
  const rand = x - Math.floor(x);
  return Math.floor(rand * (max - min + 1)) + min;
}

/**
 * Generate colors from username hash
 */
function generateColors(username) {
  const hash = hashString(username);
  const hue1 = hash % 360;
  const hue2 = (hash * 7) % 360;
  const hue3 = (hash * 13) % 360;
  
  return [
    `hsl(${hue1}, 70%, 60%)`,
    `hsl(${hue2}, 80%, 50%)`,
    `hsl(${hue3}, 60%, 55%)`
  ];
}

/**
 * Assign rarity-based planet type
 */
function assignPlanetType(username) {
  const hash = hashString(username);
  const roll = hash % 100;
  
  if (roll < 1) {
    // 1% - Very Rare
    return PLANET_TYPES.VERY_RARE[0];
  } else if (roll < 10) {
    // 9% - Rare
    return PLANET_TYPES.RARE[0];
  } else if (roll < 30) {
    // 20% - Uncommon
    const idx = seededRandom(hash, 0, PLANET_TYPES.UNCOMMON.length - 1);
    return PLANET_TYPES.UNCOMMON[idx];
  } else {
    // 70% - Common
    return PLANET_TYPES.COMMON[0];
  }
}

/**
 * Calculate planet size based on GitHub followers
 */
function calculateSize(followers) {
  if (followers >= 1000) return 4;
  if (followers >= 100) return 3;
  if (followers >= 10) return 2;
  return 1;
}

/**
 * Pick random elements for planet
 */
function pickElements(username, count = 2) {
  const hash = hashString(username);
  const elements = [];
  
  for (let i = 0; i < count; i++) {
    const idx = seededRandom(hash + i, 0, ELEMENTS_POOL.length - 1);
    const element = ELEMENTS_POOL[idx];
    if (!elements.includes(element)) {
      elements.push(element);
    }
  }
  
  // Ensure at least 1 element
  if (elements.length === 0) {
    elements.push(ELEMENTS_POOL[0]);
  }
  
  return elements;
}

/**
 * Generate complete planet configuration
 * @param {Object} stargazer - GitHub stargazer object
 * @param {Object} userDetails - GitHub user details (optional)
 * @returns {Object} Planet configuration
 */
function generatePlanet(stargazer, userDetails = null) {
  const username = stargazer.login;
  const followers = userDetails?.followers || 0;
  const bio = userDetails?.bio || '';
  
  const planetId = `github_${username}`;
  const planetType = assignPlanetType(username);
  const size = calculateSize(followers);
  const colors = generateColors(username);
  const elements = pickElements(username, 2);
  
  // Build info text
  let info = `Created by @${username}`;
  if (bio) {
    info += ` • ${bio}`;
  }
  if (followers > 0) {
    info += ` • ${followers} followers`;
  }
  
  return {
    id: planetId,
    name: username,
    type: planetType,
    size: size,
    elements: elements,
    colors: colors,
    info: info,
    github_url: stargazer.html_url,
    avatar_url: stargazer.avatar_url,
    github_id: stargazer.id,
    starred_at: new Date().toISOString()
  };
}

module.exports = {
  generatePlanet,
  generateColors,
  assignPlanetType,
  calculateSize
};
