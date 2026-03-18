# [FEAT-015] 온보딩 입사일 → 보건증만료일 교체

| 항목 | 내용 |
|------|------|
| 유형 | 기능 수정 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/OnboardingFunnel.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

대표 통화에서 온보딩 시 입사일은 직원 본인이 정확히 모르는 경우가 많아 실용성이 낮음.
대신 보건증 만료일은 직원이 직접 알고 있는 정보이고, 만료 알림(FEAT-017)의 기반 데이터가 되므로 교체.

## 현재 상태

- Step 3: `입사일이 언제인가요?` — DatePicker, `joinDate` state
- `handleSubmit`에서 `join_date` 컬럼에 저장
- **버그**: 라인 102에 `alert()` 사용 중 → 토스 UI/UX 위반, 이번에 함께 수정

## 수정 계획

### 코드 변경 (`OnboardingFunnel.tsx`)

1. **State 교체**
   - `joinDate: Date | undefined` → `healthCertDate: Date | undefined`

2. **Step 3 UI 교체**
   ```
   제목: "보건증 만료일이 언제인가요?"
   설명: "보건증이 없다면 건너뛸 수 있어요."
   DatePicker 재활용, 미래 날짜만 선택 가능하도록 disabledDates 설정
   ```

3. **handleSubmit 변경**
   - `join_date: joinDate` → `health_cert_date: healthCertDate`

4. **alert() 제거** (라인 102)
   ```tsx
   // Before
   alert("서류 업로드 중 문제가 발생했습니다. 나중에 다시 시도해주세요.");
   // After
   toast.error("서류 업로드 중 문제가 생겼어요.", {
     description: "잠시 후 다시 시도해 주세요."
   });
   ```

### UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| Step 3 제목 | "보건증 만료일이 언제인가요?" |
| Step 3 설명 | "보건증이 없다면 건너뛸 수 있어요." |
| 건너뛰기 버튼 | "건너뛰기" (기존 유지) |

## 결과

- [x] Step 3 UI 교체 완료 — "보건증 만료일이 언제인가요?" / "모른다면 건너뛰고 나중에 등록해도 괜찮아요."
- [x] `health_cert_date` DB 저장 확인 — `join_date` → `health_cert_date` 교체
- [x] `alert()` → `toast.error()` 교체 완료 (sonner)
- [x] 빌드 통과
