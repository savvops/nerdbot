const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEY_EXCHANGE_URL =
  "https://openrouter.ai/api/v1/auth/keys";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createPkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function launchAuthFlow(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url, interactive: true },
      (redirectUrl) => {
        const message = chrome.runtime.lastError?.message;
        if (message) {
          reject(
            new Error(
              /cancel|closed|denied|approve/i.test(message)
                ? "OpenRouter connection was cancelled"
                : message,
            ),
          );
          return;
        }
        if (!redirectUrl) {
          reject(new Error("OpenRouter did not return an authorization code"));
          return;
        }
        resolve(redirectUrl);
      },
    );
  });
}

/**
 * Connect the current browser profile to OpenRouter through OAuth PKCE.
 * The returned user-controlled key is stored through the normal settings flow;
 * the user never needs to create, copy, or paste it manually.
 */
export async function connectOpenRouter(): Promise<string> {
  if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
    throw new Error("OpenRouter sign-in requires Chrome's identity permission");
  }

  const redirectUrl = chrome.identity.getRedirectURL("openrouter");
  const { verifier, challenge } = await createPkce();
  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set("callback_url", redirectUrl);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const resultUrl = new URL(await launchAuthFlow(authUrl.toString()));
  const oauthError = resultUrl.searchParams.get("error");
  const code = resultUrl.searchParams.get("code");
  if (oauthError) throw new Error(`OpenRouter connection failed: ${oauthError}`);
  if (!code) throw new Error("OpenRouter did not return an authorization code");

  const response = await fetch(OPENROUTER_KEY_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      code_challenge_method: "S256",
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { key?: string; error?: { message?: string } | string }
    | null;
  if (!response.ok || !payload?.key) {
    const detail =
      typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message;
    throw new Error(detail || "Couldn't finish the OpenRouter connection");
  }
  return payload.key;
}
