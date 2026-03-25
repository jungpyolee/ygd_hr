# 043 — 근태 티어 시스템 기획 종합 보고서

> 스케줄 기반 롤 티어(다이아~아이언) 근태 관리 시스템
> 4개 에이전트(PM / 카페 사장 / Z세대 알바생 / UX·UI 디자이너) 검토 결과 통합

**작성일**: 2026-03-25
**상태**: 기획 확정 (구현 대기)

---

## 에그제큐티브 서머리

기획 방향성은 옳다. 스케줄 기반 스트릭, 티어 구조, 시작점 실버 500점 — 모두 유효하다.
단, 4개 관점 모두에서 공통적으로 지적된 3가지 핵심 문제가 있고, 이를 수정하지 않으면 론칭 후 이탈 및 저항이 예상된다.

---

## 1. 티어 구조

| 티어 | 점수 범위 | 설명 |
|------|---------|------|
| 💎 다이아몬드 | 900~1000점 | 상위 5% 에이스. 점장 부재 시 매장 위임 가능 수준 |
| ❇️ 플래티넘 | 750~899점 | 핵심 인력. 매우 성실하고 믿음직함 |
| 🥇 골드 | 600~749점 | 표준 근로자. 안정적으로 1인분 |
| 🥈 실버 | 450~599점 | 신규 입사자 시작점(500점) |
| 🥉 브론즈 | 300~449점 | 근태 관리 필요. 요주의 |
| ⚙️ 아이언 | 300점 미만 | 면담 및 인사 조치 시급 |

---

## 2. 점수 증감 정책 (확정안)

### 가점

| 이벤트 | 점수 |
|--------|------|
| 정상 출퇴근 (스케줄 기준 5분 이내) | +3점 |
| 대타 출근 (월 2회 한도) | +10점 |
| 대타 출근 (월 2회 초과분) | +3점 |
| 스트릭 10회 달성 보너스 | +15점 |
| 스트릭 30회 달성 보너스 | +50점 |
| 스트릭 60회 달성 보너스 | +80점 |
| 스트릭 100회 달성 보너스 | +150점 + 특별 배지 |
| 관리자 취소 출근 (교통비 보상) | +5점 |

### 감점

| 이벤트 | 점수 | 비고 |
|--------|------|------|
| 지각 (5분 초과~10분 이내) | -3점 | 스트릭도 초기화 |
| 지각 (10분 이상) | -10점 | |
| 조기퇴근 | -8점 | |
| OUT 미기록 | -5점 | 예정 종료시간 자동 OUT 처리 |
| 당일 취소 (직원, 사전 통보 없음) | -20점 | |
| 사전 3일+ 취소 (직원) | -5점 | 사전 통보 문화 장려 |
| 무단결근 | -50점 | 기존 -100 → 완화 |
| 무단결근 2회 연속 시 추가 | -30점 | 반복 행위 누적 페널티 |

> **강등**: 점수 하락 즉시 적용
> **승급**: 7일 유예 (일시적 점프 후 재하락 방지)

---

## 3. 스트릭 시스템

### 스케줄 기반 스트릭 정의
달력 기준이 아닌 **배정된 스케줄 기준**. 월·수·금 근무자라면 월-수-금이 3 스트릭.

### 초기화 조건
- 5분 초과 지각 발생 시 초기화
- 결근 발생 시 초기화
- **스트릭 보호권** 사용 시 초기화 면제

### 스트릭 보호권
- 월 1회 자동 지급
- 5분 초과 지각 발생 시 소모 → 스트릭 유지
- 직원 앱에서 보유 여부 항상 표시

### 스트릭 마일스톤 (누적형, 리셋하지 않음)
| 달성 | 보너스 |
|------|--------|
| 10회 | +15점 |
| 30회 | +50점 |
| 60회 | +80점 |
| 100회 | +150점 + 특별 배지 |

---

## 4. 엣지케이스 & 해결책 (PM 검토)

### EC-1. 관리자 당일 스케줄 취소
`schedule_slots`에 `cancelled_by`, `cancel_reason('employee'|'manager'|'system')`, `cancelled_at` 컬럼 추가.
`cancel_reason = 'employee'`인 경우에만 -20점 페널티 적용.
관리자 취소 시 +5점 보상.

### EC-2. 알바생끼리 스케줄 스왑
`shift_swap_requests` 테이블 신설. 관리자 승인 시 `schedule_slots.profile_id` 자동 교체.
미승인 스왑은 결근 처리.

### EC-3. 스트릭 마일스톤 초기화 여부
누적형으로 설계. 30회 달성 후 스트릭 카운터 리셋 없이 계속 누적.
각 마일스톤 보너스는 생애 1회 지급.

### EC-4. 사고/병으로 인한 긴급 결근
`attendance_exception_requests` 테이블. 진단서 첨부 → 관리자 승인 시 페널티 롤백 + 스트릭 freeze(리셋 아님).

### EC-5. GPS/앱 오류로 체크인 실패
`attendance_correction_requests` 테이블. 원본 레코드 유지 + `is_corrected=true` 플래그.

---

## 5. Loophole 방어

| 허점 | 방어 방안 |
|------|---------|
| 대타 팜밍 (서로 대타 주고받기) | 대타 +10점 월 2회 상한, 초과는 +3점 |
| 스트릭 의도적 초기화 후 보너스 반복 수령 | 스트릭 마일스톤 누적형, 생애 1회 지급 |
| OUT 미기록으로 조기퇴근 페널티 회피 | OUT 미기록 시 예정 종료시간 자동 OUT + -5점 |
| 관리자 점수 임의 조작 | `score_adjustment_logs` 감사 테이블 + reason 필수 입력 |
| 신규 직원 대타 인플레이션 | 재직 14일 미만은 대타 +3점 (인상분 미적용) |

---

## 6. 카페 사장 관점 — 인사 활용 시나리오

### 시나리오 A — 시급 인상 기준 명문화
"3개월 연속 골드 유지 시 시급 200원 인상" — 입사 계약서에 명시. 감정 소모 없는 팩트 기반 인사.

### 시나리오 B — 대타 요청 우선 대상 자동화
플래티넘/다이아 직원에게 먼저 대타 알림 발송. +10점 인센티브와 연계.

### 시나리오 C — 경고/계약 해지 법적 근거
점수 히스토리 PDF → "1차 경고 날짜, 2차 경고 날짜, 이후에도 아이언 유지" 문서화. 부당해고 방어 자료.

### 시나리오 D — 분기 포상 기준
다이아 달성 시 상품권, 골드 이상 전원 회식. 이직률 감소 효과.

### 관리자 대시보드 핵심 지표 우선순위

| 순위 | 지표 | 형태 |
|------|------|------|
| 1 | 오늘 출근 예정 vs 실제 현황 | 숫자 카드 4개 |
| 2 | 이번 달 지각 TOP 3 | 랭킹 리스트 |
| 3 | 무단결근 발생 여부 | 플래그 |
| 4 | 직원별 티어 + 전월 대비 변동 | 테이블 + 화살표 |
| 5 | 이번 달 총 근무시간 vs 예정 | 숫자 비교 |

### 결제 의향
월 9,900~19,900원. 전환 트리거: ① 자동 급여 계산 ② 즉시 푸시 알림 ③ 이의신청 기능.

### 법적 주의사항
티어는 참고 지표일 뿐, 해고의 유일한 근거로 사용 불가. 이용약관/운영가이드에 명시 필요.

---

## 7. Z세대 알바생 관점 — 심리 & 동기부여

### 핵심 발견
현재 설계는 **"잃지 않으려는 공포" 기반**. 게이미피케이션은 **"더 잘하고 싶은 욕구" 기반**이어야 한다.

### 감정 반응 시뮬레이션

| 상황 | 감정 | 행동 예측 |
|------|------|---------|
| 첫 앱 오픈, 실버 확인 | 애매한 찜찜함 → 골드 보이는 순간 올리고 싶어짐 | 긍정적 출발 |
| 1분 지각으로 20일 스트릭 초기화 | 앱 삭제 진지하게 고려 | 이탈 위험 |
| 리더보드 꼴찌 (아이언) | 앱 최소한으로만 사용, 주눅 | 이탈 가속 |
| 스트릭 30회 +50점 | 진짜 뿌듯함, 공유 욕구 | 유지·전파 |
| 퇴근 후 "+3점" 알림 (맥락 없음) | 처음엔 귀엽지만 1개월 후 알림 끔 | 노이즈 |

### 필수 추가 게이미피케이션 요소

| 요소 | 설명 | 우선순위 |
|------|------|---------|
| 스트릭 보호권 | 월 1회, 5분 초과 지각 때 스트릭 유지 | 최우선 |
| 맥락 있는 알림 | "+3점" → "골드까지 47점 남았어요!" | 높음 |
| 강등 유예 2주 | 즉시 강등 아닌 유예 기간 | 높음 |
| 티어 유지 경고 알림 | "이번 달 -2점이면 강등됩니다" 미리 | 높음 |
| 칭호 시스템 | "비 와도 출근함", "오픈 전문가" | 중간 |
| 히든 미션 | 예고 없이 달성 → 팝업 배지 | 낮음 |

### 리더보드
비공개 기본 + 공개 선택 방식. 또는 퍼센타일("상위 30%")로만 표시.

---

## 8. UX/UI 설계

### 티어별 색상 팔레트

| 티어 | 컬러 | 컨셉 |
|------|------|------|
| 다이아몬드 | `#B8D4F5` Ice Blue | 다이아의 차가운 투명함 |
| 플래티넘 | `#C8D4DC` Cool Gray | 백금의 차가운 광택 |
| 골드 | `#C9A84C` Warm Gold | 황토빛, 클래식 럭셔리 |
| 실버 | `#9BAAB8` Silver Blue | 중립, 가능성의 백지 |
| 브론즈 | `#9E7A5A` Warm Bronze | 따뜻한 테라코타 |
| 아이언 | `#78828C` Muted Iron | 차분한 회색 |

> ⚠️ 골드에 `#FFD700` 사용 금지. 값싸 보임. `#C9A84C`만 사용.

### 배지 형태
**변형 육각형 (Rounded Hexagon)**. 원형=프로필, 사각형=카드, 육각형=성취 배지의 고유 언어.

배지 크기 스펙:
- XS 20×20px (인라인/이름 옆)
- SM 32×32px (직원 목록 행)
- MD 48×48px (프로필 카드)
- LG 80×80px (메인 화면)

### 마이크로 인터랙션 — 출근 체크인

```
버튼 탭 (scale 0.96) →
스피너 1.2초 →
성공 그린 전환 (0.3s) →
"+3점" 칩 슬라이드인 →
점수 카운트업 "523 → 526" (0.5s) →  ← 핵심 감정 포인트
진행률 바 pulse ring 1회
```

### 마이크로 인터랙션 — 티어 강등

```
❌ 빨간색 금지
❌ "강등!" 텍스트 금지
✅ 회색 하향 화살표
✅ "등급이 조정됐어요" (중립 표현)
✅ 복구 경로 즉시 표시: "3회 출근하면 실버로 돌아갈 수 있어요"
```

### 직원 앱 메인 화면 (정보 우선순위)

```
┌──────────────────────────────┐
│  P1 — 티어 카드               │  배지 + 점수(48px) + 진행률 바
├──────────────────────────────┤
│  P1 — 출근/퇴근 버튼          │
├──────────────────────────────┤
│  P2 — 이번 주  |  스트릭      │  좌우 2칸
├──────────────────────────────┤
│  P3 — 이번 달 주간 캘린더     │  ✓ 표시
└──────────────────────────────┘
```

### 아이언 등급 배려 원칙

- 배지 크기·버튼 스타일 다운그레이드 절대 금지
- "최하위 등급", "경고", "주의" 텍스트 절대 금지
- 항상 다음 티어까지 거리 강조: "브론즈까지 80점 남았어요"
- 배경·버튼 색상 변경 없이 동일한 UI 유지

---

## 9. DB 스키마 추가 목록

```sql
-- 1. 스케줄 취소 주체 구분 (schedule_slots 컬럼 추가)
ALTER TABLE schedule_slots ADD COLUMN cancelled_by uuid REFERENCES profiles(id);
ALTER TABLE schedule_slots ADD COLUMN cancel_reason text; -- 'employee'|'manager'|'system'
ALTER TABLE schedule_slots ADD COLUMN cancelled_at timestamptz;

-- 2. 점수 이벤트 로그 (핵심 테이블)
CREATE TABLE attendance_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  event_type text, -- 'normal_attendance'|'tardiness_minor'|'tardiness_major'|
                   -- 'no_show'|'early_leave'|'streak_bonus_10'|'streak_bonus_30'|
                   -- 'substitute'|'manager_cancel_compensation'|...
  delta integer,   -- +3, -10, +15 등
  balance integer, -- 적용 후 누적
  ref_date date,
  note text,
  created_at timestamptz DEFAULT now()
);

-- 3. 이의신청 / 예외처리
CREATE TABLE attendance_exception_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id),
  slot_id uuid REFERENCES schedule_slots(id),
  reason_type text, -- 'medical'|'accident'|'family_emergency'|'correction'
  document_url text,
  status text DEFAULT 'pending', -- 'pending'|'approved'|'rejected'
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 4. 점수 수동 조정 감사 로그
CREATE TABLE score_adjustment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjusted_by uuid REFERENCES profiles(id),
  profile_id uuid REFERENCES profiles(id),
  before_score integer,
  after_score integer,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 5. 스케줄 스왑 요청 (Phase 2)
CREATE TABLE shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES profiles(id),
  acceptor_id uuid REFERENCES profiles(id),
  original_slot_id uuid REFERENCES schedule_slots(id),
  target_slot_id uuid REFERENCES schedule_slots(id),
  status text DEFAULT 'pending', -- 'pending'|'manager_approved'|'completed'|'rejected'
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);
```

---

## 10. 구현 로드맵

### Phase 1 — 집계 통계 (DB 추가 최소)
- `schedule_slots + attendance_logs` JOIN으로 지각/결근/정상 출근 집계
- 어드민 직원별 월별 통계 화면
- 리더보드 (정상출근률 기준)

### Phase 2 — 크레딧 시스템
- `attendance_credits` 테이블 생성 및 점수 계산 로직
- 티어 자동 산출 (balance 기반)
- 직원 앱 메인 화면 티어 카드
- 스트릭 보호권 지급 로직

### Phase 3 — 풀 게이미피케이션
- 마이크로 인터랙션 (카운트업, 배지 발견 온보딩)
- 스트릭 마일스톤 배지
- 이의신청 플로우
- 맥락 있는 푸시 알림

### Phase 4 — SaaS 확장
- 근태 프로필 이식성
- 업종 평균 벤치마크
- 월급 자동 계산 연동

---

## 11. 즉시 수정 필요 항목 (구현 전 확정)

| # | 항목 | 출처 |
|---|------|------|
| 1 | 무단결근 -50점 (기존 -100 완화) | PM + Z세대 |
| 2 | 스트릭 보호권 월 1회 지급 | Z세대 + PM |
| 3 | `cancelled_by` / `cancel_reason` / `cancelled_at` 컬럼 추가 | PM + 사장 |
| 4 | 이의신청 플로우 (이의신청 없으면 점수 신뢰도 붕괴) | 사장 + Z세대 |
| 5 | 강등 시 회색 화살표 + 중립 언어 + 복구 경로 | UX + Z세대 |
| 6 | 대타 +10점 월 2회 상한 | PM |
| 7 | 아이언 등급 배려 UI (다운그레이드 없음, 복구 경로 강조) | UX + Z세대 |
