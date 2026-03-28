# Development Mode

## Quick Start

### 1. Enable DEV_MODE

Edit `docker-compose.yml` and set:
```yaml
environment:
  DEV_MODE: "true"
```

This disables GitHub API sync so fake stargazers won't be removed.

### 2. Rebuild and Start

```bash
docker-compose down
docker-compose build cosmos-server
docker-compose up -d
```

### 3. Populate with Fake Stargazers

```bash
# Copy the populate script into the container
docker cp server/dev-populate.js cosmos_cosmos-server_1:/app/

# Generate 50 fake stargazers
docker exec cosmos_cosmos-server_1 node dev-populate.js 50

# Or any number you want (e.g., 100)
docker exec cosmos_cosmos-server_1 node dev-populate.js 100
```

### 4. Restart to Load

```bash
docker restart cosmos_cosmos-server_1
```

### 5. Check Status

```bash
curl http://localhost:3001/health
```

## What Gets Created

The script generates fake GitHub users with:
- Unique IDs (1000000+)
- Random names (alice, bob, charlie, etc.)
- Realistic planet configurations
- Smart orbital allocation (moons start appearing after 5 planets)

## Back to Production

Set `DEV_MODE: "false"` in docker-compose.yml and rebuild:

```bash
docker-compose down
docker-compose build cosmos-server
docker-compose up -d
```

The server will sync with real GitHub stargazers and remove fake ones.

## Current Configuration

With the improved orbital allocator:
- **First 5 planets**: Orbit COSMOS X directly
- **After 5**: New planets become moons (orbiting other planets)
- **Spacing**: Enhanced collision avoidance (40px buffer minimum)
- **Max moons per planet**: 10
- **Sync interval**: 10 seconds (instant updates)
