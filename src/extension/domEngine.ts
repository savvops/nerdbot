/**
 * Nerdbot DOM Automation Engine
 * 
 * Features:
 * - Interactive element scanning & accessible name computation
 * - Numbered visual badge overlay on active webpage
 * - Robust synthetic event dispatching (pointer/mouse/keyboard/input)
 * - Safe mutation tracking and element target resolution
 */

export interface TargetElement {
  id: string;
  tag: string;
  role: string;
  name: string;
  selector: string;
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  actions: string[];
  disabled: boolean;
  value?: string;
}

export interface FocusMapResult {
  url: string;
  title: string;
  targets: TargetElement[];
  totalInteractive: number;
}

const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

const TARGET_CACHE = new Map<string, HTMLElement>();
const OVERLAY_CONTAINER_ID = '__nerdbot_target_overlays__';
let serial = 0;

/**
 * Computes accessible name following W3C accessibility heuristics:
 * aria-labelledby -> aria-label -> form labels -> placeholder -> title -> textContent
 */
export function getAccessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const val = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
      .trim();
    if (val) return val;
  }

  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return ariaLabel;

  if (el instanceof HTMLInputElement && el.labels?.length) {
    const labelText = Array.from(el.labels)
      .map((l) => l.textContent || '')
      .join(' ')
      .trim();
    if (labelText) return labelText;
  }

  const placeholder = el.getAttribute('placeholder')?.trim();
  if (placeholder) return placeholder;

  const title = el.getAttribute('title')?.trim();
  if (title) return title;

  const ariaDesc = el.getAttribute('aria-description')?.trim();
  if (ariaDesc) return ariaDesc;

  // Fallback to text content
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 120);
}

/**
 * Determines semantic element role
 */
export function getSemanticRole(el: HTMLElement): string {
  const explicitRole = el.getAttribute('role');
  if (explicitRole) return explicitRole.toLowerCase();

  if (el instanceof HTMLAnchorElement) return 'link';
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLSelectElement) return 'combobox';
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    if (['button', 'submit', 'reset'].includes(t)) return 'button';
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'search') return 'searchbox';
    return 'textbox';
  }
  return el.tagName.toLowerCase();
}

/**
 * Checks if element is visible and in viewport
 */
export function isElementVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  // Element should be within reasonable render boundary
  return (
    rect.top < (window.innerHeight || document.documentElement.clientHeight) + 500 &&
    rect.bottom > -500 &&
    rect.left < (window.innerWidth || document.documentElement.clientWidth) + 500 &&
    rect.right > -500
  );
}

/**
 * Derives valid actions supported by element
 */
export function getElementActions(el: HTMLElement): string[] {
  const actions: string[] = ['focus'];
  if (
    el.matches(
      'a, button, input[type=button], input[type=submit], [role=button], [role=link], [role=menuitem], [role=tab]'
    )
  ) {
    actions.push('click');
  }
  if (el.matches('input, textarea, [contenteditable=true]')) {
    actions.push('type');
  }
  if (el instanceof HTMLSelectElement) {
    actions.push('select');
  }
  if (
    el.matches(
      'input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch]'
    )
  ) {
    actions.push('check');
  }
  return actions;
}

/**
 * Computes a readable CSS selector
 */
export function getElementSelector(el: HTMLElement): string {
  if (el.id && CSS.escape) return `#${CSS.escape(el.id)}`;
  for (const attr of ['data-testid', 'data-qa', 'name', 'aria-label']) {
    const val = el.getAttribute(attr);
    if (val && CSS.escape) {
      return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(val)}"]`;
    }
  }
  return el.tagName.toLowerCase();
}

/**
 * Scans page and generates focus map of all actionable targets
 */
export function scanFocusMap(showOverlays = false): FocusMapResult {
  TARGET_CACHE.clear();
  serial = 0;

  const rawElements = Array.from(
    document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)
  );

  const targets: TargetElement[] = [];

  for (const el of rawElements) {
    if (!isElementVisible(el)) continue;

    serial += 1;
    const id = `t${serial}`;
    TARGET_CACHE.set(id, el);

    const rect = el.getBoundingClientRect();
    const name = getAccessibleName(el);
    const role = getSemanticRole(el);
    const actions = getElementActions(el);
    const selector = getElementSelector(el);
    const disabled =
      (el as HTMLInputElement).disabled ||
      el.getAttribute('aria-disabled') === 'true';

    let value: string | undefined;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      value = el.value;
    } else if (el instanceof HTMLSelectElement) {
      value = el.value;
    }

    targets.push({
      id,
      tag: el.tagName.toLowerCase(),
      role,
      name,
      selector,
      rect: {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      actions,
      disabled,
      value,
    });
  }

  if (showOverlays) {
    renderOverlays(targets);
  } else {
    clearOverlays();
  }

  return {
    url: window.location.href,
    title: document.title,
    targets: targets.slice(0, 75), // Cap at top 75 most relevant elements to keep context compact
    totalInteractive: targets.length,
  };
}

/**
 * Renders numbered badge overlays next to interactive elements
 */
export function renderOverlays(targets: TargetElement[]): void {
  clearOverlays();

  const container = document.createElement('div');
  container.id = OVERLAY_CONTAINER_ID;
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '2147483640';

  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  targets.slice(0, 60).forEach((t) => {
    const el = TARGET_CACHE.get(t.id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const badge = document.createElement('div');
    badge.className = '__nerdbot_badge__';
    badge.textContent = t.id;
    badge.style.position = 'absolute';
    badge.style.top = `${rect.top + scrollY - 8}px`;
    badge.style.left = `${rect.left + scrollX - 6}px`;
    badge.style.backgroundColor = '#6366f1';
    badge.style.color = '#ffffff';
    badge.style.fontSize = '10px';
    badge.style.fontWeight = 'bold';
    badge.style.fontFamily = 'monospace';
    badge.style.padding = '1px 5px';
    badge.style.borderRadius = '4px';
    badge.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    badge.style.border = '1px solid #ffffff';
    badge.style.pointerEvents = 'none';
    badge.style.zIndex = '2147483645';
    badge.style.opacity = '0.92';

    container.appendChild(badge);
  });

  document.body.appendChild(container);
}

/**
 * Clears all visual badge overlays
 */
export function clearOverlays(): void {
  const existing = document.getElementById(OVERLAY_CONTAINER_ID);
  if (existing) existing.remove();
}

/**
 * Resolves element from ID, selector, or accessible name
 */
export function resolveElement(identifier: string): HTMLElement | null {
  // 1. Check ID in active cache
  if (TARGET_CACHE.has(identifier)) {
    return TARGET_CACHE.get(identifier)!;
  }

  // 2. Check direct CSS selector or element ID
  try {
    const bySel = document.querySelector<HTMLElement>(identifier);
    if (bySel) return bySel;
  } catch {
    /* not a selector */
  }

  // 3. Check accessible name match
  const lower = identifier.toLowerCase().trim();
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)
  );
  const found = all.find((el) => {
    const name = getAccessibleName(el).toLowerCase();
    return name === lower || name.includes(lower);
  });

  return found || null;
}

/**
 * Dispatches realistic pointer, mouse, and click events
 */
export async function clickElement(identifier: string): Promise<{ ok: boolean; message: string }> {
  const el = resolveElement(identifier);
  if (!el) {
    return { ok: false, message: `Target element "${identifier}" not found on page.` };
  }

  // Scroll into view if needed
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await new Promise((r) => setTimeout(r, 80));

  // Visual pulse highlight on click
  const prevOutline = el.style.outline;
  const prevBoxShadow = el.style.boxShadow;
  el.style.outline = '2px solid #6366f1';
  el.style.boxShadow = '0 0 12px rgba(99, 102, 241, 0.7)';

  setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.boxShadow = prevBoxShadow;
  }, 600);

  // Dispatch full synthetic event chain for modern web frameworks
  const rect = el.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;

  const eventOpts = { bubbles: true, cancelable: true, view: window, clientX, clientY };

  el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
  el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
  el.focus();
  el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
  el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
  el.dispatchEvent(new MouseEvent('click', eventOpts));

  if (el instanceof HTMLElement && typeof el.click === 'function') {
    el.click();
  }

  return {
    ok: true,
    message: `Clicked element "${getAccessibleName(el) || identifier}" (${el.tagName.toLowerCase()})`,
  };
}

/**
 * Types text into input, textarea, or contenteditable
 */
export async function typeElement(
  identifier: string,
  text: string,
  clearFirst = false,
  pressEnter = false
): Promise<{ ok: boolean; message: string }> {
  const el = resolveElement(identifier);
  if (!el) {
    return { ok: false, message: `Input target "${identifier}" not found on page.` };
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus();
  await new Promise((r) => setTimeout(r, 60));

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (clearFirst) {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    el.value = clearFirst ? text : el.value + text;

    // Dispatch input and change so React/Vue forms detect state updates
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    if (clearFirst) el.innerText = '';
    el.innerText = clearFirst ? text : el.innerText + text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (pressEnter) {
    const enterOpts = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    el.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
    el.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

    // If input is in a form, trigger submit if Enter was pressed
    if (el instanceof HTMLInputElement && el.form) {
      el.form.requestSubmit?.() ?? el.form.submit();
    }
  }

  return {
    ok: true,
    message: `Entered text into "${getAccessibleName(el) || identifier}"${
      pressEnter ? ' and pressed Enter' : ''
    }.`,
  };
}

/**
 * Selects an option in a dropdown
 */
export async function selectOption(
  identifier: string,
  value: string
): Promise<{ ok: boolean; message: string }> {
  const el = resolveElement(identifier);
  if (!el || !(el instanceof HTMLSelectElement)) {
    return { ok: false, message: `Select dropdown "${identifier}" not found on page.` };
  }

  el.focus();
  const option = Array.from(el.options).find(
    (opt) =>
      opt.value.toLowerCase() === value.toLowerCase() ||
      opt.text.toLowerCase().includes(value.toLowerCase())
  );

  if (!option) {
    return {
      ok: false,
      message: `Option "${value}" not found in select dropdown. Available: ${Array.from(
        el.options
      )
        .map((o) => o.text)
        .join(', ')}`,
    };
  }

  el.value = option.value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return {
    ok: true,
    message: `Selected option "${option.text}" (${option.value}) in dropdown.`,
  };
}

/**
 * Smoothly scrolls the window or target element
 */
export async function scrollPage(
  direction: 'up' | 'down' | 'top' | 'bottom',
  amount = 500
): Promise<{ ok: boolean; message: string }> {
  if (direction === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (direction === 'bottom') {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  } else if (direction === 'up') {
    window.scrollBy({ top: -amount, behavior: 'smooth' });
  } else {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }

  await new Promise((r) => setTimeout(r, 250));
  return { ok: true, message: `Scrolled page ${direction}.` };
}
