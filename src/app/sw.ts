/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { revision: string | null; url: string })[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    cleanupOutdatedCaches: true,
  },
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// ── Web Push 핸들러 ────────────────────────────────────────

interface PushData {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let data: PushData;
  try {
    data = event.data.json() as PushData;
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/icons/icon-192x192.png",
      badge: data.badge ?? "/icons/badge-96x96.png",
      tag: data.tag,   // 같은 tag = 이전 알림 교체 (중복 방지)
      data: { url: data.url ?? "/" },
    } as NotificationOptions)
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const rawUrl = (event.notification.data as { url?: string })?.url;
  const url: string = rawUrl && rawUrl.startsWith("/") ? rawUrl : "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 탭이 있으면 포커스 + 해당 URL로 이동
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              (client as WindowClient).navigate(url);
            }
            return;
          }
        }
        // 열린 탭 없으면 새 창 열기
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
