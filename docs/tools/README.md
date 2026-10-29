# Offline diagnostics

- [Native Chromium when navigation is blocked](OFFLINE_VISUAL_KERNEL.md#real-native-app-with-offline-swiftshader-diagnostic) — existing `offline-native-app-capture.py`, Xvfb/SwiftShader and `about:blank` fallback; Renderer diagnosis only if origin is null.
- [Offline visual kernel](OFFLINE_VISUAL_KERNEL.md) — geometry diagnostics, scientific provenance and backend limitations.
- [Offline ChatGPT visual diagnostics](OFFLINE_CHAT_RUNTIME.md) — source-backed capture without direct browser navigation.

None of these isolated diagnostic paths replaces real production Chromium
screenshot and interaction acceptance for changed UI, Mask, 3D or Section
behavior. Native in-memory Three.js evidence can narrow a renderer issue but
cannot certify Worker Open, IndexedDB, History/Recovery, or normal-Origin
production layout.
