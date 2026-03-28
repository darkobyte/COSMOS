# COSMOS Universe

A real-time interactive solar system visualization powered by **GitHub Stars**! ⭐

![COSMOS](https://img.shields.io/badge/COSMOS-Universe-00ff41?style=for-the-badge)

## Live Demo

Visit the live universe at: **[cosmos.gianluca.click](http://cosmos.gianluca.click)**

## ⭐ How It Works

**Every GitHub star creates a planet!** Simply star this repository and watch your planet appear in the universe:

1. **Star this repository** ⭐
2. Your planet is automatically created and added to the cosmos
3. **Visit [cosmos.gianluca.click](http://cosmos.gianluca.click)** to see your planet orbiting!

### Your Planet's Features
- **Unique appearance** - Generated from your GitHub profile colors
- **Size based on followers** - More followers = bigger planet!
- **Smart orbital mechanics** - Automatically assigned to avoid collisions
- **Profile integration** - Click your planet to see your GitHub profile
- **Persistent** - Your planet stays as long as you keep the star ⭐

### What Happens When You Unstar?
Your planet will be removed from the universe within 5 minutes (next sync cycle).

---

## Features

- **Real-time visualization** - Watch planets orbit in real-time with smooth animations
- **GitHub-powered** - Every star creates a unique planet automatically
- **Interactive controls** - Pan, zoom, and click on planets for details
- **Search functionality** - Find any planet by GitHub username
- **Space radio** - Listen to ambient space music while exploring
- **Smart collisions** - Planets are intelligently distributed to prevent overlaps

---

## Planet Types & Rarity

Your planet type is randomly assigned based on your username:

| Type | Rarity | Description |
|------|--------|-------------|
| 🪐 Planet | 70% | Standard orbiting planet |
| 🌙 Moon | 15% | Smaller satellite body |
| ☄️ Asteroid | 5% | Rocky, irregular body |
| 🕳️ Black Hole | 1% | Ultra-rare cosmic phenomenon |

### Planet Size
Based on your GitHub followers:
- 1-9 followers: Size 1 (small)
- 10-99 followers: Size 2 (medium)
- 100-999 followers: Size 3 (large)
- 1000+ followers: Size 4 (huge)

---

## Self-Hosting

Want to run your own COSMOS server?

```bash
git clone https://github.com/darkobyte/COSMOS.git
cd COSMOS
docker-compose up -d
```

This starts:
- **Frontend** - Vue.js visualization (port 80)
- **Server** - WebSocket server with GitHub integration (port 3001)

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_REPO` | GitHub repository to track | `darkobyte/COSMOS` |
| `SYNC_INTERVAL` | Sync interval in milliseconds | `300000` (5 minutes) |

---

## Project Structure

```
COSMOS/
├── frontend/              # Vue.js frontend application
├── server/                # WebSocket server with GitHub API
│   ├── lib/
│   │   ├── github.js      # GitHub API client
│   │   ├── planetGenerator.js  # Planet generation logic
│   │   ├── orbitalAllocator.js # Smart orbit distribution
│   │   └── storage.js     # JSON persistence
│   └── stargazers.json    # Persistent planet data
└── docker-compose.yml     # Main deployment
```

---

## How It Works Technically

1. **Server polls GitHub API** every 10 seconds for stargazers
2. **New stars** trigger automatic planet creation with:
   - Username-based colors and attributes
   - Smart orbital allocation to avoid collisions
   - Profile data integration
3. **Planets persist** in `stargazers.json` across server restarts
4. **Unstars are detected** and planets removed automatically
5. **WebSocket broadcasts** keep all viewers in sync in real-time

### Orbital System
- **COSMOS X** (central star) can have unlimited direct children
- Other planets can have max 10 satellites
- Planets distributed in rings to prevent collisions
- When primary orbits fill, planets become satellites of other planets

---

## API

The server exposes a health check endpoint:

```bash
GET /health

Response:
{
  "status": "ok",
  "bodies": 42,
  "viewers": 5,
  "last_sync": "2026-03-28T07:56:10.038Z"
}
```

---

## Controls

| Action | Control |
|--------|---------|
| Pan | Click and drag |
| Zoom | Mouse scroll wheel |
| Select planet | Click on planet |
| View GitHub profile | Click "View Profile" in planet info |
| Search | Type username in search bar |
| Toggle statusbar | Click arrow button |

---

## Ownership & Usage

This is the original COSMOS project by **Gianluca** (GitHub: [DarkObyte](https://github.com/DarkObyte)).

**Contributions are welcome**, but the code is **not** available to be re-published as your own project.

You may:
- View the source, open issues, and submit pull requests
- Fork/clone this repository **only as needed to contribute back**

You may **not**:
- Copy/re-upload this repository (or substantial parts of it) and present it as your own repo/project
- Remove attribution or claim authorship of this work
- Sell, license, or otherwise commercialize this code or derived works without explicit written permission

If you want to use this code beyond the permissions above (e.g., commercial use, redistribution, public re-hosting), please request permission from the maintainer.

---

## Contributing

1. Fork the repository (for contribution purposes)
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

By submitting a pull request, you agree that your contribution can be used, modified, and distributed as part of this project by the maintainer.

---

## License

**Copyright © Gianluca. All rights reserved.**

No open-source license is granted. The permissions and restrictions are described in the **Ownership & Usage** section above.

---

Made by [DarkObyte](https://github.com/DarkObyte)
