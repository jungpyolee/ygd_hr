"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Trash2,
  Printer,
  Settings,
  ChevronDown,
  Upload,
  FileText,
  Loader2,
  PackageCheck,
  CalendarDays,
  Box,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import LabelPreview, {
  openLabelPrintWindow,
  type LabelData,
} from "@/components/admin/orders/LabelPrintView";

interface KurlyProduct {
  id: string;
  name: string;
  master_code: string;
  barcode: string | null;
  unit_weight: string | null;
  box_capacity: number;
  is_active: boolean;
}

interface OrderItem {
  productId: string;
  quantity: number;
}

const SUPPLIER_NAME = "(주)연경당 (VD6235)";

export default function AdminOrdersPage() {
  const [products, setProducts] = useState<KurlyProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);

  const [orderCode, setOrderCode] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [manufactureDate, setManufactureDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );
  const [expiryDate, setExpiryDate] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [warehouse, setWarehouse] = useState<{
    name: string;
    address: string;
    phone: string;
  } | null>(null);

  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("kurly_products")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setProducts(data ?? []);
      setLoading(false);
    };
    load();
  }, []);

  // ── PDF 업로드 → 자동 파싱 ──
  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("PDF 파일만 업로드할 수 있어요", {
          description: "컬리 셀러 포털에서 받은 거래명세서를 올려주세요",
        });
        return;
      }
      setParsing(true);
      setUploadedFileName(file.name);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/orders/parse-pdf", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "파싱 실패");
        }
        const data = await res.json();

        if (data.orderCode) setOrderCode(data.orderCode);
        if (data.deliveryDate) setDeliveryDate(data.deliveryDate);
        if (data.manufactureDate) setManufactureDate(data.manufactureDate);
        if (data.warehouse) setWarehouse(data.warehouse);

        const matchedItems: OrderItem[] = [];
        const unmatchedCodes: string[] = [];
        for (const item of data.items) {
          const product = products.find(
            (p) => p.master_code === item.masterCode
          );
          if (product) {
            matchedItems.push({
              productId: product.id,
              quantity: item.totalQuantity,
            });
          } else {
            unmatchedCodes.push(item.masterCode);
          }
        }
        setOrderItems(matchedItems);

        if (matchedItems.length > 0) {
          toast.success(
            `거래명세서에서 ${matchedItems.length}개 제품을 불러왔어요`
          );
        }
        if (unmatchedCodes.length > 0) {
          toast.error(
            `${unmatchedCodes.length}개 제품이 등록되지 않았어요`,
            {
              description: `미등록 코드: ${unmatchedCodes.join(", ")}. 제품 관리에서 먼저 등록해주세요.`,
              duration: 8000,
            }
          );
        }
        if (data.warnings && data.warnings.length > 0) {
          for (const w of data.warnings) {
            toast.error("데이터를 다시 확인해주세요", {
              description: w,
              duration: 10000,
            });
          }
        }
      } catch (e) {
        toast.error("거래명세서를 읽을 수 없어요", {
          description:
            e instanceof Error ? e.message : "PDF 형식을 확인해주세요",
        });
        setUploadedFileName("");
      } finally {
        setParsing(false);
      }
    },
    [products]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
      e.target.value = "";
    },
    [handleFileUpload]
  );

  // ── 제품 조작 ──
  const availableProducts = useMemo(
    () =>
      products.filter(
        (p) => !orderItems.some((item) => item.productId === p.id)
      ),
    [products, orderItems]
  );

  const addProduct = (productId: string) => {
    setOrderItems((prev) => [...prev, { productId, quantity: 0 }]);
    setShowProductPicker(false);
  };

  const updateQuantity = (index: number, quantity: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity } : item))
    );
  };

  const removeItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const getProduct = (id: string) => products.find((p) => p.id === id);

  const getBoxCount = (item: OrderItem) => {
    const product = getProduct(item.productId);
    if (!product || item.quantity <= 0) return 0;
    return Math.ceil(item.quantity / product.box_capacity);
  };

  // ── 라벨 생성 ──
  const labels = useMemo<LabelData[]>(() => {
    if (!orderCode.trim() || (!expiryDate && !manufactureDate)) return [];
    const result: LabelData[] = [];
    for (const item of orderItems) {
      const product = getProduct(item.productId);
      if (!product || item.quantity <= 0) continue;
      const boxCount = getBoxCount(item);
      const boxCapacity = product.box_capacity;
      for (let box = 1; box <= boxCount; box++) {
        const isLastBox = box === boxCount;
        const boxQty = isLastBox
          ? item.quantity - boxCapacity * (boxCount - 1)
          : boxCapacity;
        result.push({
          orderCode: orderCode.trim(),
          supplierName: SUPPLIER_NAME,
          productName: product.name,
          productCode: product.master_code,
          expiryDate: expiryDate || "-",
          manufactureDate: manufactureDate || "-",
          boxQuantity: boxQty,
          totalQuantity: item.quantity,
          boxNumber: box,
          totalBoxes: boxCount,
        });
      }
    }
    return result;
  }, [orderCode, orderItems, expiryDate, manufactureDate, products]);

  const totalBoxes = orderItems.reduce(
    (sum, item) => sum + getBoxCount(item),
    0
  );

  const handlePrint = () => {
    if (labels.length === 0) {
      toast.error("인쇄할 라벨이 없어요", {
        description: "발주코드와 제품 수량을 입력해주세요",
      });
      return;
    }
    openLabelPrintWindow(labels);
  };

  const handleDownloadInvoice = async () => {
    if (!warehouse) {
      toast.error("물류센터 정보가 없어요", {
        description: "거래명세서를 먼저 올려주세요",
      });
      return;
    }
    if (orderItems.length === 0) {
      toast.error("제품이 없어요", {
        description: "거래명세서를 올리거나 제품을 추가해주세요",
      });
      return;
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("송장");

    // 제품 1개 = 1줄, 택배수량=1, 운임 고정
    for (const item of orderItems) {
      const product = getProduct(item.productId);
      if (!product || item.quantity <= 0) continue;

      sheet.addRow([
        warehouse.name,    // A: 수하인명
        warehouse.address, // B: 수하인주소
        null,              // C: 빈칸
        warehouse.phone,   // D: 전화번호
        product.name,      // E: 품목명
        1,                 // F: 택배수량
        2750,              // G: 택배운임
        "030",             // H: 운임구분
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `송장_${orderCode || "발주"}_${format(new Date(), "yyyyMMdd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("송장 엑셀을 다운로드했어요");
  };

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-7 w-32 bg-[#F2F4F6] rounded-xl animate-pulse" />
        <div className="h-3 w-56 bg-[#F2F4F6] rounded animate-pulse" />
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-[28px] border border-slate-100 p-5 animate-pulse"
          >
            <div className="h-3 bg-[#F2F4F6] rounded w-20 mb-4" />
            <div className="h-10 bg-[#F2F4F6] rounded-xl mb-3" />
            <div className="h-10 bg-[#F2F4F6] rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── 헤더 ── */}
      <header className="mb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#191F28] tracking-tight">
            발주 라벨지
          </h1>
          <button
            onClick={() => router.push("/admin/orders/products")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-bold bg-white border border-[#E5E8EB] text-[#4E5968] hover:bg-[#F2F4F6] active:bg-[#E5E8EB] transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            제품 관리
          </button>
        </div>
        <p className="text-[14px] text-[#8B95A1] font-medium mt-1">
          거래명세서를 올리면 라벨지가 자동으로 만들어져요
        </p>
      </header>

      {/* ── 거래명세서 업로드 ── */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !parsing && fileInputRef.current?.click()}
        className={`
          rounded-[28px] p-6 text-center cursor-pointer transition-all
          ${
            parsing
              ? "bg-[#E8F3FF] border-2 border-[#3182F6]"
              : uploadedFileName
                ? "bg-[#EBFBEE] border-2 border-[#2F9E44]/30"
                : "bg-white border-2 border-dashed border-[#D1D6DB] hover:border-[#3182F6] hover:bg-[#F8FBFF]"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        {parsing ? (
          <div className="flex items-center justify-center gap-3 py-2">
            <Loader2 className="w-5 h-5 text-[#3182F6] animate-spin" />
            <p className="text-[14px] font-semibold text-[#3182F6]">
              거래명세서를 분석하고 있어요
            </p>
          </div>
        ) : uploadedFileName ? (
          <div className="flex items-center justify-center gap-3 py-1">
            <FileText className="w-5 h-5 text-[#2F9E44]" />
            <div className="text-left">
              <p className="text-[14px] font-semibold text-[#191F28]">
                {uploadedFileName}
              </p>
              <p className="text-[12px] text-[#8B95A1]">
                다른 파일을 올리려면 여기를 눌러주세요
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-12 h-12 rounded-2xl bg-[#F2F4F6] flex items-center justify-center">
              <Upload className="w-6 h-6 text-[#8B95A1]" />
            </div>
            <p className="text-[15px] font-semibold text-[#191F28]">
              컬리 거래명세서 올리기
            </p>
            <p className="text-[13px] text-[#8B95A1]">
              PDF를 끌어다 놓거나 여기를 눌러주세요
            </p>
          </div>
        )}
      </div>

      {/* ── 발주 정보 ── */}
      <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F2F4F6]">
          <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#3182F6]" />
            발주 정보
          </h3>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
              발주코드
            </label>
            <input
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="거래명세서에서 자동으로 채워져요"
              className="w-full px-4 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] focus:outline-none focus:border-[#3182F6] transition-all"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                입고일
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                제조일자
              </label>
              <input
                type="date"
                value={manufactureDate}
                onChange={(e) => setManufactureDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#8B95A1] mb-1">
                유통기한 <span className="text-[11px] font-normal">(선택)</span>
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#F9FAFB] border border-slate-200 rounded-xl text-[14px] text-[#191F28] focus:outline-none focus:border-[#3182F6] transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── 제품 목록 ── */}
      <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F2F4F6] flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
            <Box className="w-4 h-4 text-[#3182F6]" />
            제품 목록
          </h3>
          {orderItems.length > 0 && (
            <span className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] px-2.5 py-1 rounded-lg">
              {orderItems.length}종 · {totalBoxes}박스
            </span>
          )}
        </div>

        <div className="p-5 space-y-2.5">
          {/* 제품 항목 */}
          {orderItems.map((item, index) => {
            const product = getProduct(item.productId);
            if (!product) return null;
            const boxCount = getBoxCount(item);

            return (
              <div
                key={item.productId}
                className="bg-[#F9FAFB] rounded-2xl p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#191F28] truncate">
                      {product.name}
                    </p>
                    <p className="text-[11px] text-[#8B95A1] mt-0.5">
                      {product.master_code} · {product.box_capacity}개입
                      {product.unit_weight && ` · ${product.unit_weight}`}
                    </p>
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    aria-label="제거"
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#FFF0F0] active:bg-red-100 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#F04438]" />
                  </button>
                </div>

                <div className="flex items-end gap-3 mt-3">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-[#8B95A1] mb-1">
                      총 수량
                    </label>
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        updateQuantity(index, parseInt(e.target.value) || 0)
                      }
                      placeholder="수량을 입력해주세요"
                      min={0}
                      className="w-full bg-white px-3 py-2 rounded-xl text-[14px] text-[#191F28] placeholder:text-[#B0B8C1] border border-slate-200 focus:outline-none focus:border-[#3182F6] transition-all"
                    />
                  </div>
                  {boxCount > 0 && (
                    <div className="shrink-0 bg-[#E8F3FF] rounded-xl px-4 py-2 text-center">
                      <p className="text-[11px] text-[#3182F6] font-medium">
                        박스
                      </p>
                      <p className="text-[18px] font-bold text-[#3182F6] leading-tight">
                        {boxCount}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* 제품 추가 */}
          {availableProducts.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowProductPicker(!showProductPicker)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-[#E5E8EB] text-[13px] font-bold text-[#8B95A1] hover:border-[#3182F6] hover:text-[#3182F6] hover:bg-[#F8FBFF] active:bg-[#E8F3FF] transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                제품 추가하기
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showProductPicker ? "rotate-180" : ""}`}
                />
              </button>

              {showProductPicker && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowProductPicker(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#E5E8EB] rounded-2xl shadow-lg z-20 max-h-[260px] overflow-y-auto">
                    {availableProducts.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-[#F9FAFB] active:bg-[#F2F4F6] transition-colors first:rounded-t-2xl last:rounded-b-2xl ${
                          idx !== 0 ? "border-t border-[#F2F4F6]" : ""
                        }`}
                      >
                        <p className="text-[14px] font-bold text-[#191F28]">
                          {p.name}
                        </p>
                        <p className="text-[11px] text-[#8B95A1] mt-0.5">
                          {p.master_code} · {p.box_capacity}개입
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 빈 상태 */}
          {products.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-[#8B95A1]">
                아직 등록된 제품이 없어요
              </p>
              <button
                onClick={() => router.push("/admin/orders/products")}
                className="text-[14px] font-bold text-[#3182F6] mt-2 hover:underline"
              >
                제품 등록하러 가기
              </button>
            </div>
          )}

          {products.length > 0 && orderItems.length === 0 && (
            <div className="py-8 text-center text-[14px] text-[#8B95A1]">
              거래명세서를 올리면 제품이 자동으로 채워져요
            </div>
          )}
        </div>
      </div>

      {/* ── 출력 섹션 ── */}
      {orderItems.length > 0 && orderItems.some((item) => item.quantity > 0) && (
        <div className="bg-white rounded-[28px] border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F2F4F6]">
            <h3 className="text-[15px] font-bold text-[#191F28] flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-[#3182F6]" />
              출력
              {labels.length > 0 && (
                <span className="text-[12px] font-bold text-[#3182F6] bg-[#E8F3FF] px-2 py-0.5 rounded-md ml-1">
                  라벨 {labels.length}장 · A4 {Math.ceil(labels.length / 4)}페이지
                </span>
              )}
            </h3>
          </div>

          <div className="p-5 space-y-4">
            {/* 버튼 영역 */}
            <div className="flex gap-2.5">
              <button
                onClick={handlePrint}
                disabled={labels.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[14px] font-bold text-white bg-[#3182F6] hover:bg-[#2272EB] active:bg-[#1B64DA] disabled:bg-[#E5E8EB] disabled:text-[#B0B8C1] transition-colors"
              >
                <Printer className="w-4 h-4" />
                라벨지 인쇄하기
              </button>
              <button
                onClick={handleDownloadInvoice}
                disabled={!warehouse}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[14px] font-bold text-[#191F28] bg-[#F2F4F6] hover:bg-[#E5E8EB] active:bg-[#D1D6DB] disabled:text-[#B0B8C1] transition-colors"
              >
                <Download className="w-4 h-4" />
                송장 엑셀 다운로드
              </button>
            </div>

            {/* 물류센터 정보 */}
            {warehouse && (
              <div className="bg-[#F9FAFB] rounded-xl px-4 py-3 text-[12px] text-[#8B95A1] space-y-0.5">
                <p>
                  <span className="font-medium text-[#4E5968]">수하인</span>{" "}
                  {warehouse.name}
                </p>
                <p>
                  <span className="font-medium text-[#4E5968]">주소</span>{" "}
                  {warehouse.address}
                </p>
                <p>
                  <span className="font-medium text-[#4E5968]">연락처</span>{" "}
                  {warehouse.phone}
                </p>
              </div>
            )}

            {/* 라벨 미리보기 */}
            {labels.length > 0 && <LabelPreview labels={labels} />}
          </div>
        </div>
      )}
    </div>
  );
}
