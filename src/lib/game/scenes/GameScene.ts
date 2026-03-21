import * as Phaser from "phaser";

// ─── 상수 ───────────────────────────────────
const WORLD_W = 800;
const WORLD_H = 600;

const PLAYER_SPEED = 160;
const PLAYER_MAX_HP = 100;

const EXP_PER_LEVEL = [0, 10, 25, 45, 70, 100, 140, 190, 250, 320, 400];

// 웨이브별 적 스폰 설정
interface WaveConfig {
  enemyCount: number;
  spawnInterval: number; // ms
  enemyHp: number;
  enemySpeed: number;
  enemyDamage: number;
}

const WAVE_CONFIGS: WaveConfig[] = [
  { enemyCount: 8,  spawnInterval: 1200, enemyHp: 30,  enemySpeed: 60,  enemyDamage: 10 },
  { enemyCount: 12, spawnInterval: 1000, enemyHp: 40,  enemySpeed: 70,  enemyDamage: 12 },
  { enemyCount: 16, spawnInterval: 900,  enemyHp: 55,  enemySpeed: 80,  enemyDamage: 15 },
  { enemyCount: 20, spawnInterval: 800,  enemyHp: 70,  enemySpeed: 90,  enemyDamage: 18 },
  { enemyCount: 25, spawnInterval: 700,  enemyHp: 90,  enemySpeed: 100, enemyDamage: 20 },
];

// ─── 무기 정의 ───────────────────────────────
export interface WeaponConfig {
  id: string;
  name: string;
  emoji: string;
  description: string;
  damage: number;
  cooldown: number;  // ms
  range: number;
  projectileSpeed: number;
  level: number;
}

const BASE_WEAPONS: Omit<WeaponConfig, "level">[] = [
  { id: "hairball",  name: "헤어볼",    emoji: "🐾", description: "가장 가까운 적 추적", damage: 20, cooldown: 800,  range: 300, projectileSpeed: 220 },
  { id: "scratch",   name: "발톱 파동", emoji: "✨", description: "부채꼴 근거리 공격", damage: 15, cooldown: 600,  range: 140, projectileSpeed: 0   },
  { id: "fishbomb",  name: "생선 폭탄", emoji: "🐟", description: "AoE 폭발",           damage: 35, cooldown: 2000, range: 400, projectileSpeed: 180 },
  { id: "whisker",   name: "수염 레이저", emoji: "⚡", description: "직선 관통 빔",     damage: 25, cooldown: 1200, range: 500, projectileSpeed: 400 },
  { id: "meow",      name: "야옹 소닉", emoji: "💫", description: "사방 충격파",         damage: 18, cooldown: 2500, range: 180, projectileSpeed: 160 },
  { id: "nap",       name: "낮잠 오라", emoji: "💤", description: "주변 적 잠재우기",    damage: 5,  cooldown: 3000, range: 150, projectileSpeed: 0   },
];

// ─── 레벨업 카드 옵션 ─────────────────────────
export interface UpgradeOption {
  type: "weapon_new" | "weapon_up" | "passive";
  weaponId?: string;
  passiveId?: string;
  label: string;
  description: string;
  emoji: string;
}

// ─── 이벤트 키 ───────────────────────────────
export const GAME_EVENTS = {
  LEVEL_UP:   "levelup",
  GAME_OVER:  "gameover",
  STATS_UPDATE: "statsupdate",
} as const;

export interface GameStats {
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  expNext: number;
  wave: number;
  kills: number;
  elapsed: number; // 초
  score: number;
}

// ─── GameScene ───────────────────────────────
export default class GameScene extends Phaser.Scene {
  // 플레이어
  private player!: Phaser.GameObjects.Text;
  private playerHp = PLAYER_MAX_HP;
  private playerMaxHp = PLAYER_MAX_HP;
  private playerSpeed = PLAYER_SPEED;
  private invincible = false;

  // 경험치 / 레벨
  private exp = 0;
  private level = 1;

  // 웨이브
  private wave = 1;
  private kills = 0;
  private waveKillsNeeded = WAVE_CONFIGS[0].enemyCount;
  private waveKills = 0;
  private spawnTimer?: Phaser.Time.TimerEvent;

  // 무기
  private equippedWeapons: WeaponConfig[] = [];
  private weaponTimers: Map<string, Phaser.Time.TimerEvent> = new Map();

  // 게임 오브젝트 그룹
  private enemies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private expOrbs!: Phaser.GameObjects.Group;

  // 입력
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private touchX = 0;
  private touchY = 0;
  private isTouching = false;

  // 타이머
  private startTime = 0;
  private elapsed = 0;
  private score = 0;

  // 일시정지 (레벨업 모달 중)
  private paused = false;

  constructor() {
    super({ key: "GameScene" });
  }

  create() {
    this.startTime = this.time.now;
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // 타일 배경 그리드
    this.drawGrid();

    // 그룹 초기화
    this.enemies    = this.add.group();
    this.projectiles = this.add.group();
    this.expOrbs    = this.add.group();

    // 플레이어 생성
    this.player = this.add.text(WORLD_W / 2, WORLD_H / 2, "🐱", {
      fontSize: "36px",
    }).setOrigin(0.5);

    // 시작 무기 장착
    this.equipWeapon("hairball");

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // 터치 입력
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.isTouching = true;
      this.touchX = p.x;
      this.touchY = p.y;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (p.isDown) {
        this.touchX = p.x;
        this.touchY = p.y;
      }
    });
    this.input.on("pointerup", () => { this.isTouching = false; });

    // 첫 웨이브 스폰
    this.startWave(this.wave);

    // 점수 타이머
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.paused) {
          this.elapsed++;
          this.score += this.wave * 2; // 시간 점수
        }
      },
    });
  }

  private drawGrid() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2a4a, 0.4);
    for (let x = 0; x <= WORLD_W; x += 40) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += 40) g.lineBetween(0, y, WORLD_W, y);
  }

  // ─── 웨이브 ───────────────────────────────
  private startWave(waveNum: number) {
    const cfg = WAVE_CONFIGS[Math.min(waveNum - 1, WAVE_CONFIGS.length - 1)];
    this.waveKillsNeeded = cfg.enemyCount + (waveNum - WAVE_CONFIGS.length) * 5;
    this.waveKills = 0;

    this.spawnTimer?.destroy();
    this.spawnTimer = this.time.addEvent({
      delay: cfg.spawnInterval,
      repeat: this.waveKillsNeeded - 1,
      callback: () => {
        if (!this.paused) this.spawnEnemy(cfg);
      },
    });
  }

  private spawnEnemy(cfg: WaveConfig) {
    const side = Phaser.Math.Between(0, 3);
    let x: number, y: number;
    switch (side) {
      case 0: x = Phaser.Math.Between(0, WORLD_W); y = -30;        break;
      case 1: x = WORLD_W + 30;                    y = Phaser.Math.Between(0, WORLD_H); break;
      case 2: x = Phaser.Math.Between(0, WORLD_W); y = WORLD_H+30; break;
      default: x = -30;                             y = Phaser.Math.Between(0, WORLD_H); break;
    }

    const emoji = ["🐭", "🐀", "🐶", "🦅"][Math.min(this.wave - 1, 3)];
    const enemy = this.add.text(x, y, emoji, { fontSize: "28px" }).setOrigin(0.5);
    (enemy as any).hp     = cfg.enemyHp;
    (enemy as any).maxHp  = cfg.enemyHp;
    (enemy as any).speed  = cfg.enemySpeed + Phaser.Math.Between(-10, 10);
    (enemy as any).damage = cfg.enemyDamage;
    this.enemies.add(enemy);
  }

  // ─── 무기 장착 ────────────────────────────
  private equipWeapon(id: string) {
    const base = BASE_WEAPONS.find(w => w.id === id);
    if (!base) return;
    const weapon: WeaponConfig = { ...base, level: 1 };
    this.equippedWeapons.push(weapon);
    this.startWeaponTimer(weapon);
  }

  private startWeaponTimer(weapon: WeaponConfig) {
    this.weaponTimers.get(weapon.id)?.destroy();
    const timer = this.time.addEvent({
      delay: weapon.cooldown,
      loop: true,
      callback: () => {
        if (!this.paused) this.fireWeapon(weapon);
      },
    });
    this.weaponTimers.set(weapon.id, timer);
  }

  private fireWeapon(weapon: WeaponConfig) {
    switch (weapon.id) {
      case "hairball":  this.fireTracking(weapon);  break;
      case "scratch":   this.fireFan(weapon);        break;
      case "fishbomb":  this.fireBomb(weapon);       break;
      case "whisker":   this.fireBeam(weapon);       break;
      case "meow":      this.firePulse(weapon);      break;
      case "nap":       this.fireAura(weapon);       break;
    }
  }

  private fireTracking(w: WeaponConfig) {
    const target = this.getNearestEnemy();
    if (!target) return;
    const proj = this.add.text(this.player.x, this.player.y, "🐾", {
      fontSize: "20px",
    }).setOrigin(0.5);
    (proj as any).damage  = w.damage;
    (proj as any).targetX = target.x;
    (proj as any).targetY = target.y;
    (proj as any).speed   = w.projectileSpeed;
    (proj as any).type    = "tracking";
    this.projectiles.add(proj);
  }

  private fireFan(w: WeaponConfig) {
    const angles = [-40, -20, 0, 20, 40];
    const base = this.getAngleToNearest() ?? 0;
    angles.forEach(offset => {
      const rad = Phaser.Math.DegToRad(base + offset);
      const proj = this.add.text(this.player.x, this.player.y, "✨", {
        fontSize: "16px",
      }).setOrigin(0.5);
      (proj as any).damage = w.damage;
      (proj as any).vx     = Math.cos(rad) * 300;
      (proj as any).vy     = Math.sin(rad) * 300;
      (proj as any).type   = "linear";
      (proj as any).maxDist = w.range;
      (proj as any).traveled = 0;
      this.projectiles.add(proj);
    });
  }

  private fireBomb(w: WeaponConfig) {
    const target = this.getNearestEnemy();
    if (!target) return;
    const proj = this.add.text(this.player.x, this.player.y, "🐟", {
      fontSize: "24px",
    }).setOrigin(0.5);
    (proj as any).damage  = w.damage;
    (proj as any).targetX = target.x;
    (proj as any).targetY = target.y;
    (proj as any).speed   = w.projectileSpeed;
    (proj as any).type    = "bomb";
    (proj as any).explodeRange = 80;
    this.projectiles.add(proj);
  }

  private fireBeam(w: WeaponConfig) {
    const angle = this.getAngleToNearest() ?? 0;
    const rad = Phaser.Math.DegToRad(angle);
    const proj = this.add.text(this.player.x, this.player.y, "⚡", {
      fontSize: "20px",
    }).setOrigin(0.5);
    (proj as any).damage   = w.damage;
    (proj as any).vx       = Math.cos(rad) * w.projectileSpeed;
    (proj as any).vy       = Math.sin(rad) * w.projectileSpeed;
    (proj as any).type     = "piercing";
    (proj as any).maxDist  = w.range;
    (proj as any).traveled = 0;
    (proj as any).hit      = new Set();
    this.projectiles.add(proj);
  }

  private firePulse(w: WeaponConfig) {
    for (let i = 0; i < 8; i++) {
      const rad = Phaser.Math.DegToRad(i * 45);
      const proj = this.add.text(this.player.x, this.player.y, "💫", {
        fontSize: "18px",
      }).setOrigin(0.5);
      (proj as any).damage   = w.damage;
      (proj as any).vx       = Math.cos(rad) * w.projectileSpeed;
      (proj as any).vy       = Math.sin(rad) * w.projectileSpeed;
      (proj as any).type     = "linear";
      (proj as any).maxDist  = w.range;
      (proj as any).traveled = 0;
      this.projectiles.add(proj);
    }
  }

  private fireAura(w: WeaponConfig) {
    // 범위 내 모든 적에게 즉시 데미지
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist <= w.range) {
        this.hitEnemy(e, w.damage * 0.5);
        // 잠재우기 이펙트
        e.setAlpha(0.5);
        this.time.delayedCall(1500, () => e.setAlpha(1));
      }
    });
  }

  // ─── 유틸 ─────────────────────────────────
  private getNearestEnemy(): Phaser.GameObjects.Text | null {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    if (!enemies.length) return null;
    return enemies.reduce((a, b) => {
      const da = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
      const db = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
      return da < db ? a : b;
    });
  }

  private getAngleToNearest(): number | null {
    const target = this.getNearestEnemy();
    if (!target) return null;
    return Phaser.Math.Angle.Between(
      this.player.x, this.player.y, target.x, target.y
    ) * (180 / Math.PI);
  }

  // ─── 적 처치 ──────────────────────────────
  private hitEnemy(enemy: Phaser.GameObjects.Text, damage: number) {
    (enemy as any).hp -= damage;
    // 피격 이펙트
    this.tweens.add({
      targets: enemy,
      scaleX: 1.3, scaleY: 1.3,
      duration: 80,
      yoyo: true,
    });

    if ((enemy as any).hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: Phaser.GameObjects.Text) {
    // 경험치 오브 드랍
    const orb = this.add.text(enemy.x, enemy.y, "⭐", {
      fontSize: "16px",
    }).setOrigin(0.5);
    (orb as any).value = 3 + this.wave;
    this.expOrbs.add(orb);

    this.kills++;
    this.waveKills++;
    this.score += 10 * this.wave;

    enemy.destroy();

    // 웨이브 클리어 체크
    if (this.waveKills >= this.waveKillsNeeded) {
      this.time.delayedCall(1000, () => {
        this.wave++;
        this.startWave(this.wave);
      });
    }
  }

  // ─── 경험치 / 레벨업 ─────────────────────
  private gainExp(amount: number) {
    this.exp += amount;
    const nextExp = EXP_PER_LEVEL[Math.min(this.level, EXP_PER_LEVEL.length - 1)];
    if (this.exp >= nextExp) {
      this.exp -= nextExp;
      this.level++;
      this.triggerLevelUp();
    }
  }

  private triggerLevelUp() {
    this.paused = true;
    const options = this.buildUpgradeOptions();
    this.events.emit(GAME_EVENTS.LEVEL_UP, options);
  }

  private buildUpgradeOptions(): UpgradeOption[] {
    const opts: UpgradeOption[] = [];
    const equipped = new Set(this.equippedWeapons.map(w => w.id));

    // 새 무기 추가 (미장착 중에서)
    const newWeapons = BASE_WEAPONS.filter(w => !equipped.has(w.id));
    const pick = Phaser.Utils.Array.Shuffle([...newWeapons]).slice(0, 2);
    pick.forEach(w => {
      opts.push({
        type: "weapon_new",
        weaponId: w.id,
        label: w.name,
        description: w.description,
        emoji: w.emoji,
      });
    });

    // 기존 무기 강화
    if (this.equippedWeapons.length > 0) {
      const upgrade = Phaser.Utils.Array.GetRandom(this.equippedWeapons);
      opts.push({
        type: "weapon_up",
        weaponId: upgrade.id,
        label: `${upgrade.name} 강화`,
        description: `데미지 +25%, 쿨다운 -10%`,
        emoji: upgrade.emoji,
      });
    }

    return Phaser.Utils.Array.Shuffle(opts).slice(0, 3);
  }

  /** 외부(React)에서 레벨업 선택 후 호출 */
  public applyUpgrade(option: UpgradeOption) {
    if (option.type === "weapon_new" && option.weaponId) {
      this.equipWeapon(option.weaponId);
    } else if (option.type === "weapon_up" && option.weaponId) {
      const w = this.equippedWeapons.find(x => x.id === option.weaponId);
      if (w) {
        w.damage   = Math.round(w.damage * 1.25);
        w.cooldown = Math.round(w.cooldown * 0.9);
        this.startWeaponTimer(w);
      }
    }
    this.paused = false;
  }

  // ─── 플레이어 피격 ────────────────────────
  private takeDamage(damage: number) {
    if (this.invincible) return;
    this.playerHp -= damage;
    this.invincible = true;

    // 무적 시간 0.5초
    this.time.delayedCall(500, () => { this.invincible = false; });

    // 피격 이펙트
    this.cameras.main.shake(150, 0.005);

    if (this.playerHp <= 0) {
      this.playerHp = 0;
      this.triggerGameOver();
    }
  }

  private triggerGameOver() {
    this.paused = true;
    this.spawnTimer?.destroy();
    this.weaponTimers.forEach(t => t.destroy());
    this.events.emit(GAME_EVENTS.GAME_OVER, {
      score: this.score,
      wave_reached: this.wave,
      duration_sec: this.elapsed,
      weapons_used: this.equippedWeapons.map(w => w.id),
      killed_count: this.kills,
    } satisfies import("@/lib/game/api").GameRunPayload);
  }

  // ─── 업데이트 ─────────────────────────────
  update(_time: number, delta: number) {
    if (this.paused) return;

    const dt = delta / 1000;
    this.movePlayer(dt);
    this.moveEnemies(dt);
    this.moveProjectiles(dt);
    this.collectOrbs();
    this.checkEnemyPlayerCollision();
    this.emitStats();
  }

  private movePlayer(dt: number) {
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy -= 1;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy += 1;

    // 터치 방향
    if (this.isTouching) {
      const dx = this.touchX - this.player.x;
      const dy = this.touchY - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 20) {
        vx = dx / dist;
        vy = dy / dist;
      }
    }

    // 정규화
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) { vx /= len; vy /= len; }

    this.player.x = Phaser.Math.Clamp(this.player.x + vx * this.playerSpeed * dt, 20, WORLD_W - 20);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy * this.playerSpeed * dt, 20, WORLD_H - 20);
  }

  private moveEnemies(dt: number) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    enemies.forEach(e => {
      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        e.x += (dx / dist) * (e as any).speed * dt;
        e.y += (dy / dist) * (e as any).speed * dt;
      }
    });
  }

  private moveProjectiles(dt: number) {
    const projs = this.projectiles.getChildren() as Phaser.GameObjects.Text[];
    projs.forEach(p => {
      const type = (p as any).type;

      if (type === "tracking") {
        const tx = (p as any).targetX;
        const ty = (p as any).targetY;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) {
          this.explodeProjectile(p);
          return;
        }
        const speed = (p as any).speed;
        p.x += (dx / dist) * speed * dt;
        p.y += (dy / dist) * speed * dt;
        this.checkProjectileHit(p, false);
      } else if (type === "linear" || type === "piercing") {
        const vx = (p as any).vx;
        const vy = (p as any).vy;
        p.x += vx * dt;
        p.y += vy * dt;
        (p as any).traveled += Math.sqrt(vx * vx + vy * vy) * dt;
        if ((p as any).traveled > (p as any).maxDist) {
          p.destroy();
          this.projectiles.remove(p);
          return;
        }
        this.checkProjectileHit(p, type === "piercing");
      } else if (type === "bomb") {
        const tx = (p as any).targetX;
        const ty = (p as any).targetY;
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          this.explodeBomb(p);
          return;
        }
        const speed = (p as any).speed;
        p.x += (dx / dist) * speed * dt;
        p.y += (dy / dist) * speed * dt;
      }

      // 화면 밖 제거
      if (p.x < -50 || p.x > WORLD_W + 50 || p.y < -50 || p.y > WORLD_H + 50) {
        p.destroy();
        this.projectiles.remove(p);
      }
    });
  }

  private checkProjectileHit(proj: Phaser.GameObjects.Text, piercing: boolean) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    const hitSet: Set<Phaser.GameObjects.Text> = (proj as any).hit ?? new Set();
    enemies.forEach(e => {
      if (hitSet.has(e)) return;
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < 28) {
        this.hitEnemy(e, (proj as any).damage);
        if (!piercing) {
          proj.destroy();
          this.projectiles.remove(proj);
        } else {
          hitSet.add(e);
        }
      }
    });
  }

  private explodeProjectile(proj: Phaser.GameObjects.Text) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < 40) this.hitEnemy(e, (proj as any).damage);
    });
    proj.destroy();
    this.projectiles.remove(proj);
  }

  private explodeBomb(proj: Phaser.GameObjects.Text) {
    const range = (proj as any).explodeRange;
    const damage = (proj as any).damage;
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < range) this.hitEnemy(e, damage);
    });
    // 폭발 이펙트
    const fx = this.add.text(proj.x, proj.y, "💥", { fontSize: "40px" }).setOrigin(0.5);
    this.tweens.add({
      targets: fx,
      scaleX: 2, scaleY: 2,
      alpha: 0,
      duration: 400,
      onComplete: () => fx.destroy(),
    });
    proj.destroy();
    this.projectiles.remove(proj);
  }

  private collectOrbs() {
    const orbs = this.expOrbs.getChildren() as Phaser.GameObjects.Text[];
    orbs.forEach(orb => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, orb.x, orb.y);
      if (dist < 40) {
        this.gainExp((orb as any).value);
        orb.destroy();
        this.expOrbs.remove(orb);
      }
      // 오브 자석 (레벨 5+ 시 거리 증가 예정)
    });
  }

  private checkEnemyPlayerCollision() {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Text[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist < 32) {
        this.takeDamage((e as any).damage);
      }
    });
  }

  private emitStats() {
    const expIdx = Math.min(this.level, EXP_PER_LEVEL.length - 1);
    this.events.emit(GAME_EVENTS.STATS_UPDATE, {
      hp:      this.playerHp,
      maxHp:   this.playerMaxHp,
      level:   this.level,
      exp:     this.exp,
      expNext: EXP_PER_LEVEL[expIdx],
      wave:    this.wave,
      kills:   this.kills,
      elapsed: this.elapsed,
      score:   this.score,
    } satisfies GameStats);
  }
}
