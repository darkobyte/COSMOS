/**
 * Smart orbital allocation system
 * - COSMOS X can have unlimited direct children
 * - Other planets can have max 10 children
 * - One planet per ring (distance level)
 * - Avoid collisions based on planet size
 */

const COLLISION_BUFFER = 20; // Minimum spacing in px
const MAX_CHILDREN_PER_PLANET = 10; // Except COSMOS X (unlimited)

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
   * Check if planet has reached max children
   */
  isParentFull(parentId) {
    // COSMOS X can have unlimited children
    if (parentId === 'cosmos_x') {
      return false;
    }
    
    const childCount = this.getChildren(parentId).length;
    return childCount >= MAX_CHILDREN_PER_PLANET;
  }

  /**
   * Calculate safe orbit radius to avoid collisions
   */
  calculateSafeRadius(parentId, planetSize) {
    const children = this.getChildren(parentId);
    
    if (children.length === 0) {
      // First child: start at radius 100-150
      return 100 + Math.random() * 50;
    }

    // Sort existing children by radius
    children.sort((a, b) => a.orbit_radius - b.orbit_radius);

    // Find a gap that fits our planet
    let candidateRadius = 100; // Start radius

    for (const child of children) {
      const minDistance = (planetSize + child.size) * 7 + COLLISION_BUFFER;
      const radiusDiff = Math.abs(candidateRadius - child.orbit_radius);

      if (radiusDiff < minDistance) {
        // Too close, move further out
        candidateRadius = child.orbit_radius + minDistance + 20;
      }
    }

    // Add some randomness for visual variety
    candidateRadius += Math.random() * 30;

    return candidateRadius;
  }

  /**
   * Pick a random planet to become a parent
   */
  selectRandomParent() {
    const candidates = [];
    
    for (const [id, entry] of this.bodies) {
      if (!this.isParentFull(id)) {
        candidates.push(id);
      }
    }

    if (candidates.length === 0) {
      return 'cosmos_x'; // Fallback to center
    }

    // Prefer larger planets as parents
    candidates.sort((a, b) => {
      const sizeA = this.bodies.get(a).body.size;
      const sizeB = this.bodies.get(b).body.size;
      return sizeB - sizeA;
    });

    // Pick from top 30% of candidates (weighted towards large planets)
    const topCandidates = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * 0.3)));
    return topCandidates[Math.floor(Math.random() * topCandidates.length)];
  }

  /**
   * Allocate orbit for new planet
   * @param {Object} planet - Planet configuration
   * @returns {Object} Orbit data { parent_id, radius, speed }
   */
  allocateOrbit(planet) {
    // Select parent
    let parentId = 'cosmos_x';
    
    // If COSMOS X is getting crowded (>50 direct children), use other planets as parents
    const cosmosChildren = this.getChildren('cosmos_x');
    if (cosmosChildren.length > 50) {
      parentId = this.selectRandomParent();
    }

    // Calculate safe radius
    const radius = this.calculateSafeRadius(parentId, planet.size);

    // Calculate orbit speed (slower for further orbits)
    const baseSpeed = 0.001;
    const speed = baseSpeed + (Math.random() * 0.004);

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
