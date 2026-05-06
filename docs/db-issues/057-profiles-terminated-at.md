# 057 — profiles.terminated_at 컬럼 추가

## 배경
퇴사자 관리(이슈 053)를 위해 활성/퇴사 상태 표현 컬럼이 필요.

## 변경 내용
```sql
ALTER TABLE profiles
  ADD COLUMN terminated_at timestamptz,
  ADD COLUMN termination_reason text,
  ADD COLUMN terminated_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_active
  ON profiles(id)
  WHERE terminated_at IS NULL;
```

- `terminated_at IS NULL` → 재직중
- partial index로 활성 직원 조회 최적화

## 적용 결과
- Dev (rddplpiwvmclreeblkmi): 적용 완료
- Production: 미적용 (배포 시 dev→main 절차에서 실행)

## 검증
```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'profiles'
    AND column_name IN ('terminated_at', 'termination_reason', 'terminated_by');
```
→ 3개 컬럼 모두 정상 추가 확인 (2026-05-06)

```sql
SELECT indexname FROM pg_indexes WHERE indexname = 'idx_profiles_active';
```
→ 인덱스 생성 확인
