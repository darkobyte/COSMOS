/**
 * Orbital Allocator V2 - Multi-Solar System Architecture
 * Handles orbital assignment for:
 * - Generated suns around COSMOS X
 * - Planets around their suns
 * - Moons around their planets
 * - Black holes around COSMOS X
 * - Protects Sol (our real solar system)
 */

// COSMOS X orbital rings for suns and black holes
const SUN_ORBIT_MIN = 400;
const SUN_ORBIT_MAX = 2500;
const SUN_SPACING_BASE = 150;
const SUN_SPACING_JITTER = 80;

// Protected zone for Sol (our real solar system)
const SOL_ORBIT_RADIUS = 300; // Sol's approximate orbit
const SOL_PROTECTED_ZONE = 200; // Don't place anything within this range of Sol

// Planet orbits around generated suns (much tighter than around COSMOS X)
const PLANET_ORBIT_MIN = 40;
const PLANET_ORBIT_MAX = 250;
const PLANET_SPACING_BASE = 25;
const PLANET_SPACING_JITTER = 15;

// Moon orbits around planets
const MOON_ORBIT_MIN = 20;
const MOON_ORBIT_MAX = 80;
const MOON_SPACING_BASE = 15;

// Black hole orbits
const BLACKHOLE_ORBIT_MIN = 600;
const BLACKHOLE_ORBIT_MAX = 2800;

class OrbitalAllocatorV2 {
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
   * Check if a position is too close to Sol's system
   */
  isTooCloseToSol(radius) {
    return Math.abs(radius - SOL_ORBIT_RADIUS) < SOL_PROTECTED_ZONE;
  }

  /**
   * Allocate orbit for a generated sun around COSMOS X
   */
  allocateSunOrbit() {
    const existingSuns = this.getChildren('cosmos_x').filter(child => 
      child.type === 'star' && child.id !== 'sol'
    );

    // Progressive expansion strategy
    const sunCount = existingSuns.length;
    const expansionPerSun = 100;
    const maxSearchRadius = Math.min(
      SUN_ORBIT_MAX,
      SUN_ORBIT_MIN + (sunCount * expansionPerSun)
    );

    // Try to find a safe spot
    for (let attempt = 0; attempt < 100; attempt++) {
      const t = Math.random() ** 1.3; // Bias towards inner orbits
      const candidate = SUN_ORBIT_MIN + t * (maxSearchRadius - SUN_ORBIT_MIN);

      // Check if too close to Sol
      if (this.isTooCloseToSol(candidate)) {
        continue;
      }

      // Check collision with other suns
      let safe = true;
      for (const sun of existingSuns) {
        const distance = Math.abs(candidate - sun.orbit_radius);
        if (distance < SUN_SPACING_BASE) {
          safe = false;
          break;
        }
      }

      if (safe) {
        return {
          orbit_parent_id: 'cosmos_x',
          orbit_radius: candidate,
          orbit_speed: 0.0003 + Math.random() * 0.0007, // Slow orbit
          orbit_angle_start: Math.random() * Math.PI * 2
        };
      }
    }

    // Fallback: place after the last sun
    let maxRadius = SUN_ORBIT_MIN;
    for (const sun of existingSuns) {
      if (sun.orbit_radius > maxRadius) {
        maxRadius = sun.orbit_radius;
      }
    }

    const fallbackRadius = maxRadius + SUN_SPACING_BASE + Math.random() * SUN_SPACING_JITTER;
    
    return {
      orbit_parent_id: 'cosmos_x',
      orbit_radius: fallbackRadius,
      orbit_speed: 0.0003 + Math.random() * 0.0007,
      orbit_angle_start: Math.random() * Math.PI * 2
    };
  }

  /**
   * Allocate orbit for a black hole around COSMOS X
   */
  allocateBlackHoleOrbit() {
    const existingBlackHoles = this.getChildren('cosmos_x').filter(child => 
      child.type === 'blackhole'
    );

    // Black holes get outer orbits
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = BLACKHOLE_ORBIT_MIN + Math.random() * (BLACKHOLE_ORBIT_MAX - BLACKHOLE_ORBIT_MIN);

      // Check if too close to Sol
      if (this.isTooCloseToSol(candidate)) {
        continue;
      }

      // Check collision
      let safe = true;
      for (const bh of existingBlackHoles) {
        const distance = Math.abs(candidate - bh.orbit_radius);
        if (distance < 200) {
          safe = false;
          break;
        }
      }

      if (safe) {
        return {
          orbit_parent_id: 'cosmos_x',
          orbit_radius: candidate,
          orbit_speed: 0.0002 + Math.random() * 0.0004, // Very slow
          orbit_angle_start: Math.random() * Math.PI * 2
        };
      }
    }

    // Fallback
    let maxRadius = BLACKHOLE_ORBIT_MIN;
    for (const bh of existingBlackHoles) {
      if (bh.orbit_radius > maxRadius) {
        maxRadius = bh.orbit_radius;
      }
    }

    return {
      orbit_parent_id: 'cosmos_x',
      orbit_radius: maxRadius + 250,
      orbit_speed: 0.0002 + Math.random() * 0.0004,
      orbit_angle_start: Math.random() * Math.PI * 2
    };
  }

  /**
   * Allocate orbit for a planet around its sun
   */
  allocatePlanetOrbit(sunId, planetSize) {
    const siblings = this.getChildren(sunId);
    
    if (siblings.length === 0) {
      // First planet - close to sun
      return {
        orbit_parent_id: sunId,
        orbit_radius: PLANET_ORBIT_MIN + Math.random() * 20,
        orbit_speed: 0.004 + Math.random() * 0.008,
        orbit_angle_start: Math.random() * Math.PI * 2
      };
    }

    // Progressive placement
    const planetCount = siblings.length;
    const searchMax = Math.min(
      PLANET_ORBIT_MAX,
      PLANET_ORBIT_MIN + (planetCount * 30)
    );

    // Try to find a spot
    for (let attempt = 0; attempt < 50; attempt++) {
      const t = Math.random() ** 1.2;
      const candidate = PLANET_ORBIT_MIN + t * (searchMax - PLANET_ORBIT_MIN);

      let safe = true;
      for (const sibling of siblings) {
        const minDistance = PLANET_SPACING_BASE + (planetSize + (sibling.size || 1)) * 3;
        if (Math.abs(candidate - sibling.orbit_radius) < minDistance) {
          safe = false;
          break;
        }
      }

      if (safe) {
        return {
          orbit_parent_id: sunId,
          orbit_radius: candidate,
          orbit_speed: 0.004 + Math.random() * 0.008,
          orbit_angle_start: Math.random() * Math.PI * 2
        };
      }
    }

    // Fallback: place after the last planet
    let maxRadius = PLANET_ORBIT_MIN;
    for (const sibling of siblings) {
      if (sibling.orbit_radius > maxRadius) {
        maxRadius = sibling.orbit_radius;
      }
    }

    return {
      orbit_parent_id: sunId,
      orbit_radius: maxRadius + PLANET_SPACING_BASE + Math.random() * PLANET_SPACING_JITTER,
      orbit_speed: 0.004 + Math.random() * 0.008,
      orbit_angle_start: Math.random() * Math.PI * 2
    };
  }

  /**
   * Allocate orbit for a moon around its planet
   */
  allocateMoonOrbit(planetId, moonSize) {
    const siblings = this.getChildren(planetId);

    if (siblings.length === 0) {
      // First moon
      return {
        orbit_parent_id: planetId,
        orbit_radius: MOON_ORBIT_MIN + Math.random() * 15,
        orbit_speed: 0.015 + Math.random() * 0.020,
        orbit_angle_start: Math.random() * Math.PI * 2
      };
    }

    // Try to find a spot
    for (let attempt = 0; attempt < 30; attempt++) {
      const candidate = MOON_ORBIT_MIN + Math.random() * (MOON_ORBIT_MAX - MOON_ORBIT_MIN);

      let safe = true;
      for (const sibling of siblings) {
        const minDistance = MOON_SPACING_BASE + (moonSize + (sibling.size || 1)) * 2;
        if (Math.abs(candidate - sibling.orbit_radius) < minDistance) {
          safe = false;
          break;
        }
      }

      if (safe) {
        return {
          orbit_parent_id: planetId,
          orbit_radius: candidate,
          orbit_speed: 0.015 + Math.random() * 0.020,
          orbit_angle_start: Math.random() * Math.PI * 2
        };
      }
    }

    // Fallback
    let maxRadius = MOON_ORBIT_MIN;
    for (const sibling of siblings) {
      if (sibling.orbit_radius > maxRadius) {
        maxRadius = sibling.orbit_radius;
      }
    }

    return {
      orbit_parent_id: planetId,
      orbit_radius: Math.min(MOON_ORBIT_MAX, maxRadius + MOON_SPACING_BASE),
      orbit_speed: 0.015 + Math.random() * 0.020,
      orbit_angle_start: Math.random() * Math.PI * 2
    };
  }
}

module.exports = OrbitalAllocatorV2;
