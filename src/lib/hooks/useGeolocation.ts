import { useState, useRef, useCallback } from "react";

export type GeoStatus = "idle" | "loading" | "ready" | "denied" | "timeout" | "unavailable";

export interface GeoState {
  status: GeoStatus;
  lat?: number;
  lng?: number;
}

// 화면 표시용 (StoreDistanceList 등) — 45초 캐시 허용
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 45000,
};

// 출퇴근 기록용 — 10초 캐시만 허용 (이동 가능성 최소화)
const GEO_ATTENDANCE_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 10000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "idle" });
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
          // 이 promise가 여전히 현재 요청인 경우에만 ref 초기화
          // (retry/handlePermChange가 새 요청을 시작한 경우 덮어쓰지 않음)
          if (inFlightRef.current === p) inFlightRef.current = null;
          resolve(s);
        },
        ({ code }) => {
          // code 1: PERMISSION_DENIED → denied
          // code 3: TIMEOUT → timeout (GPS 불량, 수동 선택 허용)
          // code 2: POSITION_UNAVAILABLE → 위치 서비스 꺼짐(denied)과 GPS 불량(unavailable) 구분 필요
          if (code === 1) {
            const s: GeoState = { status: "denied" };
            setState(s);
            if (inFlightRef.current === p) inFlightRef.current = null;
            resolve(s);
            return;
          }
          if (code === 3) {
            const s: GeoState = { status: "timeout" };
            setState(s);
            if (inFlightRef.current === p) inFlightRef.current = null;
            resolve(s);
            return;
          }
          // code 2: permissions API로 시스템 차단 vs GPS 불량 구분
          const resolveCode2 = (status: GeoStatus) => {
            const s: GeoState = { status };
            setState(s);
            if (inFlightRef.current === p) inFlightRef.current = null;
            resolve(s);
          };
          if (navigator.permissions) {
            navigator.permissions
              .query({ name: "geolocation" as PermissionName })
              .then((perm) => resolveCode2(perm.state === "denied" ? "denied" : "unavailable"))
              .catch(() => resolveCode2("unavailable"));
          } else {
            resolveCode2("unavailable");
          }
        },
        GEO_OPTIONS
      );
    });

    inFlightRef.current = p;
    return p;
  }, []);

  // 자동 위치 요청 없음 — 출퇴근 버튼 탭 시 fetchForAttendance()가 직접 요청
  // (페이지 로드 시 자동 요청 시 사용자가 이유 모르고 거부 → PWA 설치 후 영구 차단 문제)

  const retry = useCallback((): Promise<GeoState> => {
    inFlightRef.current = null;
    setState({ status: "loading" });
    return doFetch();
  }, [doFetch]);

  // 출퇴근 기록 전용 — 10초 초과 캐시는 재취득 (이동 후 진입 케이스 대응)
  const fetchForAttendance = useCallback((): Promise<GeoState> => {
    return new Promise<GeoState>((resolve) => {
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
          resolve(s);
        },
        ({ code }) => {
          if (code === 1) {
            const s: GeoState = { status: "denied" };
            setState(s);
            resolve(s);
            return;
          }
          if (code === 3) {
            const s: GeoState = { status: "timeout" };
            setState(s);
            resolve(s);
            return;
          }
          // code 2: permissions API로 시스템 차단 vs GPS 불량 구분
          const resolveCode2 = (status: GeoStatus) => {
            const s: GeoState = { status };
            setState(s);
            resolve(s);
          };
          if (navigator.permissions) {
            navigator.permissions
              .query({ name: "geolocation" as PermissionName })
              .then((perm) => resolveCode2(perm.state === "denied" ? "denied" : "unavailable"))
              .catch(() => resolveCode2("unavailable"));
          } else {
            resolveCode2("unavailable");
          }
        },
        GEO_ATTENDANCE_OPTIONS
      );
    });
  }, []);

  return { locationState: state, retry, fetchForAttendance };
}
