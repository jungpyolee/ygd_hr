"use client";

export interface LabelData {
  orderCode: string;
  supplierName: string;
  productName: string;
  productCode: string;
  expiryDate: string;
  manufactureDate: string;
  boxQuantity: number;
  totalQuantity: number;
  boxNumber: number;
  totalBoxes: number;
}

function LabelCard({ label }: { label: LabelData }) {
  return (
    <table
      style={{
        width: "100%",
        height: "100%",
        borderCollapse: "collapse",
        fontSize: "11pt",
        fontFamily: "Pretendard, sans-serif",
        tableLayout: "fixed",
      }}
    >
      <tbody>
        <Row label="발주코드" value={label.orderCode} />
        <Row label="공급사명" value={label.supplierName} />
        <Row label="상품명" value={label.productName} bold />
        <Row label="상품코드" value={label.productCode} />
        <Row
          label="유통기한(소비기한)/제조일자"
          value={label.manufactureDate}
        />
        <Row
          label="수량/총수량"
          value={`박스 내 입수량 ( ${label.boxQuantity} )  /  총 입고수량 ( ${label.totalQuantity} )`}
        />
        <Row
          label="C/T"
          value={`박스 번호 ( ${label.boxNumber} )  /  전체 박스 수 ( ${label.totalBoxes} )`}
        />
      </tbody>
    </table>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <tr>
      <td
        style={{
          width: "35%",
          padding: "3px 6px",
          border: "1px solid #000",
          fontWeight: 600,
          fontSize: "9pt",
          verticalAlign: "middle",
          backgroundColor: "#f5f5f5",
          wordBreak: "keep-all",
        }}
      >
        {label}
      </td>
      <td
        style={{
          width: "65%",
          padding: "3px 6px",
          border: "1px solid #000",
          fontWeight: bold ? 700 : 400,
          fontSize: bold ? "10pt" : "9pt",
          verticalAlign: "middle",
          wordBreak: "break-all",
        }}
      >
        {value}
      </td>
    </tr>
  );
}

export function openLabelPrintWindow(labels: LabelData[]) {
  const printWindow = window.open("", "_blank", "width=800,height=1000");
  if (!printWindow) {
    alert("팝업이 차단되었어요. 팝업 허용 후 다시 시도해주세요.");
    return;
  }

  // 4개씩 페이지 나누기
  const pages: LabelData[][] = [];
  for (let i = 0; i < labels.length; i += 4) {
    pages.push(labels.slice(i, i + 4));
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>컬리 택배 입고라벨지</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 190mm;
      height: 277mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 4mm;
      page-break-after: always;
      padding: 0;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .label-cell {
      border: 1px solid #ccc;
      padding: 2mm;
      display: flex;
      align-items: stretch;
    }
    .label-cell table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      table-layout: fixed;
    }
    .label-cell td {
      border: 1px solid #000;
      padding: 2px 5px;
      vertical-align: middle;
    }
    .label-cell .field-name {
      width: 35%;
      font-weight: 600;
      font-size: 8pt;
      background-color: #f5f5f5;
      word-break: keep-all;
    }
    .label-cell .field-value {
      width: 65%;
      font-size: 8.5pt;
      word-break: break-all;
    }
    .label-cell .field-value.bold {
      font-weight: 700;
      font-size: 9pt;
    }
    .empty-cell {
      border: 1px dashed #ddd;
    }
    @media screen {
      body { background: #e5e5e5; padding: 20px; }
      .page {
        background: white;
        margin: 0 auto 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #fff;
        padding: 12px 20px;
        margin: -20px -20px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        font-family: Pretendard, sans-serif;
      }
      .toolbar button {
        padding: 10px 24px;
        background: #3182F6;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
      .toolbar button:hover { background: #2272EB; }
      .toolbar span { font-size: 14px; color: #4E5968; }
    }
    @media print {
      .toolbar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>총 ${labels.length}장 · ${pages.length}페이지</span>
    <button onclick="window.print()">인쇄하기</button>
  </div>
  ${pages
    .map(
      (pageLabels, pi) => `
    <div class="page">
      ${[0, 1, 2, 3]
        .map((i) => {
          const l = pageLabels[i];
          if (!l)
            return '<div class="label-cell empty-cell"></div>';
          return `
        <div class="label-cell">
          <table>
            <tr><td class="field-name">발주코드</td><td class="field-value">${l.orderCode}</td></tr>
            <tr><td class="field-name">공급사명</td><td class="field-value">${l.supplierName}</td></tr>
            <tr><td class="field-name">상품명</td><td class="field-value bold">${l.productName}</td></tr>
            <tr><td class="field-name">상품코드</td><td class="field-value">${l.productCode}</td></tr>
            <tr><td class="field-name">유통기한(소비기한)/제조일자</td><td class="field-value">${l.manufactureDate}</td></tr>
            <tr><td class="field-name">수량/총수량</td><td class="field-value">박스 내 입수량 ( ${l.boxQuantity} )  /  총 입고수량 ( ${l.totalQuantity} )</td></tr>
            <tr><td class="field-name">C/T</td><td class="field-value">박스 번호 ( ${l.boxNumber} )  /  전체 박스 수 ( ${l.totalBoxes} )</td></tr>
          </table>
        </div>`;
        })
        .join("")}
    </div>`
    )
    .join("")}
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

export default function LabelPreview({ labels }: { labels: LabelData[] }) {
  if (labels.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* 미리보기 그리드 (2열) */}
      <div className="grid grid-cols-2 gap-2">
        {labels.slice(0, 8).map((label, i) => (
          <div
            key={i}
            className="border border-slate-200 rounded-xl p-2.5 bg-[#F9FAFB] text-[11px] leading-snug"
          >
            <p className="text-[12px] font-bold text-[#191F28] truncate mb-1">
              {label.productName}
            </p>
            <div className="space-y-0.5 text-[#8B95A1]">
              <div className="flex justify-between">
                <span>수량</span>
                <span className="text-[#191F28] font-medium">{label.boxQuantity} / {label.totalQuantity}</span>
              </div>
              <div className="flex justify-between">
                <span>C/T</span>
                <span className="text-[#191F28] font-medium">{label.boxNumber} / {label.totalBoxes}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {labels.length > 8 && (
        <p className="text-center text-[12px] text-[#8B95A1]">
          +{labels.length - 8}개 더 있어요 (인쇄 시 전체 포함)
        </p>
      )}
    </div>
  );
}
