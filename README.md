# COSMOS Universe

A real-time interactive solar system visualization where anyone can create and add their own planets, moons, and stars!

![COSMOS](https://img.shields.io/badge/COSMOS-Universe-00ff41?style=for-the-badge)

## Live Demo

Visit the live universe at: **[dev.gianluca.click](http://dev.gianluca.click)**

## Features

- **Real-time visualization** - Watch planets orbit in real-time with smooth animations
- **Create your own planets** - Deploy a Docker container and see your planet appear instantly
- **Interactive controls** - Pan, zoom, and click on planets for details
- **Search functionality** - Find any planet by name
- **Space radio** - Listen to ambient space music while exploring

## Create Your Own Planet

### Quick Start

1. **Create a `docker-compose.yml` file:**

```yaml
services:
  my-planet:
    image: darkobyte/cosmos_planet
    environment:
      SERVER_URL: ws://dev.gianluca.click:3001
      PLANET_ID: my-unique-planet
      PLANET_NAME: My Planet
      PLANET_TYPE: planet
      PLANET_SIZE: "2"
      PLANET_ELEMENTS: water,rock
      PLANET_PARENT: sun
      PLANET_RADIUS: "200"
      PLANET_SPEED: "0.006"
      PLANET_INFO: "My awesome custom planet!"
    restart: unless-stopped
```

2. **Run it:**
```bash
docker-compose up -d
```

3. **Visit [dev.gianluca.click](http://dev.gianluca.click)** and search for your planet!

---

## Configuration Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVER_URL` | WebSocket URL of the cosmos server | `ws://dev.gianluca.click:3001` |
| `PLANET_ID` | Unique identifier (no spaces) | `my-planet-123` |

### Basic Properties

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PLANET_NAME` | Display name | Same as ID | `My Planet` |
| `PLANET_TYPE` | Type of body | `planet` | `star`, `planet`, `moon`, `asteroid`, `blackhole` |
| `PLANET_SIZE` | Visual size (1-4) | `2` | `1`=small, `2`=medium, `3`=large, `4`=huge |
| `PLANET_INFO` | Description text | empty | `A beautiful blue planet` |

### Composition

| Variable | Description | Default |
|----------|-------------|---------|
| `PLANET_ELEMENTS` | Comma-separated elements | `rock` |

**Available Elements:**
| Element | Color | Best For |
|---------|-------|----------|
| `water` | Cyan/Blue | Ocean planets, ice giants |
| `iron` | Red | Mars-like, rocky planets |
| `rock` | Gray | Moons, asteroids |
| `gas` | Yellow | Gas giants |
| `ice` | Light Blue | Ice worlds, comets |
| `fire` | Orange | Stars, volcanic worlds |
| `nitrogen` | Purple | Titan-like moons |
| `gold` | Gold | Special/rare bodies |
| `dark_matter` | Purple/Dark | Exotic stars, black holes |

**Tip:** Combine multiple elements for unique looks: `water,iron,rock` creates an Earth-like appearance!

### Orbital Mechanics

For orbiting bodies (planets around stars, moons around planets):

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PLANET_PARENT` | ID of parent body to orbit | `none` | `sun`, `earth`, `jupiter` |
| `PLANET_RADIUS` | Orbital distance in pixels | `150` | `100`-`500` |
| `PLANET_SPEED` | Orbital speed | `0.005` | `0.002`=slow, `0.01`=fast |

### Fixed Position

For stationary bodies (stars, central objects):

| Variable | Description | Example |
|----------|-------------|---------|
| `PLANET_PARENT` | Must be `none` | `none` |
| `PLANET_FIXED_X` | X position in pixels | `0`, `150`, `-200` |
| `PLANET_FIXED_Y` | Y position in pixels | `0`, `100`, `-150` |

**Note:** Fixed bodies must be at least 60px apart from each other.

---

## Examples

### Create a Star
```yaml
services:
  my-star:
    image: darkobyte/cosmos_planet
    environment:
      SERVER_URL: ws://dev.gianluca.click:3001
      PLANET_ID: my-star
      PLANET_NAME: Alpha Centauri
      PLANET_TYPE: star
      PLANET_SIZE: "4"
      PLANET_ELEMENTS: fire,gold
      PLANET_PARENT: "none"
      PLANET_FIXED_X: "-300"
      PLANET_FIXED_Y: "200"
      PLANET_INFO: "A distant star system"
    restart: unless-stopped
```

### Create an Orbiting Planet
```yaml
services:
  my-planet:
    image: darkobyte/cosmos_planet
    environment:
      SERVER_URL: ws://dev.gianluca.click:3001
      PLANET_ID: kepler-442b
      PLANET_NAME: Kepler-442b
      PLANET_TYPE: planet
      PLANET_SIZE: "2"
      PLANET_ELEMENTS: water,rock,ice
      PLANET_PARENT: sun
      PLANET_RADIUS: "250"
      PLANET_SPEED: "0.004"
      PLANET_INFO: "A potentially habitable exoplanet"
    restart: unless-stopped
```

### Create a Moon
```yaml
services:
  my-moon:
    image: darkobyte/cosmos_planet
    environment:
      SERVER_URL: ws://dev.gianluca.click:3001
      PLANET_ID: europa
      PLANET_NAME: Europa
      PLANET_TYPE: moon
      PLANET_SIZE: "1"
      PLANET_ELEMENTS: ice,water
      PLANET_PARENT: earth
      PLANET_RADIUS: "40"
      PLANET_SPEED: "0.03"
      PLANET_INFO: "An icy moon with a subsurface ocean"
    restart: unless-stopped
```

---

## Controls

| Action | Control |
|--------|---------|
| Pan | Click and drag |
| Zoom | Mouse scroll wheel |
| Select planet | Click on planet |
| Search | Type in search bar, press Enter |
| Toggle statusbar | Click arrow button |

---

## Self-Hosting

Want to run your own COSMOS server?

```bash
git clone https://github.com/DarkObyte/universe.git
cd universe
docker-compose up -d
```

This starts:
- **Frontend** - Vue.js visualization (port 80)
- **Server** - WebSocket server (port 3001)

---

## Project Structure

```
universe/
├── frontend/          # Vue.js frontend application
├── server/            # WebSocket server
├── planet-client/     # Planet client Docker image
├── examples/          # Example planet configurations
│   ├── earth/
│   ├── mars/
│   ├── moon/
│   └── sun/
└── docker-compose.yml # Main deployment
```

---

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## License

MIT License - feel free to use and modify!

---

Made by [DarkObyte](https://github.com/DarkObyte)
