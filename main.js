// Play Puck Level 1 - v0.1 prototype
// Canvas + simple physics.
// ✅ Flippers rest DOWN and flip UP with A/L (pinball correct)
// ✅ Full field drawing restored

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const elScore = document.getElementById("score");
const elMult  = document.getElementById("mult");
const elBanks = document.getElementById("banks");

const btnLaunch = document.getElementById("btnLaunch");
const btnReset  = document.getElementById("btnReset");

const W = canvas.width;
const H = canvas.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const len2  = (x,y) => x*x+y*y;
const rand  = (a,b) => a + Math.random()*(b-a);

let score = 0;
let bankHits = 0;
let mult = 1;

// Table geometry
const table = {
  inset: 22,
  drainY: H - 40,
  goal: { x: W/2, y: 220, w: 130, h: 16 }, // goal zone band
};

// Bumpers ("banks")
const bumpers = [
  { x: 95,  y: 140, r: 18 },
  { x: 240, y: 110, r: 20 },
  { x: 385, y: 140, r: 18 },
  { x: 140, y: 420, r: 18 },
  { x: 340, y: 420, r: 18 },
];

// Puck
const puck = {
  x: W/2,
  y: H - 120,
  r: 12,
  vx: 0,
  vy: 0,
  launched: false,
  stuck: true,
};

// ✅ FIX: flippers rest DOWN, flip UP when pressed
const flippers = {
  left: {
    pivot: { x: W/2 - 95, y: H - 120 },
    len: 95,
    baseAngle: 0.55,    // resting DOWN
    hitAngle: -0.55,    // flips UP
    angle: 0.55,
    pressed: false,
    key: "a",
  },
  right: {
    pivot: { x: W/2 + 95, y: H - 120 },
    len: 95,
    baseAngle: Math.PI - 0.55, // resting DOWN
    hitAngle:  Math.PI + 0.55, // flips UP
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

function resetGame(){
  score = 0;
  bankHits = 0;
  mult = 1;
  resetPuckToPlunger();
  flippers.left.pressed = false;
  flippers.right.pressed = false;
  setHUD();
}

function resetPuckToPlunger(){
  puck.x = W/2;
  puck.y = H - 120;
  puck.vx = 0;
  puck.vy = 0;
  puck.launched = false;
  puck.stuck = true;
}

function launchPuck(){
  if (!puck.stuck) return;
  puck.stuck = false;
  puck.launched = true;
  puck.vx = rand(-40, 40);
  puck.vy = -520; // up the table
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

// Optional: pointer controls for quick testing
canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (W / rect.width);
  const py = (e.clientY - rect.top)  * (H / rect.height);

  if (py > H * 0.65) {
    if (px < W/2) flippers.left.pressed = true;
    else flippers.right.pressed = true;
  } else {
    launchPuck();
  }
});
canvas.addEventListener("pointerup", () => {
  flippers.left.pressed = false;
  flippers.right.pressed = false;
});

function addScore(points){
  score += Math.floor(points * mult);
  setHUD();
}

function onBankHit(){
  bankHits += 1;
  // Multipliers: 0-1 => x1, 2-3 => x2, 4-6 => x4, 7+ => x8
  if (bankHits >= 7) mult = 8;
  else if (bankHits >= 4) mult = 4;
  else if (bankHits >= 2) mult = 2;
  else mult = 1;
  setHUD();
}

function drainPenalty(){
  addScore(-500);
  // Drain also knocks multiplier down a bit
  bankHits = Math.max(0, bankHits - 2);
  if (bankHits >= 7) mult = 8;
  else if (bankHits >= 4) mult = 4;
  else if (bankHits >= 2) mult = 2;
  else mult = 1;
  setHUD();
}

// Physics constants
const GRAV = 760;
const AIR  = 0.995;
const REST = 0.88;
const MAXS = 1200;

let last = performance.now();
let bankDecayTimer = 0;

function step(now){
  const dt = Math.min(0.02, (now - last) / 1000);
  last = now;

  update(dt);
  draw();

  requestAnimationFrame(step);
}

function update(dt){
  // Launch on space
  if (input.launch){
    launchPuck();
    input.launch = false;
  }

  // Flipper animation: snappy UP, slower DOWN
  for (const f of [flippers.left, flippers.right]){
    const target = f.pressed ? f.hitAngle : f.baseAngle;
    const speed  = f.pressed ? 32 : 18;
    const delta  = target - f.angle;
    f.angle += clamp(delta, -speed * dt, speed * dt);
  }

  // If puck is stuck, keep it ready
  if (puck.stuck){
    puck.x = W/2;
    puck.y = H - 120;
    puck.vx = 0;
    puck.vy = 0;
    return;
  }

  // Nudges
  if (input.nudgeL) puck.vx -= 120 * dt;
  if (input.nudgeR) puck.vx += 120 * dt;

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

  // Walls
  const L = table.inset;
  const R = W - table.inset;
  const T = table.inset;
  const B = table.drainY;

  if (puck.x - puck.r < L){ puck.x = L + puck.r; puck.vx = -puck.vx * REST; }
  if (puck.x + puck.r > R){ puck.x = R - puck.r; puck.vx = -puck.vx * REST; }
  if (puck.y - puck.r < T){ puck.y = T + puck.r; puck.vy = -puck.vy * REST; }

  // Drain
  if (puck.y - puck.r > B){
    drainPenalty();
    resetPuckToPlunger();
    return;
  }

  // Bumpers collisions
  for (const b of bumpers){
    const dx = puck.x - b.x;
    const dy = puck.y - b.y;
    const rr = puck.r + b.r;
    if (len2(dx,dy) < rr*rr){
      const d = Math.max(0.001, Math.hypot(dx,dy));
      const nx = dx / d;
      const ny = dy / d;

      // push out
      puck.x = b.x + nx * rr;
      puck.y = b.y + ny * rr;

      // reflect
      const vn = puck.vx*nx + puck.vy*ny;
      puck.vx -= 2*vn*nx;
      puck.vy -= 2*vn*ny;

      puck.vx *= REST;
      puck.vy *= REST;

      onBankHit();
      addScore(150);
    }
  }

  // Goal zone scoring (crossing the band downward)
  const g = table.goal;
  if (
    puck.x > g.x - g.w/2 && puck.x < g.x + g.w/2 &&
    puck.y + puck.r > g.y && puck.y - puck.r < g.y + g.h &&
    puck.vy > 0
  ){
    puck.vy = -Math.abs(puck.vy) * 0.92;
    addScore(1000);
    puck.vx += rand(-40, 40);
  }

  // Flippers collisions
  collideWithFlipper(flippers.left);
  collideWithFlipper(flippers.right);

  // Gentle decay
  bankDecayTimer += dt;
  if (bankDecayTimer > 4.0){
    bankDecayTimer = 0;
    if (bankHits > 0) bankHits -= 1;
    if (bankHits >= 7) mult = 8;
    else if (bankHits >= 4) mult = 4;
    else if (bankHits >= 2) mult = 2;
    else mult = 1;
    setHUD();
  }
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

  // closest point on segment to puck center
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

  const hitR = puck.r + 8; // thickness
  if (dist2 < hitR*hitR){
    const d = Math.max(0.001, Math.sqrt(dist2));
    const nx = dx / d;
    const ny = dy / d;

    // separate
    puck.x = cx + nx * hitR;
    puck.y = cy + ny * hitR;

    // reflect
    const vn = puck.vx*nx + puck.vy*ny;
    puck.vx -= 2*vn*nx;
    puck.vy -= 2*vn*ny;

    // kick when pressed (the strike)
    if (f.pressed){
      puck.vx += nx * 420;
      puck.vy += ny * 420;
      addScore(40);
    }

    puck.vx *= REST;
    puck.vy *= REST;
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);

  // Table base
  ctx.save();
  roundRect(ctx, 10, 10, W-20, H-20, 18);
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Drain line
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(table.inset, table.drainY);
  ctx.lineTo(W - table.inset, table.drainY);
  ctx.stroke();
  ctx.restore();

  // Goal zone
  const g = table.goal;
  ctx.save();
  ctx.fillStyle = "rgba(47,125,255,0.18)";
  ctx.fillRect(g.x - g.w/2, g.y, g.w, g.h);
  ctx.strokeStyle = "rgba(47,125,255,0.35)";
  ctx.strokeRect(g.x - g.w/2, g.y, g.w, g.h);
  ctx.restore();

  // Bumpers
  for (const b of bumpers){
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = "rgba(255,59,59,0.18)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,59,59,0.35)";
    ctx.stroke();
    ctx.restore();
  }

  // Flippers
  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  // Puck
  ctx.save();
  ctx.beginPath();
  ctx.arc(puck.x, puck.y, puck.r, 0, Math.PI*2);
  ctx.fillStyle = "rgba(232,241,255,0.95)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Drain warning region
  ctx.save();
  ctx.fillStyle = "rgba(255,59,59,0.10)";
  ctx.fillRect(table.inset, table.drainY, W - table.inset*2, H - table.drainY - table.inset);
  ctx.restore();
}

function drawFlipper(f){
  const { x1, y1, x2, y2 } = flipperEndpoints(f);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 18;
  ctx.strokeStyle = f.pressed ? "rgba(47,125,255,0.95)" : "rgba(47,125,255,0.65)";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // pivot
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.arc(x1, y1, 10, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y,   x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x,   y+h, rr);
  ctx.arcTo(x,   y+h, x,   y,   rr);
  ctx.arcTo(x,   y,   x+w, y,   rr);
  ctx.closePath();
}

// Start
resetGame();
requestAnimationFrame(step);
