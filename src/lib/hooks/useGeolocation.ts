import { useState, useRef, useEffect, useCallback } from "react";

export type GeoStatus = "loading" | "ready" | "denied" | "timeout" | "unavailable";

export interface GeoState {
  status: GeoStatus;
  lat?: number;
  lng?: number;
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 45000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "loading" });
  const inFlightRef = useRef<Promise<GeoState> | null>(null);

  const doFetch = useCallback((): Promise<GeoState> => {
    if (inFlightRef.current) return inFlightRef.current;

    const p = new Promise<GeoState>((resolve) => {
      if (!navigator.geolocation) {
        const s: GeoState = { status: "unavailable" };
        setState(s);
        resolve(s);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const s: GeoState = {
            status: "ready",
            lat: coords.latitude,
            lng: coords.longitude,
          };
          setState(s);
          inFlightRef.current = null;
          resolve(s);
        },
        ({ code }) => {
          // code 1: PERMISSION_DENIED, code 2: POSITION_UNAVAILABLE, code 3: TIMEOUT
          const status: GeoStatus = code === 1 ? "denied" : "timeout";
          const s: GeoState = { status };
          setState(s);
          inFlightRef.current = null;
          resolve(s);
        },
        GEO_OPTIONS
      );
    });

    inFlightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    doFetch();

    // 권한 상태 변화 감시 — 사용자가 설정에서 권한 허용 시 자동 재시도
    let permResult: PermissionStatus | null = null;
    const handlePermChange = () => {
      if (permResult?.state === "granted") {
        inFlightRef.current = null;
        setState({ status: "loading" });
        doFetch();
      }
    };

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          permResult = result;
          result.addEventListener("change", handlePermChange);
        })
        .catch(() => {});
    }

    return () => {
      permResult?.removeEventListener("change", handlePermChange);
    };
  }, [doFetch]);

  const retry = useCallback((): Promise<GeoState> => {
    inFlightRef.current = null;
    setState({ status: "loading" });
    return doFetch();
  }, [doFetch]);

  return { locationState: state, retry };
}
