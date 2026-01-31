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
// CALIBRATION KNOBS
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

// Plunger lane (right)
const LANE_W = 68;
const LANE_X2 = WORLD_W - TABLE_INSET;
const LANE_X1 = LANE_X2 - LANE_W;
const LANE_RELEASE_Y = 505;
const PLUNGER_START_Y = WORLD_H - 120;

// Diagonal funnel rails to block the circled pockets
const FUNNEL_Y_TOP = FLIPPER_Y - 65;   // starts above flippers
const FUNNEL_Y_BOT = BOTTOM_WALL_Y - 4;

const FUNNEL_LEFT_X_TOP  = TABLE_INSET + 26;
const FUNNEL_RIGHT_X_TOP = WORLD_W - TABLE_INSET - 26;

// =====================
// GAME OBJECTS
// =====================
const puck = {
  x: (LANE_X1 + LANE_X2) / 2,
  y: PLUNGER_START_Y,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true,
  mode: "plunger_ready", // plunger_ready | plunger | play
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
const input = {
  launch: false,
};

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

// Mobile gesture state
let touchId = null;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

let plungerActive = false;
let plungerPull = 0; // 0..1
const PLUNGER_MAX_PULL_PX = 180;

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
function isInPlungerLane(p) {
  return (p.x >= LANE_X1 - 10 && p.x <= LANE_X2 + 10);
}
function setPlungerPull(pullPx) {
  plungerPull = clamp(pullPx / PLUNGER_MAX_PULL_PX, 0, 1);
}
function applyTilt(dir) {
  if (puck.mode !== "play" || puck.stuck) return;
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

  // Bottom = flippers
  if (isLeftBottom(p)) { flippers.left.pressed = true; return; }
  if (isRightBottom(p)) { flippers.right.pressed = true; return; }

  // Plunger pull if puck waiting and touch begins in lane
  if ((puck.mode === "plunger_ready" || puck.mode === "plunger") && isInPlungerLane(p)) {
    plungerActive = true;
    plungerPull = 0;
    return;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (touchId !== e.pointerId) return;
  const p = screenToWorld(e.clientX, e.clientY);

  if (isInBottomZone(p)) {
    flippers.left.pressed = isLeftBottom(p);
    flippers.right.pressed = isRightBottom(p);
  }

  if (plungerActive) {
    const pullPx = Math.max(0, p.y - touchStartY);
    setPlungerPull(pullPx);
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

  // Plunger release
  if (plungerActive) {
    plungerActive = false;

    if (plungerPull > 0.05) {
      puck.stuck = false;
      puck.mode = "plunger";
      puck.x = (LANE_X1 + LANE_X2) / 2;
      puck.y = PLUNGER_START_Y;
      puck.vx = 0;

      const minV = -420;
      const maxV = -980;
      puck.vy = minV + (maxV - minV) * plungerPull;
    }

    plungerPull = 0;
    touchId = null;
    return;
  }

  // Tilt swipe outside bottom zone
  if (!isInBottomZone(p) &&
      dt <= SWIPE_MAX_TIME &&
      Math.abs(totalDx) >= SWIPE_MIN_PX &&
      Math.abs(totalDy) < SWIPE_MIN_PX) {
    applyTilt(totalDx > 0 ? +1 : -1);
  }

  touchId = null;
});

canvas.addEventListener("pointercancel", (e) => {
  if (touchId !== e.pointerId) return;
  flippers.left.pressed = false;
  flippers.right.pressed = false;
  plungerActive = false;
  plungerPull = 0;
  touchId = null;
});

// =====================
// PHYSICS
// =====================
const GRAV = 760;
const AIR = 0.995;
const REST = 0.88;
const MAXS = 1500;

function resetToPlunger() {
  puck.stuck = true;
  puck.mode = "plunger_ready";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = 0;
}

function launchPuckKeyboard() {
  if (!puck.stuck) return;
  puck.stuck = false;
  puck.mode = "plunger";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = -820;
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

  // push out
  puck.x = cx + nx * puck.r;
  puck.y = cy + ny * puck.r;

  // reflect only if moving into wall
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
    launchPuckKeyboard();
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

  // Lane or play walls
  if (puck.mode !== "play") {
    // Plunger lane walls
    if (puck.x - puck.r < LANE_X1) { puck.x = LANE_X1 + puck.r; puck.vx = -puck.vx * REST; }
    if (puck.x + puck.r > LANE_X2) { puck.x = LANE_X2 - puck.r; puck.vx = -puck.vx * REST; }

    if (puck.y < LANE_RELEASE_Y) {
      puck.mode = "play";
      puck.vx = -260 + rand(-40, 40);
      puck.vy = Math.min(puck.vy, -300);
    }
  } else {
    // Side walls in play
    const L = TABLE_INSET;
    const R = WORLD_W - TABLE_INSET;
    if (puck.x - puck.r < L) { puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
    if (puck.x + puck.r > R) { puck.x = R - puck.r; puck.vx = -puck.vx * REST; }
  }

  // =====================
  // KEY FIX: diagonal funnel rails blocking the two pockets
  // =====================
  collideWithSegment(
    FUNNEL_LEFT_X_TOP, FUNNEL_Y_TOP,
    DRAIN_X1,          FUNNEL_Y_BOT
  );
  collideWithSegment(
    FUNNEL_RIGHT_X_TOP, FUNNEL_Y_TOP,
    DRAIN_X2,           FUNNEL_Y_BOT
  );

  // Bottom center drain only
  if (puck.y + puck.r > BOTTOM_WALL_Y) {
    const inDrain = (puck.x > DRAIN_X1 && puck.x < DRAIN_X2);
    if (inDrain && puck.y > DRAIN_TRIGGER_Y) {
      resetToPlunger();
      return;
    }
    puck.y = BOTTOM_WALL_Y - puck.r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }

  // Flippers only during play
  if (puck.mode === "play") {
    collideWithFlipper(flippers.left);
    collideWithFlipper(flippers.right);
  }
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

  // Plunger pull indicator
  if (plungerActive) {
    const barH = 90;
    const barW = 10;
    const x = LANE_X2 - 18;
    const y = WORLD_H - 140;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y - barH, barW, barH);
    ctx.fillStyle = "rgba(79,163,255,0.85)";
    ctx.fillRect(x, y - barH * plungerPull, barW, barH * plungerPull);
    ctx.restore();
  }

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
resetToPlunger();
requestAnimationFrame(loop);
