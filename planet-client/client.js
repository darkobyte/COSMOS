const WebSocket = require('ws')

// ─── Config from env ────────────────────────────────────────────────────────

const SERVER_URL   = process.env.SERVER_URL
const PLANET_ID    = process.env.PLANET_ID
const PLANET_NAME  = process.env.PLANET_NAME  || PLANET_ID
const PLANET_TYPE  = process.env.PLANET_TYPE  || 'planet'
const PLANET_PARENT = process.env.PLANET_PARENT || 'none'
const PLANET_RADIUS = parseFloat(process.env.PLANET_RADIUS ?? '150')
const PLANET_SPEED  = parseFloat(process.env.PLANET_SPEED  ?? '0.005')
const PLANET_ELEMENTS = (process.env.PLANET_ELEMENTS || 'rock').split(',').map(s => s.trim())
const PLANET_INFO   = process.env.PLANET_INFO  || ''
const PLANET_SIZE   = parseInt(process.env.PLANET_SIZE  ?? '2', 10)
const PLANET_FIXED_X = process.env.PLANET_FIXED_X !== undefined ? parseFloat(process.env.PLANET_FIXED_X) : undefined
const PLANET_FIXED_Y = process.env.PLANET_FIXED_Y !== undefined ? parseFloat(process.env.PLANET_FIXED_Y) : undefined

if (!SERVER_URL) {
  console.error('[!] SERVER_URL is required')
  process.exit(1)
}
if (!PLANET_ID) {
  console.error('[!] PLANET_ID is required')
  process.exit(1)
}

// ─── Startup banner ─────────────────────────────────────────────────────────

console.log('╔════════════════════════════════════╗')
console.log('║  COSMOS//PLANET-CLIENT             ║')
console.log(`║  ID:      ${PLANET_ID.padEnd(24)}║`)
console.log(`║  Typ:     ${PLANET_TYPE.padEnd(24)}║`)
console.log(`║  Parent:  ${(PLANET_PARENT === 'none' ? '-' : PLANET_PARENT).padEnd(24)}║`)
console.log('╚════════════════════════════════════╝')

// ─── Body config ────────────────────────────────────────────────────────────

function buildBody() {
  const body = {
    id:              PLANET_ID,
    name:            PLANET_NAME,
    type:            PLANET_TYPE,
    orbit_parent_id: PLANET_PARENT === 'none' ? null : PLANET_PARENT,
    orbit_radius:    PLANET_RADIUS,
    orbit_speed:     PLANET_SPEED,
    elements:        PLANET_ELEMENTS,
    info:            PLANET_INFO,
    size:            PLANET_SIZE
  }
  if (PLANET_FIXED_X !== undefined && PLANET_FIXED_Y !== undefined) {
    body.fixed_offset = { x: PLANET_FIXED_X, y: PLANET_FIXED_Y }
  }
  return body
}

// ─── Connection ─────────────────────────────────────────────────────────────

let ws = null
let heartbeatInterval = null
let retryDelay = 3000
let isShuttingDown = false

function connect() {
  if (isShuttingDown) return

  console.log(`[*] Verbinde mit ${SERVER_URL}...`)

  ws = new WebSocket(SERVER_URL)

  ws.on('open', () => {
    retryDelay = 3000
    ws.send(JSON.stringify({ type: 'register', body: buildBody() }))
  })

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'registered') {
      const angleDeg = ((msg.orbit_angle_start ?? 0) * 180 / Math.PI).toFixed(1)
      console.log(`[✓] Registriert als "${msg.id}" | Startwinkel: ${angleDeg}°`)

      // Start heartbeat
      clearInterval(heartbeatInterval)
      heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }))
        }
      }, 10000)
      return
    }

    if (msg.type === 'pong') {
      // heartbeat acknowledged — no-op
      return
    }

    if (msg.type === 'error') {
      console.error(`[!] Fehler vom Server: ${msg.message}`)
      process.exit(1)
    }
  })

  ws.on('close', () => {
    if (isShuttingDown) return
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
    console.log(`[~] Verbindung getrennt. Retry in ${(retryDelay / 1000).toFixed(1)}s...`)
    setTimeout(connect, retryDelay)
    retryDelay = Math.min(retryDelay * 1.5, 30000)
  })

  ws.on('error', (err) => {
    console.error(`[!] Verbindungsfehler: ${err.message}`)
    // 'close' will fire after 'error', so retry is handled there
  })
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  console.log('[*] SIGTERM empfangen. Beende...')
  isShuttingDown = true
  clearInterval(heartbeatInterval)
  if (ws) ws.close()
  process.exit(0)
})

// ─── Start ───────────────────────────────────────────────────────────────────

connect()
