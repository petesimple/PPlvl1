const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Fixed world size (physics and layout live here)
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

// Background image
const BG = new Image();
BG.src = "bg-level1.png";
let bgReady = false;
BG.onload = () => { bgReady = true; };

// Helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len2 = (x, y) => x * x + y * y;
const rand = (a, b) => a + Math.random() * (b - a);

// Scoring
let score = 0;
let bankHits = 0;
let mult = 1;

// --------------------
// Calibration knobs for your background
// --------------------
const TABLE_INSET = 22;

// Flippers: moved up and shortened to match your art better
const FLIPPER_Y = WORLD_H - 190;
const FLIPPER_OFFSET_X = 88;
const FLIPPER_LEN = 78;

// Bottom behavior: block outlanes, only allow a center drain
const BOTTOM_WALL_Y = WORLD_H - TABLE_INSET;
const DRAIN_OPEN_W = 150;          // width of the only drain opening in the middle
const DRAIN_TRIGGER_Y = WORLD_H - 90;

// Plunger lane (right side)
const LANE_W = 68;
const LANE_X2 = WORLD_W - TABLE_INSET;
const LANE_X1 = LANE_X2 - LANE_W;
const LANE_RELEASE_Y = 505;        // when puck reaches here, it exits lane into play
const PLUNGER_START_Y = WORLD_H - 120;

// Table geometry
const table = {
  inset: TABLE_INSET,
  goal: { x: WORLD_W / 2, y: 170, w: 170, h: 18 }, // simple goal band near your GOAL ZONE plate
};

// Bumpers roughly where the red buttons are
const bumpers = [
  { x: 120, y: 270, r: 22 },  // BANK
  { x: 360, y: 270, r: 22 },  // MULTIPLIER
];

// Puck
const puck = {
  x: WORLD_W / 2,
  y: WORLD_H - 130,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true,
  mode: "plunger_ready", // plunger_ready | plunger | play
};

// Flippers rest DOWN, flip UP
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

function launchPuck() {
  if (!puck.stuck) return;

  // Start in plunger lane
  puck.stuck = false;
  puck.mode = "plunger";
  puck.x = (LANE_X1 + LANE_X2) / 2;
  puck.y = PLUNGER_START_Y;
  puck.vx = 0;
  puck.vy = -760; // strong plunger push
}

btnLaunch.addEventListener("click", launchPuck);
btnReset.addEventListener("click", resetGame);

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

// Convert screen coords to WORLD coords
function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  return { x: x / scaleX, y: y / scaleY };
}

// Pointer controls (simple)
canvas.addEventListener("pointerdown", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);

  if (p.y > WORLD_H * 0.68) {
    if (p.x < WORLD_W / 2) flippers.left.pressed = true;
    else flippers.right.pressed = true;
  } else {
    launchPuck();
  }
});

canvas.addEventListener("pointerup", () => {
  flippers.left.pressed = false;
  flippers.right.pressed = false;
});

// Physics constants
const GRAV = 760;
const AIR = 0.995;
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
    launchPuck();
    input.launch = false;
  }

  // Flipper animation: fast up, slower down
  for (const f of [flippers.left, flippers.right]) {
    const target = f.pressed ? f.hitAngle : f.baseAngle;
    const speed = f.pressed ? 34 : 18;
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
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

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
    // Keep puck inside plunger lane
    if (puck.x - puck.r < LANE_X1) { puck.x = LANE_X1 + puck.r; puck.vx = -puck.vx * REST; }
    if (puck.x + puck.r > LANE_X2) { puck.x = LANE_X2 - puck.r; puck.vx = -puck.vx * REST; }

    // Release into play once it reaches the lane exit area
    if (puck.y < LANE_RELEASE_Y) {
      puck.mode = "play";
      // Kick left into the table (simple and reliable)
      puck.vx = -260 + rand(-40, 40);
      puck.vy = Math.min(puck.vy, -300); // keep it going upward
    }
  } else {
    // Normal side walls for play
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

    // Drain only if in the center opening and low enough
    if (inDrainOpening && puck.y > DRAIN_TRIGGER_Y) {
      score -= 500;
      bankHits = Math.max(0, bankHits - 2);
      mult = bankHits >= 7 ? 8 : bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
      setHUD();
      resetToPlunger();
      return;
    }

    // Otherwise bounce off the bottom wall (prevents side drain)
    puck.y = BOTTOM_WALL_Y - puck.r;
    puck.vy = -Math.abs(puck.vy) * REST;
  }

  // Bumpers (only during play so plunger lane stays clean)
  if (puck.mode === "play") {
    for (const b of bumpers) {
      const dx = puck.x - b.x;
      const dy = puck.y - b.y;
      const rr = puck.r + b.r;

      if (len2(dx, dy) < rr * rr) {
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const nx = dx / d;
        const ny = dy / d;

        // push out
        puck.x = b.x + nx * rr;
        puck.y = b.y + ny * rr;

        // reflect
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

    // Goal band scoring
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

    // Flippers collide only during play
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

    // strike boost when pressed
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

// Responsive canvas sizing
function resizeCanvas() {
  dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();

  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  scaleX = canvas.width / WORLD_W;
  scaleY = canvas.height / WORLD_H;
}

window.addEventListener("resize", resizeCanvas);

function draw() {
  resizeCanvas();

  // Draw world scaled into the actual pixel canvas
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  // Background
  if (bgReady) ctx.drawImage(BG, 0, 0, WORLD_W, WORLD_H);

  // Optional: draw plunger lane guide (subtle)
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.strokeRect(LANE_X1, table.inset, LANE_W, WORLD_H - table.inset * 2);
  ctx.restore();

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
