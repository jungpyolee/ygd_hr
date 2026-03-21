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

const MAX_WEAPON_SLOTS = 4;  // 장착 가능한 최대 무기 종류
const MAX_WEAPON_LEVEL = 5;  // 무기 최대 레벨 (이 레벨에서 각성)

// 각성 정보: 레벨 5 도달 시 적용되는 스킬 이름 / 설명
const AWAKENING_INFO: Record<string, { label: string; emoji: string; description: string }> = {
  hairball: { label: "삼중 추적탄", emoji: "🔱", description: "가장 가까운 적 3마리 동시 추적" },
  scratch:  { label: "폭풍 파동",   emoji: "🌀", description: "360도 12방향 전방위 발사" },
  fishbomb: { label: "핵 연어",     emoji: "☢️", description: "폭발 범위 3배, 연쇄 충격" },
  whisker:  { label: "X자 레이저",  emoji: "✖️", description: "4방향 동시 관통 빔" },
  meow:     { label: "초음파 포효", emoji: "📡", description: "16방향 + 이동속도 감소" },
  nap:      { label: "마취 장판",   emoji: "😴", description: "범위 3배 + 강력한 지속 데미지" },
};

// 패시브 업그레이드 옵션 (슬롯/레벨 꽉 찼을 때 제시)
const PASSIVE_UPGRADES: UpgradeOption[] = [
  { type: "passive", passiveId: "hp_regen",  label: "꿀떡 한 입",   description: "HP 20% 즉시 회복해요",        emoji: "🍯" },
  { type: "passive", passiveId: "speed_up",  label: "사뿐사뿐",     description: "이동속도 +10% 빨라져요",       emoji: "🐾" },
  { type: "passive", passiveId: "atk_power", label: "발톱 연마",    description: "전체 무기 공격력 +15%",        emoji: "💢" },
  { type: "passive", passiveId: "exp_boost", label: "경험치 폭식",  description: "EXP 구슬 흡수량 +20%",         emoji: "💫" },
];

// ─── 게임 설정 (캐릭터 타입 + 상점 버프) ───────
export interface GameConfig {
  catType: "persian" | "scottish" | "abyssinian" | "munchkin" | "doujeonku" | "bomdong" | "buttertteok";
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
    extraWeaponSlot: boolean;  // 봄동비빔밥: 무기 슬롯 +1
    counterShockwave: boolean; // 두쫀쿠: 피해 누적 시 반격 충격파
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
    extraWeaponSlot: false,
    counterShockwave: false,
  },
};

// ─── 적 타입 ────────────────────────────────
type EnemyType = "rat" | "fast_rat" | "fat_rat" | "ranged_rat" | "ghost_rat" | "mini_gangjeong";
type BossType  = "boss_king" | "boss_wizard" | "boss_twins" | "boss_gangjeong" | "boss_sikhye" | "boss_tteok";

// 보스 상태 (React에 전달)
export interface BossStatus {
  name: string;
  hp: number;
  maxHp: number;
  emoji: string;
}

// 일반 적 스펙 — 다과의 습격
const ENEMY_SPECS: Record<EnemyType, { textureKey: string; name: string; hp: number; speed: number; damage: number; scale: number }> = {
  rat:           { textureKey: "daegwa_yakgwa",    name: "약과",      hp: 18,  speed: 70,  damage: 4,  scale: 1.0 },
  fast_rat:      { textureKey: "daegwa_omija",     name: "오미자청",  hp: 12,  speed: 130, damage: 3,  scale: 0.8 },
  fat_rat:       { textureKey: "daegwa_yanggang",  name: "왕양갱",    hp: 55,  speed: 45,  damage: 6,  scale: 1.3 },
  ranged_rat:    { textureKey: "daegwa_jujube",    name: "대추탄",    hp: 20,  speed: 50,  damage: 4,  scale: 0.9 },
  ghost_rat:     { textureKey: "daegwa_juak",      name: "유령주악",  hp: 25,  speed: 90,  damage: 5,  scale: 1.0 },
  mini_gangjeong:{ textureKey: "daegwa_gangjeong", name: "미니 강정", hp: 60,  speed: 110, damage: 5,  scale: 0.8 },
};

// 보스 스펙
const BOSS_SPECS: Record<BossType, { textureKey: string; name: string; hp: number; speed: number; damage: number; scale: number }> = {
  boss_king:      { textureKey: "daegwa_kumquat",   name: "금귤 대왕",       hp: 800,  speed: 60,  damage: 8,  scale: 2.5 },
  boss_wizard:    { textureKey: "daegwa_dasik",     name: "다식 술사",       hp: 700,  speed: 50,  damage: 7,  scale: 2.0 },
  boss_twins:     { textureKey: "daegwa_pecan",     name: "피칸&호두 쌍둥이", hp: 500,  speed: 80,  damage: 7,  scale: 1.8 },
  boss_gangjeong: { textureKey: "daegwa_gangjeong", name: "강정 군주",       hp: 1200, speed: 55,  damage: 9,  scale: 2.4 },
  boss_sikhye:    { textureKey: "daegwa_sikhye",    name: "식혜 대마법사",   hp: 1100, speed: 45,  damage: 8,  scale: 2.1 },
  boss_tteok:     { textureKey: "daegwa_tteok",     name: "떡 거인",         hp: 1800, speed: 35,  damage: 12, scale: 3.0 },
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

// 미니 강정 스펙 (강정 군주 사망 후 소환)
const MINI_GANGJEONG_SPEC = { textureKey: "daegwa_gangjeong", name: "미니 강정", hp: 60, speed: 110, damage: 5, scale: 0.8 };

// 웨이브 스케일링 계수
function getWaveScale(wave: number): number {
  return 1 + (wave - 1) * 0.15;
}

// 웨이브별 스폰 카운트 (틱 수 — 실제 적 수 = count × batchSize)
function getSpawnCount(wave: number): number {
  return Math.min(8 + wave * 3, 35);
}

// 웨이브별 스폰 인터벌
function getSpawnInterval(wave: number): number {
  return Math.max(150, 550 - wave * 25);
}

// 틱당 동시 스폰 수 — 화면에 몬스터 밀도 확보
function getSpawnBatchSize(wave: number): number {
  if (wave <= 3) return 2;
  if (wave <= 7) return 3;
  return 4;
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
  awakened: boolean; // 레벨 5 도달 시 true
}

// HUD 표시용 무기 상태
export interface WeaponStatusInfo {
  id: string;
  name: string;
  emoji: string;
  level: number;
  awakened: boolean;
}

const BASE_WEAPONS: Omit<WeaponConfig, "level" | "awakened">[] = [
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
  GAME_CLEAR:   "gameclear",
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
  weapons: WeaponStatusInfo[]; // 장착 무기 슬롯
  combo: number;               // 연속 킬 콤보
  dashCooldown: number;        // 대시 쿨다운 잔여 초 (0이면 사용 가능)
}

// ─── GameScene ───────────────────────────────
export default class GameScene extends Phaser.Scene {
  // 게임 설정
  private config: GameConfig;

  // 플레이어
  private player!: Phaser.GameObjects.Sprite;
  private playerAnim: "idle" | "run" | "damage" | "die" | "rush" = "idle";
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
  private bossSikhyeTimer?: Phaser.Time.TimerEvent;
  private bossTteokTimer?: Phaser.Time.TimerEvent;
  private bossStatus: BossStatus | null = null;
  private bossHpGraphics?: Phaser.GameObjects.Graphics;

  // 식혜 보스 — 독 웅덩이
  private poisonPuddles!: Phaser.GameObjects.Group;

  // 두쫀쿠 — 반격 피해 누적
  private counterDmgAccum = 0;
  private readonly COUNTER_THRESHOLD = 30;

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

  // 패시브 런타임 배율 (레벨업 패시브로 누적)
  private runtimeExpMulti = 1.0;

  // 콤보
  private combo = 0;
  private comboTimer?: Phaser.Time.TimerEvent;
  private readonly COMBO_RESET_MS = 3000;

  // 대시
  private dashCooldownRemain = 0;
  private readonly DASH_COOLDOWN_SEC = 4;
  private readonly DASH_DISTANCE = 280;
  private isDashing = false;

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
    this.load.svg("daegwa_gangjeong", "/daegwa/11-gangjeong.svg");
    this.load.svg("daegwa_sikhye",   "/daegwa/12-sikhye.svg");
    this.load.svg("daegwa_tteok",    "/daegwa/13-tteok.svg");
    this.load.svg("game_coin",       "/game/coin.svg");
    this.load.svg("game_exp",        "/game/exp-orb.svg");
    // 고양이 스프라이트 (32×32 프레임, 세로 스트립)
    const catFrameConfig = { frameWidth: 32, frameHeight: 32 };
    this.load.spritesheet("cat_idle",   "/game/WhiteCatIdle.png",   catFrameConfig);
    this.load.spritesheet("cat_run",    "/game/WhiteCatRun.png",    catFrameConfig);
    this.load.spritesheet("cat_damage", "/game/WhiteCatDamage.png", catFrameConfig);
    this.load.spritesheet("cat_die",    "/game/WhiteCatDie.png",    catFrameConfig);
    this.load.spritesheet("cat_rush",   "/game/WhiteCatRush.png",   catFrameConfig);
    // 코인 애니메이션 프레임
    this.load.image("coin_f1", "/game/coin1.png");
    this.load.image("coin_f2", "/game/coin2.png");
    this.load.image("coin_f3", "/game/coin3.png");
    this.load.image("coin_f4", "/game/coin4.png");
  }

  create() {
    this.startTime = this.time.now;
    this.cameras.main.setBackgroundColor("#c8935a");
    this.cameras.main.setBounds(-100000, -100000, 200000, 200000);

    // 배경 레이어
    this.drawFloor();
    this.drawDecorations();

    // 그룹 초기화
    this.enemies      = this.add.group();
    this.projectiles  = this.add.group();
    this.expOrbs      = this.add.group();
    this.coinOrbs     = this.add.group();
    this.poisonPuddles = this.add.group();

    // HP 설정
    this.playerMaxHp = PLAYER_MAX_HP + this.config.buffs.hpBonus;
    this.playerHp    = this.playerMaxHp;

    // 이동속도 설정
    this.playerSpeed = PLAYER_SPEED * this.config.buffs.moveSpeedMulti;

    // 부활 초기화
    this.reviveUsed = false;

    // 고양이 애니메이션 등록
    if (!this.anims.exists("cat_idle")) {
      this.anims.create({ key: "cat_idle",   frames: this.anims.generateFrameNumbers("cat_idle",   { start: 0, end: 5  }), frameRate: 8,  repeat: -1 });
      this.anims.create({ key: "cat_run",    frames: this.anims.generateFrameNumbers("cat_run",    { start: 0, end: 5  }), frameRate: 12, repeat: -1 });
      this.anims.create({ key: "cat_damage", frames: this.anims.generateFrameNumbers("cat_damage", { start: 0, end: 3  }), frameRate: 10, repeat: 0  });
      this.anims.create({ key: "cat_die",    frames: this.anims.generateFrameNumbers("cat_die",    { start: 0, end: 6  }), frameRate: 8,  repeat: 0  });
      this.anims.create({ key: "cat_rush",   frames: this.anims.generateFrameNumbers("cat_rush",   { start: 0, end: 25 }), frameRate: 24, repeat: 0  });
      this.anims.create({ key: "coin_spin",  frames: [
        { key: "coin_f1" }, { key: "coin_f2" }, { key: "coin_f3" }, { key: "coin_f4" },
      ], frameRate: 8, repeat: -1 });
    }

    // 캐릭터별 tint + scale
    const catTint: Record<GameConfig["catType"], number> = {
      persian:     0xffffff,
      scottish:    0xaabbcc,
      abyssinian:  0xd4884a,
      munchkin:    0xfff0dd,
      doujeonku:   0x3d2b1f,
      bomdong:     0x7db249,
      buttertteok: 0xfff4a3,
    };
    const catScale: Record<GameConfig["catType"], number> = {
      persian:     2.0,
      scottish:    2.0,
      abyssinian:  2.0,
      munchkin:    1.7,
      doujeonku:   2.2,
      bomdong:     2.0,
      buttertteok: 2.3,
    };

    // 플레이어 생성
    this.player = this.add.sprite(0, 0, "cat_idle")
      .setOrigin(0.5)
      .setScale(catScale[this.config.catType])
      .setTint(catTint[this.config.catType]);
    this.player.play("cat_idle");
    this.player.on("animationcomplete", (anim: Phaser.Animations.Animation) => {
      if (anim.key === "cat_damage" || anim.key === "cat_rush") {
        this.playerAnim = "idle";
        this.player.play("cat_idle");
      }
    });

    // 카메라 추적
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // 시작 무기 장착
    this.equipWeapon("hairball");
    // 먼치킨: 투사체 2개 (scratch 추가 장착으로 표현)
    if (this.config.catType === "munchkin" && this.config.buffs.startProjectiles >= 2) {
      this.equipWeapon("scratch");
    }
    // 봄동비빔밥: 두 번째 랜덤 무기로 시작
    if (this.config.catType === "bomdong") {
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
      this.joyPointerId = p.id;
      this.joyBaseX     = p.x;
      this.joyBaseY     = p.y;
      this.joyDirX      = 0;
      this.joyDirY      = 0;
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.joyActive || p.id !== this.joyPointerId) return;
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
      if (p.id !== this.joyPointerId) return;
      this.joyActive = false;
      this.joyDirX   = 0;
      this.joyDirY   = 0;
      this.joyBase.setVisible(false);
      this.joyKnob.setVisible(false);
    });

    // 대시 — 스페이스바
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      .on("down", () => this.tryDash());

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
    // 실제 화면 크기로 생성해야 이동 중 빈 영역이 생기지 않음
    this.floorTile = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, "plank")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-1);
    // 화면 크기 변경 시 타일스프라이트도 갱신
    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      this.floorTile.setSize(gameSize.width, gameSize.height);
    });
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
      const spawnCount   = getSpawnCount(waveNum);
      const spawnInterval = getSpawnInterval(waveNum);
      const batchSize    = getSpawnBatchSize(waveNum);
      this.waveKillsNeeded = spawnCount * batchSize;
      this.waveKills       = 0;
      this.spawnTimer?.destroy();
      this.spawnTimer = this.time.addEvent({
        delay: spawnInterval,
        repeat: spawnCount - 1,
        callback: () => {
          for (let i = 0; i < batchSize; i++) this.spawnEnemyForWave(waveNum);
        },
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

    // 엘리트 판정: 웨이브 3 이상, 보스 웨이브 아님, 15% 확률
    const isElite = waveNum >= 3 && !this.isBossWave && Math.random() < 0.15;

    let hp    = scaledHp;
    let speed = scaledSpeed + Phaser.Math.Between(-5, 5);
    let dmg   = scaledDamage;
    let dSize = displaySize;

    if (isElite) {
      hp    = Math.round(hp * 3);
      speed = Math.round(speed * 1.15);
      dmg   = Math.round(dmg * 1.5);
      dSize = Math.round(dSize * 1.45);
      enemy.setDisplaySize(dSize, dSize);
      enemy.setTint(0xffd700); // 황금빛
      (enemy as any).isElite = true;
    } else {
      enemy.setDisplaySize(displaySize, displaySize);
    }

    (enemy as any).hp     = hp;
    (enemy as any).maxHp  = hp;
    (enemy as any).speed  = speed;
    (enemy as any).damage = dmg;
    (enemy as any).type   = enemyType;

    if (enemyType === "ghost_rat") (enemy as any).ghostTimer = 0;
    if (enemyType === "ranged_rat") (enemy as any).rangedCooldown = 0;

    this.enemies.add(enemy);
  }

  // ─── 보스 스폰 ───────────────────────────
  private spawnBoss(waveNum: number) {
    const bossTypes: BossType[] = [
      "boss_king",      // wave 5
      "boss_wizard",    // wave 10
      "boss_twins",     // wave 15
      "boss_gangjeong", // wave 20
      "boss_sikhye",    // wave 25
      "boss_tteok",     // wave 30+
    ];
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
      boss_king:      "🍊",
      boss_wizard:    "🍡",
      boss_twins:     "🥜",
      boss_gangjeong: "🌰",
      boss_sikhye:    "🍵",
      boss_tteok:     "🏯",
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

    // 식혜 기믹: 3.5초마다 독 웅덩이
    if (bossType === "boss_sikhye") {
      this.bossSikhyeTimer?.destroy();
      this.bossSikhyeTimer = this.time.addEvent({
        delay: 3500,
        loop: true,
        callback: () => {
          if (!this.paused && this.currentBoss) this.bossSikhyeAttack();
        },
      });
    }

    // 떡 기믹: 4초마다 충격파
    if (bossType === "boss_tteok") {
      this.bossTteokTimer?.destroy();
      this.bossTteokTimer = this.time.addEvent({
        delay: 4000,
        loop: true,
        callback: () => {
          if (!this.paused && this.currentBoss) this.bossTteokShockwave();
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

  // ─── 강정 군주: 미니 강정 소환 ───────────────
  private spawnMiniGangjeong(x: number, y: number) {
    const spec = MINI_GANGJEONG_SPEC;
    const enemy = this.add.image(x, y, spec.textureKey);
    enemy.setDisplaySize(Math.round(60 * spec.scale), Math.round(60 * spec.scale));
    enemy.setTint(0xffd700);
    (enemy as any).hp       = spec.hp;
    (enemy as any).maxHp    = spec.hp;
    (enemy as any).speed    = spec.speed;
    (enemy as any).damage   = spec.damage;
    (enemy as any).type     = "mini_gangjeong";
    (enemy as any).isBoss   = false;
    (enemy as any).isElite  = true;
    this.enemies.add(enemy);
  }

  // ─── 식혜 대마법사: 독 웅덩이 생성 ───────────
  private bossSikhyeAttack() {
    // 플레이어 위치에 독 웅덩이 생성
    const puddle = this.add.graphics().setDepth(3);
    puddle.fillStyle(0x22cc44, 0.45);
    puddle.fillCircle(0, 0, 55);
    puddle.setPosition(this.player.x, this.player.y);
    (puddle as any).lifeRemain = 6; // 6초간 유지
    this.poisonPuddles.add(puddle);

    // 생성 연출
    puddle.setAlpha(0);
    this.tweens.add({ targets: puddle, alpha: 1, duration: 400 });

    // 6초 후 페이드 아웃 후 제거
    this.time.delayedCall(5600, () => {
      if (!puddle.active) return;
      this.tweens.add({
        targets: puddle, alpha: 0, duration: 400,
        onComplete: () => {
          this.poisonPuddles.remove(puddle);
          puddle.destroy();
        },
      });
    });
  }

  // ─── 독 웅덩이 피해 체크 (update에서 호출) ────
  private checkPoisonPuddles() {
    const puddles = this.poisonPuddles.getChildren() as Phaser.GameObjects.Graphics[];
    puddles.forEach(p => {
      const dist = Phaser.Math.Distance.Between(p.x, p.y, this.player.x, this.player.y);
      if (dist < 55) {
        // 초당 8 피해 (update당 delta 기반으로 누적)
        (p as any).dmgAccum = ((p as any).dmgAccum ?? 0) + 1;
        if ((p as any).dmgAccum >= 8) {
          (p as any).dmgAccum = 0;
          this.takeDamage(8);
        }
      }
    });
  }

  // ─── 떡 거인: 충격파 + 넉백 ─────────────────
  private bossTteokShockwave() {
    if (!this.currentBoss) return;
    const bx = this.currentBoss.x;
    const by = this.currentBoss.y;

    // 충격파 시각 효과
    const ring = this.add.graphics().setDepth(10);
    ring.lineStyle(6, 0xff4400, 0.9);
    ring.strokeCircle(bx, by, 10);

    this.tweens.add({
      targets: { r: 10 },
      r: 280,
      duration: 600,
      onUpdate: (tween) => {
        const r = (tween.targets[0] as any).r as number;
        ring.clear();
        ring.lineStyle(6, 0xff4400, 1 - r / 280);
        ring.strokeCircle(bx, by, r);
      },
      onComplete: () => ring.destroy(),
    });

    // 플레이어가 범위(280px) 안이면 피해 + 넉백
    const dist = Phaser.Math.Distance.Between(bx, by, this.player.x, this.player.y);
    if (dist < 280) {
      this.takeDamage(BOSS_SPECS.boss_tteok.damage);
      // 넉백
      const angle = Math.atan2(this.player.y - by, this.player.x - bx);
      const knockDist = 120;
      this.tweens.add({
        targets: this.player,
        x: this.player.x + Math.cos(angle) * knockDist,
        y: this.player.y + Math.sin(angle) * knockDist,
        duration: 200,
        ease: "Power2",
      });
    }

    // 화면 흔들기
    this.cameras.main.shake(300, 0.012);
  }

  // ─── 두쫀쿠 반격 충격파 ──────────────────────
  private triggerCounterShockwave() {
    // 주변 160px 내 모든 적에게 피해
    const enemies = this.enemies.getChildren() as Phaser.GameObjects.Image[];
    let hitCount = 0;
    enemies.forEach(e => {
      const dist = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
      if (dist < 160) {
        const dmg = 40;
        if ((e as any).isBoss) {
          this.bossHp -= dmg;
          if (this.bossHp < 0) this.bossHp = 0;
          if (this.bossHp <= 0) this.killBoss(e);
        } else {
          (e as any).hp -= dmg;
          if ((e as any).hp <= 0) this.killEnemy(e);
        }
        hitCount++;
      }
    });

    // 시각 효과
    const ring = this.add.graphics().setDepth(12);
    this.tweens.add({
      targets: { r: 0 },
      r: 160,
      duration: 350,
      onUpdate: (tween) => {
        const r = (tween.targets[0] as any).r as number;
        ring.clear();
        ring.lineStyle(5, 0xffa500, 1 - r / 160);
        ring.strokeCircle(this.player.x, this.player.y, r);
      },
      onComplete: () => ring.destroy(),
    });

    if (hitCount > 0) {
      this.showFloatingText(this.player.x, this.player.y - 30, `🔥 반격! ×${hitCount}`, "#ff8800", "18px");
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
    this.bossSikhyeTimer?.destroy();
    this.bossTteokTimer?.destroy();

    // 독 웅덩이 정리 (식혜 보스 종료 시)
    const killedType = this.bossType;
    this.currentBoss = null;
    this.bossStatus  = null;

    this.enemies.remove(boss);
    boss.destroy();

    this.events.emit(GAME_EVENTS.BOSS_END);

    // 강정 군주 사망 → 미니 강정 3마리 소환
    if (killedType === "boss_gangjeong") {
      this.time.delayedCall(400, () => {
        for (let i = 0; i < 3; i++) {
          const a = (Math.PI * 2 * i) / 3;
          this.spawnMiniGangjeong(
            boss.x + Math.cos(a) * 60,
            boss.y + Math.sin(a) * 60,
          );
        }
      });
    }

    // waveKills 처리
    this.waveKills++;
    if (!this.waveClearing && this.waveKills >= this.waveKillsNeeded) {
      this.waveClearing = true;
      this.coinsThisRun += coinCount;
      // 30웨이브 보스 처치 → 게임 클리어
      if (this.wave === 30) {
        this.time.delayedCall(1000, () => this.triggerGameOver());
      } else {
        this.time.delayedCall(1500, () => {
          this.wave++;
          this.startWave(this.wave);
        });
      }
    }
  }

  // ─── 무기 장착 ────────────────────────────
  private equipWeapon(id: string) {
    const base = BASE_WEAPONS.find(w => w.id === id);
    if (!base) return;
    const damage   = Math.round(base.damage * this.config.buffs.damageMulti);
    const cooldown = Math.round(base.cooldown / this.config.buffs.attackSpeedMulti);
    const weapon: WeaponConfig = { ...base, damage, cooldown, level: 1, awakened: false };
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
    if (weapon.awakened) {
      this.fireAwakenedWeapon(weapon);
      return;
    }
    switch (weapon.id) {
      case "hairball":  this.fireTracking(weapon);  break;
      case "scratch":   this.fireFan(weapon);        break;
      case "fishbomb":  this.fireBomb(weapon);       break;
      case "whisker":   this.fireBeam(weapon);       break;
      case "meow":      this.firePulse(weapon);      break;
      case "nap":       this.fireAura(weapon);       break;
    }
  }

  // ─── 대시 ────────────────────────────────
  public triggerDash() { this.tryDash(); }

  private tryDash() {
    if (this.dashCooldownRemain > 0 || this.isDashing || this.paused) return;

    // 이동 방향 결정 (키보드 → 조이스틱 → 최근접 적 방향)
    let dx = 0, dy = 0;
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  dx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    dy -= 1;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  dy += 1;
    if (dx === 0 && dy === 0 && this.joyActive) { dx = this.joyDirX; dy = this.joyDirY; }
    if (dx === 0 && dy === 0) {
      const target = this.getNearestEnemy();
      if (target) {
        const ang = Math.atan2(target.y - this.player.y, target.x - this.player.x);
        dx = Math.cos(ang); dy = Math.sin(ang);
      } else return;
    }
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len; dy /= len;

    this.isDashing = true;
    this.invincible = true;
    this.dashCooldownRemain = this.DASH_COOLDOWN_SEC;

    // 잔상 이펙트
    const afterImg = this.add.sprite(this.player.x, this.player.y, "cat_rush")
      .setOrigin(0.5)
      .setScale(this.player.scaleX)
      .setTint(this.player.tintTopLeft)
      .setFlipX(this.player.flipX)
      .setAlpha(0.5)
      .setDepth(this.player.depth - 1);
    this.tweens.add({ targets: afterImg, alpha: 0, duration: 250, onComplete: () => afterImg.destroy() });

    this.playerAnim = "rush";
    this.player.play("cat_rush");
    this.tweens.add({
      targets: this.player,
      x: this.player.x + dx * this.DASH_DISTANCE,
      y: this.player.y + dy * this.DASH_DISTANCE,
      duration: 180,
      ease: "Power2",
      onComplete: () => {
        this.isDashing = false;
        this.time.delayedCall(200, () => { this.invincible = false; });
      },
    });
    this.cameras.main.shake(70, 0.003);
  }

  // ─── 각성 발사 ────────────────────────────

  private fireAwakenedWeapon(weapon: WeaponConfig) {
    switch (weapon.id) {
      case "hairball":  this.fireAwakenedHairball(weapon); break;
      case "scratch":   this.fireAwakenedScratch(weapon);  break;
      case "fishbomb":  this.fireAwakenedFishbomb(weapon); break;
      case "whisker":   this.fireAwakenedWhisker(weapon);  break;
      case "meow":      this.fireAwakenedMeow(weapon);     break;
      case "nap":       this.fireAwakenedNap(weapon);      break;
    }
  }

  /** 삼중 추적탄: 가장 가까운 적 최대 3마리 동시 추적 */
  private fireAwakenedHairball(w: WeaponConfig) {
    const sorted = (this.enemies.getChildren() as Phaser.GameObjects.Image[])
      .slice()
      .sort((a, b) =>
        Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) -
        Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y)
      );
    const targets = sorted.slice(0, 3);
    if (targets.length === 0) return;
    for (let i = 0; i < 3; i++) {
      const target = targets[i] ?? targets[0];
      const proj = this.add.text(this.player.x, this.player.y, "🔱", { fontSize: "20px" }).setOrigin(0.5);
      (proj as any).damage   = w.damage;
      (proj as any).targetX  = target.x;
      (proj as any).targetY  = target.y;
      (proj as any).speed    = w.projectileSpeed;
      (proj as any).type     = "tracking";
      (proj as any).piercing = true;
      (proj as any).hit      = new Set();
      this.projectiles.add(proj);
    }
  }

  /** 폭풍 파동: 360도 12방향 발사 */
  private fireAwakenedScratch(w: WeaponConfig) {
    for (let i = 0; i < 12; i++) {
      const rad = Phaser.Math.DegToRad(i * 30);
      const proj = this.add.text(this.player.x, this.player.y, "🌀", { fontSize: "18px" }).setOrigin(0.5);
      (proj as any).damage   = w.damage;
      (proj as any).vx       = Math.cos(rad) * 320;
      (proj as any).vy       = Math.sin(rad) * 320;
      (proj as any).type     = "piercing";
      (proj as any).maxDist  = w.range * 1.6;
      (proj as any).traveled = 0;
      (proj as any).hit      = new Set();
      this.projectiles.add(proj);
    }
  }

  /** 핵 연어: 폭발 범위 3배 */
  private fireAwakenedFishbomb(w: WeaponConfig) {
    const target = this.getNearestEnemy();
    if (!target) return;
    const proj = this.add.text(this.player.x, this.player.y, "☢️", { fontSize: "26px" }).setOrigin(0.5);
    (proj as any).damage       = w.damage;
    (proj as any).targetX      = target.x;
    (proj as any).targetY      = target.y;
    (proj as any).speed        = w.projectileSpeed;
    (proj as any).type         = "bomb";
    (proj as any).explodeRange = 240;
    this.projectiles.add(proj);
  }

  /** X자 레이저: 4방향 동시 관통 빔 */
  private fireAwakenedWhisker(w: WeaponConfig) {
    const base = this.getAngleToNearest() ?? 0;
    [0, 90, 180, 270].forEach(offset => {
      const rad = Phaser.Math.DegToRad(base + offset);
      const proj = this.add.text(this.player.x, this.player.y, "✖️", { fontSize: "20px" }).setOrigin(0.5);
      (proj as any).damage   = w.damage;
      (proj as any).vx       = Math.cos(rad) * w.projectileSpeed;
      (proj as any).vy       = Math.sin(rad) * w.projectileSpeed;
      (proj as any).type     = "piercing";
      (proj as any).maxDist  = w.range;
      (proj as any).traveled = 0;
      (proj as any).hit      = new Set();
      this.projectiles.add(proj);
    });
  }

  /** 초음파 포효: 16방향 발사 + 이동속도 감소 */
  private fireAwakenedMeow(w: WeaponConfig) {
    for (let i = 0; i < 16; i++) {
      const rad = Phaser.Math.DegToRad(i * 22.5);
      const proj = this.add.text(this.player.x, this.player.y, "📡", { fontSize: "18px" }).setOrigin(0.5);
      (proj as any).damage    = w.damage;
      (proj as any).vx        = Math.cos(rad) * w.projectileSpeed * 1.3;
      (proj as any).vy        = Math.sin(rad) * w.projectileSpeed * 1.3;
      (proj as any).type      = "piercing";
      (proj as any).maxDist   = w.range * 1.5;
      (proj as any).traveled  = 0;
      (proj as any).hit       = new Set();
      (proj as any).slowOnHit = true;
      this.projectiles.add(proj);
    }
  }

  /** 마취 장판: 범위 3배 + 강한 지속 데미지 */
  private fireAwakenedNap(w: WeaponConfig) {
    const range = w.range * 3;
    (this.enemies.getChildren() as Phaser.GameObjects.Image[]).forEach(e => {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist <= range) {
        this.hitEnemy(e, w.damage * 4);
        const origSpeed = (e as any).speed;
        (e as any).speed = Math.round(origSpeed * 0.25);
        e.setAlpha(0.35);
        this.time.delayedCall(2500, () => {
          if (e.active) { (e as any).speed = origSpeed; e.setAlpha(1); }
        });
      }
    });
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
    const coin = this.add.sprite(x, y, "coin_f1");
    coin.setDisplaySize(22, 22);
    coin.play("coin_spin");
    this.coinOrbs.add(coin);
  }

  // ─── 적 처치 ──────────────────────────────
  // ─── 크리티컬 판정 ───────────────────────
  private rollCrit(damage: number): { finalDmg: number; isCrit: boolean } {
    const critChance = 0.15;
    if (Math.random() < critChance) return { finalDmg: Math.round(damage * 1.8), isCrit: true };
    return { finalDmg: damage, isCrit: false };
  }

  // ─── 플로팅 텍스트 ────────────────────────
  private showFloatingText(x: number, y: number, text: string, color: string, size: string) {
    const label = this.add.text(x, y, text, {
      fontSize: size, color, fontStyle: "bold", stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(60);
    this.tweens.add({
      targets: label,
      y: y - 45,
      alpha: 0,
      duration: 850,
      ease: "Power1",
      onComplete: () => label.destroy(),
    });
  }

  private hitEnemy(enemy: Phaser.GameObjects.Image, damage: number) {
    const isBoss = (enemy as any).isBoss as boolean;
    const { finalDmg, isCrit } = this.rollCrit(damage);

    (enemy as any).hp -= finalDmg;
    this.tweens.add({ targets: enemy, scaleX: 1.3, scaleY: 1.3, duration: 80, yoyo: true });

    // 크리티컬 or 보스 피격 → 플로팅 데미지 숫자
    if (isCrit) {
      this.showFloatingText(enemy.x, enemy.y - 16, `💥 ${finalDmg}`, "#ff6b35", "17px");
    } else if (isBoss) {
      this.showFloatingText(enemy.x, enemy.y - 16, `${finalDmg}`, "#ffffff", "13px");
    }

    if ((enemy as any).hp <= 0) {
      if (isBoss) {
        this.bossHp -= finalDmg + (enemy as any).hp;
        if (this.bossHp < 0) this.bossHp = 0;
        this.killBoss(enemy);
      } else {
        this.killEnemy(enemy);
      }
    } else if (isBoss) {
      this.bossHp = Math.max(0, this.bossHp - finalDmg);
      if (this.bossStatus) this.bossStatus = { ...this.bossStatus, hp: this.bossHp };
    }
  }

  private killEnemy(enemy: Phaser.GameObjects.Image) {
    const isElite = !!(enemy as any).isElite;

    // 경험치 오브 드랍
    const baseExpVal = Math.max(1, Math.floor((3 + this.wave) / 3));
    const expCount = isElite ? 3 : 1;
    for (let i = 0; i < expCount; i++) {
      const orb = this.add.image(
        enemy.x + Phaser.Math.Between(-18, 18),
        enemy.y + Phaser.Math.Between(-18, 18),
        "game_exp",
      );
      orb.setDisplaySize(18, 18);
      (orb as any).value = baseExpVal;
      this.expOrbs.add(orb);
    }

    // 코인 드랍: 엘리트는 3~4개 확정, 일반은 10% 확률
    if (isElite) {
      const coinCount = Phaser.Math.Between(3, 4);
      for (let i = 0; i < coinCount; i++) {
        this.dropCoin(enemy.x + Phaser.Math.Between(-28, 28), enemy.y + Phaser.Math.Between(-28, 28));
      }
    } else {
      const dropChance = 0.10 + this.config.buffs.coinDropBonus;
      if (Math.random() < dropChance) {
        this.dropCoin(enemy.x + Phaser.Math.Between(-20, 20), enemy.y + Phaser.Math.Between(-20, 20));
      }
    }

    this.kills++;
    this.waveKills++;

    // 콤보 업데이트
    this.combo++;
    this.comboTimer?.destroy();
    this.comboTimer = this.time.delayedCall(this.COMBO_RESET_MS, () => { this.combo = 0; });

    // 콤보 보너스 점수
    const comboBonus = this.combo >= 3 ? Math.round(5 * this.wave * Math.min(this.combo, 20)) : 0;
    this.score += 10 * this.wave + comboBonus + (isElite ? 30 * this.wave : 0);

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
      this.spawnTimer?.destroy(); // 잔여 스폰 즉시 중단
      this.time.delayedCall(800, () => {
        this.wave++;
        this.startWave(this.wave);
      });
    }
  }

  // ─── 경험치 / 레벨업 ─────────────────────
  private gainExp(amount: number) {
    this.exp += Math.round(amount * this.config.buffs.expMulti * this.runtimeExpMulti);
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

    // 봄동비빔밥: 무기 슬롯 +1
    const maxSlots = MAX_WEAPON_SLOTS + (this.config.buffs.extraWeaponSlot ? 1 : 0);

    // ① 신규 무기 (슬롯 여유가 있을 때만)
    if (this.equippedWeapons.length < maxSlots) {
      const newWeapons = BASE_WEAPONS.filter(w => !equipped.has(w.id));
      const picks = Phaser.Utils.Array.Shuffle([...newWeapons]).slice(0, 2);
      picks.forEach(w => {
        opts.push({ type: "weapon_new", weaponId: w.id, label: w.name, description: w.description, emoji: w.emoji });
      });
    }

    // ② 강화 가능 무기 (레벨 < MAX인 것 중 랜덤 1개)
    const upgradable = this.equippedWeapons.filter(w => w.level < MAX_WEAPON_LEVEL);
    if (upgradable.length > 0) {
      const upgrade = Phaser.Utils.Array.GetRandom(upgradable);
      const toAwaken = upgrade.level === MAX_WEAPON_LEVEL - 1;
      const awakInfo = AWAKENING_INFO[upgrade.id];
      opts.push({
        type: "weapon_up",
        weaponId: upgrade.id,
        label: toAwaken ? `✨ ${awakInfo?.label ?? upgrade.name} 각성` : `${upgrade.name} Lv.${upgrade.level + 1}`,
        description: toAwaken
          ? `각성: ${awakInfo?.description ?? "스킬이 강력해져요!"}`
          : `데미지 +25%, 쿨다운 -10%`,
        emoji: toAwaken ? (awakInfo?.emoji ?? "💥") : upgrade.emoji,
      });
    }

    // ③ 패시브 (옵션이 3개 미만이면 보충)
    const passivePool = Phaser.Utils.Array.Shuffle([...PASSIVE_UPGRADES]);
    let pIdx = 0;
    while (opts.length < 3 && pIdx < passivePool.length) {
      opts.push(passivePool[pIdx++]);
    }

    return Phaser.Utils.Array.Shuffle(opts).slice(0, 3);
  }

  /** 외부(React)에서 레벨업 선택 후 호출 */
  public applyUpgrade(option: UpgradeOption) {
    if (option.type === "weapon_new" && option.weaponId) {
      this.equipWeapon(option.weaponId);

    } else if (option.type === "weapon_up" && option.weaponId) {
      const w = this.equippedWeapons.find(x => x.id === option.weaponId);
      if (w && w.level < MAX_WEAPON_LEVEL) {
        w.damage   = Math.round(w.damage * 1.25);
        w.cooldown = Math.round(w.cooldown * 0.9);
        w.level++;
        if (w.level >= MAX_WEAPON_LEVEL) {
          w.awakened = true;
          this.triggerAwakening(w);
        }
        this.startWeaponTimer(w);
      }

    } else if (option.type === "passive" && option.passiveId) {
      switch (option.passiveId) {
        case "hp_regen":
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + Math.round(this.playerMaxHp * 0.20));
          break;
        case "speed_up":
          this.playerSpeed *= 1.10;
          break;
        case "atk_power":
          this.equippedWeapons.forEach(w => { w.damage = Math.round(w.damage * 1.15); });
          break;
        case "exp_boost":
          this.runtimeExpMulti *= 1.20;
          break;
      }
    }
    this.paused = false;
  }

  /** 각성 연출 */
  private triggerAwakening(weapon: WeaponConfig) {
    this.cameras.main.flash(600, 255, 200, 0);
    const info = AWAKENING_INFO[weapon.id];
    const label = this.add.text(
      this.player.x, this.player.y - 70,
      `✨ ${info?.label ?? weapon.name} 각성!`,
      { fontSize: "20px", color: "#fbbf24", fontStyle: "bold", stroke: "#000000", strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: label,
      y: label.y - 90,
      alpha: 0,
      duration: 2200,
      onComplete: () => label.destroy(),
    });
  }

  // ─── 플레이어 피격 ────────────────────────
  private takeDamage(damage: number) {
    if (this.invincible) return;
    this.playerHp = Math.floor(this.playerHp - damage);
    this.invincible = true;
    this.time.delayedCall(250, () => { this.invincible = false; });
    // 피격 애니
    this.playerAnim = "damage";
    this.player.play("cat_damage");
    // 피격 시 콤보 초기화
    if (this.combo > 0) {
      this.combo = 0;
      this.comboTimer?.destroy();
    }
    this.cameras.main.shake(150, 0.005);

    // 두쫀쿠 — 반격 충격파 (피해 누적 후 자동 발동)
    if (this.config.buffs.counterShockwave) {
      this.counterDmgAccum += damage;
      if (this.counterDmgAccum >= this.COUNTER_THRESHOLD) {
        this.counterDmgAccum = 0;
        this.triggerCounterShockwave();
      }
    }

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
    this.playerAnim = "die";
    this.player.play("cat_die");
    this.paused = true;
    this.spawnTimer?.destroy();
    this.bossWizardTimer?.destroy();
    this.bossChargeTimer?.destroy();
    this.bossSikhyeTimer?.destroy();
    this.bossTteokTimer?.destroy();
    this.comboTimer?.destroy();
    // 독 웅덩이 전부 제거
    this.poisonPuddles.getChildren().forEach(p => p.destroy());
    this.poisonPuddles.clear(true, true);
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

  private triggerGameClear() {
    this.paused = true;
    this.spawnTimer?.destroy();
    this.bossWizardTimer?.destroy();
    this.bossChargeTimer?.destroy();
    this.bossSikhyeTimer?.destroy();
    this.bossTteokTimer?.destroy();
    this.comboTimer?.destroy();
    this.poisonPuddles.getChildren().forEach(p => p.destroy());
    this.poisonPuddles.clear(true, true);
    this.weaponTimers.forEach(t => t.destroy());
    this.events.emit(GAME_EVENTS.GAME_CLEAR, {
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
    if (this.dashCooldownRemain > 0) this.dashCooldownRemain = Math.max(0, this.dashCooldownRemain - dt);
    if (!this.isDashing) this.movePlayer(dt);
    this.moveEnemies(dt);

    this.moveProjectiles(dt);
    this.collectOrbs();
    this.collectCoins();
    this.checkEnemyPlayerCollision();
    if (this.bossType === "boss_sikhye") this.checkPoisonPuddles();
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
    const moving = len > 0;
    if (moving) { vx /= len; vy /= len; }
    this.player.x += vx * this.playerSpeed * dt;
    this.player.y += vy * this.playerSpeed * dt;

    // 좌우 반전
    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);

    // 이동/정지 애니 전환 (피격·대시 중엔 유지)
    if (this.playerAnim === "idle" || this.playerAnim === "run") {
      const target = moving ? "run" : "idle";
      if (this.playerAnim !== target) {
        this.playerAnim = target;
        this.player.play(`cat_${target}`);
      }
    }
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
        // 초음파 포효 각성: 적 이동속도 감소
        if ((proj as any).slowOnHit && e.active) {
          const origSpeed = (e as any).speed;
          (e as any).speed = Math.round(origSpeed * 0.5);
          this.time.delayedCall(1500, () => { if (e.active) (e as any).speed = origSpeed; });
        }
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
      weapons:      this.equippedWeapons.map(w => ({
        id: w.id, name: w.name, emoji: w.emoji, level: w.level, awakened: w.awakened,
      })),
      combo:        this.combo,
      dashCooldown: this.dashCooldownRemain,
    } satisfies GameStats);
  }
}
