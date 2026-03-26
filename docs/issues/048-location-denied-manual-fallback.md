# 048 — 위치 권한 거부 시 수동 출퇴근 + QR 출퇴근 시스템

## 배경
- 일부 직원이 위치 권한 설정을 어려워하거나 거부해서 앱 사용을 포기하는 상황
- 기존 플로우: 위치 denied → LocationPermissionGuide 안내 → 설정 변경 요구 → 여전히 denied면 출근 차단

## 수정 내용

### Phase 1: 위치 실패 시 수동 선택 즉시 허용
- 위치 `denied` 시 `LocationPermissionGuide` 대신 바로 `StoreSelectorSheet`(매장 수동 선택)으로 이동
- `handlePermissionConfirm`, `showPermissionGuide` 상태, `LocationPermissionGuide` 렌더링 제거
- GPS 재시도 후에도 실패하면 모두 수동 선택으로 fallback

### Phase 2: QR 출퇴근 시스템
- DB: `stores` 테이블에 `qr_token` 컬럼 추가 (UNIQUE, hex 16바이트)
- `/admin/qr` 관리자 페이지: 매장별 QR 코드 표시, 프린트, 링크 복사, 토큰 재발급
- `/attend/qr` 직원용 페이지: QR 스캔 → 토큰 검증 → 자동 출퇴근(IN/OUT) 처리
- `attendance_type`: `qr_in` / `qr_out` 추가
- `NotificationType`: `attendance_qr_in` / `attendance_qr_out` 추가
- 관리자 캘린더, overtime 페이지에 QR 출퇴근 배지 표시
- 알림 URL 매핑 추가

### 직원 AttendanceCard QR 버튼
- 아직 숨김 상태 — QR 프린트 부착 후 활성화 예정

## 변경 플로우
```
출근/퇴근 버튼 탭
├─ 위치 OK → 자동 매장 매칭 (기존과 동일)
└─ 위치 실패 (denied / timeout / unavailable)
    └─ 매장 수동 선택 (즉시)

QR 스캔 (카메라로 벽 QR 촬영)
└─ /attend/qr 페이지 진입
    ├─ 로그인 안됨 → 로그인 안내
    ├─ 토큰 검증 실패 → 에러 안내
    └─ 토큰 OK → 마지막 기록 확인 → IN/OUT 자동 판별 → 출퇴근 기록
```

## 관련 파일
- `src/components/AttendanceCard.tsx` — 위치 실패 시 수동 선택 즉시 허용
- `src/app/admin/qr/page.tsx` — 관리자 QR 관리 페이지 (신규)
- `src/app/attend/qr/page.tsx` — QR 출퇴근 처리 페이지 (신규)
- `src/app/admin/layout.tsx` — 관리자 메뉴에 QR 추가
- `src/app/admin/calendar/page.tsx` — QR 출퇴근 배지 표시
- `src/app/admin/overtime/page.tsx` — QR 출퇴근 배지 표시
- `src/lib/notifications.ts` — `attendance_qr_in/out` 타입 추가
- `src/lib/notificationUrls.ts` — QR 알림 URL 매핑
- `docs/migrations/042_stores_qr_token.sql` — DB 마이그레이션
- `docs/schema.md` — 스키마 갱신

## 결과
- 빌드 통과
- 위치 권한 거부 직원도 즉시 수동 출퇴근 가능
- QR 출퇴근 로직 완성 (QR 프린트 부착 후 바로 사용 가능)
