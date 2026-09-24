# Nerdbot for iOS: Architecture & Porting Blueprint

## 1. Executive Summary

Nerdbot's autonomous browser control engine (DOM scanning, synthetic click/type/scroll actuation, System 1 reflex safety guardrails, and universal skills) is architected to be portable to mobile environments. On iOS, users need an AI assistant that can not only answer questions, but autonomously interact with web applications, fill forms, extract data, and navigate on their behalf.

There are two primary deployment paths for iOS:
1. **Safari Web Extension (Fastest & Native Safari Integration)**: Runs directly inside iOS Safari on iPhone and iPad (iOS 15+), using Apple's WebExtension standard.
2. **Standalone Autonomous Mobile Browser (Full Control)**: A custom SwiftUI application embedding `WKWebView`, providing a complete autonomous browsing experience similar to Arc Search or SigmaOS.

---

## 2. Comparative Architecture Matrix

| Feature | Option 1: Safari Web Extension | Option 2: Standalone SwiftUI Browser App |
|:---|:---|:---|
| **Host Environment** | Apple Safari Browser | Dedicated iOS App (SwiftUI + WKWebView) |
| **DOM & Browser Control** | ✅ Full via Content Script (`domEngine.js`) | ✅ Full via `WKUserContentController` injection |
| **Code Reuse** | 🟢 ~95% of existing Nerdbot codebase | 🟢 Core TS engine reused via JS bundle |
| **User Flow** | Tap puzzle icon in Safari address bar | Launch standalone app with integrated browser |
| **Background Execution** | ⚠️ Suspended when Safari inactive | 🟢 Unconstrained audio / background fetch |
| **Personal Agent Connect**| ✅ Via localhost/Tailscale/Cloudflare | ✅ Via Tailscale VPN, Cloudflare Tunnel, or LAN |
| **Distribution** | App Store (Safari Extension category) | App Store (Browser category) or TestFlight |

---

## 3. Option 1: Safari Web Extension Implementation

Apple natively supports Manifest V2 and V3 WebExtensions using the `safari-web-extension-converter` CLI.

### Step-by-Step Conversion Workflow

1. **Build the Production Bundle**:
   ```bash
   cd projects/extentions/nerdbot
   npm run build
   ```
2. **Convert to Xcode Project**:
   ```bash
   xcrun safari-web-extension-converter dist \
     --app-name "Nerdbot" \
     --bundle-identifier "com.savvops.nerdbot" \
     --ios-only
   ```
3. **Architecture Mapping**:
   - `dist/content.js` and `dist/background.js` run natively in Safari's extension sandbox.
   - `dist/sidebar.html` renders in Safari's extension popover or page action sheet.
   - `domEngine.ts` dispatches events directly to mobile Safari's DOM (`click`, `input`, `scroll`).

### Mobile Safari Touch Adaptations
Mobile web pages often listen for touch events (`touchstart`, `touchend`) in addition to click events. In `domEngine.ts`, mobile dispatching synthesizes touch sequences:
```typescript
function dispatchMobileTouchClick(target: HTMLElement) {
  const touch = new Touch({
    identifier: Date.now(),
    target,
    clientX: target.getBoundingClientRect().left + 10,
    clientY: target.getBoundingClientRect().top + 10,
  });
  target.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], bubbles: true }));
  target.dispatchEvent(new TouchEvent('touchend', { touches: [touch], bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
```

---

## 4. Option 2: Standalone SwiftUI Autonomous Browser

A dedicated iOS browser app gives Nelson unconstrained control over the UI, persistent background worker connections, and voice interactions.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                 NERDBOT iOS (SwiftUI APP)                   │
├───────────────────────────────┬─────────────────────────────┤
│      SwiftUI Browser UI       │    AI Agent Bottom Sheet    │
│  - Address Bar & Tabs         │  - Voice Mic & Streaming    │
│  - WKWebView Container        │  - Custom Agent Selector    │
└───────────────┬───────────────┴──────────────┬──────────────┘
                │                              │
                ▼                              ▼
┌───────────────────────────────┐ ┌───────────────────────────┐
│     WKUserContentController   │ │   Networking & Agents     │
│  - Injects domEngine.bundle.js│ │  - Local agent node        │
│  - Dispatches actions via JS  │ │  - Agent core (Port 4177)   │
└───────────────────────────────┘ └───────────────────────────┘
```

### Swift Integration Sample (`BrowserWebView.swift`)

```swift
import SwiftUI
import WebKit

struct BrowserWebView: UIViewRepresentable {
    let url: URL
    let coordinator: BrowserCoordinator

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let userContent = WKUserContentController()

        // 1. Inject compiled domEngine.bundle.js
        if let jsPath = Bundle.main.path(forResource: "domEngine.bundle", ofType: "js"),
           let jsSource = try? String(contentsOfFile: jsPath) {
            let script = WKUserScript(source: jsSource, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            userContent.addUserScript(script)
        }

        // 2. Register message handler for DOM scan results
        userContent.add(context.coordinator, name: "nerdbotBridge")
        config.userContentController = userContent

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> BrowserCoordinator {
        coordinator
    }
}

class BrowserCoordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let dict = message.body as? [String: Any],
              let action = dict["action"] as? String else { return }

        if action == "PAGE_SCANNED" {
            // Forward elements to AI Agent LLM / Reflex layer
            print("Received DOM elements: \(dict)")
        }
    }
}
```

---

## 5. Connecting Mobile Nerdbot to Personal Agents

Mobile devices leave local Wi-Fi networks, requiring secure remote access to your agent endpoints:
1. **Tailscale Mesh**:
   - Install Tailscale on the iPhone and each agent node.
   - Nerdbot iOS connects directly to `http://<node>:8000/v1` with end-to-end WireGuard encryption.
2. **Cloudflare Zero Trust Tunnel**:
   - Expose agent endpoints via secure tunnels (e.g. `https://agents.example.com/v1`).
   - Use Nerdbot's custom bearer token support in Settings for authentication.

---

## 6. Shared Skill System on iOS

Because skills are stored as standardized JSON or Markdown with YAML frontmatter (`SKILL.md`), the iOS app uses the identical skill definitions:
- Built-in skills (`builtin-browse`, `builtin-cli-replay`, `builtin-explain`).
- Synced skills from iCloud Drive or GitHub repo (`savvops/skills`).
