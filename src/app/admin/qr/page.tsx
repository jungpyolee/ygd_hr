"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { QRCodeCanvas } from "qrcode.react";
import { Printer, RefreshCw, Copy, Check } from "lucide-react";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface Store {
  id: string;
  name: string;
  qr_token: string;
  work_location_key: string | null;
}

export default function AdminQRPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmStoreId, setConfirmStoreId] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    const { data, error } = await supabase
      .from("stores")
      .select("id, name, qr_token, work_location_key")
      .order("display_order");

    if (error) {
      toast.error("매장 정보를 불러올 수 없어요");
      return;
    }
    // 케이터링 제외 (이동형 근무지라 QR 부착 불가)
    setStores((data ?? []).filter((s) => s.work_location_key !== "catering"));
    setLoading(false);
  };

  const regenerateToken = async (storeId: string) => {
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabase
      .from("stores")
      .update({ qr_token: newToken })
      .eq("id", storeId);

    if (error) {
      toast.error("토큰 재발급에 실패했어요");
      return;
    }

    toast.success("QR 코드가 재발급됐어요. 새로 프린트해주세요.");
    fetchStores();
  };

  const handleConfirmRegenerate = () => {
    if (confirmStoreId) {
      regenerateToken(confirmStoreId);
    }
    setConfirmStoreId(null);
  };

  const getQRUrl = (store: Store) =>
    `${baseUrl}/attend/qr?s=${store.id}&token=${store.qr_token}`;

  const copyUrl = async (store: Store) => {
    await navigator.clipboard.writeText(getQRUrl(store));
    setCopiedId(store.id);
    toast.success("링크가 복사됐어요");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePrintAll = () => {
    const cards = stores.map((store) => {
      const canvas = document.querySelector(
        `[data-store-qr="${store.id}"] canvas`
      ) as HTMLCanvasElement | null;
      return { name: store.name, dataUrl: canvas?.toDataURL("image/png") ?? "" };
    }).filter((c) => c.dataUrl);

    if (cards.length === 0) return;

    const win = window.open("", "_blank");
    if (!win) return;

    const cardsHtml = cards
      .map(
        (c) => `
      <div class="card">
        <span class="badge">QR 출퇴근</span>
        <div class="store-name">${c.name}</div>
        <div class="qr-wrapper"><img src="${c.dataUrl}" /></div>
        <div class="instruction">카메라로 QR을 스캔하면<br/>출퇴근이 자동으로 기록돼요</div>
        <div class="divider"></div>
        <div class="brand">연경당 HR</div>
      </div>`
      )
      .join("\n");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>QR 출퇴근 - 전체 프린트</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 210mm;
      height: 297mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-evenly;
      font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .card {
      width: 160mm;
      height: 130mm;
      padding: 8mm 10mm;
      border: 2.5px solid #E5E8EB;
      border-radius: 8mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3.5mm;
    }
    .badge {
      display: inline-block;
      background: #E8F3FF;
      color: #3182F6;
      font-size: 10pt;
      font-weight: 700;
      padding: 1.5mm 5mm;
      border-radius: 4mm;
      letter-spacing: 0.5px;
    }
    .store-name {
      font-size: 24pt;
      font-weight: 800;
      color: #191F28;
    }
    .qr-wrapper img {
      width: 50mm;
      height: 50mm;
    }
    .instruction {
      font-size: 12pt;
      color: #4E5968;
      font-weight: 600;
      text-align: center;
      line-height: 1.5;
    }
    .divider {
      width: 20mm;
      border-top: 2px solid #E5E8EB;
    }
    .brand {
      font-size: 9pt;
      color: #ADB5BD;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  ${cardsHtml}
</body>
</html>`);
    win.document.close();
    win.onload = () => win.print();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-[#F2F4F6] rounded-xl" />
          <div className="h-64 bg-[#F2F4F6] rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-[22px] font-bold text-[#191F28] mb-2">
        QR 출퇴근 관리
      </h1>
      <p className="text-[14px] text-[#6B7684] mb-6">
        QR 코드를 프린트해서 매장에 부착하면, 직원들이 스캔으로 출퇴근할 수
        있어요
      </p>

      <div className="space-y-5">
        {stores.map((store) => (
          <div
            key={store.id}
            className="bg-white rounded-[20px] border border-[#E5E8EB] p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-[18px] font-bold text-[#191F28]">
                {store.name}
              </h2>
              <button
                onClick={() => setConfirmStoreId(store.id)}
                className="flex items-center gap-1.5 text-[13px] text-[#8B95A1] hover:text-[#4E5968] transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                재발급
              </button>
            </div>

            <div
              data-store-qr={store.id}
              className="flex justify-center mb-5"
            >
              <div className="bg-white p-4 rounded-2xl border border-[#E5E8EB]">
                <QRCodeCanvas
                  value={getQRUrl(store)}
                  size={200}
                  level="H"
                  marginSize={2}
                />
              </div>
            </div>

            <button
              onClick={() => copyUrl(store)}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#F2F4F6] text-[#4E5968] font-bold text-[14px] active:scale-[0.98] transition-transform"
            >
              {copiedId === store.id ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              {copiedId === store.id ? "복사됨" : "링크 복사"}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={handlePrintAll}
        className="w-full flex items-center justify-center gap-2 h-14 mt-5 rounded-2xl bg-[#3182F6] text-white font-bold text-[16px] active:scale-[0.98] transition-transform"
      >
        <Printer className="w-5 h-5" />
        전체 프린트 (A4 한 장)
      </button>

      <ConfirmDialog
        isOpen={!!confirmStoreId}
        title="QR 코드를 재발급할까요?"
        description="재발급하면 기존 QR 코드가 무효화돼요. 매장에 부착된 QR을 새로 프린트해야 해요."
        confirmLabel="재발급하기"
        cancelLabel="취소"
        onConfirm={handleConfirmRegenerate}
        onCancel={() => setConfirmStoreId(null)}
      />
    </div>
  );
}
