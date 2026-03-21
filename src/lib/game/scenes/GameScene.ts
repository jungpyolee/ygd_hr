import * as Phaser from "phaser";

// ─── 상수 ───────────────────────────────────
const VIEWPORT_W = 800;
const VIEWPORT_H = 600;

const SPAWN_RADIUS_MIN = 560;  // 플레이어 기준 스폰 최소 거리
const SPAWN_RADIUS_MAX = 720;  // 플레이어 기준 스폰 최대 거리
const MAX_PROJ_DIST    = 650;  // 투사체 플레이어 기준 최대 거리

const PLAYER_SPEED = 160;
const PLAYER_MAX_HP = 100;

const EXP_PER_LEVEL = [0, 15, 35, 65, 105, 160, 230, 320, 430, 560, 720];

// ─── 게임 설정 (캐릭터 타입 + 상점 버프) ───────
export interface GameConfig {
  catType: "persian" | "scottish" | "abyssinian" | "munchkin";
  buffs: {
    hpBonus: number;           // 시작 HP 추가량 (기본 0)
    damageMulti: number;       // 공격력 배율 (기본 1.0)
    attackSpeedMulti: number;  // 공격속도 배율 (기본 1.0)
    moveSpeedMulti: number;    // 이동속도 배율 (기본 1.0)
    expMulti: number;          // EXP 배율 (기본 1.0)
    coinPickupRange: number;   // 픽업 반경 (기본 60)
    coinDropBonus: number;     // 코인 드랍 추가 확률 (기본 0)
    hasRevive: boolean;        // 부활 목걸이
    hasPiercing: boolean;      // 관통력
    startProjectiles: number;  // 시작 투사체 수 (기본 1, 먼치킨 2)
    healMulti: number;         // 레벨업 회복 배율 (기본 1.0)
  };
}

const DEFAULT_CONFIG: GameConfig = {
  catType: "persian",
  buffs: {
    hpBonus: 0,
    damageMulti: 1.0,
    attackSpeedMulti: 1.0,
    moveSpeedMulti: 1.0,
    expMulti: 1.0,
    coinPickupRange: 60,
    coinDropBonus: 0,
    hasRevive: false,
    hasPiercing: false,
    startProjectiles: 1,
    healMulti: 1.0,
  },
};

// ─── 적 타입 ────────────────────────────────
type EnemyType = "rat" | "fast_rat" | "fat_rat" | "ranged_rat" | "ghost_rat";
type BossType  = "boss_king" | "boss_wizard" | "boss_twins";

// 보스 상태 (React에 전달)
export interface BossStatus {
  name: string;
  hp: number;
  maxHp: number;
  emoji: string;
}

// 일반 적 스펙 — 다과의 습격
const ENEMY_SPECS: Record<EnemyType, { textureKey: string; name: string; hp: number; speed: number; damage: number; scale: number }> = {
  rat:        { textureKey: "daegwa_yakgwa",   name: "약과",     hp: 18,  speed: 70,  damage: 4,  scale: 1.0 },
  fast_rat:   { textureKey: "daegwa_omija",    name: "오미자청", hp: 12,  speed: 130, damage: 3,  scale: 0.8 },
  fat_rat:    { textureKey: "daegwa_yanggang", name: "왕양갱",   hp: 55,  speed: 45,  damage: 6,  scale: 1.3 },
  ranged_rat: { textureKey: "daegwa_jujube",   name: "대추탄",   hp: 20,  speed: 50,  damage: 4,  scale: 0.9 },
  ghost_rat:  { textureKey: "daegwa_juak",     name: "유령주악", hp: 25,  speed: 90,  damage: 5,  scale: 1.0 },
};

// 보스 스펙
const BOSS_SPECS: Record<BossType, { textureKey: string; name: string; hp: number; speed: number; damage: number; scale: number }> = {
  boss_king:   { textureKey: "daegwa_kumquat",  name: "금귤 대왕",       hp: 400, speed: 60,  damage: 8,  scale: 2.5 },
  boss_wizard: { textureKey: "daegwa_dasik",    name: "다식 술사",       hp: 350, speed: 50,  damage: 7,  scale: 2.0 },
  boss_twins:  { textureKey: "daegwa_pecan",    name: "피칸&호두 쌍둥이", hp: 250, speed: 80,  damage: 7,  scale: 1.8 },
};
const BOSS_TWINS_TEXTURE2 = "daegwa_walnut";

// 웨이브별 적 구성
function getEnemyTypesForWave(wave: number): EnemyType[] {
  const types: EnemyType[] = ["rat"];
  if (wave >= 3)  types.push("fast_rat");
  if (wave >= 5)  types.push("fat_rat");
  if (wave >= 7)  types.push("ranged_rat");
  if (wave >= 10) types.push("ghost_rat");
  return types;
}

// 웨이브 스케일링 계수
function getWaveScale(wave: number): number {
  return 1 + (wave - 1) * 0.15;
}

// 웨이브별 스폰 카운트
function getSpawnCount(wave: number): number {
  const base = (12 + wave * 6) * 3;
  return Math.min(base, 150);
}

// 웨이브별 스폰 인터벌
function getSpawnInterval(wave: number): number {
  return Math.max(200, 800 - wave * 30);
}

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
  { id: "hairball",  name: "헤어볼",      emoji: "🐾", description: "가장 가까운 적 추적", damage: 20, cooldown: 800,  range: 300, projectileSpeed: 220 },
  { id: "scratch",   name: "발톱 파동",   emoji: "✨", description: "부채꼴 근거리 공격", damage: 15, cooldown: 600,  range: 140, projectileSpeed: 0   },
  { id: "fishbomb",  name: "생선 폭탄",   emoji: "🐟", description: "AoE 폭발",           damage: 35, cooldown: 2000, range: 400, projectileSpeed: 180 },
  { id: "whisker",   name: "수염 레이저", emoji: "⚡", description: "직선 관통 빔",       damage: 25, cooldown: 1200, range: 500, projectileSpeed: 400 },
  { id: "meow",      name: "야옹 소닉",   emoji: "💫", description: "사방 충격파",         damage: 18, cooldown: 2500, range: 180, projectileSpeed: 160 },
  { id: "nap",       name: "낮잠 오라",   emoji: "💤", description: "주변 적 잠재우기",    damage: 5,  cooldown: 3000, range: 150, projectileSpeed: 0   },
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
  LEVEL_UP:     "levelup",
  GAME_OVER:    "gameover",
  STATS_UPDATE: "statsupdate",
  BOSS_START:   "bossstart",
  BOSS_END:     "bossend",
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
  coins: number;
  nextBossIn: number; // 다음 보스까지 남은 웨이브 수
  boss: BossStatus | null;
}

// ─── GameScene ───────────────────────────────
export default class GameScene extends Phaser.Scene {
  // 게임 설정
  private config: GameConfig;

  // 플레이어
  private player!: Phaser.GameObjects.Text;
  private playerHp = PLAYER_MAX_HP;
  private playerMaxHp = PLAYER_MAX_HP;
  private playerSpeed = PLAYER_SPEED;
  private invincible = false;
  private reviveUsed = false;

  // 경험치 / 레벨
  private exp = 0;
  private level = 1;

  // 웨이브
  private wave = 1;
  private kills = 0;
  private waveKillsNeeded = 0;
  private waveKills = 0;
  private waveClearing = false;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private isBossWave = false;

  // 보스
  private currentBoss: Phaser.GameObjects.Image | null = null;
  private bossType: BossType | null = null;
  private bossHp = 0;
  private bossMaxHp = 0;
  private bossPhase2 = false;
  private bossCharging = false;
  private bossChargeTimer?: Phaser.Time.TimerEvent;
  private bossWizardTimer?: Phaser.Time.TimerEvent;
  private bossStatus: BossStatus | null = null;
  private bossHpGraphics?: Phaser.GameObjects.Graphics;

  // 코인
  private coinsThisRun = 0;
  private coinOrbs!: Phaser.GameObjects.Group;

  // 무기
  private equippedWeapons: WeaponConfig[] = [];
  private weaponTimers: Map<string, Phaser.Time.TimerEvent> = new Map();

  // 게임 오브젝트 그룹
  private floorTile!: Phaser.GameObjects.TileSprite;
  private enemies!: Phaser.GameObjects.Group;
  private projectiles!: Phaser.GameObjects.Group;
  private expOrbs!: Phaser.GameObjects.Group;

  // 입력 — 키보드
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;

  // 입력 — 가상 조이스틱
  private joyBase!: Phaser.GameObjects.Graphics;
  private joyKnob!: Phaser.GameObjects.Graphics;
  private joyActive    = false;
  private joyBaseX     = 0;
  private joyBaseY     = 0;
  private joyDirX      = 0;
  private joyDirY      = 0;
  private joyPointerId = -1;

  // 타이머
  private startTime = 0;
  private elapsed = 0;
  private score = 0;

  // 일시정지 (레벨업 모달 중)
  private paused = false;

  constructor(config?: GameConfig) {
    super({ key: "GameScene" });
    this.config = config ?? DEFAULT_CONFIG;
  }

  preload() {
    this.load.svg("daegwa_yakgwa",   "/daegwa/02-yakgwa.svg");
    this.load.svg("daegwa_omija",    "/daegwa/08-omija.svg");
    this.load.svg("daegwa_yanggang", "/daegwa/07-yanggang.svg");
    this.load.svg("daegwa_jujube",   "/daegwa/10-jujube.svg");
    this.load.svg("daegwa_juak",     "/daegwa/03-juak.svg");
    this.load.svg("daegwa_kumquat",  "/daegwa/01-kumquat.svg");
    this.load.svg("daegwa_dasik",    "/daegwa/06-dasik.svg");
    this.load.svg("daegwa_pecan",    "/daegwa/04-pecan.svg");
    this.load.svg("daegwa_walnut",   "/daegwa/05-walnut.svg");
    this.load.svg("game_coin",       "/game/coin.svg");
    this.load.svg("game_exp",        "/game/exp-orb.svg");
  }

  create() {
    this.startTime = this.time.now;
    this.cameras.main.setBackgroundColor("#c8935a");
    this.cameras.main.setBounds(-100000, -100000, 200000, 200000);

    // config 기반 초기화
    const catEmojis: Record<GameConfig["catType"], string> = {
      persian:    "🐱",
      scottish:   "😺",
      abyssinian: "😸",
      munchkin:   "🐈",
    };

    // 배경 레이어
    this.drawFloor();
    this.drawDecorations();

    // 그룹 초기화
    this.enemies     = this.add.group();
    this.projectiles = this.add.group();
    this.expOrbs     = this.add.group();
    this.coinOrbs    = this.add.group();

    // HP 설정
    this.playerMaxHp = PLAYER_MAX_HP + this.config.buffs.hpBonus;
    this.playerHp    = this.playerMaxHp;

    // 이동속도 설정
    this.playerSpeed = PLAYER_SPEED * this.config.buffs.moveSpeedMulti;

    // 부활 초기화
    this.reviveUsed = false;

    // 플레이어 생성
    this.player = this.add.text(0, 0, catEmojis[this.config.catType], {
      fontSize: "36px",
      padding: { x: 2, y: 8 },
    }).setOrigin(0.5);

    // 카메라 추적
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // 시작 무기 장착
    this.equipWeapon("hairball");
    // 먼치킨: 투사체 2개 (scratch 추가 장착으로 표현)
    if (this.config.catType === "munchkin" && this.config.buffs.startProjectiles >= 2) {
      this.equipWeapon("scratch");
    }

    // 입력
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // 가상 조이스틱
    this.setupJoystick();

    // 터치 입력
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.joyActive) return;
      this.joyActive    = true;
      this.joyPointerId = p.pointerId ?? 0;
      this.joyBaseX     = p.x;
      this.joyBaseY     = p.y;
      this.joyDirX      = 0;
      this.joyDirY      = 0;
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.joyActive || p.pointerId !== this.joyPointerId) return;
      const dx   = p.x - this.joyBaseX;
      const dy   = p.y - this.joyBaseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const MAX  = 60;
      if (dist < 8) {
        this.joyDirX = 0;
        this.joyDirY = 0;
        this.joyKnob.setPosition(this.joyBaseX, this.joyBaseY);
      } else {
        this.joyDirX = dx / dist;
        this.joyDirY = dy / dist;
        const clamp = Math.min(dist, MAX);
        this.joyKnob.setPosition(
          this.joyBaseX + this.joyDirX * clamp,
          this.joyBaseY + this.joyDirY * clamp,
        );
      }
    });

    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.pointerId !== this.joyPointerId) return;
      this.joyActive = false;
      this.joyDirX   = 0;
      this.joyDirY   = 0;
      this.joyBase.setVisible(false);
      this.joyKnob.setVisible(false);
    });

    // 첫 웨이브
    this.startWave(this.wave);

    // 점수 타이머
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!this.paused) {
          this.elapsed++;
          this.score += this.wave * 2;
        }
      },
    });
  }

  /** 마루바닥 — TileSprite 기반 무한 타일링 */
  private drawFloor() {
    const tg = this.make.graphics({ x: 0, y: 0 });
    tg.fillStyle(0xc8935a, 1);
    tg.fillRect(0, 0, 160, 40);
    tg.fillStyle(0x7a4f28, 0.55);
    tg.fillRect(0, 0, 160, 2);
    tg.fillStyle(0xd4a06a, 0.2);
    tg.fillRect(22, 4, 3, 32);
    tg.fillRect(78, 7, 2, 26);
    tg.fillStyle(0xffffff, 0.03);
    tg.fillRect(0, 0, 160, 18);
    tg.generateTexture("plank", 160, 40);
    tg.destroy();
    this.floorTile = this.add
      .tileSprite(0, 0, VIEWPORT_W, VIEWPORT_H, "plank")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-1);
  }

  /** 배경 장식 */
  private drawDecorations() {
    const decos = ["🪴", "🧹", "📦", "🪣", "🗑️", "🪑", "🌿", "🪨"];
    const RANGE = 800;
    const count = 30;
    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      do {
        x = Phaser.Math.Between(-RANGE, RANGE);
        y = Phaser.Math.Between(-RANGE, RANGE);
      } while (Math.abs(x) < 110 && Math.abs(y) < 110);
      const emoji = decos[Math.floor(Math.random() * decos.length)];
      this.add.text(x, y, emoji, {
        fontSize: `${Phaser.Math.Between(16, 24)}px`,
      } as Phaser.Types.GameObjects.Text.TextStyle)
        .setOrigin(0.5)
        .setAlpha(0.45)
        .setDepth(0);
    }
  }

  // ─── 가상 조이스틱 ────────────────────────
  private setupJoystick() {
    const BASE_R = 60;
    const KNOB_R = 24;
    this.joyBase = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(500)
      .setVisible(false);
    this.joyBase.lineStyle(2.5, 0xffffff, 0.45);
    this.joyBase.strokeCircle(0, 0, BASE_R);
    this.joyBase.fillStyle(0xffffff, 0.08);
    this.joyBase.fillCircle(0, 0, BASE_R);
    this.joyKnob = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(501)
      .setVisible(false);
    this.joyKnob.fillStyle(0xffffff, 0.55);
    this.joyKnob.fillCircle(0, 0, KNOB_R);
    this.joyKnob.lineStyle(2, 0xffffff, 0.8);
    this.joyKnob.strokeCircle(0, 0, KNOB_R);
  }

  // ─── 웨이브 ───────────────────────────────
  private startWave(waveNum: number) {
    this.waveClearing = false;
    this.isBossWave   = waveNum % 5 === 0;

    if (this.isBossWave) {
      // 보스 웨이브
      this.waveKillsNeeded = 1;
      this.waveKills       = 0;
      this.spawnTimer?.destroy();
      this.time.delayedCall(500, () => this.spawnBoss(waveNum));
    } else {
      // 일반 웨이브
      const spawnCount = getSpawnCount(waveNum);
      const spawnInterval = getSpawnInterval(waveNum);
      this.waveKillsNeeded = spawnCount;
      this.waveKills       = 0;
      this.spawnTimer?.destroy();
      this.spawnTimer = this.time.addEvent({
        delay: spawnInterval,
        repeat: spawnCount - 1,
        callback: () => this.spawnEnemyForWave(waveNum),
      });
    }

    // 웨이브 클리어 보너스 코인 (웨이브 1부터 적용)
    if (waveNum > 1) {
      this.coinsThisRun += waveNum - 1;
    }
  }

  private spawnEnemyForWave(waveNum: number) {
    const types     = getEnemyTypesForWave(waveNum);
    const enemyType = types[Math.floor(Math.random() * types.length)];
    const spec      = ENEMY_SPECS[enemyType];
    const scale     = getWaveScale(waveNum);

    const angle  = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const radius = Phaser.Math.FloatBetween(SPAWN_RADIUS_MIN, SPAWN_RADIUS_MAX);
    const x = this.player.x + Math.cos(angle) * radius;
    const y = this.player.y + Math.sin(angle) * radius;

    const displaySize = Math.round(32 * spec.scale);
    const enemy = this.add.image(x, y, spec.textureKey);
    enemy.setDisplaySize(displaySize, displaySize);

    const scaledHp     = Math.round(spec.hp * scale);
    const scaledSpeed  = Math.round(spec.speed * (1 + (waveNum - 1) * 0.05));
    const scaledDamage = Math.round(spec.damage * scale); // damage already /3 in spec

    (enemy as any).hp         = scaledHp;
    (enemy as any).maxHp      = scaledHp;
    (enemy as any).speed      = scaledSpeed + Phaser.Math.Between(-5, 5);
    (enemy as any).damage     = scaledDamage;
    (enemy as any).type       = enemyType;

    if (enemyType === "ghost_rat") {
      (enemy as any).ghostTimer = 0;
    }
    if (enemyType === "ranged_rat") {
      (enemy as any).rangedCooldown = 0;
    }

    this.enemies.add(enemy);
  }

  // ─── 보스 스폰 ───────────────────────────
  private spawnBoss(waveNum: number) {
    const bossTypes: BossType[] = ["boss_king", "boss_wizard", "boss_twins"];
    const bossIdx = Math.floor((waveNum / 5 - 1) % bossTypes.length);
    const bossType = bossTypes[bossIdx];
    const spec = BOSS_SPECS[bossType];
    const scale = getWaveScale(waveNum);

    const angle  = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const radius = SPAWN_RADIUS_MIN + 100;
    const x = this.player.x + Math.cos(angle) * radius;
    const y = this.player.y + Math.sin(angle) * radius;

    const scaledHp = Math.round(spec.hp * scale);

    if (bossType === "boss_twins") {
      // 쌍둥이: 2마리 스폰
      this.spawnSingleBoss(bossType, x, y, scaledHp, spec);
      this.spawnSingleBoss(bossType, x + 80, y + 80, scaledHp, spec, BOSS_TWINS_TEXTURE2);
    } else {
      this.spawnSingleBoss(bossType, x, y, scaledHp, spec);
    }

    this.bossType   = bossType;
    this.bossHp     = bossType === "boss_twins" ? scaledHp * 2 : scaledHp;
    this.bossMaxHp  = this.bossHp;
    this.bossPhase2 = false;
    const bossEmoji: Record<BossType, string> = {
      boss_king:   "🍊",
      boss_wizard: "🍡",
      boss_twins:  "🥜",
    };
    this.bossStatus = {
      name:  spec.name,
      hp:    this.bossHp,
      maxHp: this.bossMaxHp,
      emoji: bossEmoji[bossType],
    };

    this.events.emit(GAME_EVENTS.BOSS_START, this.bossStatus);

    // 보스 HP 바 그래픽 생성
    this.bossHpGraphics?.destroy();
    this.bossHpGraphics = this.add.graphics().setDepth(15);

    // 마법사 기믹: 4초마다 8방향 투사체
    if (bossType === "boss_wizard") {
      this.bossWizardTimer?.destroy();
      this.bossWizardTimer = this.time.addEvent({
        delay: 4000,
        loop: true,
        callback: () => {
          if (!this.paused && this.currentBoss) this.bossWizardShoot();
        },
      });
    }

    // 킹 기믹: 5초마다 돌진 체크 타이머
    if (bossType === "boss_king") {
      this.bossChargeTimer?.destroy();
      this.bossChargeTimer = this.time.addEvent({
        delay: 5000,
        loop: true,
        callback: () => {
          if (!this.paused && this.currentBoss && !this.bossPhase2) {
            // HP 50% 이하 시 phase2
            if (this.bossHp <= this.bossMaxHp * 0.5) {
              this.bossPhase2 = true;
            }
          }
          if (!this.paused && this.currentBoss && this.bossPhase2) {
            this.startBossCharge();
          }
        },
      });
    }
  }

  private spawnSingleBoss(bossType: BossType, x: number, y: number, hp: number, spec: typeof BOSS_SPECS[BossType], textureOverride?: string) {
    const textureKey = textureOverride ?? spec.textureKey;
    const displaySize = Math.round(60 * spec.scale);
    const boss = this.add.image(x, y, textureKey);
    boss.setDisplaySize(displaySize, displaySize);

    (boss as any).hp         = hp;
    (boss as any).maxHp      = hp;
    (boss as any).speed      = spec.speed;
    (boss as any).damage     = spec.damage;
    (boss as any).type       = bossType;
    (boss as any).isBoss     = true;

    this.enemies.add(boss);
    if (!this.currentBoss) {
      this.currentBoss = boss;
    }
  }

  private startBossCharge() {
    if (!this.currentBoss) return;
    this.bossCharging = true;
    const origSpeed = BOSS_SPECS.boss_king.speed;
    (this.currentBoss as any).speed = origSpeed * 3;
    this.time.delayedCall(1500, () => {
      this.bossCharging = false;
      if (this.currentBoss) (this.currentBoss as any).speed = BOSS_SPECS.boss_king.speed;
    });
  }

  private bossWizardShoot() {
    if (!this.currentBoss) return;
    for (let i = 0; i < 8; i++) {
      const rad = Phaser.Math.DegToRad(i * 45);
      const proj = this.add.text(this.currentBoss.x, this.currentBoss.y, "🔥", {
        fontSize: "16px",
      }).setOrigin(0.5);
      (proj as any).damage   = BOSS_SPECS.boss_wizard.damage * 0.5;
      (proj as any).vx       = Math.cos(rad) * 200;
      (proj as any).vy       = Math.sin(rad) * 200;
      (proj as any).type     = "boss_proj";
      (proj as any).maxDist  = 400;
      (proj as any).traveled = 0;
      (proj as any).isBossProj = true;
      this.projectiles.add(proj);
    }
  }

  private killBoss(boss: Phaser.GameObjects.Image) {
    // 코인 3~5 드랍
    const coinCount = Phaser.Math.Between(3, 5);
    for (let i = 0; i < coinCount; i++) {
      this.dropCoin(boss.x + Phaser.Math.Between(-30, 30), boss.y + Phaser.Math.Between(-30, 30));
    }

    this.bossHpGraphics?.destroy();
    this.bossHpGraphics = undefined;
    this.bossWizardTimer?.destroy();
    this.bossChargeTimer?.destroy();
    this.currentBoss = null;
    this.bossStatus  = null;

    this.enemies.remove(boss);
    boss.destroy();

    this.events.emit(GAME_EVENTS.BOSS_END);

    // waveKills 처리
    this.waveKills++;
    if (!this.waveClearing && this.waveKills >= this.waveKillsNeeded) {
      this.waveClearing = true;
      // 보스 처치 코인 별도 추가 (killEnemy에서 드랍하지 않으므로)
      this.coinsThisRun += coinCount;
      this.time.delayedCall(2000, () => {
        this.wave++;
        this.startWave(this.wave);
      });
    }
  }

  // ─── 무기 장착 ────────────────────────────
  private equipWeapon(id: string) {
    const base = BASE_WEAPONS.find(w => w.id === id);
    if (!base) return;
    // 버프 적용
    const damage  = Math.round(base.damage * this.config.buffs.damageMulti);
    const cooldown = Math.round(base.cooldown / this.config.buffs.attackSpeedMulti);
    const weapon: WeaponConfig = { ...base, damage, cooldown, level: 1 };
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
    (proj as any).damage   = w.damage;
    (proj as any).targetX  = target.x;
    (proj as any).targetY  = target.y;
    (proj as any).speed    = w.projectileSpeed;
    (proj as any).type     = "tracking";
    (proj as any).piercing = this.config.buffs.hasPiercing;
    (proj as any).hit      = new Set();
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
      (proj as any).damage   = w.damage;
      (proj as any).vx       = Math.cos(rad) * 300;
      (proj as any).vy       = Math.sin(rad) * 300;
      (proj as any).type     = this.config.buffs.hasPiercing ? "piercing" : "linear";
      (proj as any).maxDist  = w.range;
      (proj as any).traveled = 0;
      (proj as any).hit      = new Set();
      this.projectiles.add(proj);
    });
  }

  private fireBomb(w: WeaponConfig) {
    const target = this.getNearestEnemy();
    if (!target) return;
    const proj = this.add.text(this.player.x, this.player.y, "🐟", {
      fontSize: "24px",
    }).setOrigin(0.5);
    (proj as any).damage       = w.damage;
    (proj as any).targetX      = target.x;
    (proj as any).targetY      = target.y;
    (proj as any).speed        = w.projectileSpeed;
    (proj as any).type         = "bomb";
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
      (proj as any).type     = this.config.buffs.hasPiercing ? "piercing" : "linear";
      (proj as any).maxDist  = w.range;
      (proj as any).traveled = 0;
      (proj as any).hit      = new Set();
      this.projectiles.add(proj);
    }
  }

  private fireAura(w: WeaponConfig) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist <= w.range) {
        this.hitEnemy(e, w.damage * 0.5);
        e.setAlpha(0.5);
        this.time.delayedCall(1500, () => { if (e.active) e.setAlpha(1); });
      }
    });
  }

  // ─── 유틸 ─────────────────────────────────
  private getNearestEnemy(): Phaser.GameObjects.Image | null {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
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

  // ─── 코인 드랍 ────────────────────────────
  private dropCoin(x: number, y: number) {
    const coin = this.add.image(x, y, "game_coin");
    coin.setDisplaySize(22, 22);
    this.coinOrbs.add(coin);
  }

  // ─── 적 처치 ──────────────────────────────
  private hitEnemy(enemy: Phaser.GameObjects.Image, damage: number) {
    (enemy as any).hp -= damage;
    this.tweens.add({
      targets: enemy,
      scaleX: 1.3, scaleY: 1.3,
      duration: 80,
      yoyo: true,
    });

    if ((enemy as any).hp <= 0) {
      if ((enemy as any).isBoss) {
        // 보스 HP 동기화
        this.bossHp -= damage + (enemy as any).hp; // hp는 이미 음수이므로 더하면 실제 초과 데미지 뺌
        if (this.bossHp < 0) this.bossHp = 0;
        this.killBoss(enemy);
      } else {
        this.killEnemy(enemy);
      }
    } else if ((enemy as any).isBoss) {
      // 보스 HP 업데이트
      const prevHp = this.bossHp;
      this.bossHp = Math.max(0, prevHp - damage);
      if (this.bossStatus) {
        this.bossStatus = { ...this.bossStatus, hp: this.bossHp };
      }
    }
  }

  private killEnemy(enemy: Phaser.GameObjects.Image) {
    // 경험치 오브 드랍 (SVG)
    const orb = this.add.image(enemy.x, enemy.y, "game_exp");
    orb.setDisplaySize(18, 18);
    (orb as any).value = Math.max(1, Math.floor((3 + this.wave) / 3)); // 경험치 1/3
    this.expOrbs.add(orb);

    // 코인 드랍 10%
    const dropChance = 0.10 + this.config.buffs.coinDropBonus;
    if (Math.random() < dropChance) {
      this.dropCoin(enemy.x + Phaser.Math.Between(-20, 20), enemy.y + Phaser.Math.Between(-20, 20));
    }

    this.kills++;
    this.waveKills++;
    this.score += 10 * this.wave;

    // 쌍둥이 처치 시 나머지 speed ×2
    const enemyType = (enemy as any).type as string;
    if (enemyType === "boss_twins") {
      const allEnemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
      allEnemies.forEach(e => {
        if ((e as any).type === "boss_twins" && e !== enemy) {
          (e as any).speed = Math.round((e as any).speed * 2);
        }
      });
    }

    this.enemies.remove(enemy);
    enemy.destroy();

    // 웨이브 클리어 체크
    if (!this.waveClearing && this.waveKills >= this.waveKillsNeeded) {
      this.waveClearing = true;
      this.time.delayedCall(1000, () => {
        this.wave++;
        this.startWave(this.wave);
      });
    }
  }

  // ─── 경험치 / 레벨업 ─────────────────────
  private gainExp(amount: number) {
    this.exp += Math.round(amount * this.config.buffs.expMulti);
    const nextExp = EXP_PER_LEVEL[Math.min(this.level, EXP_PER_LEVEL.length - 1)];
    if (this.exp >= nextExp) {
      this.exp -= nextExp;
      this.level++;
      this.triggerLevelUp();
    }
  }

  private triggerLevelUp() {
    // 레벨업 HP 회복 (healMulti 적용)
    const healAmount = Math.round(this.playerMaxHp * this.config.buffs.healMulti);
    this.playerHp = Math.min(this.playerMaxHp, this.playerHp + healAmount);

    this.paused    = true;
    this.joyActive = false;
    this.joyDirX   = 0;
    this.joyDirY   = 0;
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
    const options = this.buildUpgradeOptions();
    this.events.emit(GAME_EVENTS.LEVEL_UP, options);
  }

  private buildUpgradeOptions(): UpgradeOption[] {
    const opts: UpgradeOption[] = [];
    const equipped = new Set(this.equippedWeapons.map(w => w.id));

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
    this.time.delayedCall(250, () => { this.invincible = false; });
    this.cameras.main.shake(150, 0.005);

    if (this.playerHp <= 0) {
      // 부활 목걸이 처리
      if (this.config.buffs.hasRevive && !this.reviveUsed) {
        this.reviveUsed = true;
        this.playerHp = Math.round(this.playerMaxHp * 0.3);
        // 부활 이펙트
        this.cameras.main.flash(300, 255, 255, 255);
        return;
      }
      this.playerHp = 0;
      this.triggerGameOver();
    }
  }

  private triggerGameOver() {
    this.paused = true;
    this.spawnTimer?.destroy();
    this.bossWizardTimer?.destroy();
    this.bossChargeTimer?.destroy();
    this.weaponTimers.forEach(t => t.destroy());
    this.events.emit(GAME_EVENTS.GAME_OVER, {
      score: this.score,
      wave_reached: this.wave,
      duration_sec: this.elapsed,
      weapons_used: this.equippedWeapons.map(w => w.id),
      killed_count: this.kills,
      coins_earned: this.coinsThisRun,
    } satisfies import("@/lib/game/api").GameRunPayload);
  }

  // ─── 업데이트 ─────────────────────────────
  update(_time: number, delta: number) {
    this.floorTile.tilePositionX = this.cameras.main.scrollX;
    this.floorTile.tilePositionY = this.cameras.main.scrollY;

    this.updateBossHpBar();

    if (this.paused) return;

    const dt = delta / 1000;
    this.movePlayer(dt);
    this.moveEnemies(dt);
    this.moveProjectiles(dt);
    this.collectOrbs();
    this.collectCoins();
    this.checkEnemyPlayerCollision();
    this.emitStats();
  }

  private movePlayer(dt: number) {
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy -= 1;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy += 1;
    if (vx === 0 && vy === 0 && this.joyActive) {
      vx = this.joyDirX;
      vy = this.joyDirY;
    }
    const len = Math.sqrt(vx * vx + vy * vy);
    if (len > 0) { vx /= len; vy /= len; }
    this.player.x += vx * this.playerSpeed * dt;
    this.player.y += vy * this.playerSpeed * dt;
  }

  private moveEnemies(dt: number) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    enemies.forEach(e => {
      const enemyType = (e as any).type as string;

      if (enemyType === "ranged_rat") {
        // 원거리: 300px 유지하며 원을 그림
        const dx   = this.player.x - e.x;
        const dy   = this.player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const PREFERRED_DIST = 300;

        if (dist > PREFERRED_DIST + 50) {
          // 너무 멀면 접근
          e.x += (dx / dist) * (e as any).speed * dt;
          e.y += (dy / dist) * (e as any).speed * dt;
        } else if (dist < PREFERRED_DIST - 50) {
          // 너무 가까우면 후퇴
          e.x -= (dx / dist) * (e as any).speed * dt;
          e.y -= (dy / dist) * (e as any).speed * dt;
        } else {
          // 옆으로 이동 (원 궤도)
          const perpX = -dy / dist;
          const perpY =  dx / dist;
          e.x += perpX * (e as any).speed * dt;
          e.y += perpY * (e as any).speed * dt;
        }

        // 원거리 쿨다운 공격
        (e as any).rangedCooldown = ((e as any).rangedCooldown ?? 0) + dt;
        if ((e as any).rangedCooldown > 2.5) {
          (e as any).rangedCooldown = 0;
          if (dist < PREFERRED_DIST + 100) {
            this.rangedRatShoot(e);
          }
        }
      } else if (enemyType === "ghost_rat") {
        // 유령: 기본 추적 + 텔레포트
        const dx   = this.player.x - e.x;
        const dy   = this.player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          e.x += (dx / dist) * (e as any).speed * dt;
          e.y += (dy / dist) * (e as any).speed * dt;
        }
        (e as any).ghostTimer = ((e as any).ghostTimer ?? 0) + dt;
        if ((e as any).ghostTimer > 1.5) {
          (e as any).ghostTimer = 0;
          // 텔레포트: 플레이어 주변 200~400px
          const tAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const tDist  = Phaser.Math.FloatBetween(200, 400);
          e.x = this.player.x + Math.cos(tAngle) * tDist;
          e.y = this.player.y + Math.sin(tAngle) * tDist;
          e.setAlpha(0.3);
          this.time.delayedCall(300, () => { if (e.active) e.setAlpha(1); });
        }
      } else {
        // 기본: 플레이어 추적
        const dx   = this.player.x - e.x;
        const dy   = this.player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          e.x += (dx / dist) * (e as any).speed * dt;
          e.y += (dy / dist) * (e as any).speed * dt;
        }
      }
    });
  }

  private rangedRatShoot(rat: Phaser.GameObjects.Image) {
    const dx   = this.player.x - rat.x;
    const dy   = this.player.y - rat.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const proj = this.add.text(rat.x, rat.y, "•", {
      fontSize: "14px",
      color: "#ff4444",
    }).setOrigin(0.5);
    (proj as any).damage      = (rat as any).damage * 0.7;
    (proj as any).vx          = (dx / dist) * 180;
    (proj as any).vy          = (dy / dist) * 180;
    (proj as any).type        = "enemy_proj";
    (proj as any).maxDist     = 350;
    (proj as any).traveled    = 0;
    (proj as any).isEnemyProj = true;
    this.projectiles.add(proj);
  }

  private moveProjectiles(dt: number) {
    const projs = this.projectiles.getChildren() as Phaser.GameObjects.Text[];
    projs.forEach(p => {
      const type = (p as any).type as string;

      // 적 투사체 (플레이어에게 피해)
      if ((p as any).isEnemyProj || (p as any).isBossProj) {
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
        // 플레이어 충돌 체크
        const distToPlayer = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
        if (distToPlayer < 28) {
          this.takeDamage((p as any).damage);
          p.destroy();
          this.projectiles.remove(p);
        }
        return;
      }

      if (type === "tracking") {
        const tx    = (p as any).targetX;
        const ty    = (p as any).targetY;
        const dx    = tx - p.x;
        const dy    = ty - p.y;
        const dist  = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10) {
          this.explodeProjectile(p, (p as any).piercing ?? false);
          return;
        }
        const speed = (p as any).speed;
        p.x += (dx / dist) * speed * dt;
        p.y += (dy / dist) * speed * dt;
        this.checkProjectileHit(p, (p as any).piercing ?? false);
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
        const tx   = (p as any).targetX;
        const ty   = (p as any).targetY;
        const dx   = tx - p.x;
        const dy   = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 15) {
          this.explodeBomb(p);
          return;
        }
        const speed = (p as any).speed;
        p.x += (dx / dist) * speed * dt;
        p.y += (dy / dist) * speed * dt;
      }

      const distFromPlayer = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
      if (distFromPlayer > MAX_PROJ_DIST) {
        p.destroy();
        this.projectiles.remove(p);
      }
    });
  }

  private checkProjectileHit(proj: Phaser.GameObjects.Text, piercing: boolean) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    const hitSet: Set<Phaser.GameObjects.Image> = (proj as any).hit ?? new Set();
    enemies.forEach(e => {
      if (hitSet.has(e)) return;
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < 28) {
        this.hitEnemy(e, (proj as any).damage);
        if (!piercing) {
          if (proj.active) { proj.destroy(); this.projectiles.remove(proj); }
        } else {
          hitSet.add(e);
        }
      }
    });
  }

  private explodeProjectile(proj: Phaser.GameObjects.Text, piercing: boolean) {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < 40) {
        this.hitEnemy(e, (proj as any).damage);
        if (!piercing) return;
      }
    });
    proj.destroy();
    this.projectiles.remove(proj);
  }

  private explodeBomb(proj: Phaser.GameObjects.Text) {
    const range  = (proj as any).explodeRange;
    const damage = (proj as any).damage;
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(proj.x, proj.y, e.x, e.y);
      if (dist < range) this.hitEnemy(e, damage);
    });
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
    const orbs = this.expOrbs.getChildren() as Phaser.GameObjects.Image[];
    orbs.forEach(orb => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, orb.x, orb.y);
      if (dist < 40) {
        this.gainExp((orb as any).value);
        orb.destroy();
        this.expOrbs.remove(orb);
      }
    });
  }

  private collectCoins() {
    const coins = this.coinOrbs.getChildren() as Phaser.GameObjects.Image[];
    const pickupRange = this.config.buffs.coinPickupRange;
    coins.forEach(coin => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, coin.x, coin.y);
      if (dist < pickupRange) {
        this.coinsThisRun++;
        coin.destroy();
        this.coinOrbs.remove(coin);
      }
    });
  }

  private checkEnemyPlayerCollision() {
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist < 32) {
        this.takeDamage((e as any).damage);
      }
    });
  }

  private updateBossHpBar() {
    if (!this.bossHpGraphics) return;
    this.bossHpGraphics.clear();
    if (!this.currentBoss || !this.bossStatus || this.bossHp <= 0) return;

    const boss = this.currentBoss;
    const BAR_W   = Math.max(60, boss.displayWidth * 0.9);
    const BAR_H   = 7;
    const offsetY = boss.displayHeight / 2 + 10;
    const bx      = boss.x - BAR_W / 2;
    const by      = boss.y + offsetY;

    // 배경
    this.bossHpGraphics.fillStyle(0x000000, 0.65);
    this.bossHpGraphics.fillRoundedRect(bx - 1, by - 1, BAR_W + 2, BAR_H + 2, 3);

    // HP 채움
    const pct = Math.max(0, this.bossHp / this.bossMaxHp);
    const fillColor = pct > 0.5 ? 0xf59e0b : pct > 0.25 ? 0xef4444 : 0xdc2626;
    this.bossHpGraphics.fillStyle(fillColor, 1);
    this.bossHpGraphics.fillRoundedRect(bx, by, BAR_W * pct, BAR_H, 2);
  }

  private emitStats() {
    const expIdx = Math.min(this.level, EXP_PER_LEVEL.length - 1);
    const nextBoss = 5 - ((this.wave - 1) % 5);
    this.events.emit(GAME_EVENTS.STATS_UPDATE, {
      hp:         this.playerHp,
      maxHp:      this.playerMaxHp,
      level:      this.level,
      exp:        this.exp,
      expNext:    EXP_PER_LEVEL[expIdx],
      wave:       this.wave,
      kills:      this.kills,
      elapsed:    this.elapsed,
      score:      this.score,
      coins:      this.coinsThisRun,
      nextBossIn: this.isBossWave ? 0 : nextBoss,
      boss:       this.bossStatus,
    } satisfies GameStats);
  }
}
