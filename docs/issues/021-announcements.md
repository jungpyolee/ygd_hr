# [FEAT-021] 공지사항 게시판

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/announcements/`, `src/app/admin/announcements/`, `src/components/AnnouncementBanner.tsx`, `src/components/announcement/AnnouncementForm.tsx`, `src/types/announcement.ts`, `src/app/page.tsx`, `src/app/admin/layout.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

대표 통화에서 "공지 같은 거도 볼 수 있게 하고" 확인.
직원들이 앱 내에서 공지사항을 확인할 수 있는 채널 필요.
현재는 카카오톡으로 공지를 전달하는데, 앱 내 공지 탭으로 통합.

## DB 설계

```sql
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  is_pinned boolean NOT NULL DEFAULT false,   -- 상단 고정
  published_at timestamptz DEFAULT now(),     -- NULL이면 임시저장(draft)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 인덱스
CREATE INDEX ON announcements(is_pinned DESC, published_at DESC);

-- updated_at 트리거
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- 전 직원 조회 (published만)
CREATE POLICY "직원 공지 조회" ON announcements FOR SELECT
  TO authenticated
  USING (published_at IS NOT NULL);

-- 어드민 ALL
CREATE POLICY "어드민 공지 관리" ON announcements FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
```

## 알림 설계

새 공지 등록 시 전 직원에게 알림 발송:
```
type: "announcement"
target_role: "all"
제목: "새 공지사항이 올라왔어요"
내용: "{공지 제목}"
source_id: announcement.id
```

알림 클릭 시 딥링크: `/announcements/{id}`

## 코드 설계

### 라우팅 구조

```
/announcements          직원 공지 목록
/announcements/[id]     공지 상세
/admin/announcements    어드민 공지 관리 (목록 + 작성/수정/삭제)
/admin/announcements/new    공지 작성
/admin/announcements/[id]/edit  공지 수정
```

### 직원 홈 (`page.tsx`) 변경

공지 배너 추가 (위치: 출퇴근 카드 위 또는 아래):
- 가장 최근 공지 1개 + 고정 공지 1개 표시
- 탭/카드 형태로 간략 표시
- "전체 공지 보기" 링크

```
[📢 최신 공지]
이번 주 토요일 단체 청소 있어요.
전체 공지 보기 →
```

### 직원 공지 목록 (`/announcements`)

- 고정 공지 상단 (📌 아이콘)
- 날짜 역순 정렬
- 각 항목: 제목 + 날짜 + 첫 줄 미리보기

### 어드민 공지 관리

- 목록: 전체 공지 (임시저장 포함)
- 상태 뱃지: 게시됨 / 임시저장
- 고정 토글
- 삭제 (확인 바텀시트)

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 홈 배너 제목 | "공지사항" |
| 홈 배너 링크 | "전체 보기" |
| 목록 페이지 제목 | "공지사항" |
| 고정 공지 뱃지 | "고정" |
| 빈 상태 | "아직 공지사항이 없어요." |
| 작성 버튼 | "공지 올리기" |
| 저장 버튼 | "게시하기" |
| 임시저장 버튼 | "임시저장" |
| 삭제 확인 | "공지를 삭제할까요?" / "삭제하기" / "취소" |
| 알림 제목 | "새 공지사항이 올라왔어요" |

## 확정 요구사항

- 공개/알림 대상 통합: `target_roles` (all / full_time / part_time)
- `announcement_reads` 테이블로 읽음 처리 (UNIQUE per 직원+공지)
- 홈 배너 항상 표시 (공지 없으면 "등록된 공지가 없어요.")
- 고정 공지 (`is_pinned`) 상단 고정
- 새 공지 등록 시 target_roles 대상 직원 전원에게 `notifications` insert
- notifications는 아직 in-app만 (push 미지원)

## 결과

- [x] DB 마이그레이션: `announcements` + `announcement_reads` 테이블
- [x] RLS: 직원 target_roles 기반 SELECT, 어드민 ALL, 읽음 INSERT/SELECT
- [x] `/announcements` 직원 목록 + `/announcements/[id]` 상세 (읽음 자동 처리)
- [x] `/admin/announcements` 목록 + 고정 토글 + 삭제
- [x] `/admin/announcements/new` 공지 작성 + 알림 발송
- [x] `/admin/announcements/[id]/edit` 공지 수정
- [x] `AnnouncementBanner.tsx` 홈 배너 컴포넌트 (미읽음 카운트 뱃지)
- [x] 어드민 사이드바 "공지사항 관리" 메뉴 추가
- [x] 알림 딥링크: 홈/어드민 모두 `/announcements/{id}` 연결
- [x] 빌드 통과
