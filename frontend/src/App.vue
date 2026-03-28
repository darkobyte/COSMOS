<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

const canvas = ref(null)
const fps = ref(0)
const mousePos = ref({ x: 0, y: 0 })
const zoomLevel = ref(1)
const selectedBody = ref(null)
const infoPanelVisible = ref(false)

const simSpeed = ref(1)

const pan = reactive({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = reactive({ x: 0, y: 0 })
const panStart = reactive({ x: 0, y: 0 })

const wsConnected = ref(false)
const wsStatus = ref('CONNECTING')

// Server stats (viewers + sync timing)
const viewerCount = ref(null)
const syncInfo = reactive({
  intervalMs: null,
  nextSyncAtMs: null,
  rateLimited: false,
  rateLimitResetAtMs: null,
  lastError: null,
})

const nowMs = ref(Date.now())
let nowTimer = null

function parseIsoMs(iso) {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${m}:${String(ss).padStart(2, '0')}`
}

const viewerCountDisplay = computed(() => (viewerCount.value == null ? '--' : viewerCount.value))

const nextSyncCountdown = computed(() => {
  const targetMs = (syncInfo.rateLimited && syncInfo.rateLimitResetAtMs)
    ? syncInfo.rateLimitResetAtMs
    : syncInfo.nextSyncAtMs
  if (!targetMs) return '--'
  return formatDuration(targetMs - nowMs.value)
})

const nextSyncLabel = computed(() => {
  if (!syncInfo.nextSyncAtMs && !syncInfo.rateLimitResetAtMs) return 'NEXT:--'
  return syncInfo.rateLimited ? `NEXT(RL):${nextSyncCountdown.value}` : `NEXT:${nextSyncCountdown.value}`
})

// New UI features state
const searchQuery = ref('')
const statusbarExpanded = ref(true)
const radioPlaying = ref(false)
const radioVolume = ref(0.5)
const audioElement = ref(null)
const messageBoxVisible = ref(true)

const ELEMENT_COLORS = {
  water:       '#00e5ff',
  iron:        '#ff1744',
  rock:        '#888888',
  gas:         '#ffeb3b',
  ice:         '#b3e5fc',
  fire:        '#ff6d00',
  nitrogen:    '#ce93d8',
  gold:        '#ffd700',
  dark_matter: '#4a148c',
}

const bodies = reactive([])

// ─── Pixel Art Renderer ────────────────────────────────────────────────────

const textureCache = new Map()

function pixelHash(seed, x, y) {
  let h = (seed * 1000003 + x * 374761393 + y * 1013904223) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h / 4294967295
}

function getBodyRadius(body) {
  return [0, 8, 14, 20, 28][body.size] ?? body.size * 7
}

function getPixelRGBA(body, dx, dy, dist, radius, r, n1, n2, n3) {
  const el = body.elements

  // ── Star ──
  if (body.type === 'star') {
    // Blend colors from all elements
    const elementColors = {
      dark_matter: { base: [74, 20, 140], core: [150, 100, 200] },
      fire:        { base: [255, 109, 0], core: [255, 255, 200] },
      water:       { base: [0, 229, 255], core: [200, 240, 255] },
      gold:        { base: [255, 215, 0], core: [255, 245, 220] },
      ice:         { base: [179, 229, 252], core: [240, 250, 255] },
      iron:        { base: [255, 23, 68], core: [255, 200, 200] },
      rock:        { base: [136, 136, 136], core: [200, 200, 200] },
      gas:         { base: [255, 235, 59], core: [255, 250, 200] },
      nitrogen:    { base: [206, 147, 216], core: [230, 200, 235] }
    }
    
    let baseR = 0, baseG = 0, baseB = 0
    let coreR = 0, coreG = 0, coreB = 0
    let count = 0
    
    // Blend all element colors together
    for (const element of el) {
      if (elementColors[element]) {
        const { base, core } = elementColors[element]
        baseR += base[0]
        baseG += base[1]
        baseB += base[2]
        coreR += core[0]
        coreG += core[1]
        coreB += core[2]
        count++
      }
    }
    
    // Average the colors if multiple elements exist
    if (count > 0) {
      baseR = Math.round(baseR / count)
      baseG = Math.round(baseG / count)
      baseB = Math.round(baseB / count)
      coreR = Math.round(coreR / count)
      coreG = Math.round(coreG / count)
      coreB = Math.round(coreB / count)
    } else {
      // Default yellow-orange star if no valid elements
      baseR = 255; baseG = 200; baseB = 45
      coreR = 255; coreG = 255; coreB = 245
    }
    
    // Outer edge glow
    if (r > 0.96) return [baseR, Math.round(baseG * 0.5), Math.round(baseB * 0.5), Math.round((1 - r) / 0.04 * 160)]
    
    // Bright core
    if (r < 0.12) return [coreR, coreG, coreB, 255]
    
    // Gradient from core to mid
    if (r < 0.45) {
      const t = (r - 0.12) / 0.33
      return [
        Math.round(coreR - (coreR - baseR) * t + n1 * 15),
        Math.round(coreG - (coreG - baseG) * t + n1 * 15),
        Math.round(coreB - (coreB - baseB) * t + n1 * 25),
        255
      ]
    }
    
    // Mid to outer gradient
    if (r < 0.8) {
      const t = (r - 0.45) / 0.35
      return [
        Math.round(baseR * (1 - t * 0.15) + n1 * 20),
        Math.round(baseG * (1 - t * 0.2) + n1 * 20),
        Math.round(baseB * (1 - t * 0.3) + n1 * 20),
        255
      ]
    }
    
    // Outer layer with fadeout
    const t = (r - 0.8) / 0.16
    return [
      Math.round(baseR * 0.85 + n1 * 35),
      Math.round(baseG * 0.85 + n1 * 35),
      Math.round(baseB * 0.85 + n1 * 35),
      Math.round(255 - t * 95)
    ]
  }

  // ── Black hole ──
  if (body.type === 'blackhole') {
    if (r < 0.30) return [0, 0, 0, 255]
    const angle = Math.atan2(dy, dx)
    const disk = (Math.sin(angle * 4 + n2 * 3) + 1) * 0.5
    if (r < 0.55) {
      const t = (r - 0.30) / 0.25
      return [Math.round(55 * t * disk + n1 * 15), 0, Math.round(115 * t * disk), Math.round(200 + t * 55)]
    }
    if (r < 0.80) {
      const t = (r - 0.55) / 0.25
      return [Math.round(75 * disk), 0, Math.round(140 * disk), Math.round((1 - t) * 180)]
    }
    if (n1 > 0.60 + (r - 0.80) / 0.20 * 0.35) return [45, 0, 85, Math.round((1 - r) / 0.20 * 100)]
    return [0, 0, 0, 0]
  }

  // ── Atmosphere edge (planets only) ──
  if (r > 0.90 && body.type === 'planet') {
    const alpha = Math.round((1 - r) / 0.10 * 130)
    if (el.includes('gas')) return [215, 185, 115, alpha]
    if (el.includes('water')) return [70, 150, 215, alpha]
    if (el.includes('nitrogen')) return [150, 115, 195, alpha]
    if (el.includes('ice')) return [150, 215, 235, alpha]
    return [175, 145, 115, alpha]
  }

  // ── Earth-like water world ──
  if (el.includes('water') && !el.includes('gas')) {
    const normY = dy / radius
    if (Math.abs(normY) > 0.77 + n2 * 0.09) return [220, 235, 255, 255] // polar ice
    const landVal = n3 * 0.50 + n2 * 0.35 + n1 * 0.15
    if (landVal > 0.50) {
      if (Math.abs(normY) > 0.62) return [180, 165, 140, 255]           // tundra
      if (n2 > 0.73) return [195, 165, 100, 255]                         // desert
      return [Math.round(42 + n1 * 52), Math.round(102 + n1 * 48), Math.round(33 + n1 * 28), 255]
    }
    const depth = 1 - landVal / 0.50
    return [0, Math.round(32 + depth * 48), Math.round(88 + depth * 95), 255]
  }

  // ── Gas giants ──
  if (el.includes('gas')) {
    const normY = dy / radius
    const isJupiter = el.includes('nitrogen')
    const bandFreq = isJupiter ? 9 : 6
    const bandVal = Math.sin(normY * Math.PI * bandFreq + n3 * 2.5 + n2 * 0.5)

    if (isJupiter) {
      // Great Red Spot
      const spotDx = dx - radius * 0.25
      const spotDy = dy + radius * 0.15
      if (spotDx * spotDx + spotDy * spotDy < (radius * 0.22) * (radius * 0.22)) {
        const sR = Math.sqrt(spotDx * spotDx + spotDy * spotDy) / (radius * 0.22)
        return [Math.round(200 - sR * 55), Math.round(75 - sR * 30), Math.round(35 - sR * 20), 255]
      }
      if (bandVal > 0.55) return [232, 188, 102, 255]
      if (bandVal > 0.10) return [198, 138, 77, 255]
      if (bandVal > -0.40) return [162, 102, 62, 255]
      return [212, 162, 112, 255]
    } else {
      // Saturn
      if (bandVal > 0.40) return [242, 228, 188, 255]
      if (bandVal > -0.20) return [212, 192, 142, 255]
      return [188, 168, 112, 255]
    }
  }

  // ── Ice planets (Uranus / Neptune) ──
  if (el.includes('ice') && body.type === 'planet') {
    if (body.id === 'uranus') {
      return [Math.round(82 + n1 * 28), Math.round(202 + n1 * 22), Math.round(202 + n1 * 22), 255]
    }
    const sdx = dx - radius * 0.20
    const sdy = dy - radius * 0.15
    if (sdx * sdx + sdy * sdy < (radius * 0.18) * (radius * 0.18)) return [202, 218, 255, 255]
    return [Math.round(18 + n1 * 32), Math.round(52 + n1 * 48), Math.round(198 + n1 * 38), 255]
  }

  // ── Volcanic moon (Io) ──
  if (el[0] === 'fire') {
    if (n3 < 0.11) return [Math.round(28 + n1 * 18), Math.round(12 + n1 * 10), 0, 255]
    if (n2 < 0.17) return [255, Math.round(95 + n1 * 105), 0, 255]
    return [Math.round(208 + n1 * 38), Math.round(182 + n1 * 38), Math.round(18 + n1 * 42), 255]
  }

  // ── Ice moon (Europa) ──
  if (el[0] === 'ice' || (el.includes('ice') && el.includes('water'))) {
    const crack = Math.abs(Math.sin((dx * 0.7 + n2 * 8) * 0.5) * Math.sin((dy * 0.5 + n3 * 6) * 0.5))
    if (crack < 0.12) return [118, 78, 52, 255]
    return [Math.round(198 + n1 * 42), Math.round(218 + n1 * 28), 255, 255]
  }

  // ── Nitrogen moon (Titan) ──
  if (el.includes('nitrogen')) {
    return [Math.round(158 + n1 * 48), Math.round(112 + n1 * 48), Math.round(68 + n1 * 48), 255]
  }

  // ── Iron-dominant (Mars, Mercury) ──
  if (el[0] === 'iron') {
    const normY = dy / radius
    if (body.id === 'mars' && Math.abs(normY) > 0.82 + n2 * 0.06) return [198, 185, 175, 255]
    if (n3 < 0.12) return [Math.round(88 + n1 * 32), Math.round(32 + n1 * 14), Math.round(12 + n1 * 10), 255]
    return [Math.round(182 + n1 * 52), Math.round(62 + n1 * 38), Math.round(22 + n1 * 22), 255]
  }

  // ── Rock-dominant (moons, asteroids) ──
  if (el[0] === 'rock') {
    if (n3 < 0.14) return [Math.round(52 + n1 * 28), Math.round(52 + n1 * 28), Math.round(55 + n1 * 25), 255]
    return [Math.round(122 + n1 * 58), Math.round(122 + n1 * 58), Math.round(125 + n1 * 58), 255]
  }

  // ── Fallback (dark matter etc.) ──
  return [Math.round(38 + n1 * 32), 0, Math.round(68 + n1 * 52), 255]
}

function buildTexture(body) {
  const radius = getBodyRadius(body)
  const dim = radius * 2 + 1
  const oc = document.createElement('canvas')
  oc.width = dim
  oc.height = dim
  const octx = oc.getContext('2d')
  const imageData = octx.createImageData(dim, dim)
  const data = imageData.data

  const seed = body.id.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0)

  for (let py = 0; py < dim; py++) {
    for (let px = 0; px < dim; px++) {
      const dx = px - radius
      const dy = py - radius
      const dist2 = dx * dx + dy * dy
      if (dist2 > radius * radius) continue

      const dist = Math.sqrt(dist2)
      const r = dist / radius
      const n1 = pixelHash(seed, px, py)
      const n2 = pixelHash(seed + 99999, px >> 1, py >> 1)
      const n3 = pixelHash(seed + 44444, px >> 2, py >> 2)

      const [cr, cg, cb, ca] = getPixelRGBA(body, dx, dy, dist, radius, r, n1, n2, n3)

      const idx = (py * dim + px) * 4
      data[idx] = cr
      data[idx + 1] = cg
      data[idx + 2] = cb
      data[idx + 3] = ca ?? 255
    }
  }

  octx.putImageData(imageData, 0, 0)
  return { canvas: oc, radius }
}

// ─── Body management ────────────────────────────────────────────────────────

function addBody(bodyData) {
  const elapsed = bodyData.registered_at ? (Date.now() - bodyData.registered_at) / 16.667 : 0
  const body = {
    ...bodyData,
    _angle: (bodyData.orbit_angle_start ?? 0) + (bodyData.orbit_speed ?? 0) * elapsed,
    _x: bodyData.fixed_offset ? bodyData.fixed_offset.x : 0,
    _y: bodyData.fixed_offset ? bodyData.fixed_offset.y : 0,
    online: bodyData.online ?? true
  }
  bodies.push(body)
  textureCache.set(body.id, buildTexture(body))
}

function removeBody(id) {
  const idx = bodies.findIndex(b => b.id === id)
  if (idx !== -1) bodies.splice(idx, 1)
  textureCache.delete(id)
}

function setBodyOnline(id, isOnline) {
  const body = bodies.find(b => b.id === id)
  if (body) body.online = isOnline
}

function updateBody(bodyData) {
  const idx = bodies.findIndex(b => b.id === bodyData.id)
  if (idx === -1) return
  
  const oldBody = bodies[idx]
  const elapsed = bodyData.registered_at ? (Date.now() - bodyData.registered_at) / 16.667 : 0
  
  // Update body with new data, preserving runtime state
  const updatedBody = {
    ...bodyData,
    _angle: oldBody._angle, // Keep current angle to avoid jump
    _x: bodyData.fixed_offset ? bodyData.fixed_offset.x : oldBody._x,
    _y: bodyData.fixed_offset ? bodyData.fixed_offset.y : oldBody._y,
    online: bodyData.online ?? true
  }
  
  bodies[idx] = updatedBody
  
  // Rebuild texture if visual properties changed
  textureCache.delete(bodyData.id)
  textureCache.set(bodyData.id, buildTexture(updatedBody))
}

// ─── WebSocket ──────────────────────────────────────────────────────────────

const WS_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) || 'ws://cosmos.gianluca.click:3001'
let ws = null
let wsRetryTimer = null
let wsRetryDelay = 3000

function initWS() {
  clearTimeout(wsRetryTimer)
  wsStatus.value = 'CONNECTING'
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    wsConnected.value = true
    wsStatus.value = 'CONNECTED'
    wsRetryDelay = 3000
    ws.send(JSON.stringify({ type: 'viewer' }))
  }

  ws.onmessage = (event) => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }

    if (msg.type === 'init') {
      bodies.splice(0, bodies.length)
      textureCache.clear()
      for (const body of msg.bodies) addBody(body)
    }
    if (msg.type === 'body_added') addBody(msg.body)
    if (msg.type === 'body_removed') removeBody(msg.id)
    if (msg.type === 'body_offline') setBodyOnline(msg.id, false)
    if (msg.type === 'body_online') setBodyOnline(msg.id, true)
    if (msg.type === 'body_updated') updateBody(msg.body)

    if (msg.type === 'stats') {
      if (typeof msg.viewers === 'number') viewerCount.value = msg.viewers
      if (msg.sync) {
        if (typeof msg.sync.interval_ms === 'number') syncInfo.intervalMs = msg.sync.interval_ms
        syncInfo.rateLimited = !!msg.sync.rate_limited
        syncInfo.nextSyncAtMs = parseIsoMs(msg.sync.next_sync)
        syncInfo.rateLimitResetAtMs = parseIsoMs(msg.sync.rate_limit_reset)
        syncInfo.lastError = msg.sync.last_error || null
      }
    }
  }

  ws.onclose = () => {
    wsConnected.value = false
    wsStatus.value = 'DISCONNECTED'
    viewerCount.value = null
    syncInfo.nextSyncAtMs = null
    syncInfo.rateLimited = false
    syncInfo.rateLimitResetAtMs = null
    wsRetryDelay = Math.min(wsRetryDelay * 1.5, 30000)
    wsRetryTimer = setTimeout(initWS, wsRetryDelay)
  }

  ws.onerror = () => {
    wsStatus.value = 'ERROR'
  }
}

// ─── Orbit & Position ──────────────────────────────────────────────────────

function getParent(id) {
  return bodies.find(b => b.id === id) || null
}

function updatePositions() {
  for (const body of bodies) {
    body._angle += body.orbit_speed * simSpeed.value
  }
  for (const body of bodies) {
    if (!body.orbit_parent_id) {
      body._x = body.fixed_offset ? body.fixed_offset.x : 0
      body._y = body.fixed_offset ? body.fixed_offset.y : 0
    }
  }
  for (let pass = 0; pass < 5; pass++) {
    for (const body of bodies) {
      if (body.orbit_parent_id) {
        const parent = getParent(body.orbit_parent_id)
        if (parent) {
          body._x = parent._x + Math.cos(body._angle) * body.orbit_radius
          body._y = parent._y + Math.sin(body._angle) * body.orbit_radius
        }
      }
    }
  }
}

// ─── Draw Loop ─────────────────────────────────────────────────────────────

let animFrameId = null
let lastTime = 0
let frameCount = 0
let fpsTimer = 0

function draw(timestamp) {
  const el = canvas.value
  if (!el) return

  const ctx = el.getContext('2d')
  const W = el.width
  const H = el.height

  const delta = timestamp - lastTime
  lastTime = timestamp
  frameCount++
  fpsTimer += delta
  if (fpsTimer >= 500) {
    fps.value = Math.round((frameCount / fpsTimer) * 1000)
    frameCount = 0
    fpsTimer = 0
  }

  updatePositions()

  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, W, H)

  ctx.save()
  ctx.setTransform(zoomLevel.value, 0, 0, zoomLevel.value, pan.x + W / 2, pan.y + H / 2)

  // Orbit rings
  ctx.setLineDash([2, 6])
  ctx.strokeStyle = '#1a3a1a'
  ctx.lineWidth = 1 / zoomLevel.value
  for (const body of bodies) {
    if (body.orbit_parent_id && body.orbit_radius > 0) {
      const parent = getParent(body.orbit_parent_id)
      if (parent) {
        ctx.beginPath()
        ctx.arc(parent._x, parent._y, body.orbit_radius, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }
  ctx.setLineDash([])

  // Draw bodies
  for (const body of bodies) {
    const bx = body._x
    const by = body._y
    const tex = textureCache.get(body.id)
    if (!tex) continue
    const rad = tex.radius

    // Handle offline dimming
    if (body.online === false) ctx.globalAlpha = 0.38

    // Saturn rings (behind planet)
    if (body.id === 'saturn') {
      ctx.save()
      ctx.translate(bx, by)
      ctx.strokeStyle = 'rgba(210, 190, 140, 0.45)'
      ctx.lineWidth = 5 / zoomLevel.value
      ctx.beginPath()
      ctx.ellipse(0, 0, rad * 2.4, rad * 0.55, 0.25, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(190, 168, 110, 0.28)'
      ctx.lineWidth = 9 / zoomLevel.value
      ctx.beginPath()
      ctx.ellipse(0, 0, rad * 2.9, rad * 0.68, 0.25, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // Star glow
    if (body.type === 'star') {
      const grd = ctx.createRadialGradient(bx, by, 0, bx, by, rad * 2.5)
      grd.addColorStop(0, 'rgba(255, 200, 50, 0.28)')
      grd.addColorStop(0.5, 'rgba(255, 120, 0, 0.12)')
      grd.addColorStop(1, 'rgba(255, 60, 0, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(bx, by, rad * 2.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Pixel texture
    ctx.drawImage(tex.canvas, bx - rad, by - rad)

    // Black hole glow
    if (body.type === 'blackhole') {
      const grd = ctx.createRadialGradient(bx, by, rad * 0.3, bx, by, rad * 2.2)
      grd.addColorStop(0, 'rgba(0,0,0,0)')
      grd.addColorStop(0.4, 'rgba(74, 20, 140, 0.30)')
      grd.addColorStop(0.7, 'rgba(74, 20, 140, 0.12)')
      grd.addColorStop(1, 'rgba(74, 20, 140, 0)')
      ctx.fillStyle = grd
      ctx.beginPath()
      ctx.arc(bx, by, rad * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Selection ring
    if (selectedBody.value && selectedBody.value.id === body.id) {
      ctx.strokeStyle = 'rgba(0, 255, 65, 0.7)'
      ctx.lineWidth = 1.5 / zoomLevel.value
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.arc(bx, by, rad + 3 / zoomLevel.value, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Reset alpha before labels
    ctx.globalAlpha = 1.0

    // Label
    if (zoomLevel.value > 0.35) {
      const labelSize = Math.max(8, 9 / zoomLevel.value)
      ctx.font = `${labelSize}px 'Share Tech Mono', monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(0, 200, 80, 0.55)'
      ctx.fillText(body.name, bx, by + rad + 3 / zoomLevel.value)

      // Offline label
      if (body.online === false) {
        const offlineSize = Math.max(7, 8 / zoomLevel.value)
        ctx.font = `${offlineSize}px 'Share Tech Mono', monospace`
        ctx.fillStyle = '#ff1744'
        ctx.fillText('[OFFLINE]', bx, by + rad + labelSize + 5 / zoomLevel.value)
      }
    }
  }

  ctx.restore()
  animFrameId = requestAnimationFrame(draw)
}

// ─── Interaction ───────────────────────────────────────────────────────────

function worldToScreen(wx, wy) {
  const W = canvas.value.width
  const H = canvas.value.height
  return {
    sx: wx * zoomLevel.value + pan.x + W / 2,
    sy: wy * zoomLevel.value + pan.y + H / 2
  }
}

function handleWheel(e) {
  e.preventDefault()
  const rect = canvas.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const W = canvas.value.width
  const H = canvas.value.height
  
  // World coordinates of mouse position before zoom
  const wxBefore = (mx - pan.x - W / 2) / zoomLevel.value
  const wyBefore = (my - pan.y - H / 2) / zoomLevel.value
  
  const factor = e.deltaY < 0 ? 1.12 : 0.9
  const newZoom = Math.min(5, Math.max(0.1, zoomLevel.value * factor))
  
  // World coordinates should stay the same after zoom
  const wxAfter = (mx - pan.x - W / 2) / newZoom
  const wyAfter = (my - pan.y - H / 2) / newZoom
  
  // Adjust pan to keep mouse position stationary in world coordinates
  pan.x += (wxBefore - wxAfter) * newZoom
  pan.y += (wyBefore - wyAfter) * newZoom
  
  zoomLevel.value = newZoom
}

function handleMouseDown(e) {
  isDragging.value = true
  dragStart.x = e.clientX
  dragStart.y = e.clientY
  panStart.x = pan.x
  panStart.y = pan.y
}

function handleMouseMove(e) {
  const rect = canvas.value.getBoundingClientRect()
  const W = canvas.value.width
  const H = canvas.value.height
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  mousePos.value = {
    x: Math.round((mx - pan.x - W / 2) / zoomLevel.value),
    y: Math.round((my - pan.y - H / 2) / zoomLevel.value)
  }
  if (isDragging.value) {
    pan.x = panStart.x + (e.clientX - dragStart.x)
    pan.y = panStart.y + (e.clientY - dragStart.y)
  }
}

function handleMouseUp(e) {
  if (!isDragging.value) return
  const dx = e.clientX - dragStart.x
  const dy = e.clientY - dragStart.y
  isDragging.value = false
  if (Math.sqrt(dx * dx + dy * dy) < 5) handleClick(e)
}

function handleClick(e) {
  const rect = canvas.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  for (const body of bodies) {
    const { sx, sy } = worldToScreen(body._x, body._y)
    const rad = getBodyRadius(body) * zoomLevel.value
    const hitR = Math.max(18, rad)
    const dist = Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2)
    if (dist < hitR) {
      selectedBody.value = body
      infoPanelVisible.value = true
      return
    }
  }
  infoPanelVisible.value = false
  selectedBody.value = null
}

function closePanel() {
  infoPanelVisible.value = false
  selectedBody.value = null
}

// Search functionality
function searchPlanet() {
  const query = searchQuery.value.toLowerCase().trim()
  if (!query) return
  
  const found = bodies.find(b => 
    b.name?.toLowerCase().includes(query) || 
    b.id?.toLowerCase().includes(query)
  )
  
  if (found) {
    selectedBody.value = found
    infoPanelVisible.value = true
    // Center camera on selected body
    if (found._x !== undefined && found._y !== undefined) {
      pan.x = -found._x * zoomLevel.value
      pan.y = -found._y * zoomLevel.value
    }
  }
}

// Statusbar toggle
function toggleStatusbar() {
  statusbarExpanded.value = !statusbarExpanded.value
}

function handleTopHover(event) {
  // Disabled - no auto-expand on hover
}

// Radio player
function toggleRadio() {
  if (!audioElement.value) {
    audioElement.value = new Audio()
    audioElement.value.volume = radioVolume.value
    audioElement.value.src = 'https://radio.stereoscenic.com/asp-s'
  }
  
  if (radioPlaying.value) {
    audioElement.value.pause()
    radioPlaying.value = false
  } else {
    audioElement.value.play().catch(err => console.error('Radio play error:', err))
    radioPlaying.value = true
  }
}

function updateVolume() {
  if (audioElement.value) {
    audioElement.value.volume = radioVolume.value
  }
}

function resizeCanvas() {
  if (!canvas.value) return
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
}

function getBodyColor(body) {
  if (body.type === 'star') return '#ffb300'
  return ELEMENT_COLORS[body.elements?.[0]] || '#00ff41'
}

onMounted(() => {
  nowTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 250)

  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  initWS()
  animFrameId = requestAnimationFrame(draw)
})

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
  if (animFrameId) cancelAnimationFrame(animFrameId)
  window.removeEventListener('resize', resizeCanvas)
  if (ws) ws.close()
  clearTimeout(wsRetryTimer)
})
</script>

<template>
  <div class="cosmos-root" @mousemove="handleTopHover">
    <div class="scanlines" />
    <div class="vignette" />

    <!-- Bottom-right floating HUD stats (no box) -->
    <div class="corner-stats" aria-hidden="true">
      <div class="corner-line">VIEWERS:{{ viewerCountDisplay }}</div>
      <div :class="['corner-line', 'corner-next', { 'rate-limited': syncInfo.rateLimited }]">{{ nextSyncLabel }}</div>
    </div>

    <!-- Toggle Statusbar Button -->
    <button 
      class="statusbar-toggle-btn" 
      :class="{ 'below-statusbar': statusbarExpanded }"
      @click="toggleStatusbar" 
      :title="statusbarExpanded ? 'Hide Statusbar' : 'Show Statusbar'"
    >
      {{ statusbarExpanded ? '▲' : '▼' }}
    </button>

    <!-- Statusbar (Collapsible) -->
    <Transition name="statusbar-slide">
      <div v-if="statusbarExpanded" class="statusbar">
        <span class="statusbar-title">COSMOS</span>
        <span class="sep">|</span>
        
        <!-- Search Input -->
        <input 
          type="text" 
          v-model="searchQuery" 
          @keyup.enter="searchPlanet"
          placeholder="SEARCH..."
          class="search-input"
        />
        <button v-if="searchQuery" class="search-btn" @click="searchPlanet">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        
        <span class="sep">|</span>
        <span class="coords">X:{{ mousePos.x }} Y:{{ mousePos.y }}</span>
        <span class="sep">|</span>
        <span class="zoom-val">ZOOM:{{ zoomLevel.toFixed(2) }}x</span>
        <span class="sep">|</span>
        <span class="fps-val">FPS:{{ fps }}</span>
        <span class="sep">|</span>
        <span>BODIES:{{ bodies.length }}</span>
        <span class="sep">|</span>
        <span :class="['ws-status', { 'ws-on': wsConnected, 'ws-off': !wsConnected }]">
          WS:{{ wsStatus }}
        </span>
        <span class="sep">|</span>
        <button class="spd-btn" @click="simSpeed = 0" :class="{ active: simSpeed === 0 }">⏸</button>
        <input
          class="spd-slider"
          type="range"
          min="0" max="5" step="0.1"
          v-model.number="simSpeed"
        />
        <button class="spd-btn" @click="simSpeed = 1" :class="{ active: simSpeed === 1 }">1x</button>
        <span class="spd-val">{{ simSpeed.toFixed(1) }}x</span>
        
        <span class="sep">|</span>
        
        <!-- Radio Controls -->
         <p>RADIO</p>
        <button class="radio-btn" @click="toggleRadio" :title="radioPlaying ? 'Pause Radio' : 'Play Radio'">
          {{ radioPlaying ? '⏸' : '▶' }}
        </button>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01"
          v-model.number="radioVolume"
          @input="updateVolume"
          class="volume-slider"
          title="Volume"
        />
        <span class="vol-val">{{ Math.round(radioVolume * 100) }}%</span>
      </div>
    </Transition>

    <canvas
      ref="canvas"
      class="sim-canvas"
      @wheel.prevent="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
    />

    <Transition name="slide">
      <div v-if="infoPanelVisible && selectedBody" class="info-panel">
        <div class="info-header">
          <span class="info-char" :style="{ color: getBodyColor(selectedBody) }">
            {{ { star: '★', planet: '●', moon: '○', asteroid: '·', blackhole: '◉' }[selectedBody.type] ?? '●' }}
          </span>
          <span class="info-name">{{ selectedBody.name }}</span>
          <span v-if="selectedBody.online === false" class="offline-badge">OFFLINE</span>
          <button class="close-btn" @click="closePanel">[X]</button>
        </div>
        <div class="divider">────────────────────</div>
        <div class="info-row"><span class="lbl">TYPE</span><span>{{ selectedBody.type.toUpperCase() }}</span></div>
        <div class="info-row"><span class="lbl">ID</span><span>{{ selectedBody.id }}</span></div>
        <div v-if="selectedBody.orbit_parent_id" class="info-row">
          <span class="lbl">ORBIT</span>
          <span>{{ selectedBody.orbit_parent_id.toUpperCase() }} @ {{ selectedBody.orbit_radius }}px</span>
        </div>
        <div class="info-row">
          <span class="lbl">ELEMENTS</span>
          <span>
            <span
              v-for="el in selectedBody.elements" :key="el"
              class="el-tag"
              :style="{ color: ELEMENT_COLORS[el] || '#00ff41', borderColor: ELEMENT_COLORS[el] || '#00ff41' }"
            >{{ el }}</span>
          </span>
        </div>
        <div class="divider">────────────────────</div>
        <div class="info-desc">{{ selectedBody.info }}</div>
        <div class="divider">────────────────────</div>
        <div class="hint">[SCROLL] zoom  [DRAG] pan  [CLICK] select</div>
      </div>
    </Transition>

    <!-- Message Box (Bottom-Left) -->
    <div v-if="messageBoxVisible" class="message-box">
      <button class="message-close" @click="messageBoxVisible = false">&times;</button>
      <div class="message-content">
        <div class="message-text">Want to create your own planet?</div>
        <div class="message-link">Check the <a href="https://github.com/DarkObyte/universe" target="_blank" class="github-link">GitHub README</a></div>
      </div>
    </div>
  </div>
</template>

<style>
/* Global reset — fixes white borders & scrollbars */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: #0a0a0a;
}
#app {
  width: 100vw; height: 100vh;
  overflow: hidden;
  background: #0a0a0a;
}
</style>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');

.cosmos-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #0a0a0a;
  font-family: 'Share Tech Mono', monospace;
  color: #00ff41;
  position: relative;
}

.sim-canvas {
  display: block;
  position: absolute;
  top: 0; left: 0;
  cursor: crosshair;
  image-rendering: pixelated;
}

.scanlines {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px, transparent 2px,
    rgba(0,0,0,0.13) 2px, rgba(0,0,0,0.13) 4px
  );
}

.vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 11;
  background: radial-gradient(
    ellipse at center,
    transparent 52%,
    rgba(0,0,0,0.55) 82%,
    rgba(0,0,0,0.90) 100%
  );
}

.statusbar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 20;
  background: rgba(0,10,0,0.88);
  border-bottom: 1px solid #00ff4130;
  padding: 5px 16px;
  font-size: 12px;
  letter-spacing: 0.08em;
  display: flex;
  align-items: center;
  gap: 10px;
}

.statusbar-title {
  font-weight: bold;
  letter-spacing: 0.15em;
  text-shadow: 0 0 8px #00ff41aa;
}

.sep { color: #1a5c1a; }

.coords {
  min-width: 140px;
  display: inline-block;
}

.zoom-val {
  min-width: 90px;
  display: inline-block;
}

.fps-val {
  min-width: 50px;
  display: inline-block;
}

.info-panel {
  position: fixed;
  top: 34px; right: 0;
  z-index: 20;
  width: 300px;
  background: rgba(0,8,0,0.94);
  border-left: 1px solid #00ff4140;
  border-bottom: 1px solid #00ff4140;
  padding: 14px;
  font-size: 13px;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.info-char {
  font-size: 26px;
  line-height: 1;
  text-shadow: 0 0 10px currentColor;
}

.info-name {
  font-size: 15px;
  letter-spacing: 0.1em;
  flex: 1;
  text-shadow: 0 0 8px #00ff4188;
}

.close-btn {
  background: none;
  border: none;
  color: #ff1744;
  font-family: 'Share Tech Mono', monospace;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}
.close-btn:hover { text-shadow: 0 0 8px #ff1744; }

.divider { color: #1a5c1a; margin: 7px 0; }

.info-row {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
  align-items: flex-start;
}

.lbl {
  color: #00803f;
  min-width: 70px;
  font-size: 11px;
  padding-top: 2px;
  letter-spacing: 0.07em;
}

.el-tag {
  border: 1px solid;
  padding: 1px 5px;
  font-size: 10px;
  margin-right: 4px;
  display: inline-block;
}

.info-desc {
  color: #a0d8a0;
  line-height: 1.5;
  font-size: 12px;
}

.hint {
  color: #2a6a2a;
  font-size: 10px;
  letter-spacing: 0.05em;
}

.spd-btn {
  background: none;
  border: 1px solid #1a5c1a;
  color: #00ff41;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  padding: 1px 6px;
  cursor: pointer;
  line-height: 1.4;
}
.spd-btn:hover, .spd-btn.active {
  border-color: #00ff41;
  text-shadow: 0 0 6px #00ff41;
}

.spd-val {
  min-width: 34px;
  font-size: 12px;
  color: #00ff41;
  text-shadow: 0 0 6px #00ff4166;
}

.spd-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 90px;
  height: 3px;
  background: #1a3a1a;
  outline: none;
  cursor: pointer;
}
.spd-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  background: #00ff41;
  box-shadow: 0 0 6px #00ff41;
  cursor: pointer;
}
.spd-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  background: #00ff41;
  border: none;
  box-shadow: 0 0 6px #00ff41;
  cursor: pointer;
}

.slide-enter-active, .slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.ws-status { font-size: 12px; letter-spacing: 0.06em; }
.ws-on { color: #00ff41; }
.ws-off { color: #ff1744; text-shadow: 0 0 6px #ff174488; }

.corner-stats {
  position: fixed;
  right: 10px;
  bottom: 10px;
  z-index: 12;
  pointer-events: none;
  text-align: right;
  color: #00ff41;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-shadow: 0 0 8px #00ff4188;
}

.corner-line {
  line-height: 1.25;
}

.corner-next.rate-limited {
  color: #ff1744;
  text-shadow: 0 0 6px #ff174488;
}

.offline-badge {
  color: #ff1744;
  border: 1px solid #ff1744;
  font-size: 10px;
  padding: 1px 5px;
  letter-spacing: 0.08em;
}

/* Statusbar Toggle Button */
.statusbar-toggle-btn {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 25;
  background: rgba(0, 10, 0, 0.9);
  border: 1px solid #00ff4140;
  border-top: none;
  border-radius: 0 0 8px 8px;
  color: #00ff41;
  font-family: 'Share Tech Mono', monospace;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 14px 4px 14px;
  transition: top 0.3s ease, all 0.2s ease;
}

/* When statusbar is expanded, move button below it */
.statusbar-toggle-btn.below-statusbar {
  top: 29px;
}

.statusbar-toggle-btn:hover {
  border-color: #00ff41;
  box-shadow: 0 0 10px #00ff4166;
  text-shadow: 0 0 8px #00ff41;
}

.statusbar-slide-enter-active, .statusbar-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.statusbar-slide-enter-from, .statusbar-slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

/* Search Input in Statusbar */
.search-input {
  background: rgba(0, 30, 0, 0.7);
  border: 1px solid #1a5c1a;
  color: #00ff41;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  padding: 2px 8px;
  width: 130px;
  outline: none;
  letter-spacing: 0.06em;
}

.search-input:focus {
  border-color: #00ff41;
  box-shadow: 0 0 6px #00ff4166;
}

.search-input::placeholder {
  color: #1a5c1a;
}

.search-btn {
  background: none;
  border: 1px solid #1a5c1a;
  color: #00ff41;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  padding: 1px 6px;
  cursor: pointer;
  margin-left: 4px;
}

.search-btn:hover {
  border-color: #00ff41;
  text-shadow: 0 0 6px #00ff41;
}

/* Radio Controls in Statusbar */
.radio-btn {
  background: none;
  border: 1px solid #1a5c1a;
  color: #00ff41;
  font-family: 'Share Tech Mono', monospace;
  font-size: 11px;
  padding: 1px 6px;
  cursor: pointer;
}

.radio-btn:hover {
  border-color: #00ff41;
  text-shadow: 0 0 6px #00ff41;
}

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 70px;
  height: 3px;
  background: #1a3a1a;
  outline: none;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 8px;
  height: 8px;
  background: #00ff41;
  box-shadow: 0 0 4px #00ff41;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 8px;
  height: 8px;
  background: #00ff41;
  border: none;
  box-shadow: 0 0 4px #00ff41;
  cursor: pointer;
}

.vol-val {
  font-size: 11px;
  color: #00ff41;
  min-width: 35px;
}

/* Message Box (Bottom-Left) */
.message-box {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 19;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 8, 0, 0.94);
  border: 1px solid #00ff4140;
  padding: 20px 24px;
  font-size: 12px;
  max-width: 380px;
}

.message-close {
  position: absolute;
  top: 4px;
  right: 8px;
  background: none;
  border: none;
  color: #00ff41;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.6;
  line-height: 1;
}

.message-close:hover {
  opacity: 1;
}

.message-icon {
  font-size: 24px;
  line-height: 1;
}

.message-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-text {
  color: #00ff41;
  font-size: 12px;
  letter-spacing: 0.06em;
}

.message-link {
  color: #1a5c1a;
  font-size: 10px;
  letter-spacing: 0.06em;
}

.github-link {
  color: #00ff41;
  text-decoration: none;
  border-bottom: 1px solid #1a5c1a;
  transition: all 0.2s ease;
}

.github-link:hover {
  border-bottom-color: #00ff41;
  text-shadow: 0 0 6px #00ff4166;
}
</style>
