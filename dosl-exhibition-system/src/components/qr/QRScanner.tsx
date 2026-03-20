"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface QRScannerProps {
  onScan: (code: string) => void;
  onError?: (error: string) => void;
  active?: boolean;
}

export default function QRScanner({
  onScan,
  onError,
  active = true,
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameras, setCameras] = useState<
    { id: string; label: string }[]
  >([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [permissionError, setPermissionError] = useState("");
  // Prevent duplicate scans
  const lastScannedRef = useRef("");
  const lastScannedTimeRef = useRef(0);

  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices.length === 0) {
          setPermissionError("カメラが見つかりません");
          return;
        }
        setCameras(devices);
        // 背面カメラを優先選択
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes("back") ||
            d.label.toLowerCase().includes("rear") ||
            d.label.includes("背面"),
        );
        setSelectedCamera(backCamera?.id || devices[0].id);
      })
      .catch(() => {
        setPermissionError("カメラへのアクセスが許可されていません");
      });

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!active || !selectedCamera || !containerRef.current) return;

    const scanner = new Html5Qrcode("qr-scanner-container");
    scannerRef.current = scanner;

    scanner
      .start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // 同一コードの連続スキャン防止（3秒間）
          const now = Date.now();
          if (
            decodedText === lastScannedRef.current &&
            now - lastScannedTimeRef.current < 3000
          ) {
            return;
          }
          lastScannedRef.current = decodedText;
          lastScannedTimeRef.current = now;
          onScan(decodedText);
        },
        () => {
          // QRコード未検出（無視）
        },
      )
      .then(() => {
        setCameraActive(true);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "カメラの起動に失敗しました";
        setPermissionError(message);
        onError?.(message);
      });

    return () => {
      if (scanner.isScanning) {
        scanner.stop().catch(() => {});
      }
      setCameraActive(false);
    };
  }, [selectedCamera, active, onScan, onError]);

  if (permissionError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-600 font-medium mb-2">カメラエラー</p>
        <p className="text-red-500 text-sm">{permissionError}</p>
        <p className="text-gray-400 text-xs mt-3">
          ブラウザの設定でカメラへのアクセスを許可してください
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* カメラ選択 */}
      {cameras.length > 1 && (
        <div className="mb-3">
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-full"
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `カメラ ${cam.id}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* スキャナー */}
      <div className="relative rounded-xl overflow-hidden bg-black">
        <div id="qr-scanner-container" ref={containerRef} />
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <p className="text-gray-400">カメラ起動中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
