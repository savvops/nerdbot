"""Inspect or stage Nerdbot in the Chrome Web Store Developer Dashboard.

The script uses Nelson's existing Brave Default profile. It never activates a
Submit for review, Publish, or confirmation control. `inspect` is read-only;
`stage` may create a new draft item and upload the package/screenshots.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
BRAVE = Path(r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe")
BRAVE_DATA = Path.home() / "AppData/Local/BraveSoftware/Brave-Browser/User Data"
DASHBOARD = "https://chrome.google.com/webstore/devconsole"
PACKAGE = ROOT / "nerdbot-v1.0.0.zip"
SCREENSHOTS = ROOT / "store-assets" / "2026-07-15"


def safe_location(page: Page) -> str:
    parsed = urlsplit(page.url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def readiness(page: Page) -> dict[str, object]:
    host = (urlsplit(page.url).hostname or "").lower()
    body = page.locator("body")
    password = page.locator('input[type="password"]')
    return {
        "location": safe_location(page),
        "title": page.title()[:120],
        "new_item_visible": page.get_by_text("New item", exact=True).count() > 0,
        "add_new_item_visible": page.get_by_text("Add new item", exact=True).count() > 0,
        "sign_in_visible": page.get_by_text("Sign in", exact=True).count() > 0,
        "continue_visible": page.get_by_role("button", name="Continue", exact=True).count() > 0,
        "next_visible": page.get_by_role("button", name="Next", exact=True).count() > 0,
        "password_required": password.count() > 0,
        "password_autofilled": password.count() > 0 and len(password.first.input_value()) > 0,
        "auth_required": host == "accounts.google.com",
        "dashboard_loaded": body.count() == 1 and host in {"chrome.google.com", "chromewebstore.google.com"},
    }


def inspect(page: Page) -> dict[str, object]:
    page.goto(DASHBOARD, wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(5_000)
    return readiness(page)


def advance_auth(page: Page) -> dict[str, object]:
    state = inspect(page)
    if not state["auth_required"] or state["password_required"]:
        return {**state, "advanced": False}
    control = page.get_by_role("button", name="Continue", exact=True)
    if control.count() == 0:
        control = page.get_by_role("button", name="Next", exact=True)
    if control.count() == 0:
        return {**state, "advanced": False}
    control.first.click()
    page.wait_for_timeout(5_000)
    return {**readiness(page), "advanced": True}


def stage(page: Page) -> dict[str, object]:
    """Create/upload a draft only. Deliberately contains no submit selectors."""
    state = inspect(page)
    if state["sign_in_visible"] or not state["dashboard_loaded"]:
        return {**state, "staged": False, "reason": "dashboard_not_signed_in"}
    if not PACKAGE.exists():
        return {**state, "staged": False, "reason": "package_missing"}

    new_item = page.get_by_text("Add new item", exact=True)
    if new_item.count() == 0:
        new_item = page.get_by_text("New item", exact=True)
    if new_item.count() == 0:
        return {**state, "staged": False, "reason": "new_item_control_missing"}

    new_item.first.click()
    page.wait_for_timeout(800)
    chooser = page.locator('input[type="file"]')
    if chooser.count() == 0:
        return {**state, "staged": False, "reason": "package_file_input_missing"}
    chooser.first.set_input_files(str(PACKAGE))
    page.wait_for_timeout(1_000)

    upload = page.get_by_role("button", name="Upload", exact=True)
    if upload.count() > 0:
        upload.first.click()
    page.wait_for_timeout(8_000)

    # Some dashboard versions land directly on the item editor; others keep a
    # dialog open. Upload screenshot inputs only when an unambiguous Store
    # listing screenshot field is already present. Never infer a Submit button.
    uploaded_screenshots: list[str] = []
    screenshot_files = sorted(SCREENSHOTS.glob("*.png"))
    screenshot_inputs = page.locator('input[type="file"][accept*="image"]')
    if screenshot_inputs.count() == 1 and screenshot_files:
        screenshot_inputs.first.set_input_files([str(path) for path in screenshot_files])
        page.wait_for_timeout(5_000)
        uploaded_screenshots = [path.name for path in screenshot_files]

    return {
        **readiness(page),
        "staged": True,
        "package": PACKAGE.name,
        "screenshots_uploaded": uploaded_screenshots,
        "submit_clicked": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("inspect", "advance-auth", "stage"))
    args = parser.parse_args()
    if not BRAVE.exists() or not BRAVE_DATA.exists():
        raise SystemExit("Brave Default profile is unavailable")

    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            str(BRAVE_DATA),
            executable_path=str(BRAVE),
            headless=False,
            viewport={"width": 1280, "height": 800},
            args=["--profile-directory=Default", "--start-maximized"],
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            result = inspect(page) if args.mode == "inspect" else advance_auth(page) if args.mode == "advance-auth" else stage(page)
            print(json.dumps(result, ensure_ascii=True))
        finally:
            context.close()


if __name__ == "__main__":
    main()
