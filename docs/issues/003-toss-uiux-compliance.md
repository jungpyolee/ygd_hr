# [UI-001] 토스 UI/UX 기준 전면 적용

| 항목 | 내용 |
|------|------|
| **유형** | UI/UX 개선 |
| **상태** | ✅ 완료 |
| **발견일** | 2026-03-16 |
| **완료일** | 2026-03-16 |
| **기준 문서** | `docs/toss-ui-ux-guidelines.md` |
| **감사 보고서** | `docs/ui-ux-analysis.md` |

---

## 배경 (Background)

`docs/ui-ux-analysis.md` 감사 결과 토스 디자인 기준 미준수 항목 12건 발견.
Critical 5건, Warning 7건을 일괄 수정.

---

## 수정 사항 상세

### C-001: 네이티브 다이얼로그 4곳 제거

브라우저 기본 `alert()` / `window.confirm()` 사용은 토스 디자인 원칙 위반.
커스텀 ConfirmDialog 바텀시트 컴포넌트를 신규 생성하여 모두 대체.

**신규 파일**
- `src/components/ui/confirm-dialog.tsx` — 재사용 가능한 바텀시트 확인 다이얼로그

**수정 파일 및 내용**

| 파일 | 전 | 후 |
|------|----|----|
| `src/app/admin/layout.tsx:80` | `alert("접근 권한이 없습니다.")` | `toast.error("접근 권한이 없어요")` |
| `src/app/page.tsx:181` | `confirm("로그아웃 하시겠어요?")` | `<ConfirmDialog>` 바텀시트 |
| `src/app/admin/employees/page.tsx:88` | `window.confirm(직원 삭제)` | `<ConfirmDialog variant="destructive">` |
| `src/app/admin/employees/page.tsx:206` | `window.confirm(서류 삭제)` | `<ConfirmDialog variant="destructive">` |

---

### C-002: 습니다체 → 해요체 8곳

토스 UX 라이팅 원칙: 전 제품 해요체 통일.

| 파일 | 전 | 후 |
|------|----|----|
| `admin/layout.tsx:287` | "새로운 알림이 없습니다." | "새 알림이 없어요" |
| `admin/page.tsx:156` | "해당하는 직원이 없습니다." | "해당하는 직원이 없어요" |
| `admin/page.tsx:244` | "오늘은 {date}입니다." | "{date} · ..." |
| `admin/employees/page.tsx:96` | "완전히 삭제되었습니다." | "삭제됐어요" |
| `admin/employees/page.tsx:99` | "오류가 발생했습니다." | "실패했어요. 다시 시도해주세요" |
| `admin/employees/page.tsx:122` | "수정에 실패했습니다." | "실패했어요. 다시 시도해주세요" |
| `admin/employees/page.tsx:132` | "성공적으로 수정되었습니다." | "수정했어요" |
| `admin/employees/page.tsx:172` | "성공적으로 업로드되었습니다." | "업로드했어요" |
| `MyInfoModal.tsx:176` | "정보가 수정되었습니다." | "정보를 수정했어요" |

---

### C-003: toast.error에 description 추가 — 2곳

에러 메시지는 원인 + 해결 방법을 함께 제공해야 함.

| 파일 | 전 | 후 |
|------|----|----|
| `MyInfoModal.tsx:72` | `toast.error("업로드 실패")` | `toast.error("서류 업로드에 실패했어요", { description: "..." })` |
| `MyInfoModal.tsx:121` | `toast.error("저장 실패")` | `toast.error("저장에 실패했어요", { description: "..." })` |

---

### C-004: Skeleton UI — 홈 로딩 화면

`src/app/page.tsx` 전체 로딩 시 `"로딩 중..."` 텍스트 대신
실제 레이아웃을 반영한 Skeleton UI (`animate-pulse`) 로 교체.

---

### C-005: 영문 시간 단위 → 한국어

`src/app/attendances/page.tsx`에서 `Xh Ym` 형식을 `X시간 Y분`으로 수정.

---

### W-001: Geist 폰트 제거

`src/app/layout.tsx`에서 사용하지 않는 Geist, Geist_Mono 폰트 import 및 CSS 변수 제거.
Pretendard만 유지.

---

### W-002: MyInfoModal CTA 버튼 텍스트

`"수정 완료"` (결과 표현) → `"저장하기"` (동작 표현). Save 아이콘도 제거.

---

### W-003: 직원 관리 버튼 레이블

`"관리"` (모호) → `"수정하기"` (구체적 동작).

---

### W-004: 출퇴근 Toast 문장형

`"○○ 출근 완료!"` → `"○○으로 출근했어요"` / `"○○에서 퇴근했어요"`.

---

### W-005: admin/page 서브헤더

`"오늘은 {date}입니다."` (습니다체) → `"{date} · 항목을 탭해서 상세 명단을 확인하세요."`.

---

### W-006: admin/layout 알림 빈 상태

`italic` 스타일 제거, 습니다체 → 해요체.

---

### W-007: MyInfoModal 에러 메시지 톤

`"이름은 필수입니다."` (지시형) → `"이름을 입력해주세요"` (안내형).

---

## 빌드 결과

```
✓ Compiled successfully in 3.3s
✓ Generating static pages (9/9)
타입 오류: 0건
```

---

## 변경 파일 목록

| 파일 | 변경 유형 |
|------|----------|
| `src/components/ui/confirm-dialog.tsx` | 신규 생성 |
| `src/app/layout.tsx` | Geist 폰트 제거 |
| `src/app/page.tsx` | Skeleton UI, ConfirmDialog 로그아웃 |
| `src/app/attendances/page.tsx` | 시간 단위 한국어화 |
| `src/app/admin/layout.tsx` | alert→toast, 습니다체, italic 제거 |
| `src/app/admin/page.tsx` | 습니다체, 서브헤더 문구 |
| `src/app/admin/employees/page.tsx` | window.confirm 2곳, 습니다체 4곳, 버튼 레이블 |
| `src/components/AttendanceCard.tsx` | Toast 문장형 개선 |
| `src/components/MyInfoModal.tsx` | toast 3곳, 버튼 텍스트, 미사용 import 정리 |
