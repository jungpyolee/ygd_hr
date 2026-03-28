import { NextRequest, NextResponse } from "next/server";

// Vercel Serverless에 없는 브라우저 API polyfill (pdfjs-dist 텍스트 추출에 필요)
// ESM import는 호이스팅되므로 polyfill을 먼저 적용하려면 dynamic import 필수
function ensurePolyfills() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    // @ts-expect-error minimal polyfill for pdfjs-dist
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(init?: number[]) {
        const m = init ?? [1, 0, 0, 1, 0, 0];
        this.a = m[0]; this.b = m[1]; this.c = m[2];
        this.d = m[3]; this.e = m[4]; this.f = m[5];
        this.m11 = m[0]; this.m12 = m[1]; this.m21 = m[2];
        this.m22 = m[3]; this.m41 = m[4]; this.m42 = m[5];
        this.is2D = true; this.isIdentity = false;
      }
      a=1;b=0;c=0;d=1;e=0;f=0;
      m11=1;m12=0;m21=0;m22=1;m41=0;m42=0;
      is2D=true;isIdentity=false;
      inverse() { return new DOMMatrix(); }
      multiply() { return new DOMMatrix(); }
      translate() { return new DOMMatrix(); }
      scale() { return new DOMMatrix(); }
      transformPoint(p: unknown) { return p; }
    };
  }
  if (typeof globalThis.ImageData === "undefined") {
    // @ts-expect-error minimal polyfill
    globalThis.ImageData = class ImageData {
      width: number; height: number; data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w; this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    };
  }
  if (typeof globalThis.Path2D === "undefined") {
    // @ts-expect-error minimal polyfill
    globalThis.Path2D = class Path2D {
      moveTo() {} lineTo() {} bezierCurveTo() {} rect() {} closePath() {}
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // polyfill 먼저 적용 후 pdf-parse를 dynamic import
    ensurePolyfills();
    const { PDFParse } = await import("pdf-parse");

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "PDF 파일을 업로드해주세요" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const parser = new PDFParse({ data: new Uint8Array(arrayBuffer) });
    const textResult = await parser.getText();
    const text = textResult.text;
    await parser.destroy();

    const parsed = parseOrderText(text);

    return NextResponse.json(parsed);
  } catch (e) {
    console.error("PDF 파싱 실패:", e);
    return NextResponse.json(
      { error: "PDF를 읽을 수 없어요. 컬리 거래명세서인지 확인해주세요." },
      { status: 500 }
    );
  }
}

interface ParsedItem {
  masterCode: string;
  totalQuantity: number;
  manufactureDate: string;
  boxCount: number;
  perBoxQty: number;
}

interface WarehouseInfo {
  name: string;
  address: string;
  phone: string;
}

interface ParsedOrder {
  orderCode: string;
  deliveryDate: string;
  manufactureDate: string;
  warehouse: WarehouseInfo | null;
  items: ParsedItem[];
  warnings: string[];
}

function parseOrderText(rawText: string): ParsedOrder {
  const cleanText = rawText.replace(/\x00/g, " ");
  const warnings: string[] = [];

  // ── 1. 필수 필드: 발주코드 ──
  const orderCodeMatch = cleanText.match(/발주코드:\s*(T\S+)/);
  if (!orderCodeMatch) {
    throw new Error(
      "발주코드를 찾을 수 없어요. 컬리 거래명세서가 맞는지 확인해주세요."
    );
  }
  const orderCode = orderCodeMatch[1].trim();

  // ── 2. 필수 필드: 입고일 ──
  const deliveryDateMatch = cleanText.match(/입고일:\s*(\d{4}-\d{2}-\d{2})/);
  if (!deliveryDateMatch) {
    throw new Error(
      "입고일을 찾을 수 없어요. PDF 형식이 예상과 달라요."
    );
  }
  const deliveryDate = deliveryDateMatch[1];

  // ── 3. 거래명세서 기본 구조 검증 ──
  if (!cleanText.includes("공급사") || !cleanText.includes("연경당")) {
    throw new Error(
      "연경당 거래명세서가 아닌 것 같아요. 파일을 확인해주세요."
    );
  }

  // ── 4. 제품 라인 합치기 (줄바꿈된 상품명 처리) ──
  const rawLines = cleanText.split("\n");
  const joinedLines: string[] = [];

  for (const line of rawLines) {
    const isProductStart = /^\s*\d{1,2}\s*M\d{8,}/.test(line);
    const prevIdx = joinedLines.length - 1;
    const prevIsProduct =
      prevIdx >= 0 && /^\s*\d{1,2}\s*M\d{8,}/.test(joinedLines[prevIdx]);
    const prevHasDate =
      prevIdx >= 0 && /\d{4}-\d{2}-\d{2}/.test(joinedLines[prevIdx]);

    if (!isProductStart && prevIsProduct && !prevHasDate) {
      joinedLines[prevIdx] += " " + line.trim();
    } else {
      joinedLines.push(line);
    }
  }

  // ── 5. 제품 라인 파싱 ──
  const items: ParsedItem[] = [];
  let globalManufactureDate = "";

  // 마스터코드가 있지만 데이터 파싱에 실패한 라인 추적
  const failedLines: string[] = [];

  for (const line of joinedLines) {
    if (line.includes("마스터코드") || line.includes("입수규격")) continue;

    const masterMatch = line.match(/^\s*\d{1,2}\s*(M\d{8,})/);
    if (!masterMatch) continue;

    const masterCode = masterMatch[1];
    if (items.some((item) => item.masterCode === masterCode)) continue;

    // {총수량} {날짜} {박스수} {입수량} {규격}
    const dataMatch = line.match(
      /(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d+)\s+(\d+)\s+(\d+)/
    );

    if (!dataMatch) {
      // 마스터코드는 있는데 수량/날짜 패턴이 안 맞는 경우 → 파싱 실패
      failedLines.push(masterCode);
      continue;
    }

    const totalQuantity = parseInt(dataMatch[1]);
    const manufactureDate = dataMatch[2];
    const boxCount = parseInt(dataMatch[3]);
    const perBoxQty = parseInt(dataMatch[4]);

    if (!globalManufactureDate) globalManufactureDate = manufactureDate;

    // ── 6. 항목별 데이터 정합성 검증 ──
    if (totalQuantity <= 0 || totalQuantity > 10000) {
      warnings.push(`${masterCode}: 총수량(${totalQuantity})이 비정상적이에요`);
    }
    if (boxCount <= 0 || boxCount > 100) {
      warnings.push(`${masterCode}: 박스수(${boxCount})가 비정상적이에요`);
    }
    if (perBoxQty <= 0) {
      warnings.push(`${masterCode}: 입수량(${perBoxQty})이 비정상적이에요`);
    }
    // 박스수 × 입수량이 총수량과 안 맞으면 경고
    if (boxCount * perBoxQty !== totalQuantity) {
      warnings.push(
        `${masterCode}: 박스수(${boxCount})×입수량(${perBoxQty})=${boxCount * perBoxQty}이 총수량(${totalQuantity})과 달라요`
      );
    }

    items.push({
      masterCode,
      totalQuantity,
      manufactureDate,
      boxCount,
      perBoxQty,
    });
  }

  // ── 7. 최종 검증 ──
  if (failedLines.length > 0) {
    throw new Error(
      `제품 ${failedLines.join(", ")}의 수량/날짜를 읽을 수 없어요. PDF 형식이 변경되었을 수 있어요.`
    );
  }

  if (items.length === 0) {
    throw new Error(
      "제품 정보를 하나도 찾지 못했어요. 컬리 거래명세서가 맞는지 확인해주세요."
    );
  }

  // ── 8. 물류센터(입고지) 파싱 ──
  const warehouse = parseWarehouse(cleanText);
  if (!warehouse) {
    warnings.push("물류센터 정보를 읽지 못했어요. 송장 생성 시 직접 입력해주세요.");
  }

  return {
    orderCode,
    deliveryDate,
    manufactureDate: globalManufactureDate,
    warehouse,
    items,
    warnings,
  };
}

function parseWarehouse(text: string): WarehouseInfo | null {
  // 패턴: {센터명}({층수}) | 일반입고... | 입고지 연락처 {전화}
  const infoMatch = text.match(
    /(\S+?)\([^)]+\)\s*\|\s*일반입고.*?\|\s*입고지\s*연락처\s*([\d\s\-,]+)/
  );

  // 택배 주소: "택배 : {주소}"
  const addrMatch = text.match(/택배\s*:\s*(.+)/);

  if (!infoMatch) return null;

  const rawName = infoMatch[1].trim(); // 평택냉장, 김포냉동
  const rawPhone = infoMatch[2].replace(/\s+/g, "").trim(); // 010-5820-2936

  // 센터명 → 수하인명 매핑
  let name = "마켓컬리";
  if (rawName.includes("평택")) name = "마켓컬리 평택";
  else if (rawName.includes("김포")) name = "마켓컬리 김포";
  else if (rawName.includes("창원")) name = "마켓컬리 창원";
  else name = `마켓컬리 ${rawName.replace(/냉장|냉동/g, "").trim()}`;

  const address = addrMatch?.[1]?.trim().replace(/\*+/g, "") || "";

  return { name, address, phone: rawPhone };
}
