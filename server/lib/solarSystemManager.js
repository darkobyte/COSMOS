/**
 * Solar System Manager
 * Manages creation and assignment of mini solar systems for GitHub stargazers
 */

// System configuration
const MIN_PLANETS_PER_SYSTEM = 1;

// Hard caps per system
const MAX_PLANETS_PER_SYSTEM = 5;
const MAX_MOONS_PER_SYSTEM = 3;

// System creation gating
// A new system may only be created once ALL existing systems have at least this many planets.
const MIN_PLANETS_BEFORE_NEW_SYSTEM = 3;

// Assignment behavior
// 30% chance a user becomes a moon (only when moon slots exist)
const MOON_PROBABILITY = 0.30;
// After the "min planets" baseline is met, this is the chance to start a fresh system
// instead of filling existing systems up to MAX_PLANETS_PER_SYSTEM.
const NEW_SYSTEM_CREATION_PROBABILITY = 0.35;

const BLACKHOLE_SPAWN_RATE = 0.05; // 5% chance per 10 stargazers

// Sun name pools
const SUN_NAMES_GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 
                          'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 
                          'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];

const SUN_NAMES_STARS = ['Sirius', 'Betelgeuse', 'Rigel', 'Vega', 'Arcturus', 'Capella', 
                          'Aldebaran', 'Antares', 'Pollux', 'Deneb', 'Regulus', 'Altair'];

const SUN_COLORS = [
  { colors: ['#FFE4B5', '#FFD700', '#FFA500'], elements: ['fire', 'gas'], temp: 'hot' },
  { colors: ['#87CEEB', '#4682B4', '#1E90FF'], elements: ['gas', 'nitrogen'], temp: 'cool' },
  { colors: ['#FF6347', '#FF4500', '#DC143C'], elements: ['fire', 'dark_matter'], temp: 'red_giant' },
  { colors: ['#F0E68C', '#FFFFE0', '#FFFACD'], elements: ['fire', 'gold'], temp: 'yellow' },
  { colors: ['#E0FFFF', '#F0F8FF', '#FFFFFF'], elements: ['ice', 'gas'], temp: 'white_dwarf' }
];

/**
 * Hash string to get consistent random values
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

class SolarSystemManager {
  constructor() {
    this.systems = new Map(); // systemId -> system data
    this.userToSystem = new Map(); // userId -> systemId
    this.sunCounter = 0;
    this.blackholeCounter = 0;
  }

  /**
   * Generate a unique sun name
   */
  generateSunName() {
    const namePool = Math.random() > 0.5 ? SUN_NAMES_GREEK : SUN_NAMES_STARS;
    
    if (this.sunCounter < namePool.length) {
      return namePool[this.sunCounter];
    }
    
    // Fallback to numbered names
    return `Star-${this.sunCounter + 1}`;
  }

  /**
   * Generate sun properties
   */
  generateSun(systemId) {
    this.sunCounter++;
    const name = this.generateSunName();
    const colorSet = SUN_COLORS[Math.floor(Math.random() * SUN_COLORS.length)];
    const size = 2 + Math.floor(Math.random() * 2); // Size 2-3
    
    return {
      id: `sun_${systemId}`,
      name: name,
      type: 'star',
      size: size,
      elements: colorSet.elements,
      colors: colorSet.colors,
      info: `${name} - A ${colorSet.temp} star system`,
      system_id: systemId,
      registered_at: Date.now()
    };
  }

  /**
   * Generate black hole
   */
  generateBlackHole() {
    this.blackholeCounter++;
    return {
      id: `blackhole_${this.blackholeCounter}`,
      name: `Void ${this.blackholeCounter}`,
      type: 'blackhole',
      size: 3,
      elements: ['dark_matter'],
      colors: ['#000000', '#1a1a1a', '#0a0a0a'],
      info: `A mysterious black hole consuming everything nearby 🕳️`,
      registered_at: Date.now()
    };
  }

  /**
   * Check if we should spawn a black hole
   */
  shouldSpawnBlackHole(totalStargazers) {
    // 5% chance every 10 stargazers
    const checkpoints = Math.floor(totalStargazers / 10);
    const existingBlackholes = this.blackholeCounter;
    
    return checkpoints > existingBlackholes && Math.random() < BLACKHOLE_SPAWN_RATE;
  }

  /**
   * A new system may only be created once all existing systems have at least
   * MIN_PLANETS_BEFORE_NEW_SYSTEM planets.
   */
  canCreateNewSystem() {
    if (this.systems.size === 0) return true;

    for (const [, system] of this.systems) {
      if (system.planets.length < MIN_PLANETS_BEFORE_NEW_SYSTEM) return false;
    }

    return true;
  }

  /**
   * Create and register a new solar system
   */
  createSystem() {
    const newSystemId = `system_${this.systems.size + 1}`;
    const sun = this.generateSun(newSystemId);

    this.systems.set(newSystemId, {
      id: newSystemId,
      sun,
      planets: [],
      moons: [],
      created_at: Date.now()
    });

    return newSystemId;
  }

  /**
   * Pick an existing system that can accept a new planet.
   * Returns null if a new system should be created.
   */
  findSystemForPlanet() {
    // First: ensure every existing system reaches the baseline before expanding
    let bestUnderMin = null;
    let bestUnderMinPlanets = Infinity;

    for (const [systemId, system] of this.systems) {
      if (system.planets.length >= MAX_PLANETS_PER_SYSTEM) continue;

      if (system.planets.length < MIN_PLANETS_BEFORE_NEW_SYSTEM) {
        if (system.planets.length < bestUnderMinPlanets) {
          bestUnderMin = systemId;
          bestUnderMinPlanets = system.planets.length;
        }
      }
    }

    if (bestUnderMin) return bestUnderMin;

    // Next: choose between filling existing systems or creating a new one
    const candidates = [];
    for (const [systemId, system] of this.systems) {
      if (system.planets.length < MAX_PLANETS_PER_SYSTEM) {
        candidates.push({ systemId, planets: system.planets.length, moons: system.moons.length });
      }
    }

    if (candidates.length === 0) return null;

    if (this.canCreateNewSystem() && Math.random() < NEW_SYSTEM_CREATION_PROBABILITY) {
      return null;
    }

    // Balance: pick the system with the fewest planets (then fewest moons)
    candidates.sort((a, b) => (a.planets - b.planets) || (a.moons - b.moons));
    return candidates[0].systemId;
  }

  /**
   * Pick an existing system that can accept a new moon.
   */
  findSystemForMoon() {
    const candidates = [];

    for (const [systemId, system] of this.systems) {
      if (system.planets.length === 0) continue;
      if (system.moons.length >= MAX_MOONS_PER_SYSTEM) continue;

      candidates.push({ systemId, planets: system.planets.length, moons: system.moons.length });
    }

    if (candidates.length === 0) return null;

    // Prefer systems with fewer moons (spread them out)
    candidates.sort((a, b) => (a.moons - b.moons) || (b.planets - a.planets));
    return candidates[0].systemId;
  }

  /**
   * Assign a user to a system as either a planet or moon.
   * Enforces hard caps at mutation time.
   */
  assignUserToSystem(userId, planetData) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const moonSystemId = this.findSystemForMoon();
      const wantsMoon = Math.random() < MOON_PROBABILITY;

      let systemId;
      let isMoon = false;

      if (wantsMoon && moonSystemId) {
        systemId = moonSystemId;
        isMoon = true;
      } else {
        const planetSystemId = this.findSystemForPlanet();
        systemId = planetSystemId || this.createSystem();
        isMoon = false;
      }

      const system = this.systems.get(systemId);
      if (!system) continue;

      if (isMoon) {
        if (system.planets.length === 0) continue;
        if (system.moons.length >= MAX_MOONS_PER_SYSTEM) continue;

        const randomPlanet = system.planets[Math.floor(Math.random() * system.planets.length)];
        system.moons.push({
          userId,
          parentPlanetId: randomPlanet.userId,
          planetData
        });
      } else {
        if (system.planets.length >= MAX_PLANETS_PER_SYSTEM) {
          continue;
        }

        system.planets.push({
          userId,
          planetData
        });
      }

      this.userToSystem.set(userId, systemId);
      return { systemId, isMoon };
    }

    throw new Error('Failed to assign user to a system after multiple attempts');
  }

  /**
   * Remove user from system
   */
  removeUserFromSystem(userId) {
    const systemId = this.userToSystem.get(userId);
    if (!systemId) return null;

    const system = this.systems.get(systemId);
    if (!system) return null;

    // Remove from planets
    const planetIndex = system.planets.findIndex(p => p.userId === userId);
    if (planetIndex !== -1) {
      system.planets.splice(planetIndex, 1);
      
      // Remove any moons that orbited this planet
      system.moons = system.moons.filter(m => m.parentPlanetId !== userId);
    }

    // Remove from moons
    const moonIndex = system.moons.findIndex(m => m.userId === userId);
    if (moonIndex !== -1) {
      system.moons.splice(moonIndex, 1);
    }

    this.userToSystem.delete(userId);

    // If system is now empty, remove it
    if (system.planets.length === 0 && system.moons.length === 0) {
      this.systems.delete(systemId);
      return { systemId, systemRemoved: true };
    }

    return { systemId, systemRemoved: false };
  }

  /**
   * Get system for a user
   */
  getSystemForUser(userId) {
    const systemId = this.userToSystem.get(userId);
    return systemId ? this.systems.get(systemId) : null;
  }

  /**
   * Get all systems
   */
  getAllSystems() {
    return Array.from(this.systems.values());
  }

  /**
   * Get total planet count across all systems
   */
  getTotalPlanetCount() {
    let count = 0;
    for (const system of this.systems.values()) {
      count += system.planets.length + system.moons.length;
    }
    return count;
  }

  /**
   * Export state for persistence
   */
  exportState() {
    const systems = [];
    for (const [systemId, system] of this.systems) {
      systems.push({
        id: systemId,
        sun: system.sun,
        planets: system.planets.map(p => p.userId),
        moons: system.moons.map(m => ({ userId: m.userId, parentPlanetId: m.parentPlanetId })),
        created_at: system.created_at
      });
    }

    return {
      systems,
      sunCounter: this.sunCounter,
      blackholeCounter: this.blackholeCounter
    };
  }

  /**
   * Import state from persistence
   */
  importState(state) {
    if (!state || !state.systems) return;

    this.sunCounter = state.sunCounter || 0;
    this.blackholeCounter = state.blackholeCounter || 0;

    for (const systemData of state.systems) {
      if (systemData.planets && systemData.planets.length > MAX_PLANETS_PER_SYSTEM) {
        console.warn(`  [Systems] Warning: ${systemData.id} has ${systemData.planets.length} planets in storage (max is ${MAX_PLANETS_PER_SYSTEM}).`);
      }
      if (systemData.moons && systemData.moons.length > MAX_MOONS_PER_SYSTEM) {
        console.warn(`  [Systems] Warning: ${systemData.id} has ${systemData.moons.length} moons in storage (max is ${MAX_MOONS_PER_SYSTEM}).`);
      }

      this.systems.set(systemData.id, {
        id: systemData.id,
        sun: systemData.sun,
        planets: systemData.planets.map(userId => ({ userId, planetData: null })),
        moons: systemData.moons.map(m => ({ userId: m.userId, parentPlanetId: m.parentPlanetId, planetData: null })),
        created_at: systemData.created_at
      });

      // Rebuild user to system mapping
      for (const userId of systemData.planets) {
        this.userToSystem.set(userId, systemData.id);
      }
      for (const moon of systemData.moons) {
        this.userToSystem.set(moon.userId, systemData.id);
      }
    }
  }
}

module.exports = SolarSystemManager;
