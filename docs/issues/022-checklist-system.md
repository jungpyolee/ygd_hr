# [FEAT-021] 출퇴근 체크리스트 시스템

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | 🔄 미시작 |
| 파일 | `src/components/AttendanceCard.tsx`, `src/components/ChecklistSheet.tsx` (신규), `src/app/admin/checklists/page.tsx` (신규) |
| 발견일 | 2026-03-18 |
| 완료일 | - |

## 배경

대표 통화에서:
- "출근을 찍으면 체크리스트가 뜸 — 항목들 체크해서 완료되면 오픈준비 끝 상태"
- "퇴근하기 누를 때 체크리스트가 뜨고 다 수행하면 퇴근 가능"
- "포지션에 따라서 역할이 있을 거야. 어드민에서 설정할 수 있게 포지션별로"
- 예: 바닥 닦기, 물 채우기, 문 잠갔는지, 화장실 비웠는지, 동파방지 등

체크리스트를 통해 오픈/마감 업무 누락을 방지하고, 어드민이 직원별/포지션별로 항목을 커스텀 설정 가능.

## DB 설계

```sql
-- 체크리스트 항목 템플릿 (어드민이 설정)
CREATE TABLE checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,                           -- 항목명 (예: "바닥 닦기")
  trigger text NOT NULL,                         -- 'check_in' | 'check_out'
  work_location text,                            -- NULL이면 모든 근무지 적용
                                                 -- 'cafe' | 'factory' | 'catering'
  cafe_position text,                            -- NULL이면 포지션 무관
                                                 -- 'hall' | 'kitchen' | 'showroom'
  order_index integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 체크리스트 완료 기록
CREATE TABLE checklist_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger text NOT NULL,                         -- 'check_in' | 'check_out'
  attendance_log_id uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,
  checked_item_ids uuid[] NOT NULL DEFAULT '{}', -- 완료한 템플릿 ID 배열
  all_checked boolean NOT NULL DEFAULT false,
  submitted_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX ON checklist_templates(trigger, is_active, order_index);
CREATE INDEX ON checklist_submissions(profile_id, submitted_at DESC);

-- updated_at 트리거
CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_submissions ENABLE ROW LEVEL SECURITY;

-- 템플릿: 전 직원 조회, 어드민 관리
CREATE POLICY "직원 템플릿 조회" ON checklist_templates FOR SELECT
  TO authenticated USING (is_active = true);

CREATE POLICY "어드민 템플릿 관리" ON checklist_templates FOR ALL
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 제출 기록: 본인 INSERT/SELECT, 어드민 ALL
CREATE POLICY "직원 제출 기록 관리" ON checklist_submissions FOR ALL
  TO authenticated USING (profile_id = auth.uid());

CREATE POLICY "어드민 제출 기록 조회" ON checklist_submissions FOR ALL
  TO authenticated USING (is_admin());
```

## 항목 필터링 로직

직원이 보게 되는 체크리스트 항목 = `checklist_templates` 중:
1. `trigger` 일치 ('check_in' 또는 'check_out')
2. `is_active = true`
3. `work_location`이 NULL **또는** 직원의 오늘 근무지와 일치
4. `cafe_position`이 NULL **또는** 직원의 카페 포지션과 일치

→ 직원 프로필의 `work_locations`, `cafe_positions` 기준으로 필터

## 코드 설계

### 컴포넌트: `ChecklistSheet.tsx`

바텀시트 형태. `AttendanceCard`에서 트리거.

```
[오픈 준비 체크리스트]  ← trigger = 'check_in'
─────────────────────
□ 바닥 닦기
□ 물 채우기
□ 냉장고 온도 확인

[3/3 완료]
[완료하기]  ← 모두 체크해야 활성화
```

**퇴근 체크리스트 (`check_out`)**:
- 퇴근하기 버튼 클릭 시 트리거
- 미완료 항목 있으면 퇴근 버튼 비활성화
- 완료 후 `attendance_logs`에 OUT 기록

### `AttendanceCard.tsx` 수정

**출근 시 흐름**:
```
출근하기 버튼 → GPS 체크 → attendance_logs INSERT (IN)
  → check_in 체크리스트 항목 있으면 → ChecklistSheet 표시
  → 체크리스트 완료 → checklist_submissions INSERT → 홈 갱신
```

**퇴근 시 흐름**:
```
퇴근하기 버튼 → check_out 체크리스트 항목 있으면 → ChecklistSheet 표시
  → 모두 체크 → GPS 체크 → attendance_logs INSERT (OUT)
  → checklist_submissions INSERT → 홈 갱신
```

> 체크리스트가 없는 직원은 기존 흐름 그대로.

### 어드민 설정 (`/admin/checklists`)

- 출근/퇴근 탭으로 분리
- 항목 목록: 드래그로 순서 변경
- 항목 추가: 제목 + 근무지 필터 + 포지션 필터
- 항목 활성/비활성 토글
- 항목 삭제

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 출근 체크리스트 제목 | "오픈 준비를 확인해요" |
| 퇴근 체크리스트 제목 | "마감 전 확인해요" |
| 완료 버튼 (미완료) | `"N개 남았어요"` (비활성) |
| 완료 버튼 (완료) | "모두 완료했어요" |
| 퇴근 차단 토스트 | "마감 체크리스트를 모두 완료해야 퇴근할 수 있어요." |
| 빈 상태 (항목 없음) | 체크리스트 표시 없이 기존 흐름 유지 |
| 어드민 메뉴 | "체크리스트 설정" |
| 항목 추가 버튼 | "항목 추가하기" |
| 저장 버튼 | "저장하기" |

## 결과

- [ ] DB 마이그레이션 (`checklist_templates`, `checklist_submissions`)
- [ ] RLS 4종 생성
- [ ] `ChecklistSheet.tsx` 신규 생성
- [ ] `AttendanceCard.tsx` 출근/퇴근 체크리스트 연동
- [ ] `/admin/checklists` 설정 페이지
- [ ] 어드민 레이아웃 사이드바에 "체크리스트 설정" 메뉴 추가
- [ ] 체크리스트 없는 직원은 기존 흐름 유지 확인
- [ ] schema.md 갱신
- [ ] 빌드 통과
