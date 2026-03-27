const http = require('http')
const { WebSocketServer } = require('ws')

// ─── State ─────────────────────────────────────────────────────────────────

const bodies = new Map()   // id -> { body: {...}, ws: WebSocket|null }
const viewers = new Set()  // browser connections

// ─── Validation ────────────────────────────────────────────────────────────

const VALID_TYPES = ['star', 'planet', 'moon', 'asteroid', 'blackhole']
const VALID_ELEMENTS = ['water', 'iron', 'rock', 'gas', 'ice', 'fire', 'nitrogen', 'gold', 'dark_matter']

function validateBody(body) {
  if (!body.id || typeof body.id !== 'string' || body.id.includes(' ')) {
    return 'id: required string with no spaces'
  }
  if (!body.name || typeof body.name !== 'string') {
    return 'name: required string'
  }
  if (!VALID_TYPES.includes(body.type)) {
    return `type: must be one of ${VALID_TYPES.join(', ')}`
  }
  if (!Array.isArray(body.elements) || body.elements.length === 0) {
    return 'elements: non-empty array required'
  }
  for (const el of body.elements) {
    if (!VALID_ELEMENTS.includes(el)) {
      return `elements: "${el}" is not valid. Must be one of ${VALID_ELEMENTS.join(', ')}`
    }
  }
  const size = body.size
  if (!Number.isInteger(size) || size < 1 || size > 4) {
    return 'size: integer between 1 and 4'
  }
  if (body.orbit_parent_id && body.orbit_parent_id !== 'none') {
    if (typeof body.orbit_radius !== 'number' || body.orbit_radius <= 0) {
      return 'orbit_radius: must be > 0 when orbit_parent_id is set'
    }
  }
  if (typeof body.orbit_speed !== 'number' || body.orbit_speed < 0) {
    return 'orbit_speed: must be >= 0'
  }
  return null
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hasChildren(parentId) {
  for (const [, entry] of bodies) {
    if (entry.body.orbit_parent_id === parentId) return true
  }
  return false
}

function broadcastToViewers(msg) {
  const data = JSON.stringify(msg)
  for (const viewer of viewers) {
    if (viewer.readyState === 1) viewer.send(data)
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function getBodySnapshot(entry) {
  return { ...entry.body, online: entry.ws !== null }
}

function cleanupOrphanedOffline() {
  let changed = false
  for (const [id, entry] of bodies) {
    if (entry.ws === null && !hasChildren(id)) {
      bodies.delete(id)
      broadcastToViewers({ type: 'body_removed', id })
      console.log(`  [-] Orphan offline body removed: ${id}`)
      changed = true
    }
  }
  if (changed) cleanupOrphanedOffline()
}

// ─── WebSocket Server ───────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', bodies: bodies.size, viewers: viewers.size }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  let role = null  // 'viewer' | 'planet'
  let bodyId = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    // ── viewer identify ──
    if (msg.type === 'viewer') {
      role = 'viewer'
      viewers.add(ws)
      const snapshot = []
      for (const [, entry] of bodies) {
        snapshot.push(getBodySnapshot(entry))
      }
      send(ws, { type: 'init', bodies: snapshot })
      console.log(`  [V] Viewer connected. Total: ${viewers.size}`)
      return
    }

    // ── planet register ──
    if (msg.type === 'register') {
      const body = msg.body
      if (!body) { send(ws, { type: 'error', message: 'Missing body in register' }); return }

      const validationError = validateBody(body)
      if (validationError) {
        send(ws, { type: 'error', message: validationError })
        return
      }

      const id = body.id

      // Check if ID already exists
      if (bodies.has(id)) {
        const existing = bodies.get(id)
        if (existing.ws === null) {
          // Offline reconnect - update body data fully
          const orbitAngleStart = existing.body.orbit_angle_start
          const registeredAt = existing.body.registered_at
          
          // Update body with new data but preserve orbit timing
          const updatedBody = {
            ...body,
            orbit_parent_id: (!body.orbit_parent_id || body.orbit_parent_id === 'none') ? null : body.orbit_parent_id,
            orbit_angle_start: orbitAngleStart,
            registered_at: registeredAt
          }
          
          existing.body = updatedBody
          existing.ws = ws
          role = 'planet'
          bodyId = id
          
          send(ws, { type: 'registered', id, orbit_angle_start: orbitAngleStart, registered_at: registeredAt })
          broadcastToViewers({ type: 'body_updated', body: getBodySnapshot(existing) })
          console.log(`  [↑] Body reconnected & updated: ${id} (${body.name})`)
          return
        } else {
          send(ws, { type: 'error', message: `ID "${id}" is already taken` })
          return
        }
      }

      // Check orbit_parent_id exists
      const parentId = body.orbit_parent_id
      if (parentId && parentId !== 'none') {
        if (!bodies.has(parentId)) {
          send(ws, { type: 'error', message: `orbit_parent_id "${parentId}" not found` })
          return
        }
      }

      // Orbit conflict check
      if (parentId && parentId !== 'none') {
        for (const [, entry] of bodies) {
          const other = entry.body
          if (other.orbit_parent_id === parentId) {
            const rDiff = Math.abs(other.orbit_radius - body.orbit_radius)
            const minGap = (other.size + body.size) * 7 + 15
            if (rDiff < minGap) {
              send(ws, { type: 'error', message: `Orbit conflict with "${other.id}": radii too close (diff ${rDiff.toFixed(1)} < ${minGap})` })
              return
            }
          }
        }
      }

      // Fixed offset conflict check (no parent)
      if (!parentId || parentId === 'none') {
        const fx = typeof body.fixed_offset?.x === 'number' ? body.fixed_offset.x : 0
        const fy = typeof body.fixed_offset?.y === 'number' ? body.fixed_offset.y : 0
        for (const [, entry] of bodies) {
          const other = entry.body
          if (!other.orbit_parent_id || other.orbit_parent_id === 'none') {
            const ox = typeof other.fixed_offset?.x === 'number' ? other.fixed_offset.x : 0
            const oy = typeof other.fixed_offset?.y === 'number' ? other.fixed_offset.y : 0
            const dist = Math.sqrt((fx - ox) ** 2 + (fy - oy) ** 2)
            if (dist < 60) {
              send(ws, { type: 'error', message: `Fixed offset conflict with "${other.id}": too close (${dist.toFixed(1)}px < 60px)` })
              return
            }
          }
        }
      }

      // Assign random start angle and timestamp
      const orbitAngleStart = Math.random() * Math.PI * 2
      const registeredAt = Date.now()

      const storedBody = {
        ...body,
        orbit_parent_id: (!parentId || parentId === 'none') ? null : parentId,
        orbit_angle_start: orbitAngleStart,
        registered_at: registeredAt
      }

      bodies.set(id, { body: storedBody, ws })
      role = 'planet'
      bodyId = id

      send(ws, { type: 'registered', id, orbit_angle_start: orbitAngleStart, registered_at: registeredAt })
      broadcastToViewers({ type: 'body_added', body: getBodySnapshot({ body: storedBody, ws }) })

      console.log(`  [+] Body registered: ${id} (${body.name}) type=${body.type} parent=${storedBody.orbit_parent_id ?? 'none'}`)
      return
    }

    // ── heartbeat ──
    if (msg.type === 'heartbeat') {
      send(ws, { type: 'pong' })
      return
    }
  })

  ws.on('close', () => {
    if (role === 'viewer') {
      viewers.delete(ws)
      console.log(`  [V] Viewer disconnected. Total: ${viewers.size}`)
      return
    }

    if (role === 'planet' && bodyId) {
      const entry = bodies.get(bodyId)
      if (!entry) return

      entry.ws = null

      if (hasChildren(bodyId)) {
        broadcastToViewers({ type: 'body_offline', id: bodyId })
        console.log(`  [↓] Body offline (has children): ${bodyId}`)
      } else {
        bodies.delete(bodyId)
        broadcastToViewers({ type: 'body_removed', id: bodyId })
        console.log(`  [-] Body removed: ${bodyId}`)
        cleanupOrphanedOffline()
      }
    }
  })

  ws.on('error', (err) => {
    console.error(`  [!] WS error for ${bodyId ?? 'unknown'}:`, err.message)
  })
})

// ─── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log('╔══════════════════════════════════╗')
  console.log('║     COSMOS//SERVER v1.0          ║')
  console.log(`║     Port: ${PORT}                  ║`)
  console.log('╚══════════════════════════════════╝')
  console.log('')
})
