// main.js - Play Puck Level 1 (neon HUD + scoring targets + no side drains)
// Drop-in file

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
const rand  = (a, b) => a + Math.random() * (b - a);

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

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

// Upper funnel rails (help guide ball toward drain edges)
const FUNNEL_Y_TOP = FLIPPER_Y - 65;
const FUNNEL_Y_BOT = BOTTOM_WALL_Y - 4;
const FUNNEL_LEFT_X_TOP  = TABLE_INSET + 26;
const FUNNEL_RIGHT_X_TOP = WORLD_W - TABLE_INSET - 26;

// HARD OUTLANE BLOCKERS (real fix: thick rails + caps)
const OUTLANE_Y_TOP = FLIPPER_Y - 80;     // start higher so it blocks earlier
const OUTLANE_Y_BOT = BOTTOM_WALL_Y - 2;

// start basically on the wall so no side gap exists
const OUTLANE_LEFT_X_TOP  = TABLE_INSET + 2;
const OUTLANE_RIGHT_X_TOP = WORLD_W - TABLE_INSET - 2;

// small horizontal “cap” rails so the puck cannot sneak around the top corner
const OUTLANE_CAP_Y = OUTLANE_Y_TOP;

// Spawn higher in field
const START_X = WORLD_W / 2;
const START_Y = 320;

// =====================
// GAME STATE
// =====================
let score = 0;
let mult = 1;
const multSteps = [1, 2, 3, 5];
let multIndex = 0;

// HUD pulse when points are scored
let hudPulse = 0;     // 0..1
let hudPulseVel = 0;  // spring velocity
let lastScoreAdd = 0;

function addScore(base) {
  const add = base * mult;
  score += add;
  lastScoreAdd = add;

  // Trigger neon pulse (stackable)
  hudPulse = Math.min(1, hudPulse + 0.55);
  hudPulseVel = -0.9;
}

// Simple hit flash timers
let flashBank = 0;
let flashMult = 0;
let flashGoal = 0;

// =====================
// GAME OBJECTS
// =====================
const puck = {
  x: START_X,
  y: START_Y,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true,
  mode: "play",
};

// Flippers
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

// Targets lined up to the background image
const targets = {
  bank:       { x: 113.2, y: 121.0, r: 28, power: 620, points: 250 },
  multiplier: { x: 367.7, y: 120.0, r: 28, power: 620, points: 250 },
};

// Goal zone (top center label area)
const goalZone = {
  x1: 160, y1: 55,
  x2: 320, y2: 130,
  points: 400,
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

  // Swipe down anywhere = serve
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
const AIR  = 0.995;
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
  if (!puck.stuck) return;
  puck.stuck = false;

  puck.vx = rand(-220, 220);
  puck.vy = rand(-420, -520);
}

// Segment collider (thick rail support)
function collideWithSegment(x1, y1, x2, y2, extra = 0) {
  const sx = x2 - x1, sy = y2 - y1;
  const px = puck.x - x1, py = puck.y - y1;
  const segLen2 = sx * sx + sy * sy;
  const t = segLen2 > 0 ? clamp((px * sx + py * sy) / segLen2, 0, 1) : 0;

  const cx = x1 + t * sx;
  const cy = y1 + t * sy;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist2 = dx * dx + dy * dy;

  const hitR = puck.r + extra;
  if (dist2 >= hitR * hitR) return;

  const dist = Math.max(0.001, Math.sqrt(dist2));
  const nx = dx / dist;
  const ny = dy / dist;

  puck.x = cx + nx * hitR;
  puck.y = cy + ny * hitR;

  const vn = puck.vx * nx + puck.vy * ny;
  if (vn < 0) {
    puck.vx -= 2 * vn * nx;
    puck.vy -= 2 * vn * ny;
    puck.vx *= REST;
    puck.vy *= REST;
  }
}

// Circle target / bumper collider
function collideWithCircleTarget(t, onHit) {
  const dx = puck.x - t.x;
  const dy = puck.y - t.y;
  const rr = puck.r + t.r;
  const dist2 = dx * dx + dy * dy;
  if (dist2 >= rr * rr) return;

  const dist = Math.max(0.001, Math.sqrt(dist2));
  const nx = dx / dist;
  const ny = dy / dist;

  puck.x = t.x + nx * rr;
  puck.y = t.y + ny * rr;

  const vn = puck.vx * nx + puck.vy * ny;
  if (vn < 0) {
    puck.vx -= 2 * vn * nx;
    puck.vy -= 2 * vn * ny;

    puck.vx += nx * t.power;
    puck.vy += ny * t.power;

    puck.vx *= REST;
    puck.vy *= REST;

    onHit?.();
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

// Goal zone check (rectangle)
function handleGoalZone() {
  if (puck.x < goalZone.x1 || puck.x > goalZone.x2) return;
  if (puck.y < goalZone.y1 || puck.y > goalZone.y2) return;

  if (puck.vy < -120) {
    addScore(goalZone.points);
    flashGoal = 10;
    puck.vy = Math.abs(puck.vy) * 0.55;
  }
}

// =====================
// NEON HUD
// =====================
function drawNeonScoreHUD() {
  // centered in the header panel
  const w = 260;
  const h = 72;
  const x = (WORLD_W - w) / 2;
  const y = 32;

  const r = 14;
  const pad = 12;

  const p = hudPulse;
  const glow = 12 + 30 * p;
  const borderW = 3 + 3 * p;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();

  const t = performance.now() * 0.001;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0.00, `hsla(${(t * 90 +   0) % 360}, 100%, 65%, 0.95)`);
  grad.addColorStop(0.20, `hsla(${(t * 90 +  70) % 360}, 100%, 65%, 0.95)`);
  grad.addColorStop(0.40, `hsla(${(t * 90 + 140) % 360}, 100%, 65%, 0.95)`);
  grad.addColorStop(0.60, `hsla(${(t * 90 + 210) % 360}, 100%, 65%, 0.95)`);
  grad.addColorStop(0.80, `hsla(${(t * 90 + 280) % 360}, 100%, 65%, 0.95)`);
  grad.addColorStop(1.00, `hsla(${(t * 90 + 360) % 360}, 100%, 65%, 0.95)`);

  ctx.shadowColor = "rgba(255,255,255,0.35)";
  ctx.shadowBlur = glow;
  ctx.strokeStyle = grad;
  ctx.lineWidth = borderW;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r - 2);
  ctx.stroke();

  const scoreText = String(score).padStart(6, "0");

  ctx.shadowColor = `hsla(${(t * 90) % 360}, 100%, 70%, 0.85)`;
  ctx.shadowBlur = 10 + 24 * p;

  ctx.fillStyle = "rgba(235,245,255,0.98)";
  ctx.textBaseline = "top";

  ctx.font = "800 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  ctx.fillText("SCORE", x + pad, y + 10);

  ctx.font = "900 28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  ctx.fillText(scoreText, x + pad, y + 26);

  const mx = x + w - 60;
  const my = y + 10;
  ctx.shadowBlur = 8 + 16 * p;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  roundRect(ctx, mx, my, 48, 20, 8);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1;
  roundRect(ctx, mx, my, 48, 20, 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "900 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  ctx.fillText(`x${mult}`, mx + 12, my + 4);

  ctx.restore();
}

// Visible scoring markers so they’re not “missing”
function drawNeonRing(x, y, r, alpha = 0.18) {
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 5;
  ctx.shadowBlur = 18;
  ctx.shadowColor = `hsla(${(t * 90) % 360}, 100%, 70%, ${alpha})`;
  ctx.strokeStyle = `hsla(${(t * 90) % 360}, 100%, 70%, ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGoalOutline(z, alpha = 0.14) {
  const t = performance.now() * 0.001;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 3;
  ctx.shadowBlur = 16;
  ctx.shadowColor = `hsla(${(t * 90 + 180) % 360}, 100%, 70%, ${alpha})`;
  ctx.strokeStyle = `hsla(${(t * 90 + 180) % 360}, 100%, 70%, ${alpha})`;
  ctx.strokeRect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
  ctx.restore();
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

  // HUD pulse decay
  {
    const k = 18;
    const d = 10;
    hudPulseVel += (-k * hudPulse - d * hudPulseVel) * dt;
    hudPulse += hudPulseVel * dt;
    if (hudPulse < 0) { hudPulse = 0; hudPulseVel = 0; }
    if (hudPulse > 1) { hudPulse = 1; hudPulseVel *= -0.5; }
  }

  if (flashBank > 0) flashBank--;
  if (flashMult > 0) flashMult--;
  if (flashGoal > 0) flashGoal--;

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

  // BANK target
  collideWithCircleTarget(targets.bank, () => {
    addScore(targets.bank.points);
    flashBank = 10;
    puck.vx += rand(-80, 80);
  });

  // MULTIPLIER target
  collideWithCircleTarget(targets.multiplier, () => {
    addScore(targets.multiplier.points);
    flashMult = 10;
    multIndex = (multIndex + 1) % multSteps.length;
    mult = multSteps[multIndex];
  });

  // GOAL ZONE
  handleGoalZone();

  // Rails
  collideWithSegment(FUNNEL_LEFT_X_TOP,  FUNNEL_Y_TOP, DRAIN_X1, FUNNEL_Y_BOT, 0);
  collideWithSegment(FUNNEL_RIGHT_X_TOP, FUNNEL_Y_TOP, DRAIN_X2, FUNNEL_Y_BOT, 0);

  // HARD outlane blockers (thick + capped)
  const OUTLANE_THICK = 10;
  collideWithSegment(OUTLANE_LEFT_X_TOP,  OUTLANE_Y_TOP, DRAIN_X1, OUTLANE_Y_BOT, OUTLANE_THICK);
  collideWithSegment(OUTLANE_RIGHT_X_TOP, OUTLANE_Y_TOP, DRAIN_X2, OUTLANE_Y_BOT, OUTLANE_THICK);

  // Caps connect wall to rail start
  collideWithSegment(TABLE_INSET, OUTLANE_CAP_Y, OUTLANE_LEFT_X_TOP, OUTLANE_CAP_Y, OUTLANE_THICK);
  collideWithSegment(WORLD_W - TABLE_INSET, OUTLANE_CAP_Y, OUTLANE_RIGHT_X_TOP, OUTLANE_CAP_Y, OUTLANE_THICK);

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

  // Visible scoring markers (so they don’t disappear into the art)
  drawNeonRing(targets.bank.x, targets.bank.y, targets.bank.r + 10, 0.16);
  drawNeonRing(targets.multiplier.x, targets.multiplier.y, targets.multiplier.r + 10, 0.16);
  drawGoalOutline(goalZone, 0.12);

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

  // Optional hit flashes
  if (flashBank) {
    ctx.fillStyle = "rgba(255,120,80,0.18)";
    ctx.beginPath(); ctx.arc(targets.bank.x, targets.bank.y, targets.bank.r + 14, 0, Math.PI * 2); ctx.fill();
  }
  if (flashMult) {
    ctx.fillStyle = "rgba(255,120,80,0.18)";
    ctx.beginPath(); ctx.arc(targets.multiplier.x, targets.multiplier.y, targets.multiplier.r + 14, 0, Math.PI * 2); ctx.fill();
  }
  if (flashGoal) {
    ctx.fillStyle = "rgba(80,200,255,0.12)";
    ctx.fillRect(goalZone.x1, goalZone.y1, goalZone.x2 - goalZone.x1, goalZone.y2 - goalZone.y1);
  }

  // Neon HUD
  drawNeonScoreHUD();

  // Hint
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Space or swipe down to serve | Swipe L/R to tilt | A/L flippers", 16, WORLD_H - 18);

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
