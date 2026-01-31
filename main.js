const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// =====================
// WORLD SETUP
// =====================
const WORLD_W = 480;
const WORLD_H = 800;

let scaleX = 1;
let scaleY = 1;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  scaleX = canvas.width / WORLD_W;
  scaleY = canvas.height / WORLD_H;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// =====================
// BACKGROUND
// =====================
const BG = new Image();
BG.src = "bg-level1.png";
let bgReady = false;
BG.onload = () => { bgReady = true; };

// =====================
// HELPERS
// =====================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// =====================
// CALIBRATION
// =====================
const TABLE_INSET = 22;

// Flippers
const FLIPPER_Y = WORLD_H - 190;
const FLIPPER_OFFSET_X = 88;
const FLIPPER_LEN = 78;

// Bottom + center drain
const BOTTOM_WALL_Y = WORLD_H - TABLE_INSET;
const DRAIN_OPEN_W = 150;
const DRAIN_TRIGGER_Y = WORLD_H - 90;
const DRAIN_X1 = (WORLD_W / 2) - (DRAIN_OPEN_W / 2);
const DRAIN_X2 = (WORLD_W / 2) + (DRAIN_OPEN_W / 2);

// Funnel rails to block side pockets
const FUNNEL_Y_TOP = FLIPPER_Y - 65;
const FUNNEL_Y_BOT = BOTTOM_WALL_Y - 4;
const FUNNEL_LEFT_X_TOP  = TABLE_INSET + 26;
const FUNNEL_RIGHT_X_TOP = WORLD_W - TABLE_INSET - 26;

// NEW: spawn higher in field
const START_X = WORLD_W / 2;
const START_Y = 360; // higher up (tune: 260-420 depending on feel)

// =====================
// GAME OBJECTS
// =====================
const puck = {
  x: START_X,
  y: START_Y,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true,      // stuck means waiting for serve
  mode: "play",     // always play mode now
};

const flippers = {
  left: {
    pivot: { x: WORLD_W / 2 - FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    base: 0.55,
    hit: -0.55,
    angle: 0.55,
    pressed: false,
    key: "a",
  },
  right: {
    pivot: { x: WORLD_W / 2 + FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    base: Math.PI - 0.55,
    hit: Math.PI + 0.55,
    angle: Math.PI - 0.55,
    pressed: false,
    key: "l",
  },
};

// =====================
// INPUT (desktop + mobile)
// =====================
const input = { launch: false };

// Desktop keys
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") { input.launch = true; e.preventDefault(); }
  if (k === flippers.left.key) flippers.left.pressed = true;
  if (k === flippers.right.key) flippers.right.pressed = true;
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = false;
  if (k === flippers.left.key) flippers.left.pressed = false;
  if (k === flippers.right.key) flippers.right.pressed = false;
});

// Screen -> world
function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top)  * (canvas.height / rect.height);
  return { x: x / scaleX, y: y / scaleY };
}

// Mobile gestures
let touchId = null;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

const FLIPPER_ZONE_H = 0.28;
const SWIPE_MIN_PX = 55;
const SWIPE_MAX_TIME = 280;
const TILT_STRENGTH = 240;

function isInBottomZone(p) {
  return p.y > WORLD_H * (1 - FLIPPER_ZONE_H);
}
function isLeftBottom(p) {
  return isInBottomZone(p) && (p.x < WORLD_W * 0.5);
}
function isRightBottom(p) {
  return isInBottomZone(p) && (p.x >= WORLD_W * 0.5);
}
function applyTilt(dir) {
  if (puck.stuck) return;
  puck.vx += dir * TILT_STRENGTH;
}

canvas.addEventListener("pointerdown", (e) => {
  if (touchId !== null) return;
  touchId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);

  const p = screenToWorld(e.clientX, e.clientY);
  touchStartX = p.x;
  touchStartY = p.y;
  touchStartTime = performance.now();

  if (isLeftBottom(p)) { flippers.left.pressed = true; return; }
  if (isRightBottom(p)) { flippers.right.pressed = true; return; }
});

canvas.addEventListener("pointermove", (e) => {
  if (touchId !== e.pointerId) return;
  const p = screenToWorld(e.clientX, e.clientY);

  if (isInBottomZone(p)) {
    flippers.left.pressed = isLeftBottom(p);
    flippers.right.pressed = isRightBottom(p);
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (touchId !== e.pointerId) return;

  const p = screenToWorld(e.clientX, e.clientY);
  const dt = performance.now() - touchStartTime;
  const totalDx = p.x - touchStartX;
  const totalDy = p.y - touchStartY;

  flippers.left.pressed = false;
  flippers.right.pressed = false;

  // Tilt swipe outside bottom zone
  if (!isInBottomZone(p) &&
      dt <= SWIPE_MAX_TIME &&
      Math.abs(totalDx) >= SWIPE_MIN_PX &&
      Math.abs(totalDy) < SWIPE_MIN_PX) {
    applyTilt(totalDx > 0 ? +1 : -1);
  }

  // Swipe down anywhere = serve (simple mobile launch)
  if (dt <= 420 && totalDy > 90 && Math.abs(totalDx) < 90) {
    input.launch = true;
  }

  touchId = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (touchId !== e.pointerId) return;
  flippers.left.pressed = false;
  flippers.right.pressed = false;
  touchId = null;
});

// =====================
// PHYSICS
// =====================
const GRAV = 760;
const AIR = 0.995;
const REST = 0.88;
const MAXS = 1500;

function resetBallHigh() {
  puck.x = START_X;
  puck.y = START_Y;
  puck.vx = 0;
  puck.vy = 0;
  puck.stuck = true;
}

function serveBall() {
  // Only serve if waiting
  if (!puck.stuck) return;
  puck.stuck = false;

  // Gentle "space cadet" serve
  puck.vx = rand(-220, 220);
  puck.vy = rand(-420, -520);
}

// Segment collider for invisible rails
function collideWithSegment(x1, y1, x2, y2) {
  const sx = x2 - x1, sy = y2 - y1;
  const px = puck.x - x1, py = puck.y - y1;
  const segLen2 = sx * sx + sy * sy;
  const t = segLen2 > 0 ? clamp((px * sx + py * sy) / segLen2, 0, 1) : 0;

  const cx = x1 + t * sx;
  const cy = y1 + t * sy;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist2 = dx * dx + dy * dy;

  if (dist2 >= puck.r * puck.r) return;

  const dist = Math.max(0.001, Math.sqrt(dist2));
  const nx = dx / dist;
  const ny = dy / dist;

  puck.x = cx + nx * puck.r;
  puck.y = cy + ny * puck.r;

  const vn = puck.vx * nx + puck.vy * ny;
  if (vn < 0) {
    puck.vx -= 2 * vn * nx;
    puck.vy -= 2 * vn * ny;
    puck.vx *= REST;
    puck.vy *= REST;
  }
}

// Flipper collision
function flipperEndpoints(f) {
  return {
    x1: f.pivot.x,
    y1: f.pivot.y,
    x2: f.pivot.x + Math.cos(f.angle) * f.len,
    y2: f.pivot.y + Math.sin(f.angle) * f.len,
  };
}

function collideWithFlipper(f) {
  const { x1, y1, x2, y2 } = flipperEndpoints(f);
  const sx = x2 - x1, sy = y2 - y1;
  const px = puck.x - x1, py = puck.y - y1;
  const segLen2 = sx * sx + sy * sy;
  const t = segLen2 > 0 ? clamp((px * sx + py * sy) / segLen2, 0, 1) : 0;

  const cx = x1 + t * sx;
  const cy = y1 + t * sy;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist2 = dx * dx + dy * dy;

  const hitR = puck.r + 9;
  if (dist2 >= hitR * hitR) return;

  const dist = Math.max(0.001, Math.sqrt(dist2));
  const nx = dx / dist;
  const ny = dy / dist;

  puck.x = cx + nx * hitR;
  puck.y = cy + ny * hitR;

  const vn = puck.vx * nx + puck.vy * ny;
  puck.vx -= 2 * vn * nx;
  puck.vy -= 2 * vn * ny;

  if (f.pressed) {
    puck.vx += nx * 520;
    puck.vy += ny * 520;
  }

  puck.vx *= REST;
  puck.vy *= REST;
}

// =====================
// LOOP
// =====================
let last = performance.now();

function update(dt) {
  if (input.launch) {
    serveBall();
    input.launch = false;
  }

  // Flipper animation
  for (const f of [flippers.left, flippers.right]) {
    const target = f.pressed ? f.hit : f.base;
    const speed = f.pressed ? 34 : 18;
    f.angle += clamp(target - f.angle, -speed * dt, speed * dt);
  }

  if (puck.stuck) return;

  // Integrate
  puck.vy += GRAV * dt;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  puck.vx *= AIR;
  puck.vy *= AIR;

  puck.vx = clamp(puck.vx, -MAXS, MAXS);
  puck.vy = clamp(puck.vy, -MAXS, MAXS);

  // Top wall
  if (puck.y - puck.r < TABLE_INSET) {
    puck.y = TABLE_INSET + puck.r;
    puck.vy = -puck.vy * REST;
  }

  // Side walls
  const L = TABLE_INSET;
  const R = WORLD_W - TABLE_INSET;
  if (puck.x - puck.r < L) { puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
  if (puck.x + puck.r > R) { puck.x = R - puck.r; puck.vx = -puck.vx * REST; }

  // Funnel rails blocking side pockets
  collideWithSegment(FUNNEL_LEFT_X_TOP,  FUNNEL_Y_TOP, DRAIN_X1, FUNNEL_Y_BOT);
  collideWithSegment(FUNNEL_RIGHT_X_TOP, FUNNEL_Y_TOP, DRAIN_X2, FUNNEL_Y_BOT);

  // Bottom center drain only
  if (puck.y + puck.r > BOTTOM_WALL_Y) {
    const inDrain = (puck.x > DRAIN_X1 && puck.x < DRAIN_X2);
    if (inDrain && puck.y > DRAIN_TRIGGER_Y) {
      resetBallHigh();
      return;
    }
    puck.y = BOTTOM_WALL_Y - puck.r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }

  // Flippers
  collideWithFlipper(flippers.left);
  collideWithFlipper(flippers.right);
}

function drawFlipper(f) {
  const e = flipperEndpoints(f);
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.strokeStyle = f.pressed ? "rgba(79,163,255,0.98)" : "rgba(47,125,255,0.75)";
  ctx.beginPath();
  ctx.moveTo(e.x1, e.y1);
  ctx.lineTo(e.x2, e.y2);
  ctx.stroke();
}

function draw() {
  resizeCanvas();
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  if (bgReady) ctx.drawImage(BG, 0, 0, WORLD_W, WORLD_H);

  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  // Puck
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(232,241,255,0.95)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.stroke();

  // Little hint text (optional)
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Space or swipe down to serve", 14, WORLD_H - 18);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function loop(now) {
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// Start
resetBallHigh();
requestAnimationFrame(loop);
