"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";

interface QRScannerSheetProps {
  isOpen: boolean;
  onScan: (storeId: string, token: string) => void;
  onClose: () => void;
}

/** Web Audio API로 삑 소리 생성 */
function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    osc.type = "sine";
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio not available
  }
}

/** 진동 피드백 */
function vibrate() {
  try {
    navigator.vibrate?.(150);
  } catch {
    // Vibration not available
  }
}

/** QR URL에서 storeId, token 추출 */
function parseQRData(raw: string): { storeId: string; token: string } | null {
  try {
    const url = new URL(raw);
    const storeId = url.searchParams.get("s");
    const token = url.searchParams.get("token");
    if (storeId && token) return { storeId, token };
  } catch {
    // URL 형식이 아닌 경우
  }
  // fallback: 쿼리 파라미터만 있는 경우
  try {
    const params = new URLSearchParams(raw.split("?")[1] || "");
    const storeId = params.get("s");
    const token = params.get("token");
    if (storeId && token) return { storeId, token };
  } catch {
    // ignore
  }
  return null;
}

export default function QRScannerSheet({
  isOpen,
  onScan,
  onClose,
}: QRScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      clearInterval(scannerRef.current);
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    processedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // BarcodeDetector가 지원되면 사용, 아니면 html5-qrcode fallback
      if ("BarcodeDetector" in window) {
        startNativeScanner();
      } else {
        startLibScanner();
      }
    } catch {
      setError("카메라를 사용할 수 없어요. 카메라 권한을 확인해주세요.");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** BarcodeDetector API (Chrome Android, Samsung Internet 등 지원) */
  const startNativeScanner = () => {
    // @ts-expect-error BarcodeDetector is not in all TS libs
    const detector = new BarcodeDetector({ formats: ["qr_code"] });

    scannerRef.current = setInterval(async () => {
      if (!videoRef.current || processedRef.current) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          handleDetected(barcodes[0].rawValue);
        }
      } catch {
        // detection failed, retry
      }
    }, 200);
  };

  /** jsQR 기반 fallback (순수 JS 디코더) */
  const startLibScanner = async () => {
    const jsQR = (await import("jsqr")).default;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    scannerRef.current = setInterval(() => {
      if (processedRef.current || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, canvas.width, canvas.height);
      if (code?.data) handleDetected(code.data);
    }, 250);
  };

  const handleDetected = (raw: string) => {
    if (processedRef.current) return;
    const parsed = parseQRData(raw);
    if (!parsed) return;

    processedRef.current = true;
    playBeep();
    vibrate();
    stopCamera();
    onScan(parsed.storeId, parsed.token);
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-black">
      {/* 상단 헤더 */}
      <div className="relative flex items-center justify-center h-14 shrink-0">
        <h2 className="text-white font-bold text-[17px]">QR 출퇴근</h2>
        <button
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* 카메라 영역 */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="relative w-full max-w-[280px] aspect-square">
          {/* 비디오 */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover rounded-3xl"
          />

          {/* 스캔 프레임 오버레이 */}
          <div className="absolute inset-0 rounded-3xl border-[3px] border-white/60 pointer-events-none" />

          {/* 코너 마커 */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-[4px] border-l-[4px] border-[#3182F6] rounded-tl-3xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-[4px] border-r-[4px] border-[#3182F6] rounded-tr-3xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-[4px] border-l-[4px] border-[#3182F6] rounded-bl-3xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-[4px] border-r-[4px] border-[#3182F6] rounded-br-3xl" />

          {/* 스캔 라인 애니메이션 */}
          <div className="absolute left-2 right-2 h-[2px] bg-[#3182F6]/80 rounded-full animate-scan-line" />

          {/* 히든 캔버스 (fallback 디코드용) */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>

      {/* 하단 안내 */}
      <div className="shrink-0 pb-12 pt-6 text-center">
        {error ? (
          <p className="text-red-400 text-[15px] font-medium px-6">{error}</p>
        ) : (
          <>
            <p className="text-white text-[16px] font-bold mb-1">
              QR 코드를 비춰주세요
            </p>
            <p className="text-white/60 text-[13px]">
              매장에 부착된 QR 코드를 네모 안에 맞춰주세요
            </p>
          </>
        )}
      </div>
    </div>
  );
}
