"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, Search, X } from "lucide-react";
import dynamic from "next/dynamic";

const CatDodgeGame = dynamic(() => import("@/components/CatDodgeGame"), {
  ssr: false,
});

/* ─────────────────────────────────────────────
   고양이 감정 단계 (클릭 0~9 → 10번째 😻 피날레)
───────────────────────────────────────────── */
const CAT_STAGES = [
  "🐱", // 0  산책 중
  "😺", // 1  나 발견됨?
  "😸", // 2  기분 좋아짐
  "😼", // 3  수상하다
  "😽", // 4  관심 생김
  "🙀", // 5  충격
  "😹", // 6  어이없어서 웃음
  "😿", // 7  슬퍼짐
  "😾", // 8  삐짐
  "😺", // 9  결국 좋아
];

function WalkingCat({ onGameStart }: { onGameStart: () => void }) {
  const posRef = useRef({ x: 80, y: 400 });
  const dirRef = useRef({ x: 1, y: 0.2 });
  const phaseRef = useRef<"walking" | "hearts" | "hidden">("walking");
  const clicksRef = useRef(0);

  const [renderPos, setRenderPos] = useState({ x: 80, y: 400 });
  const [goingRight, setGoingRight] = useState(true);
  const [clicks, setClicks] = useState(0);
  const [phase, setPhase] = useState<"walking" | "hearts" | "hidden">(
    "walking",
  );
  const [popping, setPopping] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    const id = setInterval(() => {
      if (phaseRef.current !== "walking") return;

      const speed = 1.2;
      let { x, y } = posRef.current;
      let { x: dx, y: dy } = dirRef.current;

      x += dx * speed;
      y += dy * speed;

      const maxX = window.innerWidth - 36;
      const maxY = window.innerHeight - 36;

      if (x < 0) {
        x = 0;
        dx = Math.abs(dx);
        setGoingRight(true);
      }
      if (x > maxX) {
        x = maxX;
        dx = -Math.abs(dx);
        setGoingRight(false);
      }
      if (y < 80) {
        y = 80;
        dy = Math.abs(dy);
      }
      if (y > maxY) {
        y = maxY;
        dy = -Math.abs(dy);
      }

      if (Math.random() < 0.008) dy = (Math.random() - 0.5) * 0.8;

      posRef.current = { x, y };
      dirRef.current = { x: dx, y: dy };
      setRenderPos({ x, y });
    }, 40);

    return () => clearInterval(id);
  }, []);

  const handleClick = () => {
    if (phaseRef.current !== "walking") return;
    clicksRef.current += 1;
    const n = clicksRef.current;
    setClicks(n);

    // 팝 애니메이션
    setPopping(true);
    setTimeout(() => setPopping(false), 350);

    if (n >= 10) {
      phaseRef.current = "hearts";
      setPhase("hearts");
      setTimeout(() => {
        phaseRef.current = "hidden";
        setPhase("hidden");
        onGameStart();
      }, 1600);
    }
  };

  if (phase === "hidden") return null;

  const emoji =
    phase === "hearts"
      ? "😻"
      : CAT_STAGES[Math.min(clicks, CAT_STAGES.length - 1)];

  const fontSize = 20 + clicks * 2.5; // 20px → 45px (10번)

  return (
    <div
      onClick={handleClick}
      style={{
        position: "fixed",
        left: renderPos.x,
        top: renderPos.y,
        zIndex: 9999,
        userSelect: "none",
        cursor: "pointer",
        transform: goingRight ? "scaleX(1)" : "scaleX(-1)",
      }}
    >
      {/* 고양이 이모지 */}
      <span
        key={clicks}
        style={{
          display: "inline-block",
          fontSize: `${fontSize}px`,
          lineHeight: 1,
          animation:
            phase === "hearts"
              ? "catHearts 1.6s ease-out forwards"
              : popping
                ? "catPop 0.35s ease-out"
                : "catBob 0.35s ease-in-out infinite",
        }}
      >
        {emoji}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   아코디언 섹션 컴포넌트
───────────────────────────────────────────── */
function Section({
  id,
  emoji,
  title,
  open,
  highlighted,
  onToggle,
  children,
}: {
  id: string;
  emoji: string;
  title: string;
  open: boolean;
  highlighted: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`section-${id}`}
      className="rounded-[24px] border shadow-sm overflow-hidden"
      style={{
        animation: highlighted ? "guideFlash 1.4s ease-out" : undefined,
        borderColor: highlighted ? "#3182F6" : "#f1f5f9",
        backgroundColor: "white",
      }}
    >
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-5 py-4 text-left active:bg-[#F9FAFB] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[22px] leading-none">{emoji}</span>
          <span className="text-[15px] font-bold text-[#191F28]">{title}</span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-[#8B95A1] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-[#F2F4F6]">{children}</div>
      )}
    </div>
  );
}

/* 스텝 컴포넌트 */
function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 w-5 h-5 rounded-full bg-[#3182F6] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
        {num}
      </span>
      <p className="text-[14px] text-[#191F28] leading-relaxed">{text}</p>
    </div>
  );
}

/* 팁 박스 */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 px-4 py-3 bg-[#E8F3FF] rounded-[16px]">
      <p className="text-[13px] text-[#3182F6] leading-relaxed font-medium">
        💡 {children}
      </p>
    </div>
  );
}

/* 주의 박스 */
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 px-4 py-3 bg-[#FFF7E6] rounded-[16px]">
      <p className="text-[13px] text-[#E67700] leading-relaxed font-medium">
        ⚠️ {children}
      </p>
    </div>
  );
}

/* 섹션 내부 소제목 */
function Sub({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-bold text-[#8B95A1] uppercase tracking-wide mt-5 mb-2">
      {children}
    </p>
  );
}

/* 배지 */
function Badge({
  color,
  bg,
  children,
}: {
  color: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold"
      style={{ color, backgroundColor: bg }}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────
   업데이트 내역 컴포넌트
───────────────────────────────────────────── */
function UpdateHistory() {
  return (
    <div className="space-y-4">
      {/* v1.0.4 */}
      <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-[#3182F6] text-white text-[13px] font-bold rounded-full">
            v1.0.4
          </span>
          <span className="text-[13px] text-[#8B95A1] font-medium">
            2026. 3. 25. · 크레딧 시스템 + 어드민 리뉴얼
          </span>
        </div>
        <div className="space-y-3">
          <UpdateItem emoji="🏅" title="크레딧 & 등급 시스템">
            출퇴근 상태에 따라 크레딧이 쌓여요. 아이언부터 다이아몬드까지
            6단계 등급이 있고, 연속 출근 보너스도 받을 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="📊" title="크레딧 이력 페이지">
            마이페이지에서 내 등급, 크레딧 점수, 연속 출근 현황, 이번 달
            크레딧 변동 내역을 확인할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="📆" title="캘린더 뷰 추가">
            월간 달력에서 내 스케줄, 출퇴근 기록, 팀 동료 스케줄, 회사 일정을
            레이어별로 확인할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="📊" title="홈 화면 월간 근무 요약">
            이번 달 총 출근 일수와 근무 시간 요약이 홈 화면에 표시돼요.
          </UpdateItem>
          <UpdateItem emoji="⏰" title="추가근무 관리">
            예정 외 추가근무 내역을 관리자가 등록하고 확인할 수 있어요.
          </UpdateItem>
        </div>
      </div>

      {/* v1.0.3 */}
      <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-[#3182F6] text-white text-[13px] font-bold rounded-full">
            v1.0.3
          </span>
          <span className="text-[13px] text-[#8B95A1] font-medium">
            2026. 3. 23. · 캘린더 + 어드민 대시보드
          </span>
        </div>
        <div className="space-y-3">
          <UpdateItem emoji="📆" title="통합 캘린더 추가">
            월간 달력에서 내 스케줄, 근태 기록, 팀 동료 스케줄, 회사 공지 일정을
            한눈에 볼 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="🏢" title="회사 일정 표시">
            관리자가 등록한 휴무일, 회의, 행사 등이 캘린더에 표시돼요.
            근무지별 일정도 구분돼요.
          </UpdateItem>
          <UpdateItem emoji="🎨" title="근무지 색상 시스템 개편">
            각 근무지에 고유 색상이 적용돼서 스케줄을 더 직관적으로 구분할 수
            있어요.
          </UpdateItem>
        </div>
      </div>

      {/* v1.0.2 */}
      <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-[#3182F6] text-white text-[13px] font-bold rounded-full">
            v1.0.2
          </span>
          <span className="text-[13px] text-[#8B95A1] font-medium">
            2026. 3. 21. · 푸시 알림 + 버그 수정
          </span>
        </div>
        <div className="space-y-3">
          <UpdateItem emoji="🔔" title="푸시 알림 추가">
            출퇴근 기록, 대타 요청·수락·거절, 스케줄 발행, 공지사항 등 주요
            알림을 기기 알림으로 받을 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="🔄" title="대타 수락 처리 개선">
            여러 슬롯이 겹칠 때도 대타 수락이 올바르게 동작해요.
          </UpdateItem>
        </div>
      </div>

      {/* v1.0.1 */}
      <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-[#3182F6] text-white text-[13px] font-bold rounded-full">
            v1.0.1
          </span>
          <span className="text-[13px] text-[#8B95A1] font-medium">
            2026. 3. 20. · 홈 화면 개선
          </span>
        </div>
        <div className="space-y-3">
          <UpdateItem emoji="📅" title="이번 주 스케줄 카드 개선">
            날짜 숫자가 표시되고 셀이 더 커져서 한눈에 보기 편해졌어요. 근무지
            이름도 셀 안에 바로 보여요.
          </UpdateItem>
          <UpdateItem emoji="📢" title="공지사항 & 레시피 카드 배치 변경">
            공지사항과 레시피 바로가기가 나란히 배치됐어요. 스크롤 없이 홈
            화면에서 바로 확인할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="⚡" title="홈 화면 로딩 속도 개선">
            불필요한 거리 계산 로직을 제거해 홈 화면이 더 빠르게 열려요.
          </UpdateItem>
        </div>
      </div>

      <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
        {/* v1.0.0 */}
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-[#3182F6] text-white text-[13px] font-bold rounded-full">
            v1.0.0
          </span>
          <span className="text-[13px] text-[#8B95A1] font-medium">
            2026. 3. 19. · 최초 출시
          </span>
        </div>

        <div className="space-y-3">
          <UpdateItem emoji="📍" title="위치 기반 출퇴근">
            GPS로 매장 반경 100m를 자동 감지해요. 도착하면 버튼 하나로 출근
            완료예요.
          </UpdateItem>
          <UpdateItem emoji="✈️" title="출장출근 / 원격퇴근 지원">
            케이터링 등 외부 현장 근무 시 출장출근으로 처리할 수 있어요. 매장
            밖에서도 퇴근 가능해요.
          </UpdateItem>
          <UpdateItem emoji="🏪" title="위치 실패 시 매장 수동 선택">
            GPS 신호가 잡히지 않으면 매장을 직접 선택해서 출퇴근할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="✅" title="출근·퇴근 체크리스트">
            출퇴근 때마다 역할별 체크리스트가 자동으로 나와요. 중간에 닫아도
            이어서 완료할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="📅" title="주간 스케줄 확인">
            이번 주 내 스케줄을 한눈에 볼 수 있어요. 날짜별로
            근무지·포지션·시간을 확인할 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="🏷️" title="카페 포지션 표시">
            카페 근무 시 홀·주방·쇼룸 포지션이 스케줄과 출퇴근 카드에 함께
            표시돼요.
          </UpdateItem>
          <UpdateItem emoji="🔄" title="대타 요청 & 수락 시스템">
            원하는 날 대타를 요청할 수 있어요. 관리자 승인 후 다른 직원이
            수락하면 확정돼요.
          </UpdateItem>
          <UpdateItem emoji="📢" title="공지사항">
            관리자가 올린 공지를 앱에서 바로 확인할 수 있어요. 중요 공지는 홈
            화면에 배너로 표시돼요.
          </UpdateItem>
          <UpdateItem emoji="📖" title="레시피 열람">
            카테고리별로 정리된 레시피를 언제든 찾아볼 수 있어요.
          </UpdateItem>
          <UpdateItem emoji="📋" title="내 출퇴근 기록 조회">
            지금까지의 출퇴근 기록을 날짜별로 확인할 수 있어요.
          </UpdateItem>
        </div>
      </div>
    </div>
  );
}

function UpdateItem({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#F2F4F6] last:border-0">
      <span className="text-[20px] shrink-0 leading-none mt-0.5">{emoji}</span>
      <div>
        <p className="text-[14px] font-bold text-[#191F28] mb-0.5">{title}</p>
        <p className="text-[13px] text-[#4E5968] leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   검색 인덱스
───────────────────────────────────────────── */
const SEARCH_INDEX = [
  {
    id: "home",
    emoji: "🏠",
    title: "홈 화면",
    keywords: [
      "홈",
      "근무 상태",
      "오늘 스케줄",
      "알림",
      "공지 배너",
      "출퇴근 버튼",
    ],
  },
  {
    id: "checkin",
    emoji: "☀️",
    title: "출근하기",
    keywords: [
      "출근",
      "GPS",
      "위치",
      "반경",
      "위치 권한",
      "아이폰",
      "안드로이드",
    ],
  },
  {
    id: "biztrip",
    emoji: "✈️",
    title: "출장출근 & 위치 실패",
    keywords: [
      "출장",
      "출장출근",
      "수동 매장",
      "매장 선택",
      "GPS 실패",
      "원격",
      "케이터링",
    ],
  },
  {
    id: "checklist-in",
    emoji: "✅",
    title: "출근 체크리스트",
    keywords: ["체크리스트", "출근 체크", "체크", "완료", "이어서"],
  },
  {
    id: "checkout",
    emoji: "🌙",
    title: "퇴근하기",
    keywords: ["퇴근", "원격퇴근", "퇴근 체크리스트", "매장 밖"],
  },
  {
    id: "schedule",
    emoji: "📅",
    title: "내 스케줄",
    keywords: [
      "스케줄",
      "주간",
      "포지션",
      "홀",
      "주방",
      "쇼룸",
      "카페",
      "공장",
    ],
  },
  {
    id: "substitute",
    emoji: "🔄",
    title: "대타 요청 & 수락",
    keywords: ["대타", "요청", "수락", "대타 요청", "대타 수락"],
  },
  {
    id: "announcements",
    emoji: "📢",
    title: "공지사항",
    keywords: ["공지", "공지사항", "고정 공지", "배너"],
  },
  {
    id: "recipes",
    emoji: "📖",
    title: "레시피",
    keywords: ["레시피", "레시피 찾기", "카테고리"],
  },
  {
    id: "attendances",
    emoji: "📋",
    title: "출퇴근 기록",
    keywords: ["출퇴근 기록", "기록", "이력", "수정"],
  },
  {
    id: "profile",
    emoji: "⚙️",
    title: "내 정보 수정",
    keywords: ["정보 수정", "이름", "연락처", "프로필"],
  },
  {
    id: "credit",
    emoji: "🏅",
    title: "크레딧 & 등급",
    keywords: [
      "크레딧",
      "등급",
      "티어",
      "점수",
      "스트릭",
      "연속 출근",
      "다이아몬드",
      "플래티넘",
      "골드",
      "실버",
      "브론즈",
      "아이언",
      "감점",
      "가점",
    ],
  },
  {
    id: "calendar",
    emoji: "📆",
    title: "캘린더",
    keywords: [
      "캘린더",
      "월간",
      "팀 스케줄",
      "회사 일정",
      "근태",
      "출퇴근 기록",
    ],
  },
  {
    id: "overtime",
    emoji: "⏰",
    title: "추가근무",
    keywords: ["추가근무", "연장근무", "오버타임", "추가근무 요청"],
  },
  {
    id: "push",
    emoji: "🔔",
    title: "알림 설정",
    keywords: [
      "알림",
      "푸시 알림",
      "알림 설정",
      "대타 알림",
      "스케줄 알림",
      "공지 알림",
      "알림 켜기",
      "알림 끄기",
    ],
  },
];

/* ─────────────────────────────────────────────
   메인 페이지
───────────────────────────────────────────── */
const CURRENT_VERSION = "v1.0.4";

export default function GuidePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"guide" | "updates">("guide");
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const [showDodge, setShowDodge] = useState(false);

  // 진입 시 레드닷 해제
  useEffect(() => {
    localStorage.setItem("guide_seen_version", CURRENT_VERSION);
  }, []);

  const results =
    query.trim().length > 0
      ? SEARCH_INDEX.flatMap((s) => {
          const q = query.trim();
          const titleMatch = s.title.includes(q);
          const matchedKeywords = s.keywords.filter(
            (k) => k.includes(q) && k !== s.title,
          );
          if (!titleMatch && matchedKeywords.length === 0) return [];
          return [
            {
              ...s,
              matchedKeywords: titleMatch ? matchedKeywords : matchedKeywords,
            },
          ];
        })
      : [];

  // 쿼리와 겹치는 텍스트 부분에 하이라이트 처리
  const Highlight = ({ text }: { text: string }) => {
    const q = query.trim();
    const idx = text.indexOf(q);
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <span className="bg-[#E5E8EB] text-[#191F28] rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </span>
        {text.slice(idx + q.length)}
      </span>
    );
  };

  const handleSelect = (id: string) => {
    setQuery("");
    setTab("guide");
    setOpen(id);
    setTimeout(() => {
      const el = document.getElementById(`section-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlighted(id);
      setTimeout(() => setHighlighted(null), 1500);
    }, 100);
  };

  const toggle = (id: string) => setOpen((prev) => (prev === id ? null : id));

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F4F6] font-pretendard">
      <style>{`
        @keyframes guideFlash {
          0%   { background-color: white;   box-shadow: 0 0 0 0px rgba(49,130,246,0); }
          20%  { background-color: #E8F3FF; box-shadow: 0 0 0 3px rgba(49,130,246,0.35); }
          60%  { background-color: #E8F3FF; box-shadow: 0 0 0 3px rgba(49,130,246,0.15); }
          100% { background-color: white;   box-shadow: 0 0 0 0px rgba(49,130,246,0); }
        }
        @keyframes catBob {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes catPop {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.55); }
          100% { transform: scale(1); }
        }
        @keyframes catHearts {
          0%   { transform: scale(1);   opacity: 1; }
          40%  { transform: scale(2.2); opacity: 1; }
          70%  { transform: scale(2.4); opacity: 0.8; }
          100% { transform: scale(0.3); opacity: 0; }
        }
        @keyframes labelPop {
          0%   { opacity: 0; transform: translateX(-50%) translateY(4px); }
          15%  { opacity: 1; transform: translateX(-50%) translateY(0px); }
          70%  { opacity: 1; transform: translateX(-50%) translateY(0px); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
        }
      `}</style>
      <WalkingCat onGameStart={() => setShowDodge(true)} />
      {showDodge && <CatDodgeGame onClose={() => setShowDodge(false)} />}
      {/* 헤더 */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white/90 backdrop-blur-md border-b border-[#E5E8EB]">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F2F4F6] transition-colors"
          aria-label="뒤로가기"
        >
          <ChevronLeft className="w-5 h-5 text-[#191F28]" />
        </button>
        <h1 className="text-[17px] font-bold text-[#191F28]">이용가이드</h1>
      </header>

      <main className="flex-1 px-5 pb-12 space-y-4 pt-4">
        {/* 버전 카드 */}
        <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[13px] text-[#8B95A1] font-medium mb-1">
                연경당 HR
              </p>
              <span className="inline-block px-3 py-1 bg-[#E8F3FF] text-[#3182F6] text-[13px] font-bold rounded-full">
                v1.0.4
              </span>
            </div>
            <span className="text-[12px] text-[#8B95A1]">2026. 3. 25.</span>
          </div>
          <p className="mt-3 text-[14px] text-[#4E5968] leading-relaxed">
            근무 기록부터 스케줄 확인까지,
            <br />
            연경당 모든 직원을 위한 HR 앱이에요.
          </p>
        </div>

        {/* 검색 */}
        <div ref={searchRef} className="relative">
          <div className="flex items-center gap-2 bg-white rounded-[20px] px-4 py-3 border border-slate-100 shadow-sm">
            <Search className="w-4 h-4 text-[#8B95A1] shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="궁금한 기능을 검색해요"
              className="flex-1 text-[14px] text-[#191F28] placeholder-[#C5CBD3] bg-transparent outline-none"
            />
            {query.length > 0 && (
              <button onClick={() => setQuery("")}>
                <X className="w-4 h-4 text-[#8B95A1]" />
              </button>
            )}
          </div>
          {results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[20px] border border-slate-100 shadow-lg z-30 overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleSelect(r.id)}
                  className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-[#F9FAFB] active:bg-[#F2F4F6] transition-colors border-b border-[#F2F4F6] last:border-0"
                >
                  <span className="text-[18px] leading-none mt-0.5 shrink-0">
                    {r.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#191F28]">
                      <Highlight text={r.title} />
                    </p>
                    {r.matchedKeywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.matchedKeywords.map((kw) => (
                          <span key={kw} className="text-[12px] text-[#8B95A1]">
                            <Highlight text={kw} />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {query.trim().length > 0 && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-[20px] border border-slate-100 shadow-lg z-30 px-4 py-5 text-center">
              <p className="text-[14px] text-[#8B95A1]">검색 결과가 없어요</p>
            </div>
          )}
        </div>

        {/* 탭 */}
        <div className="flex bg-white rounded-[20px] p-1.5 border border-slate-100 gap-1">
          {(["guide", "updates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-[14px] text-[14px] font-bold transition-all ${
                tab === t ? "bg-[#3182F6] text-white" : "text-[#8B95A1]"
              }`}
            >
              {t === "guide" ? "이용가이드" : "업데이트 내역"}
            </button>
          ))}
        </div>

        {/* ───────── 이용가이드 탭 ───────── */}
        {tab === "guide" ? (
          <div className="space-y-3">
            {/* 1. 홈 화면 */}
            <Section
              id="home"
              emoji="🏠"
              title="홈 화면"
              open={open === "home"}
              highlighted={highlighted === "home"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                앱을 열면 가장 먼저 보이는 화면이에요. 오늘 근무 상황을 한눈에
                확인할 수 있어요.
              </p>
              <Sub>화면 구성</Sub>
              <div className="space-y-3 mt-1">
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📌 근무 상태 카드
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    지금 출근 중인지 퇴근 전인지 바로 확인해요. 출근·퇴근 버튼도
                    여기에 있어요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📅 오늘 스케줄
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    오늘 배정된 근무지, 포지션, 시간이 표시돼요. 스케줄이 없으면
                    보이지 않아요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📢 공지사항 & 레시피
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    공지사항 카드와 레시피 바로가기 카드가 나란히 배치돼요.
                    읽지 않은 공지는 빨간 숫자로 표시돼요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    🏅 크레딧 카드
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    현재 등급과 크레딧 점수, 연속 출근 일수를 한눈에 확인할 수
                    있어요. 탭하면 크레딧 상세 페이지로 이동해요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📅 이번 주 스케줄 카드
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    요일·날짜별로 내 근무 시간과 근무지를 한눈에 볼 수 있어요.
                    탭하면 스케줄 상세 페이지로 이동해요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📊 월간 근무 요약
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    이번 달 총 출근 일수와 근무 시간을 요약해서 보여줘요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    🔔 알림
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    우측 상단 벨 아이콘을 탭하면 알림 목록이 펼쳐져요. 읽지 않은
                    알림은 파란 점으로 표시돼요.
                  </p>
                </div>
              </div>
            </Section>

            {/* 4. 출근하기 */}
            <Section
              id="checkin"
              emoji="☀️"
              title="출근하기"
              open={open === "checkin"}
              highlighted={highlighted === "checkin"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                매장 반경 100m 안에 있으면 GPS로 위치를 자동 감지해요.
              </p>
              <Sub>출근 순서</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="매장에 도착한 후 홈 화면에서 '출근하기'를 탭해요."
                />
                <Step
                  num={2}
                  text="GPS로 위치를 확인하는 동안 잠깐 기다려요."
                />
                <Step
                  num={3}
                  text="확인이 완료되면 출근이 기록돼요. 체크리스트가 있으면 바로 이어서 열려요."
                />
              </div>
              <Sub>위치 권한 설정</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                처음 출근 시 위치 권한 요청이 나와요.{" "}
                <strong>&#39;앱 사용 중 허용&#39;</strong> 또는{" "}
                <strong>&#39;항상 허용&#39;</strong>을 선택해야 출퇴근이 정상
                작동해요.
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-[13px] font-bold text-[#4E5968] shrink-0">
                    iPhone
                  </span>
                  <p className="text-[13px] text-[#4E5968]">
                    설정 → 개인 정보 보호 및 보안 → 위치 서비스 → 연경당 HR →
                    '앱 사용 중'으로 변경
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[13px] font-bold text-[#4E5968] shrink-0">
                    Android
                  </span>
                  <p className="text-[13px] text-[#4E5968]">
                    설정 → 앱 → 연경당 HR → 권한 → 위치 → '앱 사용 중 허용'으로
                    변경
                  </p>
                </div>
              </div>
              <Tip>
                위치가 잡히지 않으면 '재시도'를 탭해요. 그래도 안 되면 잠시 후
                다시 시도해요.
              </Tip>
            </Section>

            {/* 5. 출장출근 / 수동 매장 선택 */}
            <Section
              id="biztrip"
              emoji="✈️"
              title="출장출근 & 위치 실패 대처"
              open={open === "biztrip"}
              highlighted={highlighted === "biztrip"}
              onToggle={toggle}
            >
              <Sub>출장출근 — 매장 반경 밖에서 출근할 때</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                케이터링 등 외부 현장 근무거나 반경 100m 밖에 있을 때 사용해요.
              </p>
              <div className="space-y-3 mt-3">
                <Step num={1} text="홈 화면에서 '출근하기'를 탭해요." />
                <Step
                  num={2}
                  text="반경 초과 안내가 나오면 '출장 출근할게요'를 탭해요."
                />
                <Step num={3} text="출장출근으로 기록돼요." />
              </div>

              <Sub>수동 매장 선택 — GPS 신호가 안 잡힐 때</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                GPS 신호가 불안정하면 매장을 직접 선택해서 출퇴근할 수 있어요.
              </p>
              <div className="space-y-3 mt-3">
                <Step
                  num={1}
                  text="위치 확인 실패 안내가 나오면 '매장 직접 선택하기'를 탭해요."
                />
                <Step num={2} text="근무 중인 매장을 목록에서 선택해요." />
                <Step
                  num={3}
                  text="선택한 매장으로 기록되고 관리자에게 알림이 전송돼요."
                />
              </div>
              <Warn>
                반드시 실제 근무 중인 매장을 선택해요. 잘못 선택했으면
                관리자에게 바로 알려주세요.
              </Warn>
            </Section>

            {/* 6. 출근 체크리스트 */}
            <Section
              id="checklist-in"
              emoji="✅"
              title="출근 체크리스트"
              open={open === "checklist-in"}
              highlighted={highlighted === "checklist-in"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                출근이 기록되면 역할에 맞는 체크리스트가 자동으로 열려요. 업무
                시작 전에 완료해야 해요.
              </p>
              <Sub>진행 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="출근 완료 후 체크리스트 화면이 자동으로 열려요."
                />
                <Step num={2} text="항목을 하나씩 확인하고 체크해요." />
                <Step num={3} text="모두 체크하면 '완료하기'를 탭해요." />
              </div>
              <Sub>중간에 닫았을 때</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                완료하지 않고 닫아도 홈 화면에 배너가 남아 있어요. 탭하면 이어서
                진행할 수 있고, 이미 체크한 항목은 그대로 유지돼요.
              </p>
              <Tip>
                체크리스트 항목은 근무지(카페/공장/케이터링)와
                포지션(홀/주방/쇼룸)에 따라 다르게 구성돼요.
              </Tip>
            </Section>

            {/* 7. 퇴근하기 */}
            <Section
              id="checkout"
              emoji="🌙"
              title="퇴근하기"
              open={open === "checkout"}
              highlighted={highlighted === "checkout"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                퇴근 버튼을 탭하면 체크리스트가 먼저 나와요. 완료 후 GPS로
                위치를 확인하고 퇴근이 기록돼요.
              </p>
              <Sub>일반 퇴근 순서</Sub>
              <div className="space-y-3">
                <Step num={1} text="홈 화면에서 '퇴근하기'를 탭해요." />
                <Step num={2} text="퇴근 체크리스트를 완료해요." />
                <Step num={3} text="GPS 위치 확인 후 퇴근이 기록돼요." />
              </div>

              <Sub>원격퇴근 — 매장 밖에서 퇴근할 때</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                배달이나 늦은 퇴근 등으로 매장 밖에서 퇴근해야 할 때 사용해요.
              </p>
              <div className="space-y-3 mt-3">
                <Step
                  num={1}
                  text="'퇴근하기'를 탭하고 체크리스트를 완료해요."
                />
                <Step num={2} text="반경 초과 안내 후 원격퇴근 폼이 나와요." />
                <Step
                  num={3}
                  text="퇴근 사유를 입력하고 '퇴근할게요'를 탭해요."
                />
              </div>
              <Warn>체크리스트를 완료해야 퇴근 처리가 시작돼요.</Warn>
            </Section>

            {/* 8. 내 스케줄 */}
            <Section
              id="schedule"
              emoji="📅"
              title="내 스케줄"
              open={open === "schedule"}
              highlighted={highlighted === "schedule"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                이번 주 내 근무 스케줄을 한눈에 볼 수 있어요. 홈 화면 하단
                메뉴에서 진입해요.
              </p>
              <Sub>스케줄 확인 방법</Sub>
              <div className="space-y-3">
                <Step num={1} text="좌우 화살표로 주간을 이동해요." />
                <Step
                  num={2}
                  text="날짜를 탭하면 해당 날의 스케줄이 아래에 표시돼요."
                />
                <Step
                  num={3}
                  text="각 슬롯에서 근무지·포지션·시간을 확인해요."
                />
              </div>
              <Sub>포지션 배지</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed mb-2">
                카페 근무 시 배정된 포지션이 배지로 표시돼요.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Badge color="#3182F6" bg="#E8F3FF">
                  카페
                </Badge>
                <Badge color="#4E5968" bg="#F2F4F6">
                  홀
                </Badge>
                <Badge color="#4E5968" bg="#F2F4F6">
                  주방
                </Badge>
                <Badge color="#4E5968" bg="#F2F4F6">
                  쇼룸
                </Badge>
                <Badge color="#00B761" bg="#E6FAF0">
                  공장
                </Badge>
                <Badge color="#F59E0B" bg="#FFF7E6">
                  케이터링
                </Badge>
              </div>
              <Tip>
                스케줄은 관리자가 배정해요. 내 스케줄에 오류가 있으면 관리자에게
                문의해요.
              </Tip>
            </Section>

            {/* 9. 대타 요청 & 수락 */}
            <Section
              id="substitute"
              emoji="🔄"
              title="대타 요청 & 수락"
              open={open === "substitute"}
              highlighted={highlighted === "substitute"}
              onToggle={toggle}
            >
              <Sub>대타 요청하기 — 내 근무를 대신 맡아달라고 할 때</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="'내 스케줄'에서 대타가 필요한 날의 슬롯 옆 '대타 요청'을 탭해요."
                />
                <Step num={2} text="사유를 입력하고 요청을 보내요." />
                <Step
                  num={3}
                  text="관리자 승인 후 다른 직원에게 알림이 가요."
                />
                <Step
                  num={4}
                  text="다른 직원이 수락하면 '대타 확정' 알림이 와요."
                />
              </div>

              <Sub>대타 수락하기 — 나에게 온 요청을 확인할 때</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="알림을 탭하거나 '내 스케줄' 상단 '나에게 온 대타 요청'을 확인해요."
                />
                <Step
                  num={2}
                  text="날짜·근무지·포지션·시간을 확인하고 '확인하기'를 탭해요."
                />
                <Step
                  num={3}
                  text="'수락할게요'를 탭하면 내 스케줄에 추가돼요."
                />
              </div>
              <Tip>
                내 스케줄과 시간이 겹치면 수락이 안 돼요. 수락 전에 미리
                확인해요.
              </Tip>
              <div className="mt-4 px-4 py-3 bg-[#F2F4F6] rounded-[16px]">
                <p className="text-[13px] text-[#8B95A1] leading-relaxed font-medium">
                  🔜 대체근무 신청 및 근무 교환 기능은 추후 업데이트 예정이에요.
                </p>
              </div>
            </Section>

            {/* 10. 공지사항 */}
            <Section
              id="announcements"
              emoji="📢"
              title="공지사항"
              open={open === "announcements"}
              highlighted={highlighted === "announcements"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                관리자가 올린 공지를 확인할 수 있어요. 읽지 않은 공지 수는 홈
                화면 공지사항 카드에 빨간 숫자로 표시돼요.
              </p>
              <Sub>공지 확인 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="홈 화면 공지사항 카드를 탭하거나 하단 메뉴에서 공지사항으로 이동해요."
                />
                <Step num={2} text="목록에서 공지를 탭하면 내용이 펼쳐져요." />
                <Step num={3} text="읽은 공지는 자동으로 읽음 처리돼요." />
              </div>
              <div className="mt-3 flex items-center gap-2 px-4 py-3 bg-[#F9FAFB] rounded-[14px]">
                <span className="text-[18px]">📌</span>
                <p className="text-[13px] text-[#4E5968]">
                  핀 아이콘이 있는 공지는 관리자가 고정한 중요 공지예요. 목록 맨
                  위에 항상 표시돼요.
                </p>
              </div>
            </Section>

            {/* 11. 레시피 */}
            <Section
              id="recipes"
              emoji="📖"
              title="레시피"
              open={open === "recipes"}
              highlighted={highlighted === "recipes"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                카테고리별로 정리된 레시피를 언제든 찾아볼 수 있어요.
              </p>
              <Sub>레시피 찾는 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="레시피 목록에서 카테고리를 탭해 필터링해요."
                />
                <Step
                  num={2}
                  text="보고 싶은 레시피를 탭하면 상세 페이지로 이동해요."
                />
                <Step num={3} text="재료·만드는 법을 순서대로 확인해요." />
              </div>
              <Tip>
                레시피 추가·수정은 관리자만 가능해요. 필요한 레시피가 있으면
                관리자에게 요청해요.
              </Tip>
            </Section>

            {/* 12. 출퇴근 기록 */}
            <Section
              id="attendances"
              emoji="📋"
              title="출퇴근 기록"
              open={open === "attendances"}
              highlighted={highlighted === "attendances"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                지금까지의 내 출퇴근 기록을 날짜별로 확인할 수 있어요.
              </p>
              <Sub>확인 방법</Sub>
              <div className="space-y-3">
                <Step num={1} text="하단 메뉴에서 '출퇴근 기록'을 탭해요." />
                <Step
                  num={2}
                  text="날짜별로 출근·퇴근 시간과 근무지를 확인할 수 있어요."
                />
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <span className="text-[13px]">☀️</span>
                  <p className="text-[13px] text-[#4E5968]">
                    <strong>일반 출퇴근</strong> — 매장 반경 내 위치 기반
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <span className="text-[13px]">✈️</span>
                  <p className="text-[13px] text-[#4E5968]">
                    <strong>출장출근</strong> — 외부 현장 근무
                  </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <span className="text-[13px]">📍</span>
                  <p className="text-[13px] text-[#4E5968]">
                    <strong>원격퇴근</strong> — 매장 밖 퇴근
                  </p>
                </div>
              </div>
              <Tip>
                기록이 잘못됐으면 앱에서 직접 수정이 안 돼요. 날짜와 시간을
                관리자에게 알리면 수정해줘요.
              </Tip>
            </Section>

            {/* 프로필 수정 */}
            <Section
              id="profile"
              emoji="⚙️"
              title="내 정보 수정"
              open={open === "profile"}
              highlighted={highlighted === "profile"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                연락처, 계좌정보 등 내 정보를 언제든 수정할 수 있어요.
              </p>
              <Sub>수정 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="홈 화면 우측 상단의 프로필 아이콘(또는 이니셜 원)을 탭해요."
                />
                <Step
                  num={2}
                  text="내 정보 화면에서 수정하고 싶은 항목을 변경해요."
                />
                <Step num={3} text="'저장하기'를 탭하면 바로 반영돼요." />
              </div>
            </Section>

            {/* 알림 설정 */}
            <Section
              id="push"
              emoji="🔔"
              title="알림 설정"
              open={open === "push"}
              highlighted={highlighted === "push"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                주요 소식을 기기 알림으로 받을 수 있어요. 받고 싶은 알림 유형을
                직접 골라서 설정할 수 있어요.
              </p>
              <Sub>받을 수 있는 알림</Sub>
              <div className="space-y-2 mt-1">
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    🔄 스케줄
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    대타 요청 승인·거절, 대타 자리가 채워졌을 때, 스케줄 변경·확정 알림이 와요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📖 레시피
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    내가 댓글을 단 레시피에 새 댓글이나 대댓글이 달리거나, @멘션을 받으면 알림이 와요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📢 공지사항
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    관리자가 새 공지를 올리면 알림이 와요.
                  </p>
                </div>
              </div>
              <Sub>알림 켜는 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="홈 화면 우측 상단 프로필 아이콘을 탭해요."
                />
                <Step
                  num={2}
                  text="'내 정보' 화면 하단 '푸시 알림' 토글을 켜요."
                />
                <Step
                  num={3}
                  text="브라우저 알림 허용 팝업이 나오면 '허용'을 탭해요."
                />
                <Step
                  num={4}
                  text="알림 유형별로 받고 싶은 항목만 골라서 켜고 끌 수 있어요."
                />
              </div>
              <Tip>
                알림이 오지 않으면 기기 설정에서 브라우저 알림 권한을 확인해요.
              </Tip>
            </Section>

            {/* 크레딧 & 등급 */}
            <Section
              id="credit"
              emoji="🏅"
              title="크레딧 & 등급"
              open={open === "credit"}
              highlighted={highlighted === "credit"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                출퇴근 상태에 따라 크레딧 점수가 쌓여요. 점수에 따라 등급이
                결정되고, 연속 출근 시 보너스도 받을 수 있어요.
              </p>
              <Sub>크레딧 점수 규칙</Sub>
              <div className="space-y-2 mt-1">
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">정상 출근</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+3점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">지각 (5~10분)</p>
                  <span className="text-[13px] font-bold text-[#E67700]">-3점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">지각 (10분 이상)</p>
                  <span className="text-[13px] font-bold text-[#E67700]">-10점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">조기퇴근</p>
                  <span className="text-[13px] font-bold text-[#E67700]">-8점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">퇴근 미기록</p>
                  <span className="text-[13px] font-bold text-[#E67700]">-5점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">무단결근</p>
                  <span className="text-[13px] font-bold text-[#FF4545]">-50점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">대타 출근 보너스 (월 2회)</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+10점</span>
                </div>
              </div>

              <Sub>등급 체계</Sub>
              <div className="space-y-2 mt-1">
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">💎</span>
                    <p className="text-[13px] font-bold text-[#191F28]">다이아몬드</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">900~1000점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">❇️</span>
                    <p className="text-[13px] font-bold text-[#191F28]">플래티넘</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">750~899점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">🥇</span>
                    <p className="text-[13px] font-bold text-[#191F28]">골드</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">600~749점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">🥈</span>
                    <p className="text-[13px] font-bold text-[#191F28]">실버</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">450~599점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">🥉</span>
                    <p className="text-[13px] font-bold text-[#191F28]">브론즈</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">300~449점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">⚙️</span>
                    <p className="text-[13px] font-bold text-[#191F28]">아이언</p>
                  </div>
                  <span className="text-[12px] text-[#8B95A1]">0~299점</span>
                </div>
              </div>

              <Sub>연속 출근 보너스</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                정상 출근이 연속으로 이어지면 마일스톤 달성 시 보너스 크레딧을
                받아요.
              </p>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">10일 연속</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+15점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">30일 연속</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+50점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">60일 연속</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+80점</span>
                </div>
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] rounded-[12px]">
                  <p className="text-[13px] text-[#4E5968]">100일 연속</p>
                  <span className="text-[13px] font-bold text-[#3182F6]">+150점</span>
                </div>
              </div>

              <Sub>크레딧 확인 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="홈 화면의 크레딧 카드를 탭하거나, 마이페이지 → '내 크레딧'을 탭해요."
                />
                <Step
                  num={2}
                  text="현재 등급, 점수, 다음 등급까지 남은 점수를 확인해요."
                />
                <Step
                  num={3}
                  text="아래로 스크롤하면 이번 달 크레딧 변동 내역을 확인할 수 있어요."
                />
              </div>
              <Tip>
                모든 직원은 500점(실버)에서 시작해요. 지각이나 결근 시 스트릭이
                초기화되니 꾸준한 정상 출근이 중요해요.
              </Tip>
              <Warn>
                감점이 부당하다고 느끼면 관리자에게 문의해요. 관리자가 예외 사유를
                확인하고 감점을 취소할 수 있어요.
              </Warn>
            </Section>

            {/* 캘린더 */}
            <Section
              id="calendar"
              emoji="📆"
              title="캘린더"
              open={open === "calendar"}
              highlighted={highlighted === "calendar"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                내 스케줄, 출퇴근 기록, 팀 동료 스케줄, 회사 일정을 월간 달력으로
                한눈에 볼 수 있어요.
              </p>
              <Sub>캘린더 보는 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="하단 메뉴에서 '캘린더'를 탭해요."
                />
                <Step
                  num={2}
                  text="좌우 화살표로 월을 이동할 수 있어요."
                />
                <Step
                  num={3}
                  text="날짜를 탭하면 해당 날의 상세 정보를 확인할 수 있어요."
                />
              </div>
              <Sub>레이어 토글</Sub>
              <p className="text-[13px] text-[#4E5968] leading-relaxed">
                상단 필터 버튼으로 보고 싶은 정보만 골라서 표시할 수 있어요.
              </p>
              <div className="space-y-2 mt-2">
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    📅 내 스케줄
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    배정된 근무 일정이 근무지 색상으로 표시돼요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    ☀️🌙 내 근태
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    실제 출퇴근 기록이 표시돼요. 출근과 퇴근 시간을 한눈에 확인할
                    수 있어요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    👥 팀
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    같은 날 근무하는 동료들의 스케줄을 볼 수 있어요.
                  </p>
                </div>
                <div className="p-3 bg-[#F9FAFB] rounded-[16px]">
                  <p className="text-[13px] font-bold text-[#191F28] mb-1">
                    🏢 회사 일정
                  </p>
                  <p className="text-[13px] text-[#4E5968] leading-relaxed">
                    휴무일, 회의, 행사 등 회사 전체 일정이 표시돼요.
                  </p>
                </div>
              </div>
            </Section>

            {/* 추가근무 */}
            <Section
              id="overtime"
              emoji="⏰"
              title="추가근무"
              open={open === "overtime"}
              highlighted={highlighted === "overtime"}
              onToggle={toggle}
            >
              <p className="text-[14px] text-[#4E5968] leading-relaxed mt-3">
                예정된 근무 시간 외에 추가로 근무한 경우, 관리자가 추가근무를
                기록해요.
              </p>
              <Sub>추가근무 확인 방법</Sub>
              <div className="space-y-3">
                <Step
                  num={1}
                  text="캘린더에서 해당 날짜를 탭해요."
                />
                <Step
                  num={2}
                  text="승인된 추가근무 내역이 표시돼요."
                />
              </div>
              <Tip>
                추가근무는 관리자가 등록하고 승인해요. 추가근무가 누락됐다면
                관리자에게 문의해요.
              </Tip>
            </Section>
          </div>
        ) : (
          <UpdateHistory />
        )}

        {/* 문의 안내 */}
        <div className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm text-center">
          <p className="text-[14px] font-bold text-[#191F28] mb-1">
            문제가 생겼나요?
          </p>
          <p className="text-[13px] text-[#8B95A1] leading-relaxed">
            앱 사용 중 불편한 점이 있으면
            <br />
            관리자에게 문의해 주세요.
          </p>
        </div>
      </main>
    </div>
  );
}
