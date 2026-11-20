// =============================================================
//  data.js
//  『刃ノ輪廻 -ETERNAL TRIAL-』 Phase1
//  -------------------------------------------------------------
//  武器(WEAPONS)とボス(BOSSES)をデータ駆動で定義するファイル。
//  Phase2以降は WEAPONS / BOSSES の配列に要素を追加するだけで
//  新しい武器・ボスを拡張できるように設計している。
//  3Dモデルは外部アセットを使わず、Three.jsの基本ジオメトリ
//  (Box / Cylinder / Cone / Octahedron / Sphere) の組み合わせのみで
//  ローポリ＋フラットシェーディングで生成する。
// =============================================================

import * as THREE from 'three';

/* =============================================================
 * 1. ローポリ生成ユーティリティ
 * ============================================================= */

export function flatMat(color, extra = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
}

export function glowMat(color, intensity = 0.9, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    flatShading: true,
    roughness: 0.45,
    metalness: 0.05,
    ...extra,
  });
}

function mk(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
export const boxMesh = (w, h, d, mat) => mk(new THREE.BoxGeometry(w, h, d), mat);
export const cylMesh = (rt, rb, h, mat, seg = 6) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
export const coneMesh = (r, h, mat, seg = 6) => mk(new THREE.ConeGeometry(r, h, seg), mat);
export const octaMesh = (r, mat) => mk(new THREE.OctahedronGeometry(r, 0), mat);
export const sphereMesh = (r, mat, seg = 8) => mk(new THREE.SphereGeometry(r, seg, Math.max(4, Math.round(seg / 2))), mat);

// 全メッシュに安価なトゥーン風アウトライン(裏面法線を利用した縁取り)を付与する。
// シャドウマップや後処理を使わずに見た目の密度を上げるための軽量な手法。
export function applyOutline(root, color = 0x16120d, scale = 1.07) {
  const targets = [];
  root.traverse((child) => {
    if (child.isMesh && !child.userData.noOutline) targets.push(child);
  });
  targets.forEach((child) => {
    const outline = new THREE.Mesh(child.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true }));
    outline.scale.setScalar(scale);
    outline.userData.isOutline = true;
    child.add(outline);
  });
  return root;
}

/* =============================================================
 * 2. 共通リグ(人型ベース / 浮遊ベース)
 *    ソケット名はプレイヤー・ボス全てで統一し、main.js側の
 *    汎用アニメーション処理(振り/歩行/待機)から参照できるようにする。
 * ============================================================= */

export function createHumanoidBase({ skin = 0xe0b589, cloth = 0x6c5a44, trim = 0xc9a24a, pants = 0x454f42 } = {}) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.02;
  root.add(hips);

  const torso = boxMesh(0.5, 0.58, 0.3, flatMat(cloth));
  torso.position.y = 0.4;
  hips.add(torso);

  const chestTrim = boxMesh(0.52, 0.1, 0.32, flatMat(trim));
  chestTrim.position.y = 0.6;
  hips.add(chestTrim);

  const belt = boxMesh(0.54, 0.09, 0.32, flatMat(trim));
  belt.position.y = 0.1;
  hips.add(belt);

  const neck = cylMesh(0.09, 0.1, 0.1, flatMat(skin), 6);
  neck.position.y = 0.74;
  hips.add(neck);

  const head = octaMesh(0.24, flatMat(skin));
  head.position.y = 0.92;
  head.rotation.y = Math.PI / 4;
  hips.add(head);

  const brow = boxMesh(0.3, 0.08, 0.28, flatMat(trim));
  brow.position.y = 1.02;
  hips.add(brow);

  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.36 * side, 0.64, 0);
    const upper = boxMesh(0.15, 0.36, 0.17, flatMat(cloth));
    upper.position.y = -0.18;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.36;
    upper.add(elbow);
    const fore = boxMesh(0.13, 0.32, 0.15, flatMat(skin));
    fore.position.y = -0.16;
    elbow.add(fore);
    const hand = new THREE.Group();
    hand.position.y = -0.32;
    elbow.add(hand);
    return { shoulder, elbow, hand };
  }
  const rightArm = buildArm(1);
  const leftArm = buildArm(-1);
  hips.add(rightArm.shoulder, leftArm.shoulder);

  function buildLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.17 * side, -0.02, 0);
    const thigh = boxMesh(0.19, 0.4, 0.21, flatMat(pants));
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    thigh.add(knee);
    const shin = boxMesh(0.16, 0.38, 0.18, flatMat(pants));
    shin.position.y = -0.19;
    knee.add(shin);
    const foot = boxMesh(0.19, 0.12, 0.28, flatMat(trim));
    foot.position.set(0, -0.42, 0.05);
    knee.add(foot);
    return { hip, knee };
  }
  const rightLeg = buildLeg(1);
  const leftLeg = buildLeg(-1);
  hips.add(rightLeg.hip, leftLeg.hip);

  applyOutline(root);

  root.userData.sockets = {
    rightHand: rightArm.hand,
    leftHand: leftArm.hand,
    rightShoulder: rightArm.shoulder,
    leftShoulder: leftArm.shoulder,
    hips,
    head,
  };
  // 戦闘アニメーション共通インターフェース
  root.userData.weaponPivot = rightArm.shoulder;
  root.userData.offPivot = leftArm.shoulder;
  root.userData.bodyPivot = hips;
  root.userData.projectileOrigin = rightArm.hand;
  return root;
}

// 浮遊型(水呪の槍騎兵)用ベース。脚の代わりに裾布(ローブ)で浮遊する。
export function createFloatingBase({ robe = 0x3d6a8f, trim = 0xcfe8ea, skin = 0x9fd4e6 } = {}) {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 1.3;
  root.add(hips);

  const robeCone = coneMesh(0.5, 1.1, flatMat(robe), 7);
  robeCone.position.y = -0.3;
  hips.add(robeCone);

  const torso = octaMesh(0.34, flatMat(robe));
  torso.scale.set(1, 1.3, 1);
  torso.position.y = 0.32;
  hips.add(torso);

  const collar = cylMesh(0.26, 0.3, 0.1, flatMat(trim), 7);
  collar.position.y = 0.58;
  hips.add(collar);

  const head = octaMesh(0.22, flatMat(skin, { transparent: true, opacity: 0.92 }));
  head.position.y = 0.82;
  hips.add(head);

  const crown = coneMesh(0.14, 0.26, glowMat(trim, 1.1), 5);
  crown.position.y = 1.02;
  hips.add(crown);

  function buildArm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.32 * side, 0.5, 0);
    const sleeve = coneMesh(0.14, 0.42, flatMat(robe), 6);
    sleeve.position.y = -0.21;
    sleeve.rotation.x = Math.PI;
    shoulder.add(sleeve);
    const hand = new THREE.Group();
    hand.position.y = -0.42;
    shoulder.add(hand);
    return { shoulder, hand };
  }
  const rightArm = buildArm(1);
  const leftArm = buildArm(-1);
  hips.add(rightArm.shoulder, leftArm.shoulder);

  applyOutline(root);

  root.userData.sockets = { rightHand: rightArm.hand, leftHand: leftArm.hand, hips, head };
  root.userData.weaponPivot = rightArm.shoulder;
  root.userData.offPivot = leftArm.shoulder;
  root.userData.bodyPivot = hips;
  root.userData.projectileOrigin = rightArm.hand;
  root.userData.floats = true;
  return root;
}

/* =============================================================
 * 3. プレイヤーモデル組み立て(共通リグ + 選択武器)
 * ============================================================= */

export function createPlayerModel(weapon) {
  const body = createHumanoidBase({ skin: 0xe0b589, cloth: 0x5c4b37, trim: 0xc9a24a, pants: 0x3f4a3c });
  const sockets = body.userData.sockets;

  const weaponModel = weapon.createModel();
  sockets.rightHand.add(weaponModel);

  if (weapon.createOffhand) {
    const off = weapon.createOffhand();
    if (off) sockets.leftHand.add(off);
  }

  body.userData.weaponMesh = weaponModel;
  return body;
}

/* =============================================================
 * 4. 武器定義 (WEAPONS)
 *    stats の単位: 距離=ワールド単位, 時間=秒, スタミナ/体幹=0-100換算
 *    skill.execute は main.js 側の汎用スキルハンドラ名とひも付く。
 * ============================================================= */

export const WEAPONS = [
  {
    id: 'broadsword',
    name: 'ブロードソード＆バックラー',
    kana: '中世・標準',
    description: '振りが速くガード移行も最速。ジャストガードの受付時間がやや長めで扱いやすい。',
    color: 0xd7dde0,
    stats: {
      reach: 1.7, arcDeg: 100,
      lightDamage: 11, heavyDamage: 19,
      lightPoise: 8, heavyPoise: 15,
      staminaLight: 11, staminaHeavy: 20,
      swingTime: 0.22, recoverTime: 0.28,
      guardSpeed: 1.3, justGuardWindow: 0.24, justDodgeCritMult: 1.4,
    },
    skill: {
      name: '回転斬り', execute: 'spin', staminaCost: 28, cooldown: 7,
      damage: 24, poise: 20, description: '周囲一帯に二連の斬撃を放つ。',
    },
    createModel() {
      const g = new THREE.Group();
      const blade = boxMesh(0.1, 0.88, 0.035, flatMat(0xd7dde0));
      blade.position.y = 0.54;
      const tip = coneMesh(0.07, 0.16, flatMat(0xd7dde0), 4);
      tip.position.y = 1.06;
      const guard = boxMesh(0.3, 0.07, 0.06, flatMat(0xb8903f));
      guard.position.y = 0.08;
      const grip = cylMesh(0.045, 0.05, 0.24, flatMat(0x5a3d22), 6);
      grip.position.y = -0.07;
      const pommel = sphereMesh(0.07, flatMat(0xb8903f), 6);
      pommel.position.y = -0.21;
      g.add(blade, tip, guard, grip, pommel);
      applyOutline(g);
      g.userData.tip = tip;
      return g;
    },
    createOffhand() {
      const g = new THREE.Group();
      const face = cylMesh(0.24, 0.24, 0.06, flatMat(0x6b4a2b), 8);
      const umbo = sphereMesh(0.075, flatMat(0xb8903f), 6);
      umbo.position.z = 0.045;
      g.add(face, umbo);
      g.rotation.x = Math.PI / 2;
      g.position.set(-0.02, 0.02, 0.1);
      applyOutline(g);
      return g;
    },
  },
  {
    id: 'claymore',
    name: 'クレイモア',
    kana: '中世・大剣',
    description: 'リーチが長く高火力・体幹削り大。振りは遅いが怯みにくい。固有技は三段階の溜め斬り払い。',
    color: 0xb9c4c9,
    stats: {
      reach: 2.2, arcDeg: 90,
      lightDamage: 17, heavyDamage: 30,
      lightPoise: 14, heavyPoise: 24,
      staminaLight: 16, staminaHeavy: 28,
      swingTime: 0.34, recoverTime: 0.4,
      guardSpeed: 0.85, justGuardWindow: 0.18, justDodgeCritMult: 1.5,
      poiseResist: 0.5,
    },
    skill: {
      name: '三段階溜め斬り払い', execute: 'charge3', staminaCost: 34, cooldown: 9,
      damage: 14, poise: 10, hits: 3, description: '三連撃、最後の一閃が最大威力。',
    },
    createModel() {
      const g = new THREE.Group();
      const blade = boxMesh(0.16, 1.2, 0.045, flatMat(0xb9c4c9));
      blade.position.y = 0.72;
      const tip = coneMesh(0.11, 0.2, flatMat(0xb9c4c9), 4);
      tip.position.y = 1.42;
      const fuller = boxMesh(0.04, 1.0, 0.05, flatMat(0x8d979b));
      fuller.position.y = 0.7;
      const guard = boxMesh(0.42, 0.08, 0.07, flatMat(0x7a2c2c));
      guard.position.y = 0.1;
      const grip = cylMesh(0.05, 0.055, 0.38, flatMat(0x2e2a28), 6);
      grip.position.y = -0.1;
      const pommel = boxMesh(0.14, 0.09, 0.09, flatMat(0x7a2c2c));
      pommel.position.y = -0.32;
      g.add(blade, fuller, tip, guard, grip, pommel);
      applyOutline(g);
      g.userData.tip = tip;
      return g;
    },
    createOffhand: null,
  },
  {
    id: 'trident',
    name: 'トライデント',
    kana: 'マイクラ・三叉槍',
    description: '近接突きに加え投擲遠距離攻撃も可能(自動で手元に戻る)。固有技は着弾点に雷撃を呼ぶ投擲。',
    color: 0x6fd8d2,
    ranged: true,
    throwRange: 3.6,
    stats: {
      reach: 2.4, arcDeg: 40,
      lightDamage: 13, heavyDamage: 22,
      lightPoise: 7, heavyPoise: 13,
      staminaLight: 10, staminaHeavy: 19,
      swingTime: 0.2, recoverTime: 0.3,
      guardSpeed: 1.0, justGuardWindow: 0.2, justDodgeCritMult: 1.4,
      throwDamage: 20, throwSpeed: 15,
    },
    skill: {
      name: '召雷投擲', execute: 'throw_bolt', staminaCost: 26, cooldown: 8,
      damage: 16, poise: 14, strikeDamage: 22, description: '投げた穂先の着弾点に落雷を発生させる。',
    },
    createModel() {
      const g = new THREE.Group();
      const shaft = cylMesh(0.035, 0.04, 1.3, flatMat(0x4f5d5a), 6);
      shaft.position.y = 0.3;
      const centerProng = coneMesh(0.06, 0.4, glowMat(0x6fd8d2, 0.8), 4);
      centerProng.position.y = 1.15;
      function sideProng(side) {
        const p = coneMesh(0.045, 0.3, glowMat(0x6fd8d2, 0.8), 4);
        p.position.set(0.14 * side, 1.02, 0);
        p.rotation.z = -0.35 * side;
        return p;
      }
      const crossbar = boxMesh(0.32, 0.04, 0.03, flatMat(0x3c4846));
      crossbar.position.y = 0.88;
      const grip = cylMesh(0.045, 0.045, 0.3, flatMat(0x2e3432), 6);
      grip.position.y = -0.4;
      g.add(shaft, centerProng, sideProng(1), sideProng(-1), crossbar, grip);
      applyOutline(g);
      g.userData.tip = centerProng;
      return g;
    },
    createOffhand: null,
  },
];

/* =============================================================
 * 5. ボス定義 (BOSSES)
 *    attacks[].type は main.js の汎用アタックハンドラ名に対応:
 *      melee_arc / thrust / dash / aoe_slam / aoe_zone / projectile_volley / dash_combo
 *    motion: { axis, windup, swing } は weaponPivot.rotation[axis] を
 *            0 -> windup(予備動作) -> swing(振り抜き) -> 0 とアニメーションさせる。
 * ============================================================= */

export const BOSSES = [
  {
    id: 'knight',
    name: '荒野の重装騎士',
    kana: '坩堝ノ守人',
    flavor: '朽ちた大地に立つ巨躯の騎士。大剣と大盾で全てを薙ぎ払う。',
    maxHP: 1000, maxPoise: 100,
    moveSpeed: 1.6, turnSpeed: 2.4, scale: 1.35, preferredRange: 2.6,
    colors: { armor: 0x6e6a63, trim: 0xc9a24a, shield: 0x55504a, glow: 0xffcf5e },
    phase2: { speedMult: 1.25, attackSpeedMult: 1.2, extraAttackIds: ['golden_shockwave'] },
    createModel() {
      const body = createHumanoidBase({ skin: 0x9a9088, cloth: 0x6e6a63, trim: 0xc9a24a, pants: 0x55504a });
      const s = body.userData.sockets;

      const sword = new THREE.Group();
      const blade = boxMesh(0.22, 1.5, 0.07, flatMat(0xb9bdbf));
      blade.position.y = 0.95;
      const tip = coneMesh(0.15, 0.3, flatMat(0xb9bdbf), 4);
      tip.position.y = 1.85;
      const guard = boxMesh(0.55, 0.1, 0.1, flatMat(0xc9a24a));
      guard.position.y = 0.18;
      const grip = cylMesh(0.06, 0.07, 0.42, flatMat(0x3a2f22), 6);
      grip.position.y = -0.12;
      sword.add(blade, tip, guard, grip);
      applyOutline(sword);
      s.rightHand.add(sword);

      const shield = new THREE.Group();
      const plate = boxMesh(0.56, 0.86, 0.1, flatMat(0x55504a));
      const emblem = octaMesh(0.14, flatMat(0x8a2f2f));
      emblem.position.z = 0.09;
      const rim = boxMesh(0.6, 0.9, 0.04, flatMat(0xc9a24a));
      rim.position.z = -0.04;
      shield.add(rim, plate, emblem);
      shield.rotation.y = Math.PI / 2;
      shield.position.set(0, -0.1, 0.12);
      applyOutline(shield);
      s.leftHand.add(shield);

      const auraAnchor = new THREE.Object3D();
      auraAnchor.position.set(0, 0.5, 0);
      s.hips.add(auraAnchor);

      body.userData.projectileOrigin = sword.getObjectByProperty ? sword : s.rightHand;
      body.userData.auraAnchor = auraAnchor;
      body.userData.tip = tip;
      return body;
    },
    attacks: [
      {
        id: 'vertical_slash', name: '渾身の叩き割り', correctDodge: 'side', type: 'melee_arc',
        telegraph: 0.75, delay: 0.3, active: 0.22, recovery: 0.75, cooldown: 1,
        range: 3.0, arcDeg: 80, damage: 34, poiseReward: 22,
        motion: { axis: 'x', windup: -2.3, swing: 0.9 },
      },
      {
        id: 'shield_charge', name: '盾突進', correctDodge: 'side', type: 'dash',
        telegraph: 0.6, delay: 0.15, active: 0.4, recovery: 0.9, cooldown: 1.4,
        range: 1.6, dashDistance: 6.5, dashSpeed: 11, damage: 30, poiseReward: 18,
        motion: { axis: 'z', windup: -0.5, swing: 0.3, pivot: 'offPivot' },
      },
      {
        id: 'golden_shockwave', name: '黄金の衝撃波', correctDodge: 'back', type: 'aoe_slam', minPhase: 2,
        telegraph: 0.9, delay: 0.25, active: 0.3, recovery: 1.0, cooldown: 1.6,
        radius: 4.2, damage: 36, poiseReward: 26,
        motion: { axis: 'x', windup: -2.6, swing: 1.1 },
      },
    ],
  },
  {
    id: 'water_lancer',
    name: '水呪の槍騎兵',
    kana: '蒼氷ノ穂先',
    flavor: '光る穂先の長槍を携え宙に浮く呪われし騎兵。氷塊を操る。',
    maxHP: 900, maxPoise: 90,
    moveSpeed: 2.0, turnSpeed: 3.0, scale: 1.2, preferredRange: 3.4,
    colors: { robe: 0x3d6a8f, trim: 0xcfe8ea, glow: 0x8fe9ff },
    phase2: { speedMult: 1.3, attackSpeedMult: 1.25, extraAttackIds: ['wide_sweep', 'thrust_combo'] },
    createModel() {
      const body = createFloatingBase({ robe: 0x3d6a8f, trim: 0xcfe8ea, skin: 0x9fd4e6 });
      const s = body.userData.sockets;

      const spear = new THREE.Group();
      const shaft = cylMesh(0.045, 0.05, 2.0, flatMat(0x39506b), 6);
      shaft.position.y = 0.9;
      const tip = coneMesh(0.13, 0.5, glowMat(0x8fe9ff, 1.1), 5);
      tip.position.y = 2.1;
      const collar = cylMesh(0.09, 0.09, 0.1, flatMat(0xcfe8ea), 6);
      collar.position.y = 1.78;
      spear.add(shaft, tip, collar);
      applyOutline(spear);
      s.rightHand.add(spear);

      const auraAnchor = new THREE.Object3D();
      auraAnchor.position.set(0, 0.3, 0);
      s.hips.add(auraAnchor);

      body.userData.auraAnchor = auraAnchor;
      body.userData.tip = tip;
      body.userData.projectileOrigin = tip;
      return body;
    },
    attacks: [
      {
        id: 'lance_thrust', name: '穿つ突撃', correctDodge: 'side', type: 'thrust',
        telegraph: 0.55, delay: 0.3, active: 0.2, recovery: 0.6, cooldown: 1,
        range: 4.2, arcDeg: 26, damage: 32, poiseReward: 18,
        motion: { axis: 'z', windup: -0.7, swing: 0.55 },
      },
      {
        id: 'ice_barrage', name: '氷塊乱射', correctDodge: 'guard', type: 'projectile_volley',
        telegraph: 0.7, delay: 0.2, active: 1.4, recovery: 0.6, cooldown: 1.6,
        projectile: { count: 4, interval: 0.3, speed: 9, radius: 0.32, damage: 16, reflectDamage: 42, color: 0x8fe9ff },
        poiseReward: 14,
        motion: { axis: 'x', windup: -0.9, swing: 0.2 },
      },
      {
        id: 'wide_sweep', name: '薙ぎ払いの一閃', correctDodge: 'back', type: 'melee_arc', minPhase: 2,
        telegraph: 0.5, delay: 0.22, active: 0.26, recovery: 0.7, cooldown: 1.2,
        range: 3.4, arcDeg: 150, damage: 30, poiseReward: 20,
        motion: { axis: 'y', windup: -1.3, swing: 1.6 },
      },
      {
        id: 'thrust_combo', name: '連突三段', correctDodge: 'guard', type: 'dash_combo', minPhase: 2,
        telegraph: 0.45, delay: 0.15, active: 0.9, recovery: 0.7, cooldown: 1.6,
        range: 3.8, dashDistance: 2.0, dashSpeed: 14, hits: 3, hitInterval: 0.26, hitRadius: 1.8,
        damage: 14, poiseReward: 10,
        motion: { axis: 'z', windup: -0.6, swing: 0.5 },
      },
    ],
  },
  {
    id: 'thunder_swordsman',
    name: '雷呪の高速剣士',
    kana: '紫電ノ曲刃',
    flavor: '盾と曲刀を操り、瞬間移動のごとき速さで間合いを詰める。',
    maxHP: 850, maxPoise: 85,
    moveSpeed: 2.6, turnSpeed: 4.0, scale: 1.1, preferredRange: 2.2,
    colors: { cloth: 0x4b3f5e, trim: 0xe8d94a, shield: 0x3a2f4a, glow: 0xffe14a },
    phase2: { speedMult: 1.3, attackSpeedMult: 1.3, extraAttackIds: ['thunder_slash'] },
    createModel() {
      const body = createHumanoidBase({ skin: 0x8f86a3, cloth: 0x4b3f5e, trim: 0xe8d94a, pants: 0x3a2f4a });
      const s = body.userData.sockets;

      const blade = new THREE.Group();
      const curve1 = boxMesh(0.09, 0.6, 0.03, flatMat(0xc9c2d6));
      curve1.position.y = 0.4;
      curve1.rotation.z = 0.15;
      const curve2 = boxMesh(0.09, 0.6, 0.03, flatMat(0xc9c2d6));
      curve2.position.y = 0.92;
      curve2.rotation.z = 0.4;
      const tip = coneMesh(0.08, 0.2, flatMat(0xc9c2d6), 4);
      tip.position.y = 1.28;
      tip.rotation.z = 0.5;
      const grip = cylMesh(0.05, 0.06, 0.3, flatMat(0x2a2435), 6);
      grip.position.y = -0.1;
      blade.add(curve1, curve2, tip, grip);
      applyOutline(blade);
      s.rightHand.add(blade);

      const shield = new THREE.Group();
      const face = octaMesh(0.3, flatMat(0x3a2f4a));
      face.scale.set(1, 1.3, 0.4);
      const core = sphereMesh(0.09, glowMat(0xe8d94a, 1.2), 6);
      core.position.z = 0.1;
      shield.add(face, core);
      shield.position.set(0, -0.05, 0.12);
      applyOutline(shield);
      s.leftHand.add(shield);

      const auraAnchor = new THREE.Object3D();
      auraAnchor.position.set(0, 0.5, 0);
      s.hips.add(auraAnchor);

      body.userData.auraAnchor = auraAnchor;
      body.userData.tip = tip;
      body.userData.projectileOrigin = s.rightHand;
      return body;
    },
    attacks: [
      {
        id: 'zigzag_combo', name: '紫電五月雨斬り', correctDodge: 'guard', type: 'dash_combo',
        telegraph: 0.5, delay: 0.18, active: 1.1, recovery: 0.7, cooldown: 1.3,
        range: 5.5, dashDistance: 5.0, dashSpeed: 20, hits: 4, hitInterval: 0.22, hitRadius: 2.0,
        damage: 13, poiseReward: 9,
        motion: { axis: 'y', windup: -1.0, swing: 1.4 },
      },
      {
        id: 'lightning_rods', name: '避雷針招来', correctDodge: 'back', type: 'aoe_zone',
        telegraph: 0.8, delay: 0.55, active: 0.3, recovery: 0.6, cooldown: 1.8,
        zoneCount: 3, zoneRadius: 1.6, damage: 28, poiseReward: 16,
        motion: { axis: 'x', windup: -1.6, swing: 0.3 },
      },
      {
        id: 'thunder_slash', name: '雷閃一文字', correctDodge: 'guard', type: 'projectile_volley', minPhase: 2,
        telegraph: 0.4, delay: 0.16, active: 0.5, recovery: 0.6, cooldown: 1.5,
        projectile: { count: 1, interval: 0, speed: 16, radius: 0.3, damage: 24, reflectDamage: 48, color: 0xffe14a },
        poiseReward: 16,
        motion: { axis: 'y', windup: -0.8, swing: 1.0 },
      },
    ],
  },
];

export function getWeapon(id) { return WEAPONS.find((w) => w.id === id); }
export function getBoss(id) { return BOSSES.find((b) => b.id === id); }
