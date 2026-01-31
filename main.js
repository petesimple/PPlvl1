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
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
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
BG.onload = () => (bgReady = true);

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

// Bottom + drain
const BOTTOM_WALL_Y = WORLD_H - TABLE_INSET;
const DRAIN_OPEN_W = 150;
const DRAIN_TRIGGER_Y = WORLD_H - 90;

// OUTLANE BLOCKERS (REAL WALLS)
const OUTLANE_Y_TOP = FLIPPER_Y - 40;
const OUTLANE_Y_BOTTOM = BOTTOM_WALL_Y;

// Plunger lane
const LANE_W = 68;
const LANE_X2 = WORLD_W - TABLE_INSET;
const LANE_X1 = LANE_X2 - LANE_W;
const LANE_RELEASE_Y = 505;
const PLUNGER_START_Y = WORLD_H - 120;

// =====================
// GAME OBJECTS
// =====================
const puck = {
  x: WORLD_W / 2,
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
// INPUT
// =====================
let input = { launch: false };

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = true;
  if (k === "a") flippers.left.pressed = true;
  if (k === "l") flippers.right.pressed = true;
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = false;
  if (k === "a") flippers.left.pressed = false;
  if (k === "l") flippers.right.pressed = false;
});

// =====================
// PHYSICS CONSTANTS
// =====================
const GRAV = 760;
const AIR = 0.995;
const REST = 0.88;

// =====================
// CORE FUNCTIONS
// =====================
function resetToPlunger() {
  puck.stuck = true;
  puck.mode = "plunger_ready";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = puck.vy = 0;
}

function launchPuck() {
  if (!puck.stuck) return;
  puck.stuck = false;
  puck.mode = "plunger";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = -850;
}

// =====================
// COLLISIONS
// =====================
function collideOutlane(sideX, side) {
  if (puck.y + puck.r < OUTLANE_Y_TOP || puck.y - puck.r > OUTLANE_Y_BOTTOM) return;

  if (side === "left") {
    if (puck.x - puck.r < sideX) {
      puck.x = sideX + puck.r;
      puck.vx = Math.abs(puck.vx) * REST;
    }
  } else {
    if (puck.x + puck.r > sideX) {
      puck.x = sideX - puck.r;
      puck.vx = -Math.abs(puck.vx) * REST;
    }
  }
}

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
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = puck.x - x1;
  const wy = puck.y - y1;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
  const cx = x1 + vx * t;
  const cy = y1 + vy * t;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist = Math.hypot(dx, dy);
  const hitR = puck.r + 9;

  if (dist < hitR) {
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
}

// =====================
// GAME LOOP
// =====================
let last = performance.now();

function update(dt) {
  if (input.launch) {
    launchPuck();
    input.launch = false;
  }

  // Flippers
  for (const f of [flippers.left, flippers.right]) {
    const target = f.pressed ? f.hit : f.base;
    const speed = f.pressed ? 34 : 18;
    f.angle += clamp(target - f.angle, -speed * dt, speed * dt);
  }

  if (puck.stuck) return;

  puck.vy += GRAV * dt;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  puck.vx *= AIR;
  puck.vy *= AIR;

  // Top wall
  if (puck.y - puck.r < TABLE_INSET) {
    puck.y = TABLE_INSET + puck.r;
    puck.vy = -puck.vy * REST;
  }

  // Plunger lane walls
  if (puck.mode !== "play") {
    if (puck.x - puck.r < LANE_X1) puck.x = LANE_X1 + puck.r;
    if (puck.x + puck.r > LANE_X2) puck.x = LANE_X2 - puck.r;
    if (puck.y < LANE_RELEASE_Y) {
      puck.mode = "play";
      puck.vx = -260 + rand(-40, 40);
    }
  } else {
    // Side walls
    if (puck.x - puck.r < TABLE_INSET) puck.x = TABLE_INSET + puck.r;
    if (puck.x + puck.r > WORLD_W - TABLE_INSET) puck.x = WORLD_W - TABLE_INSET - puck.r;
  }

  // OUTLANE WALLS (THIS IS THE IMPORTANT FIX)
  collideOutlane(TABLE_INSET + 6, "left");
  collideOutlane(WORLD_W - TABLE_INSET - 6, "right");

  // Bottom drain
  if (puck.y + puck.r > BOTTOM_WALL_Y) {
    const dx = puck.x - WORLD_W / 2;
    if (Math.abs(dx) < DRAIN_OPEN_W / 2 && puck.y > DRAIN_TRIGGER_Y) {
      resetToPlunger();
      return;
    }
    puck.y = BOTTOM_WALL_Y - puck.r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }

  // Flippers
  if (puck.mode === "play") {
    collideWithFlipper(flippers.left);
    collideWithFlipper(flippers.right);
  }
}

function draw() {
  resizeCanvas();
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  if (bgReady) ctx.drawImage(BG, 0, 0, WORLD_W, WORLD_H);

  // Flippers
  for (const f of [flippers.left, flippers.right]) {
    const e = flipperEndpoints(f);
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.strokeStyle = f.pressed ? "#6cf" : "#39f";
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    ctx.stroke();
  }

  // Puck
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI * 2);
  ctx.fillStyle = "#eef";
  ctx.fill();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function loop(now) {
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// START
resetToPlunger();
requestAnimationFrame(loop);
