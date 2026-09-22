"""Capture Chrome Web Store screenshots from the built Nerdbot extension."""

from __future__ import annotations

import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PROFILE = ROOT / ".brave-test-profile"
DEFAULT_BRAVE = Path("C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe")


def capture(output: Path, brave: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    if not (DIST / "manifest.json").exists():
        raise SystemExit("dist/manifest.json is missing; run npm run build first")
    if not brave.exists():
        raise SystemExit(f"Brave not found at {brave}")

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(PROFILE),
            executable_path=str(brave),
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=[
                f"--disable-extensions-except={DIST}",
                f"--load-extension={DIST}",
                "--window-size=1280,800",
            ],
        )
        try:
            worker = context.service_workers[0] if context.service_workers else context.wait_for_event("serviceworker")
            extension_id = worker.url.split("/")[2]
            page = context.new_page()
            page.set_viewport_size({"width": 1280, "height": 800})
            page.goto(f"chrome-extension://{extension_id}/sidebar.html")
            page.evaluate("() => new Promise(resolve => chrome.storage.local.clear(resolve))")
            page.reload()
            page.get_by_text("Welcome to Nerdbot", exact=True).wait_for()
            page.wait_for_timeout(700)
            page.screenshot(path=str(output / "01-use-nerdbot-free.png"))

            page.get_by_role("button", name="Use Nerdbot Free").click()
            page.get_by_role("button", name="Continue with OpenRouter").wait_for()
            page.wait_for_timeout(300)
            page.screenshot(path=str(output / "02-free-or-local-setup.png"))

            page.locator(".fixed.inset-0 button").first.click()
            page.locator("textarea").last.wait_for()
            page.wait_for_timeout(300)
            page.screenshot(path=str(output / "03-browser-assistant.png"))

            composer = page.locator("textarea").last
            composer.fill("/")
            page.get_by_text("Browse skills", exact=True).wait_for()
            page.screenshot(path=str(output / "04-skills.png"))

            composer.fill("")
            page.get_by_title("Settings").click()
            page.get_by_text("Provider health", exact=True).wait_for()
            page.wait_for_timeout(500)
            page.screenshot(path=str(output / "05-provider-health.png"))
            print(f"Captured 5 screenshots in {output}")
        finally:
            context.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "store-assets" / "2026-09-01")
    parser.add_argument("--brave", type=Path, default=DEFAULT_BRAVE)
    args = parser.parse_args()
    capture(args.output.resolve(), args.brave.resolve())


if __name__ == "__main__":
    main()
