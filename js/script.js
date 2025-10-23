/* MINI ZONA DE BATALLA — VERSIÓN CON 3 NIVELES
   - Nivel 1: juego base (hasta 50 bajas)
   - Nivel 2: enemigos más rápidos y spawn más frecuente (50 - 99 bajas)
   - Nivel 3: enemigos contraatacan (>=100 bajas)
*/

/* ========= CONFIGURACIONES ========= */
// Tamaño del canvas 
const CANVAS_W = 1337;
const CANVAS_H = 550;

// Comportamiento base
const MAX_ENEMIES_BASE = 6;            // máximo de enemigos en pantallas (valor base)
const ENEMY_SPAWN_INTERVAL_BASE = 1800; // intervalo de aparición base (ms)
const BULLET_SPEED = 30;               // velocidad de las balas del jugador
const PLAYER_MAX_LIVES = 3;            // vidas del jugador

// Umbrales de nivel (número de enemigos eliminados para subir de nivel)
const KILLS_TO_LEVEL2 = 20;  // pasar a nivel 2 al eliminar 50 enemigos
const KILLS_TO_LEVEL3 = 50; // pasar a nivel 3 al eliminar 100 enemigos

/* ========= VARIABLES GLOBALES ========= */
const canvas = document.getElementById('gameCanvas'); // canvas del juego
const ctx = canvas.getContext('2d');                  // contexto 2D

// tamaño inicial del canvas (puedes mantener CANVAS_W/H o adaptarlo dinámicamente si quieres)
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

let lastTime = 0;         // tiempo de frame anterior (ms)
let running = false;      // bandera si el juego está corriendo
let player, bullets, enemies, obstacles; // entidades principales
let keys = {};            // teclado
let mouse = { x: 0, y: 0 }; // posición del mouse relativa al canvas
let score = 0;            // puntuación
let lives = PLAYER_MAX_LIVES; // vidas actuales
let spawnTimer = 0;       // temporizador para spawn de enemigos
let soundOn = false;      // sonido activo?
let kills = 0;            // contador de bajas (muertes de enemigos)
let level = 1;            // nivel actual (1,2,3)
let levelMessageTimer = 0;// temporizador para mostrar mensaje de nivel (ms)
let levelMessageText = ""; // texto del mensaje de nivel

/* Variables de comportamiento dinámico (se ajustan por nivel) */
let MAX_ENEMIES = MAX_ENEMIES_BASE;
let ENEMY_SPAWN_INTERVAL = ENEMY_SPAWN_INTERVAL_BASE;

/* Balas enemigas (usadas en Nivel 3) */
let enemyBullets = [];    // array con balas disparadas por enemigos

/* === Imágenes del jugador y enemigos === */
const enemyImage = new Image();
enemyImage.src = "img/avion4.png"; // imagen del enemigo 

const tankImage = new Image();
tankImage.src = "img/avion5.png";  // imagen del jugador

/* Elementos de UI */
const scoreHud = document.getElementById('scoreHud');
const livesHud = document.getElementById('livesHud');
const waveHud = document.getElementById('waveHud');
const statusHud = document.getElementById('statusHud');
const overlay = document.getElementById('overlay');
const startScreen = document.getElementById('startScreen');
const startBtn = document.getElementById('startBtn');
const tutorialBtn = document.getElementById('tutorialBtn');
const cardTutorial = document.getElementById('cardTutorial');
const backBtn = document.getElementById('backBtn');
const muteBtn = document.getElementById('muteBtn');

/* ========= SONIDOS SIMPLES (tono) ========= */
// Función beep para sonido simple (usar con moderación)
const beep = (f=440, t=0.06, vol=0.02) => {
  if(!soundOn) return; // si el usuario desactivó sonido, no reproducir
  try {
    const ctxAudio = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, ctxAudio.currentTime);
    g.gain.value = vol;
    o.connect(g); g.connect(ctxAudio.destination);
    o.start();
    o.stop(ctxAudio.currentTime + t);
  } catch(e){}
};

/* ========= FUNCIONES UTILITARIAS ========= */
// Limita un valor entre mínimo y máximo
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// Distancia euclidiana entre objetos (con x,y)
function distance(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

// Ángulo desde a hacia b en radianes (atan2)
function angleTo(a,b){ return Math.atan2(b.y-a.y, b.x-a.x); }

/* ========= ENTIDADES Y CREADORES ========= */
// Crea el objeto jugador con propiedades por defecto
function createPlayer(){
  return {
    x: CANVAS_W/2,
    y: CANVAS_H/2,
    angle: 0,
    turretAngle: 0,
    speed: 0,
    size: 26,
    turnSpeed: 0.05,
    accel: 0.14,
    friction: 0.96,
    reload: 0,
    reloadTime: 18,
    image: tankImage // imagen asociada (opcional)
  };
}

// Creación de un enemigo en borde aleatorio de la pantalla
function spawnEnemy(){
  const edge = Math.floor(Math.random()*4);
  let x,y;
  if(edge===0){ x=10; y=Math.random()*canvas.height; }          // borde izquierdo
  else if(edge===1){ x=canvas.width-10; y=Math.random()*canvas.height; } // borde derecho
  else if(edge===2){ x=Math.random()*canvas.width; y=10; }       // borde superior
  else { x=Math.random()*canvas.width; y=canvas.height-10; }      // borde inferior
  const sz = 18 + Math.random()*18;
  enemies.push({
    x, y,
    size: sz,
    angle: Math.random()*Math.PI*2,
    speed: 0.6 + Math.random()*0.9, // velocidad base (se modificará según nivel)
    health: 1,
    reload: Math.floor(Math.random()*120), // temporizador de disparo (se usa en nivel 3)
    color: '#33ff66'
  });
}

// Crea obstáculos estáticos en el mapa
function createObstacles(){
  return [
    {x:150, y:120, w:90, h:18},
    {x:360, y:320, w:16, h:120},
    {x:650, y:90, w:140, h:18},
    {x:700, y:400, w:18, h:140},
    {x:340, y:80, w:18, h:110},
    {x:80, y:420, w:160, h:18}
  ];
}

/* ========= INICIALIZACIÓN / REINICIO DEL JUEGO ========= */
// Reinicia variables y prepara el juego
function resetGame(){
  player = createPlayer();        // crear jugador
  bullets = [];                   // limpiar balas del jugador
  enemies = [];                   // limpiar enemigos
  enemyBullets = [];              // limpiar balas enemigas
  obstacles = createObstacles();  // crear obstáculos
  score = 0;                      // reset puntaje
  lives = PLAYER_MAX_LIVES;       // reset vidas
  spawnTimer = 0;                 // reset spawn timer
  kills = 0;                      // reset bajas
  level = 1;                      // empezar en nivel 1
  applyLevelSettings();           // aplicar parámetros del nivel 1
  levelMessageText = "NIVEL 1 — ¡Buen comienzo!"; // mensaje inicial
  levelMessageTimer = 2500;       // mostrar 2.5s
  lastTime = performance.now();   // marcar tiempo
  updateHUD();                    // actualizar HUD
}

/* Aplica ajustes dinámicos según el nivel actual */
function applyLevelSettings(){
  // Ajustes base por nivel
  if(level === 1){
    MAX_ENEMIES = MAX_ENEMIES_BASE;                 // máximo base
    ENEMY_SPAWN_INTERVAL = ENEMY_SPAWN_INTERVAL_BASE; // intervalo base
  } else if(level === 2){
    MAX_ENEMIES = Math.min(16, MAX_ENEMIES_BASE + 4); // aumentar máximo
    ENEMY_SPAWN_INTERVAL = Math.max(600, ENEMY_SPAWN_INTERVAL_BASE * 0.6); // spawnea más rápido
    // aumentar velocidad mínima de enemigos
    for(const e of enemies) e.speed *= 1.8; //modificado
  } else if(level === 3){
    MAX_ENEMIES = Math.min(20, MAX_ENEMIES_BASE );
    ENEMY_SPAWN_INTERVAL = Math.max(450, ENEMY_SPAWN_INTERVAL_BASE * 0.45);
    // en nivel 3, los enemigos disparan (se activa en el loop)
    for(const e of enemies) e.speed *= 1; 
  }
}

/* Sube de nivel cuando se alcanza un umbral de kills */
function checkLevelProgression(){
  // Si estamos en nivel 1 y llegamos a 50 kills => subir a nivel 2
  if(level === 1 && kills >= KILLS_TO_LEVEL2){
    level = 2;
    applyLevelSettings();
    levelMessageText = "¡Nivel 2! Los enemigos son más rápidos, MANTENTE FIRME";
    levelMessageTimer = 5000; // mostrar 3s
  }
  // Si estamos en nivel 2 y llegamos a 100 kills => subir a nivel 3
  if(level === 2 && kills >= KILLS_TO_LEVEL3){
    level = 3;
    applyLevelSettings();
    levelMessageText = "¡Nivel 3! ¡Ahora los enemigos contraatacan! NO PUEDES RENDIRTE";
    levelMessageTimer = 5500; // mostrar 3.5s
  }
}

/* ========= MANEJO DE ENTRADA (INPUT) ========= */
// Teclado: marca tecla como presionada o liberada
window.addEventListener('keydown', e => { keys[e.key] = true; if(e.key===' '){ e.preventDefault(); }});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Mouse: seguimiento de posición relativa al canvas
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouse.x = (e.clientX - rect.left) * scaleX;
  mouse.y = (e.clientY - rect.top) * scaleY;
});

// Click para disparar (también se puede usar espacio)
canvas.addEventListener('click', e => { playerShoot(); });

/* Botón de sonido */
muteBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  muteBtn.textContent = soundOn ? '🔊 Sonidos: On' : '🔈 Sonidos: Off';
});

/* Botón de inicio */
startBtn.addEventListener('click', async () => {
  
  // ocultar overlay / pantalla de inicio
  overlay.style.display = 'none';
  startScreen.style.display = 'none';
  statusHud.textContent = 'Estado: Jugando';
  resetGame();          // reiniciar juego
  running = true;       // marcar en ejecución
  lastTime = performance.now(); // registrar tiempo
  // iniciar loop principal
  requestAnimationFrame(loop);
});

/* ========= DISPARO DEL JUGADOR ========= */
// Función para disparar: crea una bala con velocidad en la dirección de la torreta
function playerShoot(){
  if(!running) return;
  if(player.reload>0) return; // si en cooldown, no dispara

  const r = player.size*0.6;
  // posición inicial de bala en la punta de la torreta
  const bx = player.x + Math.cos(player.turretAngle)*r;
  const by = player.y + Math.sin(player.turretAngle)*r;

  // añadir bala al array
  bullets.push({
    x: bx,
    y: by,
    vx: Math.cos(player.turretAngle)*BULLET_SPEED,
    vy: Math.sin(player.turretAngle)*BULLET_SPEED,
    life: 0,
    owner: 'player'
  });

  player.reload = player.reloadTime; // reset cooldown
  beep(900,0.04,0.02); // sonido de disparo (si está activado)
}

/* ========= BALAS ENEMIGAS (nivel 3) ========= */
// Agrega una bala enemiga disparada desde (ex,ey) hacia el jugador
function enemyFire(e){
  // calcular ángulo hacia el jugador
  const ang = Math.atan2(player.y - e.y, player.x - e.x);
  const speed = 2 + Math.random(); // velocidad de bala enemiga
  enemyBullets.push({
    x: e.x + Math.cos(ang) * e.size, // punto cercano al frente del enemigo
    y: e.y + Math.sin(ang) * e.size,
    vx: Math.cos(ang) * speed,
    vy: Math.sin(ang) * speed,
    life: 0
  });
  beep(520,0.04,0.02); // sonido de disparo enemiga
}

/* ========= COLISIONES Y UTILIDADES ========= */
// Ver si un punto está dentro de rectángulo (útil para colliders simples)
function rectIntersects(r, x,y){
  return (x>r.x && x<r.x+r.w && y>r.y && y<r.y+r.h);
}

// colisión círculo-rectángulo (no usada extensivamente pero útil)
function circleRectColl(c, rect){
  const cx = clamp(c.x, rect.x, rect.x+rect.w);
  const cy = clamp(c.y, rect.y, rect.y+rect.h);
  const dx = c.x - cx, dy = c.y - cy;
  return (dx*dx + dy*dy) < (c.r*c.r);
}

/* ========= ACTUALIZACIÓN (LOGICA) ========= */
// Actualiza la lógica del juego; dt es delta time en ms
function update(dt){
  if(!running) return;

  // primero procesar control del jugador: rotación y avance
  if(keys['a'] || keys['ArrowLeft']) player.angle -= player.turnSpeed * (dt/32);
  if(keys['d'] || keys['ArrowRight']) player.angle += player.turnSpeed * (dt/32);

  if(keys['s'] || keys['ArrowDown']) { player.speed += player.accel* (dt/8); }
  if(keys['w'] || keys['ArrowUp']) { player.speed -= player.accel* (dt/8); }

  // aplicar fricción y límites de velocidad
  player.speed *= player.friction;
  player.speed = clamp(player.speed, -3.5, 4.5);

  // mover jugador según su ángulo
  player.x += Math.cos(player.angle) * player.speed;
  player.y += Math.sin(player.angle) * player.speed;

  // mantener dentro de límites del canvas
  player.x = clamp(player.x, 12, canvas.width-12);
  player.y = clamp(player.y, 12, canvas.height-12);

  // apuntar la torreta hacia la posición del mouse
  player.turretAngle = angleTo(player, mouse);
  if(player.reload>0) player.reload--;

  /* ---------- BALAS DEL JUGADOR ---------- */
  for(let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    b.life++;

    // eliminar si sale de la pantalla o vive demasiado
    if(b.x<0 || b.x>canvas.width || b.y<0 || b.y>canvas.height || b.life>120){
      bullets.splice(i,1);
      continue;
    }

    // colisión con enemigos (hit detection)
    for(let j = enemies.length-1; j>=0; j--){
      const en = enemies[j];
      const dx = b.x - en.x, dy = b.y - en.y;
      if(dx*dx + dy*dy < (en.size*0.6)*(en.size*0.6)){
        // impacto: eliminar enemigo y bala, incrementar kills/score
        bullets.splice(i,1);
        enemies.splice(j,1);
        kills += 1;           // contabilizar kill para progresión de niveles
        score += 2;           // sumar puntos
        beep(1200,0.05,0.02); // sonido de impacto
        updateHUD();          // actualizar HUD
        checkLevelProgression(); // verificar si subir de nivel
        break;
      }
    }
  }

  /* ---------- BALAS ENEMIGAS (nivel 3) — mover y colisiones ---------- */
  if(level >= 3){
    for(let i = enemyBullets.length-1; i >= 0; i--){
      const b = enemyBullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life++;

      // eliminar si fuera de la pantalla
      if(b.x < -20 || b.x > canvas.width + 20 || b.y < -20 || b.y > canvas.height + 20 || b.life > 600){
        enemyBullets.splice(i,1);
        continue;
      }

      // colisión con jugador: distancia simple
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      if(dx*dx + dy*dy < (player.size*0.8)*(player.size*0.8)){
        // impacto al jugador
        enemyBullets.splice(i,1);
        lives--;
        beep(200,0.10,0.04);
        updateHUD();
        if(lives <= 0){
          gameOver(); // terminar juego si se quedan sin vidas
          return;
        }
      }
    }
  }

  /* ---------- ENEMIGOS: movimiento, límites y comportamiento por nivel ---------- */
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i];

    // AI rotación: girar gradualmente hacia el jugador
    const ang = angleTo(e, player);
    const diff = (ang - e.angle + Math.PI*3) % (Math.PI*2) - Math.PI;
    // limitar cuánto puede girar por frame (suavizado)
    e.angle += clamp(diff, -0.03, 0.03);

    // aplicar movimiento hacia adelante según su ángulo y velocidad
    e.x += Math.cos(e.angle) * e.speed;
    e.y += Math.sin(e.angle) * e.speed;

    // en Nivel 3: los enemigos pueden disparar (reload cuenta hacia abajo)
    if(level >= 3){
      e.reload--;
      if(e.reload <= 0){
        // disparar hacia el jugador y resetear reload con una variabilidad
        enemyFire(e);
        e.reload = 60 + Math.floor(Math.random()*120); // tiempo hasta siguiente disparo
      }
    }

    // colisión entre enemigo y jugador: contacto (ram)
    const dx = e.x - player.x, dy = e.y - player.y;
    const dist2 = dx*dx + dy*dy;
    const minDist = (e.size*0.6 + player.size*0.6);
    if(dist2 < minDist*minDist){
      // choque: enemigo se destruye y el jugador pierde vida
      enemies.splice(i,1);
      lives--;
      beep(220,0.08,0.04);
      updateHUD();
      if(lives<=0){ gameOver(); return; }
      continue;
    }

    // mantener dentro de límites del canvas (los empujamos dentro)
    if(e.x < 8) e.x = 8;
    if(e.x > canvas.width - 8) e.x = canvas.width - 8;
    if(e.y < 8) e.y = 8;
    if(e.y > canvas.height - 8) e.y = canvas.height - 8;
  }

  /* ---------- SPAWNING (aparecer enemigos) ---------- */
  spawnTimer += dt;
  // si el temporizador supera el intervalo y hay menos enemigos que el máximo, spawnear
  if(spawnTimer > ENEMY_SPAWN_INTERVAL && enemies.length < MAX_ENEMIES){
    spawnTimer = 0;
    spawnEnemy();
    updateHUD();
  }

  // incrementar puntaje por supervivencia/progresión levemente
  score += 0.001 * dt;

  // verificar progresión de niveles regularmente
  checkLevelProgression();
  updateHUD(); // actualizar HUD con valores recientes
}

/* ========= DIBUJADO (RENDER) ========= */
// Dibuja la cuadrícula de fondo para efecto retro
function drawGrid(){
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#00ff880c';
  ctx.lineWidth = 1;
  const step = 36;
  for(let x=0;x<canvas.width;x+=step){
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
  }
  for(let y=0;y<canvas.height;y+=step){
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }
  ctx.restore();
}

// Dibuja la nave del jugador (imagen o forma de respaldo)
function drawTank(t) {
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle); // rotar según la orientación de la nave

  if (tankImage.complete && tankImage.naturalWidth > 0) {
    // si la imagen está cargada, la dibujamos escalada
    const escala = t.size / 40;
    const ancho = tankImage.width * 0.08;
    const alto = tankImage.height * 0.08;
    ctx.drawImage(tankImage, -ancho / 2, -alto / 2, ancho, alto);
  } else {
    // forma de respaldo (un rectángulo simple)
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(-t.size * 0.5, -t.size * 0.4, t.size, t.size * 0.8);
    ctx.stroke();
  }

  ctx.restore();
}

// Dibuja un enemigo: rotado en la dirección que tiene e.angle
function drawEnemy(e){
  ctx.save();
  ctx.translate(e.x, e.y);

  // Ajustar rotación para que la imagen mire hacia "arriba" en coordenadas de imagen si es necesario
  ctx.rotate(e.angle - Math.PI/2);

  if (enemyImage.complete && enemyImage.naturalWidth > 0) {
    // dibujar la imagen del enemigo escalada según e.size
    const scale = e.size / 40;
    const w = enemyImage.width * 0.06;
    const h = enemyImage.height * 0.06;
    ctx.drawImage(enemyImage, -w / 2, -h / 2, w, h);
  } else {
    // forma wireframe por defecto (triángulo simple)
    ctx.strokeStyle = '#66ff88';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-e.size * 0.6, -e.size * 0.45);
    ctx.lineTo(e.size * 0.7, 0);
    ctx.lineTo(-e.size * 0.6, e.size * 0.45);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// Dibuja obstáculos rectangulares
function drawObstacles(){
  ctx.save();
  ctx.fillStyle = 'rgba(0, 221, 52, 0)';
  ctx.globalAlpha = 0.16;
  for(const r of obstacles){
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = '#33ff66';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

// Dibuja balas del jugador como trazos cortos
function drawBullets(){
  ctx.save();
  ctx.strokeStyle = '#ccffcc';
  ctx.lineWidth = 2;
  for(const b of bullets){
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx*0.30, b.y - b.vy*0.30);
    ctx.lineTo(b.x + b.vx*0.30, b.y + b.vy*0.30);
    ctx.stroke();
  }
  ctx.restore();
}

// Dibuja balas enemigas (nivel 3) como puntos naranjas
function drawEnemyBullets(){
  if(enemyBullets.length === 0) return;
  ctx.save();
  ctx.fillStyle = '#ffb86b';
  for(const b of enemyBullets){
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

// Dibuja overlay HUD (círculo alrededor del jugador)
function drawHUDOverlay(){
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.arc(0,0, player.size*2, 0, Math.PI*2);
  ctx.strokeStyle = '#66ff88';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

// Dibuja mira tipo "+" en la posición del mouse
function drawCrosshair(){
  ctx.save();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1.4;
  const size = 20;
  ctx.beginPath();
  ctx.moveTo(mouse.x - size, mouse.y);
  ctx.lineTo(mouse.x + size, mouse.y);
  ctx.moveTo(mouse.x, mouse.y - size);
  ctx.lineTo(mouse.x, mouse.y + size);
  ctx.stroke();
  ctx.restore();
}

// Dibuja texto de mensaje de nivel en pantalla (si timer > 0)
function drawLevelMessage(dt){
  if(levelMessageTimer > 0){
    // restar delta y mostrar con opacidad variable
    levelMessageTimer -= dt;
    const alpha = Math.max(0, Math.min(1, levelMessageTimer / 3000));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#00ff66';
    ctx.font = '28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(levelMessageText, canvas.width/2, 60);
    ctx.restore();
  }
}

// OBLIGA AL NAVEGADOR QUE REPRODUSCA EL VIDEO AUTOMATICAMENTE
const Video = document.getElementById('bgVideo')
  Video.muted = true;    // Asegura que esté silenciado
  Video.play();

   // ====================================
// POSICION DEL RADAR
// ====================================
  const RADAR_SIZE = 150; // más grande o más pequeño
const RADAR_X = CANVAS_W - RADAR_SIZE - 20; // separa más o menos del borde derecho
const RADAR_Y = CANVAS_H - RADAR_SIZE - 20; // más arriba o más abajo

  
  // ====================================
// FUNCIÓN PARA DIBUJAR EL RADAR BÁSICO
// ====================================
function drawRadar(ctx, player, enemies, CANVAS_W, CANVAS_H) {
  const RADAR_SIZE = 150; // Tamaño del radar
  const RADAR_X = CANVAS_W - RADAR_SIZE - 20; // Posición horizontal (esquina inferior derecha)
  const RADAR_Y = CANVAS_H - RADAR_SIZE - 20; // Posición vertical
  const radarScale = 0.1; // Escala de reducción del mapa

  // Guardar el estado del contexto antes de dibujar
  ctx.save();

  // === Fondo del radar ===
  ctx.beginPath();
  ctx.arc(
    RADAR_X + RADAR_SIZE / 2,
    RADAR_Y + RADAR_SIZE / 2,
    RADAR_SIZE / 2,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Fondo transparente oscuro
  ctx.fill();
  ctx.strokeStyle = "lime"; // Borde verde tipo radar
  ctx.lineWidth = 2;
  ctx.stroke();

  // === Jugador (centro del radar) ===
  const radarCenterX = RADAR_X + RADAR_SIZE / 2;
  const radarCenterY = RADAR_Y + RADAR_SIZE / 2;
  ctx.fillStyle = "cyan";
  ctx.beginPath();
  ctx.arc(radarCenterX, radarCenterY, 4, 0, Math.PI * 2);
  ctx.fill();

  // === Enemigos ===
  enemies.forEach(e => {
    const dx = (e.x - player.x) * radarScale;
    const dy = (e.y - player.y) * radarScale;

    // Solo dibujar si están dentro del rango visible del radar
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < RADAR_SIZE / 2) {
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(radarCenterX + dx, radarCenterY + dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Restaurar el contexto
  ctx.restore();
}

const bgImage = new Image();
bgImage.src = "img/avion1.png";  

/* ========= RENDER PRINCIPAL ========= */
// Función principal que dibuja (renderiza) todo en pantalla, recibe el tiempo transcurrido "dt"
function render(dt){ 

  // --- DIBUJAR FONDO DE VIDEO ---
  if(bgVideo && bgVideo.readyState >= 2){
      // Verifica si existe un elemento de video (bgVideo) y si está listo para reproducirse (readyState >= 2 significa que ya tiene datos suficientes para mostrar un cuadro)
    ctx.drawImage(bgVideo, 0, 0, CANVAS_W, CANVAS_H);  // Dibuja el video en todo el canvas, ajustándolo a su ancho y alto (CANVAS_W y CANVAS_H)
  } 
  else if(bgImage.complete && bgImage.naturalWidth > 0){ // Si no hay video, pero hay una imagen de fondo cargada correctamente (complete = cargada, naturalWidth > 0 = tiene tamaño válido)
     ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H); // Dibuja la imagen de fondo para cubrir todo el lienzo
  } 
  else {  
    ctx.fillStyle = '#000';  // Si no hay video ni imagen disponibles (por ejemplo, aún no cargaron)
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); // Rellena todo el canvas con un rectángulo negro, creando un fondo vacío predeterminado
  }

  drawGrid();  // grid retro
  drawObstacles();  // obstáculos y elementos
  drawBullets();   // balas del jugador
  for(const e of enemies) drawEnemy(e);  // enemigos
  if(level >= 3) drawEnemyBullets();   // balas enemigas (nivel 3)
  drawTank(player);  // jugador 
  drawHUDOverlay();   // overlay HUD
  drawCrosshair();  // mira  
  drawLevelMessage(dt);   // mensaje de nivel (si corresponde)
  drawRadar(ctx, player, enemies, CANVAS_W, CANVAS_H);  // === DIBUJAR RADAR ===
}

/* ========= HUD / ESTADO ========= */
// Actualiza los elementos HTML del HUD (puntos, vidas, enemigos, nivel)
function updateHUD(){
  if(scoreHud) scoreHud.textContent = 'Puntos: ' + Math.floor(score);
  if(livesHud) livesHud.textContent = 'Vidas: ' + lives;
  if(waveHud) waveHud.textContent = 'Enemigos: ' + enemies.length;
  if(statusHud) statusHud.textContent = `Estado: Jugando • Nivel: ${level} • Muertes Enemigas: ${kills}`;
}

/* ========= GAME OVER ========= */
function gameOver(){
  running = false;
  statusHud.textContent = 'Estado: Game Over';
  // crear mensaje en overlay similar al tuyo
  const card = document.createElement('div');
  card.className = 'card';
  card.style.pointerEvents='auto';
  card.innerHTML = `<h2>💀 Perdiste</h2><p class="small">Puntuación: ${Math.floor(score)}</p><p class="small">Muertes Enemigas: ${kills}</p>`;
  const restart = document.createElement('button');
  restart.textContent = 'Reiniciar';
  
  // al reiniciar, ocultar card y reiniciar juego
  restart.onclick = ()=> {
    overlay.removeChild(card);
    overlay.style.display = 'none';

    
    resetGame();
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  };
  card.appendChild(restart);

  // mostrar selección/registro de avión si lo tienes (mantener compatibilidad)
  overlay.style.display='flex';
  overlay.appendChild(card);
  beep(120,0.2,0.04);
}

/* ========= BUCLE PRINCIPAL ========= */
function loop(ts){
  // calcular delta time (ms)
  const dt = ts - lastTime;
  lastTime = ts;

  // si el juego está en ejecución, actualizar y renderizar
  if(running){
    update(dt);      // lógica
    render(dt);      // dibujo
    requestAnimationFrame(loop); // siguiente frame
  } else {
    // si no está corriendo, aún dibujar una frame final para ver el estado
    render(dt);
  }
}

/* ========= INICIO AUTOMÁTICO (mostrar primer frame) ========= */
// inicializar juego y hacer un render inicial sin arrancar la lógica
resetGame();
render(0);

/* Soporte para disparar con barra espaciadora */
window.addEventListener('keydown', (e)=> {
  if(e.key === ' '){
    playerShoot();
  }
});

/* Permitir debug: funciones expuestas para consola */
window._spawnEnemy = spawnEnemy;
window._reset = resetGame;
window._levelUp = () => { level = Math.min(3, level+1); applyLevelSettings(); levelMessageText = `Nivel ${level}`; levelMessageTimer = 2000; };
