const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let W = canvas.width;
let H = canvas.height;

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
BG.onload = () => bgReady = true;

// Helpers
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand  = (a,b)=>a+Math.random()*(b-a);

// Game state
let score = 0;
let bankHits = 0;
let mult = 1;

// Table
const table = {
  inset: 22,
  drainY: H - 40
};

// Puck
const puck = {
  x: W/2, y: H-120, r: 12,
  vx:0, vy:0,
  stuck:true
};

// Flippers (correct pinball direction)
const flippers = {
  left:{
    pivot:{x:W/2-95,y:H-120},
    len:95,
    base:0.55,
    hit:-0.55,
    ang:0.55,
    down:false,
    key:"a"
  },
  right:{
    pivot:{x:W/2+95,y:H-120},
    len:95,
    base:Math.PI-0.55,
    hit:Math.PI+0.55,
    ang:Math.PI-0.55,
    down:false,
    key:"l"
  }
};

const input={ launch:false };

// Controls
btnLaunch.onclick = launch;
btnReset.onclick = reset;

window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  if(k===" ") input.launch=true;
  if(k==="a") flippers.left.down=true;
  if(k==="l") flippers.right.down=true;
});
window.addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  if(k===" ") input.launch=false;
  if(k==="a") flippers.left.down=false;
  if(k==="l") flippers.right.down=false;
});

function reset(){
  score=0; bankHits=0; mult=1;
  puck.stuck=true;
  puck.x=W/2; puck.y=H-120;
  puck.vx=puck.vy=0;
  updateHUD();
}

function launch(){
  if(!puck.stuck) return;
  puck.stuck=false;
  puck.vx=rand(-50,50);
  puck.vy=-520;
}

function updateHUD(){
  elScore.textContent=score;
  elMult.textContent=`x${mult}`;
  elBanks.textContent=bankHits;
}

// Physics
const GRAV=760, AIR=.995, REST=.88;
let last=performance.now();

function loop(now){
  const dt=Math.min(.02,(now-last)/1000);
  last=now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt){
  if(input.launch){ launch(); input.launch=false; }

  for(const f of Object.values(flippers)){
    const tgt=f.down?f.hit:f.base;
    const spd=f.down?32:18;
    f.ang+=clamp(tgt-f.ang,-spd*dt,spd*dt);
  }

  if(puck.stuck) return;

  puck.vy+=GRAV*dt;
  puck.x+=puck.vx*dt;
  puck.y+=puck.vy*dt;
  puck.vx*=AIR; puck.vy*=AIR;

  if(puck.y>table.drainY){
    score-=500;
    reset();
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);

  if(bgReady){
    ctx.drawImage(BG,0,0,W,H);
  }

  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  ctx.beginPath();
  ctx.arc(puck.x,puck.y,puck.r,0,Math.PI*2);
  ctx.fillStyle="#eef";
  ctx.fill();
}

function drawFlipper(f){
  const x2=f.pivot.x+Math.cos(f.ang)*f.len;
  const y2=f.pivot.y+Math.sin(f.ang)*f.len;
  ctx.lineWidth=18;
  ctx.lineCap="round";
  ctx.strokeStyle=f.down?"#4fa3ff":"#2f7dff";
  ctx.beginPath();
  ctx.moveTo(f.pivot.x,f.pivot.y);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}

// Start
reset();
requestAnimationFrame(loop);
