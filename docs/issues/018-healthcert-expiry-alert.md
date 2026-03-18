# [FEAT-018] 보건증 만료 1달 전 어드민 알림

| 항목 | 내용 |
|------|------|
| 유형 | 기능 추가 |
| 상태 | ✅ 완료 |
| 파일 | `src/app/admin/layout.tsx` |
| 발견일 | 2026-03-18 |
| 완료일 | 2026-03-18 |

## 배경

대표 통화에서 "보건증 만료 앞두고 있는 한 달 정도 남았을 때 알려준다"고 확인.
`profiles.health_cert_date` 컬럼은 이미 존재. 알림 발송 로직만 추가하면 됨.

## 현재 상태

- `profiles.health_cert_date` (date) 컬럼 존재 ✅
- `notifications` 테이블 및 `sendNotification()` 함수 존재 ✅
- 어드민 대시보드 로드 시 데이터 fetch 로직 존재 ✅
- 만료 임박 체크 로직 없음

## 수정 계획

### 1. 체크 시점

어드민 대시보드 로드 시 (`admin/page.tsx` `useEffect`) 체크.
별도 cron/edge function 없이 어드민이 대시보드 열 때마다 확인.

### 2. 체크 로직

```typescript
// 만료일이 오늘 기준 30일 이내인 직원 조회
const today = new Date();
const in30Days = new Date(today);
in30Days.setDate(today.getDate() + 30);

const { data: expiring } = await supabase
  .from("profiles")
  .select("id, name, health_cert_date")
  .not("health_cert_date", "is", null)
  .lte("health_cert_date", format(in30Days, "yyyy-MM-dd"))
  .gte("health_cert_date", format(today, "yyyy-MM-dd")); // 만료 전만 (만료된 건 제외)
```

### 3. 중복 알림 방지

같은 직원에 대해 오늘 이미 발송된 `health_cert_expiry` 알림이 있으면 skip.

```typescript
const todayStr = format(today, "yyyy-MM-dd");

// 오늘 발송된 보건증 알림 조회
const { data: sentToday } = await supabase
  .from("notifications")
  .select("source_id")
  .eq("type", "health_cert_expiry")
  .gte("created_at", `${todayStr}T00:00:00+09:00`);

const sentIds = new Set(sentToday?.map((n) => n.source_id));

// 아직 발송 안 된 직원만 알림 발송
for (const profile of expiring ?? []) {
  if (!sentIds.has(profile.id)) {
    await sendNotification({
      target_role: "admin",
      type: "health_cert_expiry",
      title: "보건증 만료 예정",
      content: `${profile.name}님의 보건증이 ${profile.health_cert_date}에 만료돼요.`,
      source_id: profile.id,
    });
  }
}
```

### 4. 어드민 대시보드 표시

별도 섹션 또는 기존 "서류 미비/만료" 지표에 통합.
만료 30일 이내인 직원 수를 대시보드 카드에 표시.

### 5. notifications type 추가

`schema.md`의 알림 type 목록에 추가:
```
| `health_cert_expiry` | 보건증 만료 30일 전 (→ 어드민) |
```

### 6. 만료된 보건증도 별도 표시

이미 `health_cert_date < today`인 경우 → 어드민 직원 관리 페이지에서 빨간 배지 표시 (기존 로직 확인 후 추가).

## UI/UX 라이팅

| 요소 | 텍스트 |
|------|--------|
| 알림 제목 | "보건증 만료 예정" |
| 알림 내용 | `"{이름}님의 보건증이 {날짜}에 만료돼요."` |
| 대시보드 라벨 | "보건증 만료 임박" |
| 대시보드 서브텍스트 | `"{N}명 · 30일 이내 만료"` |

## 결과

- [ ] 어드민 로드 시 만료 임박 직원 체크 로직 추가
- [ ] 중복 알림 방지 로직 확인
- [ ] notifications type `health_cert_expiry` 추가
- [ ] schema.md 알림 type 목록 갱신
- [ ] 빌드 통과
