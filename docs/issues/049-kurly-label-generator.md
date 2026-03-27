# 049 — 컬리 발주 라벨지 자동생성

## 배경
마켓컬리 발주 시 거래명세서의 제품/수량 정보를 입고라벨지 Excel에 수기로 옮기는 반복 작업이 필요했음.
제품별 박스별로 라벨을 하나하나 채워야 해서 시간이 많이 소요됨.

## 구현 내용

### DB
- `kurly_products` 테이블 생성 (마이그레이션 043)
- 초기 제품 5종 등록 (거래명세서 기준)

### 페이지
1. `/admin/orders` — 발주 라벨지 생성 메인
   - 발주코드, 입고일, 제조일자, 유통기한 입력
   - 제품 선택 + 수량 입력 → 박스 수 자동계산
   - 라벨 미리보기 + 인쇄

2. `/admin/orders/products` — 컬리 제품 마스터 관리
   - 제품 추가/수정/삭제

### 컴포넌트
- `LabelPrintView.tsx` — 인쇄용 라벨 렌더링
  - A4 4분할 배치 (2x2)
  - 컬리 지정 양식 (발주코드, 공급사명, 상품명, 상품코드, 유통기한/제조일자, 수량/총수량, C/T)
  - 새 창에서 인쇄 최적화 HTML + CSS @media print

## 수정 파일
- `docs/migrations/043_kurly_products.sql`
- `docs/schema.md`
- `src/app/admin/layout.tsx` (메뉴 추가)
- `src/app/admin/orders/page.tsx` (신규)
- `src/app/admin/orders/products/page.tsx` (신규)
- `src/components/admin/orders/LabelPrintView.tsx` (신규)

## 결과
- npm run build 통과 ✅
