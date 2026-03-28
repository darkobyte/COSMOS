/**
 * Smart orbital allocation system
 * - COSMOS X can have unlimited direct children
 * - Only planets that directly orbit COSMOS X can have moons (no moon-of-moon)
 * - Moon count is per-planet and deterministic (stable across restarts)
 * - Moons orbit close to their parent with a bit more spacing and randomness
 * - Planet spacing around COSMOS X is safe but has organic randomness
 */

const COSMOS_X_THRESHOLD = 5; // After N planets, start creating moons

// Moon orbits (tight but visible)
const MOON_ORBIT_MIN = 30;
const MOON_ORBIT_MAX = 125;
const MOON_SPACING_BASE = 25; // Bigger spacing between moons

// Planet spacing around COSMOS X (keep the whole system compact)
const COSMOS_FIRST_ORBIT_MIN = 150;
const COSMOS_FIRST_ORBIT_MAX = 220;
const COSMOS_ORBIT_MAX = 5999; // soft cap for planet orbits around COSMOS X

// These directly control how far planets get pushed out.
const PLANET_COLLISION_BUFFER = 30; // safety margin between planet orbit "bands"
const PLANET_SPACING_BASE = 55; // base spacing between planets
const PLANET_SPACING_JITTER = 90; // extra random spacing

// Co-orbital planets (same orbit radius is allowed if speed matches, so they never drift together)
const COORBIT_PROB_BASE = 0.18;
const COORBIT_PROB_MAX = 0.45;
const MAX_COORBIT_PER_ORBIT = 2;
const COORBIT_RADIUS_EPS = 0.5;
const COORBIT_SPEED_EPS = 1e-12;

class OrbitalAllocator {
  constructor(bodies) {
    this.bodies = bodies; // Map of existing bodies
  }

  /**
   * Get all children of a parent
   */
  getChildren(parentId) {
    const children = [];
    for (const [, entry] of this.bodies) {
      if (entry.body.orbit_parent_id === parentId) {
        children.push(entry.body);
      }
    }
    return children;
  }

  /**
   * Deterministic hash for stable per-planet parameters
   */
  hashId(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    return h;
  }

  /**
   * Max moons for a given parent (stable across restarts)
   * Most planets get a small number; a few get more.
   */
  getMoonCapacity(parentId) {
    if (parentId === 'cosmos_x') return Infinity;

    const h = this.hashId(parentId);

    // 2..7 moons usually
    let cap = 2 + (h % 6);

    // Rare "big" moon systems
    if (h % 17 === 0) cap += 3; // 5..10

    return Math.min(10, cap);
  }

  /**
   * Check if planet has reached max children (moons)
   */
  isParentFull(parentId) {
    if (parentId === 'cosmos_x') return false;

    const childCount = this.getChildren(parentId).length;
    return childCount >= this.getMoonCapacity(parentId);
  }

  /**
   * Calculate maximum moon orbit radius for a planet
   */
  getMaxMoonRadius(parentId) {
    if (parentId === 'cosmos_x') {
      return 0; // COSMOS X doesn't have moons itself
    }
    
    const children = this.getChildren(parentId);
    if (children.length === 0) {
      return 0;
    }
    
    // Find the furthest moon
    let maxRadius = 0;
    for (const child of children) {
      if (child.orbit_radius > maxRadius) {
        maxRadius = child.orbit_radius;
      }
    }
    
    return maxRadius;
  }

  /**
   * Calculate safe orbit radius to avoid collisions
   */
  calculateSafeRadius(parentId, planetSize, planetId = null) {
    const children = this.getChildren(parentId);

    // Moons (orbiting a planet, not COSMOS X)
    if (parentId !== 'cosmos_x') {
      // Try to place the moon at a random radius within a tight range
      const attempts = 25;

      for (let a = 0; a < attempts; a++) {
        const candidate = MOON_ORBIT_MIN + Math.random() * (MOON_ORBIT_MAX - MOON_ORBIT_MIN);

        let ok = true;
        for (const sibling of children) {
          const minDistance = MOON_SPACING_BASE + (planetSize + sibling.size) * 2;
          if (Math.abs(candidate - sibling.orbit_radius) < minDistance) {
            ok = false;
            break;
          }
        }

        if (ok) return candidate;
      }

      // Fallback: pack outward with spacing, capped
      const packed = MOON_ORBIT_MIN + children.length * MOON_SPACING_BASE;
      return Math.min(MOON_ORBIT_MAX, packed);
    }

    // Planets orbiting COSMOS X
    if (children.length === 0) {
      return COSMOS_FIRST_ORBIT_MIN + Math.random() * (COSMOS_FIRST_ORBIT_MAX - COSMOS_FIRST_ORBIT_MIN);
    }

    // Reserve only the expected moon band for this planet (based on its capacity)
    const ourCap = planetId ? this.getMoonCapacity(planetId) : 6;
    const ourMoonReserve = Math.min(MOON_ORBIT_MAX, MOON_ORBIT_MIN + ourCap * MOON_SPACING_BASE);

    // Our planet orbit "band" includes its own size and reserved moon radius
    const ourBand = planetSize * 8 + ourMoonReserve + PLANET_COLLISION_BUFFER;

    // Try to place within a bounded radius range first (keeps the system compact)
    const attempts = 250;
    for (let a = 0; a < attempts; a++) {
      // Bias slightly towards inner orbits to avoid pushing everything out
      const t = Math.random() ** 1.6;
      const candidate = COSMOS_FIRST_ORBIT_MIN + t * (COSMOS_ORBIT_MAX - COSMOS_FIRST_ORBIT_MIN);

      let ok = true;
      for (const child of children) {
        // Reserve expected moon band for the existing planet (not always the full max)
        const childCap = this.getMoonCapacity(child.id);
        const childMoonReserve = Math.min(MOON_ORBIT_MAX, MOON_ORBIT_MIN + childCap * MOON_SPACING_BASE);
        const childBand = (child.size || 1) * 8 + childMoonReserve + PLANET_COLLISION_BUFFER;

        const minDistance = childBand + ourBand + PLANET_SPACING_BASE;
        if (Math.abs(candidate - child.orbit_radius) < minDistance) {
          ok = false;
          break;
        }
      }

      if (ok) {
        return candidate;
      }
    }

    // Fallback: if too crowded, place just outside the current max with some jitter
    let maxR = 0;
    for (const child of children) {
      if (child.orbit_radius > maxR) maxR = child.orbit_radius;
    }

    return maxR + ourBand + PLANET_SPACING_BASE + Math.random() * PLANET_SPACING_JITTER;
  }

  /**
   * Pick a parent for a moon (never pick moons!)
   * Weighted towards planets that still have capacity.
   */
  selectRandomParent() {
    const candidates = [];

    for (const [id, entry] of this.bodies) {
      if (id === 'cosmos_x') continue;
      if (entry.body.orbit_parent_id !== 'cosmos_x') continue; // no moon-of-moon
      if (this.isParentFull(id)) continue;

      const size = entry.body.size || 1;
      const used = this.getChildren(id).length;
      const cap = this.getMoonCapacity(id);
      const remaining = Math.max(0, cap - used);

      // Prefer planets with more remaining capacity; slightly prefer larger planets too
      const weight = (1 + remaining) * (1 + size / 4);
      candidates.push({ id, weight });
    }

    if (candidates.length === 0) return 'cosmos_x';

    const total = candidates.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c.id;
    }

    return candidates[candidates.length - 1].id;
  }

  coOrbitGroupCount(children, radius, speed) {
    let count = 0;
    for (const child of children) {
      if (Math.abs((child.orbit_radius ?? 0) - radius) > COORBIT_RADIUS_EPS) continue;
      if (Math.abs((child.orbit_speed ?? 0) - speed) > COORBIT_SPEED_EPS) continue;
      count++;
    }
    return count;
  }

  pickCoOrbitSlot(cosmosChildren) {
    // Choose an existing orbit (radius+speed) that isn't already crowded.
    const candidates = [];
    for (const child of cosmosChildren) {
      const r = child.orbit_radius;
      const s = child.orbit_speed;
      if (typeof r !== 'number' || typeof s !== 'number') continue;
      if (r <= 0 || s <= 0) continue;
      if (r > COSMOS_ORBIT_MAX) continue;

      const groupCount = this.coOrbitGroupCount(cosmosChildren, r, s);
      if (groupCount >= MAX_COORBIT_PER_ORBIT) continue;

      candidates.push({ radius: r, speed: s });
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Allocate orbit for new planet
   * @param {Object} planet - Planet configuration
   * @returns {Object} Orbit data { parent_id, radius, speed }
   */
  allocateOrbit(planet) {
    // Select parent
    let parentId = 'cosmos_x';

    const cosmosChildren = this.getChildren('cosmos_x');
    if (cosmosChildren.length >= COSMOS_X_THRESHOLD) {
      // Not every new body becomes a moon — keep it random/organic
      // As COSMOS X gets crowded, increase moon probability a bit.
      const crowd = cosmosChildren.length - COSMOS_X_THRESHOLD;
      const moonProb = Math.min(0.90, 0.65 + crowd * 0.01); // 65%..90%

      if (Math.random() < moonProb) {
        const selectedParent = this.selectRandomParent();
        if (selectedParent !== 'cosmos_x') {
          parentId = selectedParent;
        }
      }
    }

    let radius;
    let speed;

    if (parentId === 'cosmos_x') {
      // Planets are slower
      speed = 0.0004 + Math.random() * 0.0012;

      // Co-orbital mode: allow sharing an existing orbit if speed matches exactly.
      // This keeps the system compact without causing drift collisions.
      const crowd = Math.max(0, cosmosChildren.length - COSMOS_X_THRESHOLD);
      const coProb = Math.min(COORBIT_PROB_MAX, COORBIT_PROB_BASE + crowd * 0.02);

      if (cosmosChildren.length > 0 && Math.random() < coProb) {
        const slot = this.pickCoOrbitSlot(cosmosChildren);
        if (slot) {
          radius = slot.radius;
          speed = slot.speed;
        }
      }

      if (typeof radius !== 'number') {
        radius = this.calculateSafeRadius(parentId, planet.size, planet.id);
      }

      // If COSMOS X is too crowded and we'd push this planet way out,
      // prefer making it a moon instead of expanding the whole system.
      if (radius > COSMOS_ORBIT_MAX) {
        const selectedParent = this.selectRandomParent();
        if (selectedParent !== 'cosmos_x') {
          parentId = selectedParent;
          radius = this.calculateSafeRadius(parentId, planet.size, planet.id);
          speed = 0.0035 + Math.random() * 0.0040; // moons are faster
        }
      }
    } else {
      // Moons are faster
      radius = this.calculateSafeRadius(parentId, planet.size, planet.id);
      speed = 0.0035 + Math.random() * 0.0040;
    }

    return {
      orbit_parent_id: parentId,
      orbit_radius: radius,
      orbit_speed: speed
    };
  }

  /**
   * Validate that orbit doesn't collide with existing bodies
   */
  validateOrbit(parentId, radius, planetSize) {
    const siblings = this.getChildren(parentId);
    
    for (const sibling of siblings) {
      const minDistance = (planetSize + sibling.size) * 7 + COLLISION_BUFFER;
      const radiusDiff = Math.abs(radius - sibling.orbit_radius);
      
      if (radiusDiff < minDistance) {
        return false; // Collision detected
      }
    }
    
    return true; // Safe
  }
}

module.exports = OrbitalAllocator;
