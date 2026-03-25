# 040 — UI/UX 플로우 전면 감사 (멀티 관점)

> 분석일: 2026-03-24
> 분석 관점: FE 개발자 / UI·UX 디자이너 / Product Designer / 마케터
> 분석 범위: `src/` 전체 (70개 컴포넌트 + 30개 페이지)

---

## 배경

현재 프로젝트의 기능 구현은 상당 부분 완성됐지만, 실 사용 단계에서 발생할 수 있는 UX 마찰, 일관성 부재, 기회 영역을 체계적으로 점검한 적이 없었다. FE 개발자 / UI·UX 디자이너 / Product Designer / 마케터 4개 관점에서 동시에 분석을 수행해 통합 보고서를 작성한다.

---

## 🔴 크리티컬 이슈 (즉시 수정 필요)

### C-1. 삭제 작업에 `window.confirm()` 사용
**관점:** Product Designer / UI 디자이너
`admin/employees/page.tsx` 줄 88, 206에서 직원 삭제·서류 삭제 시 네이티브 confirm 사용.
- 디자인 제어 불가 (토스 스타일 위반)
- "습니다체" 사용 (말투 규칙 위반)
- 실수 복구 경로 없음

**개선:** 기존 `ConfirmDialog` 컴포넌트로 전면 교체

---

### C-3. 로딩 텍스트 직접 노출 (CLAUDE.md 규칙 위반)
**관점:** FE 개발자
`StoreDistanceList.tsx` 줄 14: `"위치 확인 중..."` 텍스트 반환.
`PushPromptModal.tsx` 줄 151: `loading ? "설정 중..." : "알림 켜기"`.

**개선:** 모든 로딩 상태를 Skeleton UI로 교체

---

### C-4. SWR 에러 핸들링 전면 부재
**관점:** FE 개발자
`AdminAttendanceCalendar.tsx`, `admin/employees/page.tsx` 등에서 `useSWR`의 `error` 파라미터를 미사용. 데이터 로드 실패 시 UI 피드백 없음.

**개선:** 모든 SWR 호출에 에러 상태 추가 + 재시도 버튼이 있는 에러 UI

---

## 🟡 주요 이슈 (1–2주 내 개선)

### W-1. 버튼 스타일 시스템 미정립
**관점:** UI 디자이너
프로젝트 전체에서 버튼 높이(`py-3.5` / `h-14` / 미지정), 반경(`rounded-2xl` / `rounded-[24px]` / `rounded-lg`), active scale(`95%` / `98%` / `99%`)이 모두 혼재.

**개선:** `src/components/ui/button.tsx` 통합 컴포넌트 구축
```tsx
<Button variant="primary" size="lg">출근하기</Button>
// variant: primary | secondary | ghost | destructive
// size: sm(h-10) | md(h-12) | lg(h-14)
// 공통: rounded-2xl, active:scale-95 active:opacity-80
```

---

### W-2. 폰트 사이즈 스케일 무질서
**관점:** UI 디자이너
현재 `11px`~`28px`까지 10단계 이상 혼용. 일관된 타이포그래피 시스템 없음.

**개선:** 8단계 스케일 확립
| 레벨 | 크기 | 용도 |
|------|------|------|
| Display | 28px bold | 페이지 대제목 |
| Title-L | 20px bold | 섹션 제목 |
| Title-M | 17px bold | 카드 제목 |
| Body-L | 16px medium | CTA 버튼, 주요 본문 |
| Body | 15px regular | 기본 텍스트 |
| Body-S | 14px regular | 보조 설명 |
| Caption | 13px regular | 라벨, 힌트 |
| Overline | 12px semibold | 배지, 태그 |

---

### W-3. 빈 상태(Empty State) UI 불일치
**관점:** UI 디자이너
공지사항·레시피·알림 팝오버의 빈 상태가 아이콘 유무, 색상(`#D1D6DB` vs `#8B95A1`), 텍스트 크기(14px vs 15px)가 제각각.

**개선:** `EmptyState` 공통 컴포넌트 생성
```tsx
<EmptyState
  icon={Bell}
  title="새 알림이 없어요"
  description="활동이 있으면 여기에 표시될 거예요"
/>
```

---

### W-4. 출퇴근 카드 상태 변수 과다
**관점:** UI 디자이너 / Product Designer
`AttendanceCard.tsx`에서 `showChecklist`, `showRemoteOutForm`, `showBizTripConfirm`, `pendingLocation`, `showPermissionGuide`, `pendingType`, `showStoreSelector`, `storeSelectorType`, `pendingResume` 등 **15개 이상의 상태 변수** 관리.
흐름이 선형적이지 않고 복수 바텀시트가 겹칠 위험.

**개선:** 상태 머신 패턴 도입
```typescript
type AttendanceFlowState =
  | { step: 'idle' }
  | { step: 'location-check'; type: 'IN' | 'OUT' }
  | { step: 'permission-denied' }
  | { step: 'out-of-range'; stores: Store[] }
  | { step: 'checklist'; items: ChecklistItem[] }
  | { step: 'success' }
```

---

### W-5. 온보딩 진행 상태 표시 부재
**관점:** Product Designer / UI 디자이너
OnboardingFunnel 3단계 중 현재 몇 단계인지 표시 없음. Step 3·4가 선택 사항임을 명시하지 않아 사용자 혼동 유발.

**개선:** 상단 Progress Bar + "(선택)" 레이블 추가

---

### W-6. 터치 타겟 크기 부족
**관점:** FE 개발자
`WeeklyScheduleCard.tsx` 요일 버튼 `w-8 h-8`(32px) — iOS 권장 최소치 44px 미달.
홈 알림 버튼도 `w-10 h-10`(40px)으로 경계선.

**개선:** 최소 `min-h-[44px] min-w-[44px]` 보장

---

### W-7. WCAG 색상 대비 미충족 위험
**관점:** UI 디자이너
`#D1D6DB` 텍스트 on white = 대비비 약 2.5:1 (AA 기준 4.5:1 미달).
`#B0B8C1` 텍스트도 경계선.

**개선:**
- `#D1D6DB`는 경계선·배경 전용, 텍스트 사용 금지
- `#B0B8C1` → `#6B7684`(5.8:1)로 교체

---

### W-8. 추가근무 거절 사유 미저장
**관점:** Product Designer
관리자가 추가근무를 `dismissed` 처리해도 거절 사유가 저장되지 않음. 직원은 왜 거절됐는지 알 수 없음.

**개선:** `overtime_requests.rejection_reason` 컬럼 추가 + 거절 시 직원 알림 발송

---

### W-9. 접근성(A11y) 미흡
**관점:** FE 개발자
- `StoreSelectorSheet.tsx`: 라디오 버튼을 `<button>` + `<div>` 조합으로 구현 → 스크린 리더 선택 상태 인식 불가
- 아이콘 전용 버튼에 `aria-label` 부재 (AttendanceCard, MyInfoModal 닫기 버튼 등)
- 요일 탭에 `role="tablist"`, `role="tab"`, `aria-selected` 미적용

**개선:** `role="radio"` + `aria-checked`, `aria-label` 전면 보강

---

### W-10. 관리자 페이지 모바일 반응형 부족
**관점:** Product Designer
관리자 좌측 사이드바가 모바일에서 고정 표시 → 콘텐츠 영역 협소. 관리자도 모바일로 확인하는 경우 많음.

**개선:** 모바일에서 사이드바 → 햄버거 메뉴 또는 상단 탭바로 전환

---

## 🟢 기회 영역 (그로스/참여도 개선)

### G-1. 개인 근태 통계 시각화 부족
**관점:** 마케터
현재 홈에서 출근 일수·총 시간·초과근무만 표시. 비교 맥락이 없어 의미가 약함.

**Quick Win (3~5일):**
- "이달 정시 출근율 85% (지난달 78% 대비 ↑)"
- "이달과 지난달 근무시간 비교"

---

### G-2. 출근 스트릭(Streak) & 배지 시스템
**관점:** 마케터
매일 방문해야 하는 도구지만 달성감을 주는 요소가 없음.

**제안:**
- 연속 정시 출근 일수 표시 ("🔥 15일 연속 정시 출근!")
- 월간 목표 달성 배지

---

### G-3. 관리자 의사결정 카드 보강
**관점:** 마케터 / Product Designer
현재 대시보드: 오늘 출근 현황 + 보건증 만료 + 미처리 추가근무 건수만 표시.
추세·비교 데이터 없어 의사결정 지원이 약함.

**제안:**
- "이번 주 지각 발생: 3명 / 지난주 대비 ↑ 67%"
- "이번 달 초과근무 누적: 150시간 / 예상 추가 비용 ○○○만 원"

---

### G-4. 알림 세분화 설정
**관점:** 마케터
현재 알림 동의 후 모든 유형이 일괄 전송. 피로도로 인한 알림 해제 위험.

**제안:** 알림 유형별 켜기/끄기 (추가근무, 스케줄 변경, 공지사항 각각 분리)

---

### G-5. 기록 확인(Confirm) 기능
**관점:** 마케터
직원이 "내 기록이 정확하게 반영됐다"고 확인하는 절차 없음 → 분쟁 발생 시 신뢰 저하.

**제안:** 주간/월간 근무 기록 확인 버튼 → "확인 완료" 상태 저장

---

## 우선순위 매트릭스

| 우선순위 | 이슈 | 예상 공수 | 비즈니스 임팩트 |
|---------|------|-----------|----------------|
| **P0** | C-1 `window.confirm()` 제거 | 2~3시간 | 디자인 일관성·안전성 |
| **P0** | C-2 로딩 텍스트 제거 | 2~3시간 | CLAUDE.md 규칙 준수 |
| **P0** | C-3 SWR 에러 핸들링 | 4~6시간 | 오류 가시성 |
| **P1** | W-1 버튼 시스템 | 4~6시간 | UI 일관성 |
| **P1** | W-2 폰트 스케일 | 3~4시간 | 가독성·브랜드 |
| **P1** | W-4 AttendanceCard 리팩토링 | 6~8시간 | 유지보수성·UX |
| **P1** | W-6 터치 타겟 크기 | 1~2시간 | 모바일 사용성 |
| **P1** | W-7 색상 대비 | 2~3시간 | 접근성 |
| **P2** | W-3 Empty State 통일 | 2~3시간 | 일관성 |
| **P2** | W-5 온보딩 진행 표시 | 1~2시간 | 신규 사용자 경험 |
| **P2** | W-8 추가근무 거절 사유 | DB 포함 3~4시간 | 투명성 |
| **P2** | W-9 A11y 보강 | 3~4시간 | 접근성 |
| **P2** | W-10 관리자 모바일 반응형 | 4~6시간 | 관리자 사용성 |
| **P3** | G-1~G-5 그로스 기회 | 각 3~7일 | 참여도·리텐션 |

---

## 결과

### 완료 (2026-03-24)

- [x] **C-1** `window.confirm()` 제거 — 에이전트 오탐, 이미 ConfirmDialog 사용 중
- [x] **C-2** 로딩 텍스트 제거
  - `StoreDistanceList.tsx`: loading 시 `"위치 확인 중..."` → Skeleton, stores 빈 상태 → Skeleton 카드 2개
  - `PushPromptModal.tsx`: `"설정 중..."` → Loader2 스피너 아이콘
- [x] **C-3** SWR 에러 핸들링 추가
  - `admin/employees/page.tsx`: fetcher에서 `return []` → `throw error`, 에러 UI + 다시 시도 버튼
  - `admin/attendance/page.tsx`: fetcher에서 `throw error`, 에러 UI + 다시 시도 버튼

- [ ] P1 이슈 수정 완료
- [ ] P2 이슈 수정 완료
- [ ] P3 그로스 기능 기획/구현

---

*분석 수행: Claude (FE·UX·PD·마케터 4개 관점 병렬 분석)*
