# [FEAT-006] Epic C — 서류 관리 간소화

| 항목 | 내용 |
|------|------|
| 유형 | 기능 개선 |
| 상태 | ✅ 완료 |
| 파일 | `src/components/OnboardingFunnel.tsx`, `src/components/MyInfoModal.tsx`, `src/app/admin/employees/page.tsx` |
| 발견일 | 2026-03-16 |
| 완료일 | 2026-03-16 |

## 배경

2026-03-16 연경이-정표 기획 대화에서 결정된 서류 간소화 사항.

- 등본(주민등록등본): 실제로 쓸 일이 없어 제거
- 통장사본: 사본 파일 자체는 불필요, 계좌번호 텍스트 입력으로 대체
- 보건증: 1년 만료 관리가 필요하므로 유지
- 근로계약서: 관리자 기록용으로 유지
- DB 컬럼(`resident_register_url`, `bank_account_copy_url`)은 기존 데이터 보존을 위해 유지, UI에서만 제거

## 수정 내용

### OnboardingFunnel.tsx
- Step 4 서류 업로드 목록에서 "계좌 사본", "주민등록등본" 제거 (보건증만 유지)
- `bankCopy`, `idCopy` state 및 `bankRef`, `idRef` ref 제거
- `handleSubmit`에서 `bankUrl`, `idUrl` 업로드 로직 제거
- DB update에서 `bank_account_copy_url`, `resident_register_url` 제거
- `selectedFilesCount` 계산 수정 (healthCert만)

### MyInfoModal.tsx
- `DocKey` 타입에서 `bank_account_copy_url`, `resident_register_url` 제거
- 서류 관리 섹션에서 통장사본, 등본 제거 (보건증 사본만 유지)
- `handleFileUpload` 알림 로직에서 통장사본/등본 분기 제거

### admin/employees/page.tsx
- `DocKey` 타입에서 `bank_account_copy_url`, `resident_register_url` 제거
- 직원 카드 서류 뱃지에서 통장, 등본 제거
- 수정 모달 증빙서류 섹션에서 통장사본, 등본 제거
- 계좌번호 옆 복사 버튼 추가 (직원 카드 + 수정 모달)

## 결과

- 빌드 성공 (타입 오류 0건)
- OnboardingFunnel Step 4: 보건증만 업로드 항목으로 표시
- MyInfoModal: 증빙서류 섹션 → 보건증 사본 1개만 유지
- admin/employees: 서류 뱃지 → 계약서/보건증만, 수정 모달 서류 → 계약서/보건증만
- 계좌번호 복사 버튼: 직원 카드 인라인 + 수정 모달 계좌번호 입력 옆에 추가
- DB 컬럼(resident_register_url, bank_account_copy_url)은 유지 — 기존 데이터 보존
