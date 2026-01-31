const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Fixed world size for physics and layout
const WORLD_W = 480;
const WORLD_H = 800;

let scaleX = 1;
let scaleY = 1;
let dpr = Math.max(1, window.devicePixelRatio || 1);

// HUD
const elScore = document.getElementById("score");
const elMult  = document.getElementById("mult");
const elBanks = document.getElementById("banks");

const btnLaunch = document.getElementById("btnLaunch");
const btnReset  = document.getElementById("btnReset");

// Background
const BG = new Image();
BG.src = "bg-level1.png";
let bgReady = false;
BG.onload = () => { bgReady = true; };

// Helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len2 = (x, y) => x * x + y * y;
const rand = (a, b) => a + Math.random() * (b - a);

// Score state
let score = 0;
let bankHits = 0;
let mult = 1;

// --------------------
// Calibration knobs
// --------------------
const TABLE_INSET = 22;

// Flippers
const FLIPPER_Y = WORLD_H - 190;
const FLIPPER_OFFSET_X = 88;
const FLIPPER_LEN = 78;

// Bottom: block outlanes, only allow center drain
const BOTTOM_WALL_Y = WORLD_H - TABLE_INSET;
const DRAIN_OPEN_W = 150;
const DRAIN_TRIGGER_Y = WORLD_H - 90;

// Plunger lane (right side)
const LANE_W = 68;
const LANE_X2 = WORLD_W - TABLE_INSET;
const LANE_X1 = LANE_X2 - LANE_W;
const LANE_RELEASE_Y = 505;
const PLUNGER_START_Y = WORLD_H - 120;

const table = {
  inset: TABLE_INSET,
  goal: { x: WORLD_W / 2, y: 170, w: 170, h: 18 },
};

// Bumpers near the big buttons
const bumpers = [
  { x: 120, y: 270, r: 22 }, // BANK
  { x: 360, y: 270, r: 22 }, // MULTIPLIER
];

const puck = {
  x: WORLD_W / 2,
  y: WORLD_H - 130,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true,
  mode: "plunger_ready", // plunger_ready | plunger | play
};

// Flippers rest down, flip up on press
const flippers = {
  left: {
    pivot: { x: WORLD_W / 2 - FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    baseAngle: 0.55,
    hitAngle: -0.55,
    angle: 0.55,
    pressed: false,
    key: "a",
  },
  right: {
    pivot: { x: WORLD_W / 2 + FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    baseAngle: Math.PI - 0.55,
    hitAngle: Math.PI + 0.55,
    angle: Math.PI - 0.55,
    pressed: false,
    key: "l",
  }
};

const input = {
  launch: false,
  nudgeL: false,
  nudgeR: false,
};

function setHUD() {
  elScore.textContent = String(score);
  elMult.textContent = `x${mult}`;
  elBanks.textContent = String(bankHits);
}

function resetToPlunger() {
  puck.stuck = true;
  puck.mode = "plunger_ready";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = 0;
}

function resetGame() {
  score = 0;
  bankHits = 0;
  mult = 1;
  resetToPlunger();
  setHUD();
}

function launchPuckKeyboard() {
  // Keyboard launch: fixed strength, starts in lane
  if (!puck.stuck) return;
  puck.stuck = false;
  puck.mode = "plunger";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = -820;
}

btnLaunch.addEventListener("click", () => {
  // Button acts like the keyboard launch
  launchPuckKeyboard();
});
btnReset.addEventListener("click", resetGame);

// Keyboard
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") { input.launch = true; e.preventDefault(); }
  if (k === "q") input.nudgeL = true;
  if (k === "p") input.nudgeR = true;
  if (k === flippers.left.key) flippers.left.pressed = true;
  if (k === flippers.right.key) flippers.right.pressed = true;
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = false;
  if (k === "q") input.nudgeL = false;
  if (k === "p") input.nudgeR = false;
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

// --------------------
// Mobile gesture controls
// --------------------
let touchId = null;
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

let plungerActive = false;
let plungerPull = 0; // 0..1
const PLUNGER_MAX_PULL_PX = 180;

const FLIPPER_ZONE_H = 0.28; // bottom 28% is flipper zone
const SWIPE_MIN_PX = 55;
const SWIPE_MAX_TIME = 280; // ms
const TILT_STRENGTH = 220;

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
function applyTilt(dir) {
  if (puck.mode !== "play" || puck.stuck) return;
  puck.vx += dir * TILT_STRENGTH;
}
function setPlungerPull(pullPx) {
  plungerPull = clamp(pullPx / PLUNGER_MAX_PULL_PX, 0, 1);
}

canvas.addEventListener("pointerdown", (e) => {
  if (touchId !== null) return; // single-touch simple mode
  touchId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);

  const p = screenToWorld(e.clientX, e.clientY);
  touchStartX = p.x;
  touchStartY = p.y;
  touchStartTime = performance.now();

  // Bottom flipper holds
  if (isLeftBottom(p)) {
    flippers.left.pressed = true;
    return;
  }
  if (isRightBottom(p)) {
    flippers.right.pressed = true;
    return;
  }

  // Plunger pull (only if puck is waiting in lane)
  if ((puck.mode === "plunger_ready" || puck.mode === "plunger") && isInPlungerLane(p)) {
    plungerActive = true;
    plungerPull = 0;
    return;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (touchId !== e.pointerId) return;

  const p = screenToWorld(e.clientX, e.clientY);

  // If finger is in bottom zone, update which flipper is held
  if (isInBottomZone(p)) {
    flippers.left.pressed = isLeftBottom(p);
    flippers.right.pressed = isRightBottom(p);
  }

  // Plunger pull: drag down increases pull
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

  // Release flippers
  flippers.left.pressed = false;
  flippers.right.pressed = false;

  // Plunger release -> launch strength
  if (plungerActive) {
    plungerActive = false;

    if (plungerPull > 0.05) {
      puck.stuck = false;
      puck.mode = "plunger";
      puck.x = (LANE_X1 + LANE_X2) / 2;
      puck.y = PLUNGER_START_Y;

      const minV = -420;
      const maxV = -980;
      puck.vx = 0;
      puck.vy = minV + (maxV - minV) * plungerPull;
    }

    plungerPull = 0;
    touchId = null;
    return;
  }

  // Tilt swipe: quick left/right (outside bottom zone)
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

// --------------------
// Physics
// --------------------
const GRAV = 760;
const AIR  = 0.995;
const REST = 0.88;
const MAXS = 1500;

let last = performance.now();

function step(now) {
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(step);
}

function update(dt) {
  if (input.launch) {
    launchPuckKeyboard();
    input.launch = false;
  }

  // Flipper animation
  for (const f of [flippers.left, flippers.right]) {
    const target = f.pressed ? f.hitAngle : f.baseAngle;
    const speed  = f.pressed ? 34 : 18;
    f.angle += clamp(target - f.angle, -speed * dt, speed * dt);
  }

  if (puck.stuck) return;

  // Nudges only during play
  if (puck.mode === "play") {
    if (input.nudgeL) puck.vx -= 130 * dt;
    if (input.nudgeR) puck.vx += 130 * dt;
  }

  // Integrate
  puck.vy += GRAV * dt;
  puck.x  += puck.vx * dt;
  puck.y  += puck.vy * dt;

  // Damping
  puck.vx *= AIR;
  puck.vy *= AIR;

  // Clamp
  puck.vx = clamp(puck.vx, -MAXS, MAXS);
  puck.vy = clamp(puck.vy, -MAXS, MAXS);

  // Top wall
  const T = table.inset;
  if (puck.y - puck.r < T) {
    puck.y = T + puck.r;
    puck.vy = -puck.vy * REST;
  }

  // Mode-specific walls
  if (puck.mode === "plunger" || puck.mode === "plunger_ready") {
    // keep puck inside plunger lane
    if (puck.x - puck.r < LANE_X1) { puck.x = LANE_X1 + puck.r; puck.vx = -puck.vx * REST; }
    if (puck.x + puck.r > LANE_X2) { puck.x = LANE_X2 - puck.r; puck.vx = -puck.vx * REST; }

    // release into play once it reaches the exit
    if (puck.y < LANE_RELEASE_Y) {
      puck.mode = "play";
      puck.vx = -260 + rand(-40, 40);       // kick left into the table
      puck.vy = Math.min(puck.vy, -300);    // keep it moving upward
    }
  } else {
    // normal side walls
    const L = table.inset;
    const R = WORLD_W - table.inset;
    if (puck.x - puck.r < L) { puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
    if (puck.x + puck.r > R) { puck.x = R - puck.r; puck.vx = -puck.vx * REST; }
  }

  // Bottom behavior: block outlanes, only center drain is open
  if (puck.y + puck.r > BOTTOM_WALL_Y) {
    const drainX1 = (WORLD_W / 2) - (DRAIN_OPEN_W / 2);
    const drainX2 = (WORLD_W / 2) + (DRAIN_OPEN_W / 2);
    const inDrainOpening = (puck.x > drainX1 && puck.x < drainX2);

    if (inDrainOpening && puck.y > DRAIN_TRIGGER_Y) {
      score -= 500;
      bankHits = Math.max(0, bankHits - 2);
      mult = bankHits >= 7 ? 8 : bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
      setHUD();
      resetToPlunger();
      return;
    }

    // bounce off bottom wall
    puck.y = BOTTOM_WALL_Y - puck.r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }

  // Collisions only during play
  if (puck.mode === "play") {
    // bumpers
    for (const b of bumpers) {
      const dx = puck.x - b.x;
      const dy = puck.y - b.y;
      const rr = puck.r + b.r;

      if (len2(dx, dy) < rr * rr) {
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const nx = dx / d;
        const ny = dy / d;

        puck.x = b.x + nx * rr;
        puck.y = b.y + ny * rr;

        const vn = puck.vx * nx + puck.vy * ny;
        puck.vx -= 2 * vn * nx;
        puck.vy -= 2 * vn * ny;

        puck.vx *= REST;
        puck.vy *= REST;

        bankHits += 1;
        mult = bankHits >= 7 ? 8 : bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
        score += 150 * mult;
        setHUD();
      }
    }

    // goal band
    const g = table.goal;
    if (
      puck.x > g.x - g.w / 2 && puck.x < g.x + g.w / 2 &&
      puck.y + puck.r > g.y && puck.y - puck.r < g.y + g.h &&
      puck.vy > 0
    ) {
      puck.vy = -Math.abs(puck.vy) * 0.92;
      score += 1000 * mult;
      puck.vx += rand(-40, 40);
      setHUD();
    }

    // flippers
    collideWithFlipper(flippers.left);
    collideWithFlipper(flippers.right);
  }
}

function flipperEndpoints(f) {
  const x1 = f.pivot.x;
  const y1 = f.pivot.y;
  const x2 = x1 + Math.cos(f.angle) * f.len;
  const y2 = y1 + Math.sin(f.angle) * f.len;
  return { x1, y1, x2, y2 };
}

function collideWithFlipper(f) {
  const { x1, y1, x2, y2 } = flipperEndpoints(f);

  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = puck.x - x1;
  const wy = puck.y - y1;

  const segLen2 = vx * vx + vy * vy;
  const t = segLen2 > 0 ? clamp((wx * vx + wy * vy) / segLen2, 0, 1) : 0;

  const cx = x1 + t * vx;
  const cy = y1 + t * vy;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist2 = dx * dx + dy * dy;

  const hitR = puck.r + 9;
  if (dist2 < hitR * hitR) {
    const d = Math.max(0.001, Math.sqrt(dist2));
    const nx = dx / d;
    const ny = dy / d;

    // separate
    puck.x = cx + nx * hitR;
    puck.y = cy + ny * hitR;

    // reflect
    const vn = puck.vx * nx + puck.vy * ny;
    puck.vx -= 2 * vn * nx;
    puck.vy -= 2 * vn * ny;

    // strike boost
    if (f.pressed) {
      puck.vx += nx * 520;
      puck.vy += ny * 520;
      score += 40 * mult;
      setHUD();
    }

    puck.vx *= REST;
    puck.vy *= REST;
  }
}

// Responsive canvas
function resizeCanvas() {
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();

  canvas.width  = Math.max(1, Math.floor(rect.width  * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  scaleX = canvas.width / WORLD_W;
  scaleY = canvas.height / WORLD_H;
}

window.addEventListener("resize", resizeCanvas);

function draw() {
  resizeCanvas();

  // Draw world scaled into pixel canvas
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  if (bgReady) ctx.drawImage(BG, 0, 0, WORLD_W, WORLD_H);

  // Plunger pull indicator (helps a lot on mobile)
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

  // Flippers
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

  // Reset transform
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawFlipper(f) {
  const { x1, y1, x2, y2 } = flipperEndpoints(f);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = f.pressed ? "rgba(79,163,255,0.98)" : "rgba(47,125,255,0.75)";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(x1, y1, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Start
resetGame();
resizeCanvas();
requestAnimationFrame(step);
