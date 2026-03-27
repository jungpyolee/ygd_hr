import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(request: NextRequest) {
  try {
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

interface ParsedOrder {
  orderCode: string;
  deliveryDate: string;
  manufactureDate: string;
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

  return {
    orderCode,
    deliveryDate,
    manufactureDate: globalManufactureDate,
    items,
    warnings,
  };
}
