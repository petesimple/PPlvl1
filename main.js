const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Fixed world size (physics and layout live here)
const WORLD_W = 480;
const WORLD_H = 800;

// Display size is responsive, but we draw world scaled into it
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
const len2 = (x,y) => x*x + y*y;
const rand = (a,b) => a + Math.random() * (b - a);

let score = 0;
let bankHits = 0;
let mult = 1;

// ---- Calibrations for THIS background ----
// If flippers still feel off, adjust FLIPPER_Y first.
const FLIPPER_Y = WORLD_H - 190;       // was WORLD_H - 120, moved up to match art
const FLIPPER_OFFSET_X = 92;
const FLIPPER_LEN = 92;

const table = {
  inset: 22,
  drainY: WORLD_H - 80,                 // bring drain line up a bit for the art
  goal: { x: WORLD_W/2, y: 170, w: 170, h: 18 } // aligns closer to the GOAL ZONE plate
};

// Bumpers roughly where the big red buttons are in the PNG
const bumpers = [
  { x: 120, y: 270, r: 22 },  // BANK
  { x: 360, y: 270, r: 22 },  // MULTIPLIER
];

const puck = {
  x: WORLD_W/2,
  y: WORLD_H - 130,
  r: 12,
  vx: 0,
  vy: 0,
  stuck: true
};

// Flippers rest DOWN, flip UP
const flippers = {
  left: {
    pivot: { x: WORLD_W/2 - FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    baseAngle: 0.55,
    hitAngle: -0.55,
    angle: 0.55,
    pressed: false,
    key: "a",
  },
  right: {
    pivot: { x: WORLD_W/2 + FLIPPER_OFFSET_X, y: FLIPPER_Y },
    len: FLIPPER_LEN,
    baseAngle: Math.PI - 0.55,
    hitAngle:  Math.PI + 0.55,
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

function setHUD(){
  elScore.textContent = String(score);
  elMult.textContent  = `x${mult}`;
  elBanks.textContent = String(bankHits);
}

function resetPuck(){
  // Spawn just above the flippers, centered in the gap
  puck.x = WORLD_W / 2;
  puck.y = FLIPPER_Y - 34;   // key line: above flippers
  puck.vx = 0;
  puck.vy = 0;
  puck.stuck = true;
}

function resetGame(){
  score = 0;
  bankHits = 0;
  mult = 1;
  resetPuck();
  setHUD();
}

function launchPuck(){
  if (!puck.stuck) return;

  // Ensure it launches from the same safe spot
  puck.x = WORLD_W / 2;
  puck.y = FLIPPER_Y - 34;

  puck.stuck = false;
  puck.vx = rand(-40, 40);
  puck.vy = -560;
}

btnLaunch.addEventListener("click", launchPuck);
btnReset.addEventListener("click", resetGame);

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") { input.launch = true; e.preventDefault(); }
  if (k === "q") input.nudgeL = true;
  if (k === "p") input.nudgeR = true;
  if (k === flippers.left.key)  flippers.left.pressed = true;
  if (k === flippers.right.key) flippers.right.pressed = true;
});

window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") input.launch = false;
  if (k === "q") input.nudgeL = false;
  if (k === "p") input.nudgeR = false;
  if (k === flippers.left.key)  flippers.left.pressed = false;
  if (k === flippers.right.key) flippers.right.pressed = false;
});

// Convert screen coords to WORLD coords
function screenToWorld(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top)  * (canvas.height / rect.height);
  return { x: x / scaleX, y: y / scaleY };
}

// Pointer controls
canvas.addEventListener("pointerdown", (e) => {
  const p = screenToWorld(e.clientX, e.clientY);

  if (p.y > WORLD_H * 0.68) {
    if (p.x < WORLD_W/2) flippers.left.pressed = true;
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
const AIR  = 0.995;
const REST = 0.88;
const MAXS = 1400;

let last = performance.now();

function step(now){
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;

  update(dt);
  draw();

  requestAnimationFrame(step);
}

function update(dt){
  if (input.launch){
    launchPuck();
    input.launch = false;
  }

  // Flipper animation
  for (const f of [flippers.left, flippers.right]){
    const target = f.pressed ? f.hitAngle : f.baseAngle;
    const speed  = f.pressed ? 34 : 18;
    f.angle += clamp(target - f.angle, -speed * dt, speed * dt);
  }

  if (puck.stuck) return;

  if (input.nudgeL) puck.vx -= 130 * dt;
  if (input.nudgeR) puck.vx += 130 * dt;

  puck.vy += GRAV * dt;
  puck.x  += puck.vx * dt;
  puck.y  += puck.vy * dt;

  puck.vx *= AIR;
  puck.vy *= AIR;

  puck.vx = clamp(puck.vx, -MAXS, MAXS);
  puck.vy = clamp(puck.vy, -MAXS, MAXS);

  // Walls
  const L = table.inset;
  const R = WORLD_W - table.inset;
  const T = table.inset;

  if (puck.x - puck.r < L){ puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
  if (puck.x + puck.r > R){ puck.x = R - puck.r; puck.vx = -puck.vx * REST; }
  if (puck.y - puck.r < T){ puck.y = T + puck.r; puck.vy = -puck.vy * REST; }

  // Drain
  if (puck.y - puck.r > table.drainY){
    score -= 500;
    bankHits = Math.max(0, bankHits - 2);
    mult = bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
    setHUD();
    resetPuck();
    return;
  }

  // Bumpers
  for (const b of bumpers){
    const dx = puck.x - b.x;
    const dy = puck.y - b.y;
    const rr = puck.r + b.r;
    if (len2(dx,dy) < rr*rr){
      const d = Math.max(0.001, Math.hypot(dx,dy));
      const nx = dx / d;
      const ny = dy / d;

      puck.x = b.x + nx * rr;
      puck.y = b.y + ny * rr;

      const vn = puck.vx*nx + puck.vy*ny;
      puck.vx -= 2*vn*nx;
      puck.vy -= 2*vn*ny;

      puck.vx *= REST;
      puck.vy *= REST;

      bankHits += 1;
      mult = bankHits >= 7 ? 8 : bankHits >= 4 ? 4 : bankHits >= 2 ? 2 : 1;
      score += 150 * mult;
      setHUD();
    }
  }

  // Goal zone scoring band
  const g = table.goal;
  if (
    puck.x > g.x - g.w/2 && puck.x < g.x + g.w/2 &&
    puck.y + puck.r > g.y && puck.y - puck.r < g.y + g.h &&
    puck.vy > 0
  ){
    puck.vy = -Math.abs(puck.vy) * 0.92;
    score += 1000 * mult;
    puck.vx += rand(-40, 40);
    setHUD();
  }

  collideWithFlipper(flippers.left);
  collideWithFlipper(flippers.right);
}

function flipperEndpoints(f){
  const x1 = f.pivot.x;
  const y1 = f.pivot.y;
  const x2 = x1 + Math.cos(f.angle) * f.len;
  const y2 = y1 + Math.sin(f.angle) * f.len;
  return { x1, y1, x2, y2 };
}

function collideWithFlipper(f){
  const { x1, y1, x2, y2 } = flipperEndpoints(f);

  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = puck.x - x1;
  const wy = puck.y - y1;

  const segLen2 = vx*vx + vy*vy;
  const t = segLen2 > 0 ? clamp((wx*vx + wy*vy) / segLen2, 0, 1) : 0;

  const cx = x1 + t*vx;
  const cy = y1 + t*vy;

  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist2 = dx*dx + dy*dy;

  const hitR = puck.r + 9;
  if (dist2 < hitR*hitR){
    const d = Math.max(0.001, Math.sqrt(dist2));
    const nx = dx / d;
    const ny = dy / d;

    puck.x = cx + nx * hitR;
    puck.y = cy + ny * hitR;

    const vn = puck.vx*nx + puck.vy*ny;
    puck.vx -= 2*vn*nx;
    puck.vy -= 2*vn*ny;

    if (f.pressed){
      puck.vx += nx * 480;
      puck.vy += ny * 480;
      score += 40 * mult;
      setHUD();
    }

    puck.vx *= REST;
    puck.vy *= REST;
  }
}

// Responsive canvas sizing
function resizeCanvas(){
  dpr = Math.max(1, window.devicePixelRatio || 1);

  const rect = canvas.getBoundingClientRect();
  const pxW = Math.max(1, Math.floor(rect.width  * dpr));
  const pxH = Math.max(1, Math.floor(rect.height * dpr));

  canvas.width = pxW;
  canvas.height = pxH;

  scaleX = canvas.width  / WORLD_W;
  scaleY = canvas.height / WORLD_H;
}

window.addEventListener("resize", resizeCanvas);

function draw(){
  // Make sure scaling matches the current on-screen canvas size
  // (important on mobile orientation changes)
  resizeCanvas();

  // Draw world scaled into the actual pixel canvas
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);

  // Background
  if (bgReady){
    ctx.drawImage(BG, 0, 0, WORLD_W, WORLD_H);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  // Optional debug lines
  // ctx.strokeStyle = "rgba(255,255,255,0.12)";
  // ctx.beginPath(); ctx.moveTo(0, table.drainY); ctx.lineTo(WORLD_W, table.drainY); ctx.stroke();

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

  // Reset transform so CSS UI is unaffected
  ctx.setTransform(1,0,0,1,0,0);
}

function drawFlipper(f){
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
