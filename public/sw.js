// 설치형 앱(PWA)용 최소 서비스 워커. 화면은 항상 네트워크에서 받아온다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
