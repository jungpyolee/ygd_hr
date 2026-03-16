/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { revision: string | null; url: string })[];
};

// 만약 import { Serwist } 에서 에러가 난다면
// 아래처럼 클래스 생성 시 namespace를 확인하거나 직접 할당해야 합니다.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
