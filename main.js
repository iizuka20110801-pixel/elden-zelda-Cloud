// =============================================================
//  main.js
//  『刃ノ輪廻 -ETERNAL TRIAL-』 Phase1 コア戦闘エンジン
//  -------------------------------------------------------------
//  data.js から武器・ボスのデータとモデル生成関数を読み込み、
//  ここではゲームロジック(入力・ステートマシン・当たり判定・UI)のみを扱う。
// =============================================================

import * as THREE from 'three';
import { WEAPONS, BOSSES, getWeapon, getBoss, flatMat, createPlayerModel } from './data.js';

/* =============================================================
 * 0. 定数
 * ============================================================= */
const ARENA_RADIUS = 13.5;
const PLAYER_MAX_HP = 120;
const PLAYER_MAX_STAMINA = 100;
const STAMINA_REGEN = 20;
const STAMINA_REGEN_DELAY = 0.45;
const DODGE_TOTAL = 0.46;
const DODGE_MOVE_PORTION = 0.6;
const DODGE_IFRAME_START = 0.02;
const DODGE_IFRAME_END = 0.38;
const DODGE_DIST_SIDE = 3.3;
const DODGE_DIST_BACK = 2.9;
const JUST_DODGE_WINDOW = 0.22;
const GUARD_JUST_WINDOW = 0.28;
const GUARD_STAMINA_COST = 15;
const GUARD_BREAK_STUN = 1.5;
const HITSTUN_TIME = 0.32;
const BOSS_STAGGER_TIME = 2.4;
const CHARGE_THRESHOLD = 0.32;
const CAM_DIST = 6.4;
const CAM_HEIGHT = 3.3;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = THREE.MathUtils.lerp;
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInCubic = (t) => Math.pow(clamp(t, 0, 1), 3);
const now = () => sim.time;

/* =============================================================
 * 1. グローバル状態
 * ============================================================= */
const dom = {};
let renderer, scene, camera;
const clock = new THREE.Clock();
const sim = { time: 0, timeScale: 1, hitstopTimer: 0 };

const input = {
  move: new THREE.Vector2(0, 0),
  keyMove: new THREE.Vector2(0, 0),
};

const run = {
  screen: 'title',
  selectedWeaponId: 'broadsword',
  selectedBossId: 'knight',
  player: null,
  boss: null,
  projectiles: [],
  vfx: [],
  deaths: 0,
  startedAt: 0,
};

/* =============================================================
 * 2. DOM取得 & 画面遷移
 * ============================================================= */
function cacheDom() {
  const ids = [
    'app', 'screen-title', 'screen-weapon', 'screen-boss', 'screen-battle', 'screen-result',
    'btnStart', 'weaponList', 'btnToBoss', 'bossList', 'btnFight', 'btnBackToWeapon',
    'hpFill', 'staminaFill', 'bossNameLabel', 'bossHpFill', 'bossPoiseFill',
    'phaseBanner', 'msgFeedback', 'introCard', 'introName', 'introFlavor', 'deathCounter',
    'joystickZone', 'joystickBase', 'joystickThumb',
    'btnAttack', 'btnSkill', 'btnDodge', 'btnGuard', 'skillLabel', 'btnQuit',
    'resultTitle', 'resultStats', 'btnRetry', 'btnMenu',
  ];
  ids.forEach((id) => { dom[id] = document.getElementById(id); });
}

function showScreen(name) {
  run.screen = name;
  ['title', 'weapon', 'boss', 'battle', 'result'].forEach((s) => {
    dom[`screen-${s}`].classList.toggle('active', s === name);
  });
}

/* =============================================================
 * 3. メニュー描画 (データ駆動: WEAPONS/BOSSESを追加するだけで反映される)
 * ============================================================= */
function renderWeaponSelect() {
  dom.weaponList.innerHTML = '';
  WEAPONS.forEach((w) => {
    const card = document.createElement('button');
    card.className = 'card' + (w.id === run.selectedWeaponId ? ' selected' : '');
    const swatch = `<span class="swatch" style="background:#${w.color.toString(16).padStart(6, '0')}"></span>`;
    card.innerHTML = `
      <div class="cardHead">${swatch}<div><div class="cardTitle">${w.name}</div><div class="cardKana">${w.kana}</div></div></div>
      <p class="cardDesc">${w.description}</p>
      <div class="statRow"><span>威力</span><span>${'●'.repeat(Math.round(w.stats.heavyDamage / 6))}</span></div>
      <div class="statRow"><span>速さ</span><span>${'●'.repeat(Math.round(6 - w.stats.swingTime * 10))}</span></div>
      <div class="statRow"><span>固有技</span><span>${w.skill.name}</span></div>`;
    card.addEventListener('click', () => {
      run.selectedWeaponId = w.id;
      renderWeaponSelect();
    });
    dom.weaponList.appendChild(card);
  });
}

function renderBossSelect() {
  dom.bossList.innerHTML = '';
  BOSSES.forEach((b) => {
    const card = document.createElement('button');
    card.className = 'card' + (b.id === run.selectedBossId ? ' selected' : '');
    const c = Object.values(b.colors)[0];
    const swatch = `<span class="swatch" style="background:#${c.toString(16).padStart(6, '0')}"></span>`;
    card.innerHTML = `
      <div class="cardHead">${swatch}<div><div class="cardTitle">${b.name}</div><div class="cardKana">${b.kana}</div></div></div>
      <p class="cardDesc">${b.flavor}</p>
      <div class="statRow"><span>体力</span><span>${b.maxHP}</span></div>`;
    card.addEventListener('click', () => {
      run.selectedBossId = b.id;
      renderBossSelect();
    });
    dom.bossList.appendChild(card);
  });
}

/* =============================================================
 * 4. Three.js 初期化・環境構築
 * ============================================================= */
function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  dom.app.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  const sky = 0xdfe9df;
  const haze = 0xe9ddbd;
  scene.background = new THREE.Color(haze);
  scene.fog = new THREE.Fog(haze, 16, 36);

  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, CAM_HEIGHT, CAM_DIST);

  const hemi = new THREE.HemisphereLight(sky, 0x6b6a52, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
  sun.position.set(6, 10, 4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb3c9, 0.35);
  fill.position.set(-6, 4, -5);
  scene.add(fill);

  buildSkyDome(sky, haze);
  buildArena();

  window.addEventListener('resize', onResize);
}

function buildSkyDome(topColor, bottomColor) {
  const geo = new THREE.SphereGeometry(80, 16, 12);
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = clamp((pos.getY(i) / 80 + 1) * 0.5, 0, 1);
    c.copy(bottom).lerp(top, Math.pow(y, 0.7));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  scene.add(new THREE.Mesh(geo, mat));
}

function buildArena() {
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS * 1.05, 0.5, 28),
    flatMat(0x9fae7f),
  );
  ground.position.y = -0.25;
  scene.add(ground);

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_RADIUS * 1.9, ARENA_RADIUS * 2.4, 0.3, 24),
    flatMat(0xcdbf94),
  );
  outer.position.y = -0.4;
  scene.add(outer);

  const rockMat = flatMat(0x7c7461);
  const rockCount = 16;
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2 + Math.random() * 0.2;
    const r = ARENA_RADIUS - 0.4 + Math.random() * 0.6;
    const rock = new THREE.Mesh(new THREE.OctahedronGeometry(0.35 + Math.random() * 0.4, 0), rockMat);
    rock.position.set(Math.cos(a) * r, -0.15 + Math.random() * 0.2, Math.sin(a) * r);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    scene.add(rock);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =============================================================
 * 5. 入力 (バーチャルスティック + アクションボタン + キーボード補助)
 * ============================================================= */
function setupControls() {
  let activePointerId = null;
  const base = dom.joystickBase;
  const thumb = dom.joystickThumb;
  const maxR = 46;

  function setVec(dx, dy) {
    const len = Math.hypot(dx, dy);
    const clampedLen = Math.min(len, maxR);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;
    const mag = clampedLen / maxR;
    input.move.set(nx * mag, -ny * mag); // 画面上方向を+yに変換
    thumb.style.transform = `translate(${nx * clampedLen}px, ${ny * clampedLen}px)`;
  }
  function reset() {
    input.move.set(0, 0);
    thumb.style.transform = 'translate(0px, 0px)';
  }

  dom.joystickZone.addEventListener('pointerdown', (e) => {
    activePointerId = e.pointerId;
    dom.joystickZone.setPointerCapture(e.pointerId);
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setVec(e.clientX - cx, e.clientY - cy);
  });
  dom.joystickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointerId) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setVec(e.clientX - cx, e.clientY - cy);
  });
  function release(e) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    reset();
  }
  dom.joystickZone.addEventListener('pointerup', release);
  dom.joystickZone.addEventListener('pointercancel', release);

  // アクションボタン
  let chargeStart = -1;
  let chargeFired = false;
  dom.btnAttack.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    chargeStart = now();
    chargeFired = false;
    dom.btnAttack.classList.add('pressed');
  });
  dom.btnAttack.addEventListener('pointerup', () => {
    dom.btnAttack.classList.remove('pressed');
    if (chargeStart < 0) return;
    if (!chargeFired) run.player?.startAttack('light');
    chargeStart = -1;
  });
  dom.btnAttack.addEventListener('pointerleave', () => dom.btnAttack.classList.remove('pressed'));

  dom.btnSkill.addEventListener('pointerdown', (e) => { e.preventDefault(); run.player?.startSkill(); });
  dom.btnDodge.addEventListener('pointerdown', (e) => { e.preventDefault(); run.player?.startDodge(); });
  dom.btnGuard.addEventListener('pointerdown', (e) => { e.preventDefault(); run.player?.startGuard(); });
  dom.btnGuard.addEventListener('pointerup', () => run.player?.releaseGuard());
  dom.btnGuard.addEventListener('pointerleave', () => run.player?.releaseGuard());

  // チャージ監視(毎フレーム update 内でも見るが、ここでは保持のみ)
  setupControls._poll = () => {
    if (chargeStart >= 0 && !chargeFired && now() - chargeStart >= CHARGE_THRESHOLD) {
      chargeFired = true;
      run.player?.startAttack('heavy');
    }
  };

  // キーボード(デスクトップ確認用の補助入力)
  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') run.player?.startDodge();
    if (e.code === 'KeyJ') run.player?.startAttack('light');
    if (e.code === 'KeyK') run.player?.startSkill();
    if (e.code === 'KeyL' || e.code === 'ShiftLeft') run.player?.startGuard();
    updateKeyVec(keys);
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'KeyL' || e.code === 'ShiftLeft') run.player?.releaseGuard();
    updateKeyVec(keys);
  });
  function updateKeyVec(k) {
    let x = 0, y = 0;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    input.keyMove.set(x, y);
  }

  dom.btnQuit.addEventListener('click', () => endBattle(false, true));
}

function getMoveVec() {
  const v = new THREE.Vector2(input.move.x + input.keyMove.x, input.move.y + input.keyMove.y);
  if (v.length() > 1) v.normalize();
  return v;
}

/* =============================================================
 * 6. フィードバック演出 (小さなUI/VFXヘルパー)
 * ============================================================= */
const FEEDBACK_TEXT = {
  just_dodge: 'JUST!見切った!', dodge: '回避', graze: 'かすった', parry: '弾いた!!',
  reflect: '跳ね返した!!', block: 'ガード', block_partial: 'ガード(大)', guardbreak: 'ガード崩れ!',
  hit: '被弾', miss: '',
};
let feedbackTimer = 0;
function showDefenseFeedback(key) {
  const text = FEEDBACK_TEXT[key];
  if (!text) return;
  dom.msgFeedback.textContent = text;
  dom.msgFeedback.className = 'feedback show ' + key;
  feedbackTimer = 0.9;
}

function triggerHitstop(scale, duration) {
  sim.timeScale = scale;
  sim.hitstopTimer = duration;
}

function spawnFlash(position, color) {
  const geo = new THREE.RingGeometry(0.05, 0.5, 12);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y = 0.1;
  scene.add(ring);
  run.vfx.push({ mesh: ring, t: 0, life: 0.4, kind: 'flash' });
}

function spawnGroundRing(position, radius, color) {
  const geo = new THREE.RingGeometry(radius * 0.88, radius, 24);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.08, position.z);
  ring.scale.set(0.05, 0.05, 1);
  scene.add(ring);
  run.vfx.push({ mesh: ring, t: 0, life: 999, kind: 'ring_grow', data: { radius } });
  return ring;
}

function updateVfx(dt) {
  for (let i = run.vfx.length - 1; i >= 0; i--) {
    const v = run.vfx[i];
    v.t += dt;
    if (v.kind === 'flash') {
      const p = v.t / v.life;
      v.mesh.scale.setScalar(1 + p * 3);
      v.mesh.material.opacity = 0.9 * (1 - p);
      if (p >= 1) { scene.remove(v.mesh); run.vfx.splice(i, 1); }
    }
    // 'ring_grow'(警告ゾーン) / 'ring_expand'(衝撃波) は updateVfxRings() で処理する
  }
}

/* =============================================================
 * 7. プレイヤー
 * ============================================================= */
class Player {
  constructor(weapon) {
    this.weapon = weapon;
    this.model = null;
    this.position = new THREE.Vector3(0, 0, 4.5);
    this.facing = 0;
    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.stamina = PLAYER_MAX_STAMINA;
    this.state = 'idle';
    this.timer = 0;
    this.attackKind = null;
    this.hitDone = false;
    this.invulnerable = false;
    this.dodgeType = null;
    this.dodgeIsJust = false;
    this.dodgeStart = new THREE.Vector3();
    this.dodgeOffset = new THREE.Vector3();
    this.guardPressTime = -99;
    this.justDodgeBonusUntil = -1;
    this.skillCooldown = 0;
    this.noRegenTimer = 0;
    this.thrown = null; // トライデント投擲中のプロジェクタイル参照
  }

  spawnModel(createPlayerModelFn) {
    this.model = createPlayerModelFn(this.weapon);
    this.model.position.copy(this.position);
    scene.add(this.model);
  }

  get isLocked() {
    return ['light', 'heavy', 'dodge', 'guardbreak', 'hitstun', 'skill', 'dead'].includes(this.state);
  }

  takeDamage(amount) {
    if (this.state === 'dead') return;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.noRegenTimer = STAMINA_REGEN_DELAY;
    if (this.hp <= 0) {
      this.die();
    } else if (this.state !== 'guardbreak') {
      this.state = 'hitstun';
      this.timer = 0;
    }
    updateHud();
  }

  enterGuardBreak() {
    this.state = 'guardbreak';
    this.timer = 0;
  }

  die() {
    this.state = 'dead';
    this.timer = 0;
    run.deaths += 1;
    setTimeout(() => endBattle(false), 1200);
  }

  startAttack(kind) {
    if (this.state !== 'idle' && this.state !== 'move') return;
    const s = this.weapon.stats;
    const cost = kind === 'heavy' ? s.staminaHeavy : s.staminaLight;
    if (this.stamina < cost * 0.3) return;
    this.stamina = clamp(this.stamina - cost, 0, PLAYER_MAX_STAMINA);
    this.noRegenTimer = STAMINA_REGEN_DELAY;
    // トライデントは間合いが遠いと自動で投擲
    if (this.weapon.ranged && run.boss && this.position.distanceTo(run.boss.position) > this.weapon.throwRange) {
      this.throwWeapon(kind === 'heavy' ? s.heavyDamage : s.lightDamage);
      return;
    }
    this.state = kind;
    this.attackKind = kind;
    this.timer = 0;
    this.hitDone = false;
  }

  throwWeapon(damage) {
    this.state = 'light';
    this.attackKind = 'light'; // 投擲は常に素早いモーションとして扱う
    this.timer = 0;
    this.hitDone = true; // 近接判定は使わない
    const origin = this.model.userData.weaponMesh.getWorldPosition(new THREE.Vector3());
    spawnProjectile({
      position: origin,
      target: run.boss.position.clone(),
      speed: 15,
      radius: 0.3,
      color: this.weapon.color,
      owner: 'player',
      damage,
      onHit: () => {},
    });
  }

  startSkill() {
    if (this.state !== 'idle' && this.state !== 'move') return;
    if (this.skillCooldown > 0) return;
    const sk = this.weapon.skill;
    if (this.stamina < sk.staminaCost) return;
    this.stamina -= sk.staminaCost;
    this.noRegenTimer = STAMINA_REGEN_DELAY;
    this.skillCooldown = sk.cooldown;
    this.state = 'skill';
    this.timer = 0;
    this.hitDone = false;
  }

  startDodge() {
    if (this.state !== 'idle' && this.state !== 'move') return;
    const cost = 16;
    if (this.stamina < cost) return;
    this.stamina -= cost;
    this.noRegenTimer = STAMINA_REGEN_DELAY;
    const mv = getMoveVec();
    let type, dist, dirVec;
    const boss = run.boss;
    const toBoss = boss ? boss.position.clone().sub(this.position).setY(0).normalize() : new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(-toBoss.z, 0, toBoss.x);
    if (mv.lengthSq() < 0.08) {
      type = 'back'; dirVec = toBoss.clone().multiplyScalar(-1); dist = DODGE_DIST_BACK;
    } else if (Math.abs(mv.x) >= Math.abs(mv.y) * 0.75) {
      type = 'side'; dirVec = right.clone().multiplyScalar(Math.sign(mv.x) || 1); dist = DODGE_DIST_SIDE;
    } else if (mv.y < 0) {
      type = 'back'; dirVec = toBoss.clone().multiplyScalar(-1); dist = DODGE_DIST_BACK;
    } else {
      type = 'side'; dirVec = right.clone().multiplyScalar(mv.x >= 0 ? 1 : -1); dist = DODGE_DIST_SIDE;
    }
    this.state = 'dodge';
    this.timer = 0;
    this.dodgeType = type;
    this.dodgeIsJust = false;
    this.dodgeStart.copy(this.position);
    this.dodgeOffset.copy(dirVec).multiplyScalar(dist);
    this.invulnerable = false;

    // 差し迫る攻撃に対する「ジャスト回避」判定
    const boss2 = run.boss;
    if (boss2 && boss2.state === 'attacking' && boss2.currentAttack) {
      const atk = boss2.currentAttack;
      let timeToActive = Infinity;
      if (boss2.attackPhase === 'telegraph') timeToActive = (atk.telegraph - boss2.phaseTimer) + atk.delay;
      else if (boss2.attackPhase === 'delay') timeToActive = atk.delay - boss2.phaseTimer;
      if (timeToActive <= JUST_DODGE_WINDOW && timeToActive >= -0.05 && type === atk.correctDodge) {
        this.dodgeIsJust = true;
      }
    }
  }

  startGuard() {
    if (this.state !== 'idle' && this.state !== 'move') return;
    if (this.stamina <= 0) return;
    this.state = 'guard';
    this.guardPressTime = now();
  }

  releaseGuard() {
    if (this.state === 'guard') {
      this.state = 'idle';
      this.timer = 0;
    }
  }

  applyHitToBoss(baseDamage, basePoise) {
    const boss = run.boss;
    if (!boss) return;
    let mult = 1;
    if (now() < this.justDodgeBonusUntil) { mult *= this.weapon.stats.justDodgeCritMult; this.justDodgeBonusUntil = -1; }
    if (boss.state === 'recovery' || boss.attackPhase === 'recovery') mult *= 1.25;
    if (boss.state === 'staggered') mult *= 1.5;
    boss.takeDamage(baseDamage * mult);
    boss.poise -= basePoise * mult;
    boss.checkStagger();
  }

  performMeleeHit(damage, poise, reachMult = 1) {
    const boss = run.boss;
    if (!boss || boss.state === 'dead') return;
    const dist = this.position.distanceTo(boss.position);
    if (dist <= this.weapon.stats.reach * reachMult + 0.9) {
      this.applyHitToBoss(damage, poise);
      spawnFlash(boss.position.clone().setY(1.1), 0xffffff);
    }
  }

  update(dt) {
    const s = this.weapon.stats;
    this.timer += dt;

    if (this.skillCooldown > 0) this.skillCooldown = Math.max(0, this.skillCooldown - dt);

    // スタミナ回復
    if (this.noRegenTimer > 0) this.noRegenTimer -= dt;
    else if (this.state !== 'guard') this.stamina = clamp(this.stamina + STAMINA_REGEN * dt, 0, PLAYER_MAX_STAMINA);

    // 常にボスの方を向く(ロックオン)
    const boss = run.boss;
    if (boss) {
      const dx = boss.position.x - this.position.x;
      const dz = boss.position.z - this.position.z;
      this.facing = Math.atan2(dx, dz);
    }

    switch (this.state) {
      case 'idle':
      case 'move': {
        const mv = getMoveVec();
        if (mv.lengthSq() > 0.001 && boss) {
          const toBoss = boss.position.clone().sub(this.position).setY(0).normalize();
          const right = new THREE.Vector3(-toBoss.z, 0, toBoss.x);
          const speed = 4.4;
          this.position.addScaledVector(toBoss, mv.y * speed * dt);
          this.position.addScaledVector(right, mv.x * speed * dt);
          this.state = 'move';
          this._bob = (this._bob || 0) + dt * 9;
        } else {
          this.state = 'idle';
          this._bob = (this._bob || 0) * 0.9;
        }
        this.clampArena();
        break;
      }
      case 'light':
      case 'heavy': {
        const dmg = this.attackKind === 'heavy' ? s.heavyDamage : s.lightDamage;
        const poise = this.attackKind === 'heavy' ? s.heavyPoise : s.lightPoise;
        const swing = this.attackKind === 'heavy' ? s.swingTime * 1.6 : s.swingTime;
        const recover = this.attackKind === 'heavy' ? s.recoverTime * 1.4 : s.recoverTime;
        const peak = swing * 0.55;
        if (!this.hitDone && this.timer >= peak) { this.performMeleeHit(dmg, poise); this.hitDone = true; }
        if (this.timer >= swing + recover) { this.state = 'idle'; this.timer = 0; }
        break;
      }
      case 'skill':
        this.updateSkill(dt);
        break;
      case 'dodge': {
        const p = clamp(this.timer / (DODGE_TOTAL * DODGE_MOVE_PORTION), 0, 1);
        this.position.copy(this.dodgeStart).addScaledVector(this.dodgeOffset, easeOutCubic(p));
        this.invulnerable = this.timer >= DODGE_IFRAME_START && this.timer <= DODGE_IFRAME_END;
        this.clampArena();
        if (this.timer >= DODGE_TOTAL) {
          this.state = 'idle'; this.timer = 0; this.invulnerable = false;
          if (this.dodgeIsJust) { triggerHitstop(0.18, 0.2); this.justDodgeBonusUntil = now() + 2.6; showDefenseFeedback('just_dodge'); }
        }
        break;
      }
      case 'guard':
        break; // 静止してガード
      case 'guardbreak':
        if (this.timer >= GUARD_BREAK_STUN) { this.state = 'idle'; this.timer = 0; }
        break;
      case 'hitstun':
        if (this.timer >= HITSTUN_TIME) { this.state = 'idle'; this.timer = 0; }
        break;
      case 'dead':
        break;
    }

    if (this.model) {
      this.model.position.set(this.position.x, Math.sin((this._bob || 0)) * 0.03, this.position.z);
      this.model.rotation.y = this.facing;
      this.animateModel();
    }
  }

  updateSkill(dt) {
    const sk = this.weapon.skill;
    if (sk.execute === 'spin') {
      if (!this.hitDone && this.timer >= 0.22) { this.performMeleeHit(sk.damage, sk.poise, 1.1); this.hitDone = true; }
      if (this.timer >= 0.55) { this.state = 'idle'; this.timer = 0; }
    } else if (sk.execute === 'charge3') {
      const hitTimes = [0.18, 0.4, 0.64];
      this._skillHitIdx = this._skillHitIdx || 0;
      if (this._skillHitIdx < hitTimes.length && this.timer >= hitTimes[this._skillHitIdx]) {
        this.performMeleeHit(sk.damage * (this._skillHitIdx === 2 ? 1.6 : 1), sk.poise * 0.7);
        this._skillHitIdx++;
      }
      if (this.timer >= 0.95) { this.state = 'idle'; this.timer = 0; this._skillHitIdx = 0; }
    } else if (sk.execute === 'throw_bolt') {
      if (!this.hitDone && this.timer >= 0.18) {
        this.hitDone = true;
        const boss = run.boss;
        if (boss) {
          const origin = this.model.userData.weaponMesh.getWorldPosition(new THREE.Vector3());
          const targetPos = boss.position.clone();
          spawnProjectile({
            position: origin, target: targetPos, speed: 17, radius: 0.28, color: 0x9ef5ff,
            owner: 'player', damage: sk.damage,
            onHit: (hitBoss) => {
              spawnFlash(targetPos.clone().setY(0.1), 0xfff27a);
              if (hitBoss) { hitBoss.poise -= sk.poise; hitBoss.takeDamage(sk.strikeDamage); hitBoss.checkStagger(); }
            },
          });
        }
      }
      if (this.timer >= 0.5) { this.state = 'idle'; this.timer = 0; }
    }
  }

  animateModel() {
    const ud = this.model.userData;
    const wp = ud.weaponPivot;
    const bp = ud.bodyPivot;
    if (!wp) return;
    const s = this.weapon.stats;
    if (this.state === 'light' || this.state === 'heavy') {
      const heavy = this.state === 'heavy';
      const swing = heavy ? s.swingTime * 1.6 : s.swingTime;
      const recover = heavy ? s.recoverTime * 1.4 : s.recoverTime;
      const total = swing + recover;
      const p = clamp(this.timer / swing, 0, 1);
      const from = heavy ? -1.9 : 0.5;
      const to = heavy ? 1.3 : -1.7;
      if (this.timer < swing) wp.rotation.x = lerp(from, to, easeInCubic(p));
      else wp.rotation.x = lerp(to, 0.4, clamp((this.timer - swing) / recover, 0, 1));
    } else if (this.state === 'skill') {
      if (this.weapon.skill.execute === 'spin') {
        bp.rotation.y = lerp(0, Math.PI * 2, clamp(this.timer / 0.5, 0, 1));
        wp.rotation.x = -0.6;
      } else if (this.weapon.skill.execute === 'charge3') {
        wp.rotation.x = Math.sin(this.timer * 14) * 0.5 - 0.6;
      } else {
        wp.rotation.x = lerp(0.4, -1.6, easeOutCubic(clamp(this.timer / 0.2, 0, 1)));
      }
    } else if (this.state === 'dodge') {
      bp.rotation.z = (this.dodgeType === 'side' ? 0.3 : 0) * Math.sin(Math.min(this.timer * 6, Math.PI));
      bp.position.y = -Math.sin(clamp(this.timer / DODGE_TOTAL, 0, 1) * Math.PI) * 0.12;
      wp.rotation.x = lerp(wp.rotation.x, 0.4, 0.3);
    } else if (this.state === 'guard') {
      wp.rotation.x = lerp(wp.rotation.x, -0.2, 0.3);
      ud.offPivot && (ud.offPivot.rotation.x = lerp(ud.offPivot.rotation.x, -0.5, 0.3));
      bp.rotation.z = lerp(bp.rotation.z, 0, 0.3);
      bp.position.y = lerp(bp.position.y, 0, 0.3);
    } else {
      wp.rotation.x = lerp(wp.rotation.x, 0.4, 0.15);
      bp.rotation.z = lerp(bp.rotation.z, 0, 0.2);
      bp.position.y = lerp(bp.position.y, 0, 0.2);
      ud.offPivot && (ud.offPivot.rotation.x = lerp(ud.offPivot.rotation.x, 0, 0.2));
    }
  }

  clampArena() {
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > ARENA_RADIUS - 0.6) {
      const k = (ARENA_RADIUS - 0.6) / r;
      this.position.x *= k; this.position.z *= k;
    }
  }
}

/* =============================================================
 * 8. ボス (共通ステートマシン: idle -> attacking(telegraph/delay/active/recovery) -> staggered / phase2)
 * ============================================================= */
class Boss {
  constructor(data) {
    this.data = data;
    this.model = null;
    this.position = new THREE.Vector3(0, 0, -4.5);
    this.facing = Math.PI;
    this.hp = data.maxHP;
    this.maxHP = data.maxHP;
    this.poise = data.maxPoise;
    this.maxPoise = data.maxPoise;
    this.moveSpeed = data.moveSpeed; // data.jsの共有オブジェクトは書き換えず、インスタンス側で保持する
    this.phase = 1;
    this.state = 'intro';
    this.attackPhase = null;
    this.phaseTimer = 0;
    this.idleTimer = 0;
    this.currentAttack = null;
    this.lastAttackId = null;
    this.lockedFacingVec = new THREE.Vector3(0, 0, -1);
    this.hasHitThisAttack = false;
    this.subHitIdx = 0;
    this.cooldowns = {};
    this.zones = [];
    this.attackSpeedMult = 1;
  }

  spawnModel() {
    this.model = this.data.createModel();
    this.model.position.copy(this.position);
    scene.add(this.model);
    // 予備動作を知らせる発光オーラ(素材依存を避けるため専用メッシュを追加する)
    const glowColor = this.data.colors.glow || 0xffffff;
    this.auraMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0, fog: false }),
    );
    this.auraMesh.visible = false;
    (this.model.userData.auraAnchor || this.model).add(this.auraMesh);
  }

  takeDamage(amount) {
    if (this.state === 'dead' || this.invulnerable) return;
    this.hp = clamp(this.hp - amount, 0, this.maxHP);
    updateHud();
    if (this.hp <= 0) { this.die(); return; }
    if (this.phase === 1 && this.hp <= this.maxHP * 0.5) this.beginPhase2();
  }

  checkStagger() {
    // phase2trans中にスタガーで上書きすると覚醒処理(無敵解除)が永久に走らなくなるため除外する
    if (this.state === 'dead' || this.state === 'phase2trans' || this.state === 'staggered') return;
    if (this.poise <= 0) {
      this.poise = 0;
      this.state = 'staggered';
      this.attackPhase = null;
      this.phaseTimer = 0;
      this.currentAttack = null;
      triggerHitstop(0.3, 0.15);
      showDefenseFeedback('parry');
    }
  }

  beginPhase2() {
    this.state = 'phase2trans';
    this.phaseTimer = 0;
    this.invulnerable = true;
    showBanner(`${this.data.name} 覚醒`);
    spawnFlash(this.position.clone().setY(1), this.data.colors.glow || 0xffffff);
  }

  die() {
    this.state = 'dead';
    this.phaseTimer = 0;
    setTimeout(() => endBattle(true), 1600);
  }

  eligibleAttacks() {
    const toPlayer = run.player.position.distanceTo(this.position);
    return this.data.attacks.filter((a) => {
      if ((a.minPhase || 1) > this.phase) return false;
      if ((this.cooldowns[a.id] || 0) > 0) return false;
      const maxD = (a.range || a.dashDistance || a.radius || 9) + 2.2;
      if (toPlayer > maxD) return false;
      return true;
    });
  }

  pickAttack() {
    let pool = this.eligibleAttacks();
    if (pool.length > 1) pool = pool.filter((a) => a.id !== this.lastAttackId) || pool;
    if (pool.length === 0) pool = this.eligibleAttacks();
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  beginAttack(atk) {
    this.currentAttack = atk;
    this.state = 'attacking';
    this.attackPhase = 'telegraph';
    this.phaseTimer = 0;
    this.hasHitThisAttack = false;
    this.subHitIdx = 0;
    this.zones = [];
    const dx = run.player.position.x - this.position.x;
    const dz = run.player.position.z - this.position.z;
    this.lockedFacingVec.set(dx, 0, dz).normalize();
    this.facing = Math.atan2(dx, dz);

    if (atk.type === 'aoe_zone') this.spawnZones(atk);
  }

  spawnZones(atk) {
    for (let i = 0; i < atk.zoneCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      const pos = run.player.position.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
      const d = Math.hypot(pos.x, pos.z);
      if (d > ARENA_RADIUS - 1) { pos.x *= (ARENA_RADIUS - 1) / d; pos.z *= (ARENA_RADIUS - 1) / d; }
      const ring = spawnGroundRing(pos, atk.zoneRadius, 0xffe14a);
      this.zones.push({ pos, ring });
    }
  }

  get atkSpeed() { return this.attackSpeedMult; }

  update(dt) {
    if (!this.model) return;

    switch (this.state) {
      case 'intro':
        this.idleTimer += dt;
        if (this.idleTimer > 0.6) { this.state = 'idle'; this.idleTimer = 0; }
        break;
      case 'idle':
        this.behaveIdle(dt);
        break;
      case 'attacking':
        this.behaveAttacking(dt);
        break;
      case 'staggered':
        this.phaseTimer += dt;
        if (this.phaseTimer >= BOSS_STAGGER_TIME) {
          this.poise = this.maxPoise; this.state = 'idle'; this.idleTimer = 0;
        }
        break;
      case 'phase2trans':
        this.phaseTimer += dt;
        if (this.phaseTimer >= 1.1) {
          this.phase = 2;
          this.invulnerable = false;
          this.attackSpeedMult = this.data.phase2.attackSpeedMult || 1.2;
          this.moveSpeed = this.data.moveSpeed * (this.data.phase2.speedMult || 1.2);
          this.state = 'idle'; this.idleTimer = 0;
        }
        break;
      case 'dead':
        this.phaseTimer += dt;
        this.model.position.y = Math.max(-1.4, this.position.y - this.phaseTimer * 0.6);
        this.model.rotation.z = Math.min(1.1, this.phaseTimer * 0.8);
        break;
    }

    Object.keys(this.cooldowns).forEach((k) => { if (this.cooldowns[k] > 0) this.cooldowns[k] -= dt; });

    if (this.state !== 'dead') {
      const r = Math.hypot(this.position.x, this.position.z);
      if (r > ARENA_RADIUS - 0.8) {
        const k = (ARENA_RADIUS - 0.8) / r;
        this.position.x *= k; this.position.z *= k;
      }
    }

    if (this.state !== 'dead' && this.model) {
      const bob = Math.sin(now() * 2.2) * (this.data.scale * 0.03) + (this.model.userData.floats ? Math.sin(now() * 1.1) * 0.15 : 0);
      this.model.position.set(this.position.x, bob, this.position.z);
      this.model.scale.setScalar(this.data.scale * (this.state === 'phase2trans' ? 1 + Math.sin(this.phaseTimer * 10) * 0.08 : 1));
      if (this.state !== 'attacking' || this.attackPhase === null) {
        this.model.rotation.y = lerp(this.model.rotation.y, this.facing, 0.12);
      } else {
        this.model.rotation.y = this.facing;
      }
      if (this.auraMesh) {
        const glowing = this.state === 'attacking' && (this.attackPhase === 'telegraph' || this.attackPhase === 'delay');
        this.auraMesh.visible = glowing;
        if (glowing) {
          const pulse = 0.5 + Math.sin(now() * 16) * 0.5;
          this.auraMesh.material.opacity = 0.25 + pulse * 0.45;
          this.auraMesh.scale.setScalar(0.85 + pulse * 0.6);
        }
      }
      this.animatePivot();
    }
  }

  behaveIdle(dt) {
    if (run.player.state === 'dead') return;
    const toPlayer = this.position.distanceTo(run.player.position);
    const dx = run.player.position.x - this.position.x;
    const dz = run.player.position.z - this.position.z;
    this.facing = Math.atan2(dx, dz);
    if (toPlayer > this.data.preferredRange) {
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      this.position.addScaledVector(dir, this.moveSpeed * dt);
    }
    this.idleTimer += dt;
    if (this.idleTimer > 0.5 + Math.random() * 0.4) {
      const atk = this.pickAttack();
      if (atk) { this.beginAttack(atk); this.lastAttackId = atk.id; }
      this.idleTimer = 0;
    }
  }

  behaveAttacking(dt) {
    const atk = this.currentAttack;
    this.phaseTimer += dt;
    const spd = this.atkSpeed;
    const telegraph = atk.telegraph / spd;
    const delay = atk.delay / spd;
    const active = atk.active / spd;
    const recovery = atk.recovery / spd;

    if (this.attackPhase === 'telegraph' && this.phaseTimer >= telegraph) {
      this.attackPhase = 'delay'; this.phaseTimer = 0;
    } else if (this.attackPhase === 'delay' && this.phaseTimer >= delay) {
      this.attackPhase = 'active'; this.phaseTimer = 0;
      this.onActiveStart(atk);
    } else if (this.attackPhase === 'active') {
      this.onActiveTick(atk, dt);
      if (this.phaseTimer >= active) { this.attackPhase = 'recovery'; this.phaseTimer = 0; }
    } else if (this.attackPhase === 'recovery' && this.phaseTimer >= recovery) {
      this.state = 'idle'; this.idleTimer = 0; this.attackPhase = null; this.currentAttack = null;
      this.cooldowns[atk.id] = atk.cooldown;
    }
  }

  onActiveStart(atk) {
    this.hasHitThisAttack = false;
    this.subHitIdx = 0;
    if (atk.type === 'melee_arc' || atk.type === 'thrust') {
      this.resolveDirectionalHit(atk, this.position);
    } else if (atk.type === 'aoe_slam') {
      // 判定は onActiveTick の終盤で実施
    } else if (atk.type === 'aoe_zone') {
      this.resolveZoneHit(atk);
      this.zones.forEach((z) => { z.ring.userData_remove = true; });
    } else if (atk.type === 'dash' || atk.type === 'dash_combo') {
      this._dashVel = this.lockedFacingVec.clone().multiplyScalar(atk.dashSpeed);
      this._dashTravelled = 0;
    } else if (atk.type === 'projectile_volley') {
      this._volleyTimer = 0;
      this._volleyFired = 0;
    }
  }

  onActiveTick(atk, dt) {
    if (atk.type === 'aoe_slam') {
      const p = clamp(this.phaseTimer / (atk.active / this.atkSpeed), 0, 1);
      if (p >= 0.65 && !this.hasHitThisAttack) {
        this.hasHitThisAttack = true;
        if (this.position.distanceTo(run.player.position) <= atk.radius) resolveDefense(this, atk);
        spawnExpandingRing(this.position, atk.radius, this.data.colors.glow || 0xffcf5e);
      }
    } else if (atk.type === 'dash') {
      const maxD = atk.dashDistance;
      const step = Math.min(dt * this._dashVel.length(), Math.max(0, maxD - this._dashTravelled));
      this.position.addScaledVector(this._dashVel.clone().normalize(), step);
      this._dashTravelled += step;
      if (!this.hasHitThisAttack && this.position.distanceTo(run.player.position) <= 1.5) {
        this.hasHitThisAttack = true;
        resolveDefense(this, atk);
      }
    } else if (atk.type === 'dash_combo') {
      if (this._dashTravelled < atk.dashDistance * 0.9) {
        const step = Math.min(dt * atk.dashSpeed, atk.dashDistance - this._dashTravelled);
        this.position.addScaledVector(this._dashVel.clone().normalize(), step);
        this._dashTravelled += step;
      }
      const hitAt = (this.subHitIdx + 1) * atk.hitInterval;
      if (this.subHitIdx < atk.hits && this.phaseTimer >= hitAt) {
        this.subHitIdx++;
        if (this.position.distanceTo(run.player.position) <= (atk.hitRadius || 2.0)) resolveDefense(this, atk);
      }
    } else if (atk.type === 'projectile_volley') {
      const pv = atk.projectile;
      const fireAt = this._volleyFired * pv.interval;
      if (this._volleyFired < pv.count && this.phaseTimer >= fireAt) {
        this._volleyFired++;
        const origin = (this.model.userData.projectileOrigin || this.model).getWorldPosition(new THREE.Vector3());
        spawnProjectile({
          position: origin, target: run.player.position.clone(), speed: pv.speed, radius: pv.radius,
          color: pv.color, owner: 'boss', bossAttack: atk, boss: this,
        });
      }
    }
  }

  resolveDirectionalHit(atk, originPos) {
    const toPlayer = new THREE.Vector3().subVectors(run.player.position, originPos).setY(0);
    const dist = toPlayer.length();
    if (dist > atk.range) return;
    if (atk.arcDeg) {
      toPlayer.normalize();
      const dot = clamp(this.lockedFacingVec.dot(toPlayer), -1, 1);
      const angle = Math.acos(dot) * (180 / Math.PI);
      if (angle > atk.arcDeg / 2) return;
    }
    resolveDefense(this, atk);
  }

  resolveZoneHit(atk) {
    const inZone = this.zones.some((z) => run.player.position.distanceTo(z.pos) <= atk.zoneRadius);
    if (inZone) resolveDefense(this, atk);
  }

  animatePivot() {
    const atk = this.currentAttack;
    const ud = this.model.userData;
    if (!atk || !atk.motion || this.state !== 'attacking') {
      if (ud.weaponPivot) ud.weaponPivot.rotation[ud._lastAxis || 'x'] = lerp(ud.weaponPivot.rotation[ud._lastAxis || 'x'], 0, 0.1);
      return;
    }
    const pivotObj = ud[atk.motion.pivot || 'weaponPivot'];
    if (!pivotObj) return;
    const axis = atk.motion.axis;
    ud._lastAxis = axis;
    const spd = this.atkSpeed;
    let val = 0;
    if (this.attackPhase === 'telegraph') val = lerp(0, atk.motion.windup, easeOutCubic(this.phaseTimer / (atk.telegraph / spd)));
    else if (this.attackPhase === 'delay') val = atk.motion.windup;
    else if (this.attackPhase === 'active') val = lerp(atk.motion.windup, atk.motion.swing, easeInCubic(clamp(this.phaseTimer / (atk.active / spd), 0, 1)));
    else if (this.attackPhase === 'recovery') val = lerp(atk.motion.swing, 0, clamp(this.phaseTimer / (atk.recovery / spd), 0, 1));
    pivotObj.rotation[axis] = val;
  }
}

function spawnExpandingRing(position, maxRadius, color) {
  const ring = spawnGroundRing(position, maxRadius, color);
  const vfx = run.vfx[run.vfx.length - 1];
  vfx.data.maxRadius = maxRadius;
  vfx.life = 0.5;
  vfx.kind = 'ring_expand';
}

/* =============================================================
 * 9. 防御判定の解決 (プレイヤーの回避/ガードとボス攻撃の突き合わせ)
 * ============================================================= */
function resolveDefense(boss, atk) {
  const p = run.player;
  let dmg = atk.damage;
  if (p.invulnerable) {
    if (p.dodgeType === atk.correctDodge) {
      dmg = 0;
      showDefenseFeedback(p.dodgeIsJust ? 'just_dodge' : 'dodge');
    } else {
      dmg *= 0.55;
      showDefenseFeedback('graze');
    }
  } else if (p.state === 'guard') {
    const isJust = now() - p.guardPressTime <= GUARD_JUST_WINDOW;
    const matched = atk.correctDodge === 'guard';
    let staminaCost = GUARD_STAMINA_COST * (matched ? 1 : 1.6);
    if (matched && isJust) {
      dmg = 0;
      boss.poise -= (atk.poiseReward || 15);
      boss.checkStagger();
      triggerHitstop(0.14, 0.16);
      spawnFlash(p.position.clone().setY(1), 0xfff1c4);
      showDefenseFeedback('parry');
    } else if (matched) {
      dmg *= 0.15;
      showDefenseFeedback('block');
    } else {
      dmg *= isJust ? 0.25 : 0.45;
      showDefenseFeedback('block_partial');
    }
    if (p.stamina < staminaCost) {
      p.stamina = 0;
      dmg = Math.max(dmg, atk.damage * 0.8);
      p.enterGuardBreak();
      showDefenseFeedback('guardbreak');
    } else {
      p.stamina -= staminaCost;
    }
    p.noRegenTimer = STAMINA_REGEN_DELAY;
  } else {
    showDefenseFeedback('hit');
  }
  if (dmg > 0) p.takeDamage(dmg);
}

function resolveProjectileDefense(boss, atk, proj) {
  const p = run.player;
  const pv = atk.projectile;
  if (p.invulnerable) {
    if (p.dodgeType === atk.correctDodge) { showDefenseFeedback(p.dodgeIsJust ? 'just_dodge' : 'dodge'); return { dmg: 0, reflect: false }; }
    showDefenseFeedback('graze');
    return { dmg: pv.damage * 0.55, reflect: false };
  }
  if (p.state === 'guard') {
    const isJust = now() - p.guardPressTime <= GUARD_JUST_WINDOW;
    if (isJust) {
      boss.poise -= (atk.poiseReward || 14) * 1.3;
      boss.checkStagger();
      triggerHitstop(0.16, 0.18);
      showDefenseFeedback('reflect');
      return { dmg: 0, reflect: true };
    }
    const staminaCost = GUARD_STAMINA_COST;
    if (p.stamina < staminaCost) { p.stamina = 0; p.enterGuardBreak(); showDefenseFeedback('guardbreak'); return { dmg: pv.damage * 0.8, reflect: false }; }
    p.stamina -= staminaCost;
    p.noRegenTimer = STAMINA_REGEN_DELAY;
    showDefenseFeedback('block');
    return { dmg: pv.damage * 0.2, reflect: false };
  }
  showDefenseFeedback('hit');
  return { dmg: pv.damage, reflect: false };
}

/* =============================================================
 * 10. プロジェクタイル (弓矢/氷塊/投擲武器 共通)
 * ============================================================= */
function spawnProjectile(opts) {
  const geo = new THREE.OctahedronGeometry(opts.radius || 0.25, 0);
  const mat = new THREE.MeshStandardMaterial({ color: opts.color, emissive: opts.color, emissiveIntensity: 1.1, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(opts.position);
  scene.add(mesh);
  const dir = new THREE.Vector3().subVectors(opts.target, opts.position).normalize();
  run.projectiles.push({
    mesh, dir, speed: opts.speed, owner: opts.owner, damage: opts.damage,
    bossAttack: opts.bossAttack, boss: opts.boss, onHit: opts.onHit, travelled: 0, maxRange: 40, reflected: false,
  });
}

function updateProjectiles(dt) {
  for (let i = run.projectiles.length - 1; i >= 0; i--) {
    const pr = run.projectiles[i];
    const step = pr.speed * dt;
    pr.mesh.position.addScaledVector(pr.dir, step);
    pr.mesh.rotation.x += dt * 6; pr.mesh.rotation.y += dt * 5;
    pr.travelled += step;

    if (pr.owner === 'boss') {
      const d = pr.mesh.position.distanceTo(run.player.position);
      if (d <= 0.9) {
        const result = resolveProjectileDefense(pr.boss, pr.bossAttack, pr);
        if (result.reflect) {
          pr.owner = 'player';
          pr.damage = pr.bossAttack.projectile.reflectDamage;
          pr.dir = new THREE.Vector3().subVectors(pr.boss.position, pr.mesh.position).normalize();
          pr.mesh.material.emissiveIntensity = 2;
          pr.mesh.material.color.set(0xfff6c8);
          pr.travelled = 0;
          continue;
        }
        if (result.dmg > 0) run.player.takeDamage(result.dmg);
        scene.remove(pr.mesh);
        run.projectiles.splice(i, 1);
        continue;
      }
    } else {
      const boss = run.boss;
      if (boss && boss.state !== 'dead') {
        const d = pr.mesh.position.distanceTo(boss.position);
        if (d <= 1.1) {
          boss.takeDamage(pr.damage);
          boss.poise -= 10;
          boss.checkStagger();
          if (pr.onHit) pr.onHit(boss);
          spawnFlash(boss.position.clone().setY(1.1), 0xffffff);
          scene.remove(pr.mesh);
          run.projectiles.splice(i, 1);
          continue;
        }
      }
    }
    if (pr.travelled > pr.maxRange) { scene.remove(pr.mesh); run.projectiles.splice(i, 1); }
  }
}

/* =============================================================
 * 11. VFXリング更新 (aoe_slam / aoe_zone 共通描画)
 * ============================================================= */
function updateVfxRings(dt) {
  for (let i = run.vfx.length - 1; i >= 0; i--) {
    const v = run.vfx[i];
    if (v.kind === 'ring_grow') {
      v.mesh.material.opacity = 0.55;
      v.mesh.scale.set(1, 1, 1);
      if (v.mesh.userData_remove) { scene.remove(v.mesh); run.vfx.splice(i, 1); }
    } else if (v.kind === 'ring_expand') {
      v.t += dt;
      const p = clamp(v.t / v.life, 0, 1);
      v.mesh.scale.set(p, p, 1);
      v.mesh.material.opacity = 0.7 * (1 - p);
      if (p >= 1) { scene.remove(v.mesh); run.vfx.splice(i, 1); }
    }
  }
}

/* =============================================================
 * 12. UI更新
 * ============================================================= */
function updateHud() {
  const p = run.player, b = run.boss;
  if (!p || !b) return;
  dom.hpFill.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`;
  dom.staminaFill.style.width = `${clamp((p.stamina / PLAYER_MAX_STAMINA) * 100, 0, 100)}%`;
  dom.bossHpFill.style.width = `${clamp((b.hp / b.maxHP) * 100, 0, 100)}%`;
  dom.bossPoiseFill.style.width = `${clamp((b.poise / b.maxPoise) * 100, 0, 100)}%`;
  dom.bossPoiseFill.parentElement.classList.toggle('broken', b.state === 'staggered');
  dom.deathCounter.textContent = `死亡 ${run.deaths}`;
}

let bannerTimer = 0;
function showBanner(text) {
  dom.phaseBanner.textContent = text;
  dom.phaseBanner.classList.add('show');
  bannerTimer = 2.2;
}

/* =============================================================
 * 13. バトル開始・終了
 * ============================================================= */
function startBattle() {
  run.deaths = 0;
  const weapon = getWeapon(run.selectedWeaponId);
  const bossData = getBoss(run.selectedBossId);

  run.player = new Player(weapon);
  run.player.spawnModel(createPlayerModel);
  run.boss = new Boss(bossData);
  run.boss.spawnModel();

  camera.position.set(0, CAM_HEIGHT, CAM_DIST);

  dom.introName.textContent = bossData.name;
  dom.introFlavor.textContent = bossData.flavor;
  dom.introCard.classList.add('show');
  setTimeout(() => dom.introCard.classList.remove('show'), 2600);

  showScreen('battle');
  updateHud();
  run.startedAt = performance.now();
}

function endBattle(victory, quitOnly = false) {
  if (run.player?.model) scene.remove(run.player.model);
  if (run.boss?.model) scene.remove(run.boss.model);
  run.projectiles.forEach((p) => scene.remove(p.mesh));
  run.projectiles = [];
  run.vfx.forEach((v) => scene.remove(v.mesh));
  run.vfx = [];
  run.player = null;
  run.boss = null;

  if (quitOnly) { showScreen('title'); return; }

  const elapsed = (performance.now() - run.startedAt) / 1000;
  dom.resultTitle.textContent = victory ? '撃破 -勝利-' : '死セリ -敗北-';
  dom.resultTitle.className = victory ? 'win' : 'lose';
  dom.resultStats.textContent = `経過時間 ${elapsed.toFixed(1)}秒 / 死亡回数 ${run.deaths}`;
  showScreen('result');
}

/* =============================================================
 * 14. メインループ
 * ============================================================= */
function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);

  setupControls._poll && setupControls._poll();

  if (sim.hitstopTimer > 0) {
    sim.hitstopTimer -= rawDt;
    if (sim.hitstopTimer <= 0) sim.timeScale = 1;
  }
  const dt = rawDt * sim.timeScale;
  sim.time += dt;

  if (run.screen === 'battle' && run.player && run.boss) {
    run.player.update(dt);
    run.boss.update(dt);
    updateProjectiles(dt);
    updateVfx(dt);
    updateVfxRings(dt);
    updateCamera(dt);

    if (feedbackTimer > 0) { feedbackTimer -= rawDt; if (feedbackTimer <= 0) dom.msgFeedback.className = 'feedback'; }
    if (bannerTimer > 0) { bannerTimer -= rawDt; if (bannerTimer <= 0) dom.phaseBanner.classList.remove('show'); }

    dom.bossNameLabel.textContent = run.boss.data.name + (run.boss.phase === 2 ? ' ◆覚醒' : '');
    dom.skillLabel.textContent = run.player.weapon.skill.name;
    dom.btnSkill.classList.toggle('cooling', run.player.skillCooldown > 0);
  }

  renderer.render(scene, camera);
}

function updateCamera(dt) {
  const p = run.player.position;
  const b = run.boss.position;
  const toBoss = new THREE.Vector3().subVectors(b, p).setY(0);
  if (toBoss.lengthSq() < 0.0001) toBoss.set(0, 0, -1);
  toBoss.normalize();
  const desired = p.clone().addScaledVector(toBoss, -CAM_DIST).setY(CAM_HEIGHT);
  camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
  const lookTarget = p.clone().lerp(b, 0.32).setY(1.3);
  camera.lookAt(lookTarget);
}

/* =============================================================
 * 15. ブートストラップ
 * ============================================================= */
function boot() {
  cacheDom();
  initThree();
  setupControls();
  renderWeaponSelect();
  renderBossSelect();
  showScreen('title');

  dom.btnStart.addEventListener('click', () => { renderWeaponSelect(); showScreen('weapon'); });
  dom.btnToBoss.addEventListener('click', () => { renderBossSelect(); showScreen('boss'); });
  dom.btnBackToWeapon.addEventListener('click', () => showScreen('weapon'));
  dom.btnFight.addEventListener('click', () => startBattle());
  dom.btnRetry.addEventListener('click', () => startBattle());
  dom.btnMenu.addEventListener('click', () => showScreen('title'));

  clock.start();
  requestAnimationFrame(tick);
}

document.addEventListener('DOMContentLoaded', boot);
