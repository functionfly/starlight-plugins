/**
 * Mail Obfuscation Client
 *
 * The server obfuscates e-mail addresses and phone numbers in the built
 * HTML and publishes the key material in a meta tag. This script recovers
 * the key and restores the content in the browser.
 *
 * The key material is protected with AES-256-GCM under a key derived from
 * the salt that travels with it, and it carries an HMAC-SHA256 checksum
 * that is verified before the content is decoded. The checksum detects a
 * corrupted or tampered meta tag; it is not a signature, because the key
 * material is necessarily recoverable by the browser — the obfuscation
 * protects against a scraper that reads the HTML without running the
 * script, not against an attacker who reads the script as well.
 */

const META_TAG_NAME = "x-mail-obf";
const CONFIG_META_TAG_NAME = "x-mail-obf-config";
const KEY_DERIVATION_CONTEXT = "functionfly/mail-obfuscation/v2:";

interface MailObfuscationConfig {
  encrypted: boolean;
}

interface KeyMaterial {
  /** Hex-encoded XOR key */
  key: string;
  /** Salt published alongside the key material */
  salt: string;
}

/**
 * Read the integration configuration from the document.
 *
 * The configuration travels in a meta tag rather than a global: a module's
 * imports are hoisted above its statements, so a global assigned next to
 * an `import` statement is assigned after the imported module has run.
 */
export function readConfig(): MailObfuscationConfig {
  const fallback: MailObfuscationConfig = { encrypted: true };

  if (typeof document === "undefined") return fallback;

  const meta = document.querySelector<HTMLMetaElement>(
    `meta[name="${CONFIG_META_TAG_NAME}"]`,
  );
  const content = meta?.getAttribute("content");
  if (!content) return fallback;

  try {
    const parsed = JSON.parse(content) as Partial<MailObfuscationConfig>;
    return { encrypted: parsed.encrypted !== false };
  } catch {
    return fallback;
  }
}

/**
 * Decode a base64url string into bytes.
 */
export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode a hex string into bytes.
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encode bytes as a lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Compare two strings without leaking where they differ.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Decode a UTF-8 byte string.
 */
function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Derive the meta-tag key from the salt.
 */
async function deriveMetaKey(salt: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(KEY_DERIVATION_CONTEXT + salt);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
}

/**
 * Decrypt an AES-256-GCM blob of `iv || ciphertext || authTag`.
 */
async function aesDecrypt(payload: string, key: Uint8Array): Promise<string> {
  const bytes = base64UrlToBytes(payload);
  if (bytes.length < 28) {
    throw new Error("encrypted meta tag is too short to be valid");
  }

  const iv = bytes.slice(0, 12);
  // WebCrypto expects the authentication tag appended to the ciphertext.
  const ciphertextWithTag = bytes.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    cryptoKey,
    ciphertextWithTag as unknown as BufferSource,
  );

  return bytesToString(new Uint8Array(plain));
}

/**
 * Compute the HMAC-SHA256 checksum of `data` under `key`.
 */
async function hmacSha256(data: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key) as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data) as unknown as BufferSource,
  );
  return bytesToHex(new Uint8Array(signature));
}

/**
 * Recover the key material from the meta tag.
 *
 * Returns `null` when the meta tag is missing, malformed, or fails its
 * integrity check — in which case nothing is decoded, rather than something
 * wrong being decoded.
 */
export async function getKeyMaterial(
  content: string | null,
  config: MailObfuscationConfig,
): Promise<KeyMaterial | null> {
  if (!content) return null;

  const parts = content.split(":");
  if (parts.length !== 4) return null;

  const [version, payload, checksum, salt] = parts as [
    string,
    string,
    string,
    string,
  ];

  try {
    if (version === "v2") {
      const metaKey = await deriveMetaKey(salt);
      const key = await aesDecrypt(payload, metaKey);

      const expected = await hmacSha256(payload, key);
      if (!constantTimeEqual(expected, checksum)) {
        console.error(
          "[mail-obfuscation] The key material failed its integrity check.",
        );
        return null;
      }

      return { key, salt };
    }

    if (version === "v1") {
      const expected = await hmacSha256(payload, payload);
      if (!constantTimeEqual(expected, checksum)) {
        console.error(
          "[mail-obfuscation] The key material failed its integrity check.",
        );
        return null;
      }

      return { key: payload, salt };
    }
  } catch (error) {
    console.error("[mail-obfuscation] Failed to read the key material:", error);
    return null;
  }

  return null;
}

/**
 * Decode one obfuscated value.
 */
export function decodeValue(
  value: string,
  method: string,
  keyHex: string,
): string | null {
  try {
    const dataBytes = base64UrlToBytes(value);
    const keyBytes = hexToBytes(keyHex);
    if (keyBytes.length === 0) return null;

    const result = new Uint8Array(dataBytes.length);

    for (let i = 0; i < dataBytes.length; i++) {
      const keyByte = keyBytes[i % keyBytes.length];

      switch (method) {
        case "1":
          result[i] = dataBytes[i] ^ keyByte;
          break;
        case "2":
          result[i] = dataBytes[i] ^ keyByte ^ (i & 0xff);
          break;
        case "3": {
          const saltMix = keyBytes[(i * 7 + 13) % keyBytes.length];
          result[i] = dataBytes[i] ^ keyByte ^ saltMix;
          break;
        }
        default:
          result[i] = dataBytes[i] ^ keyByte;
      }
    }

    return bytesToString(result);
  } catch (error) {
    console.error(
      `[mail-obfuscation] Decryption error in method ${method}:`,
      error,
    );
    return null;
  }
}

/**
 * Restore every obfuscated element in the document.
 */
export async function deobfuscateContent(): Promise<void> {
  if (typeof document === "undefined") return;

  const elements = document.querySelectorAll<HTMLElement>("[data-mobfuscated]");
  if (!elements.length) return;

  const meta = document.querySelector<HTMLMetaElement>(
    `meta[name="${META_TAG_NAME}"]`,
  );
  const keyMaterial = await getKeyMaterial(
    meta?.getAttribute("content") ?? null,
    readConfig(),
  );

  if (!keyMaterial) {
    console.warn("[mail-obfuscation] Could not retrieve key material");
    return;
  }

  const { key } = keyMaterial;

  elements.forEach((el) => {
    const encryptedHref = el.getAttribute("data-href");
    const encryptedContent = el.getAttribute("data-mobfuscated");
    const method = el.getAttribute("data-method") || "1";

    if (!encryptedContent) return;

    const content = decodeValue(encryptedContent, method, key);
    if (content === null) return;

    if (encryptedHref) {
      const href = decodeValue(encryptedHref, method, key);
      if (href) {
        el.setAttribute("href", href);
      }
    }

    const noscript = el.querySelector("noscript");
    if (noscript) noscript.remove();

    el.innerHTML = content;
    el.removeAttribute("data-mobfuscated");
    el.removeAttribute("data-method");
    el.removeAttribute("data-href");
  });
}

/**
 * Wire the client up to the document.
 */
function init(): void {
  let decryptionPerformed = false;

  const initDeobfuscation = () => {
    if (decryptionPerformed) return;
    decryptionPerformed = true;
    void deobfuscateContent();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDeobfuscation);
  } else {
    initDeobfuscation();
  }

  // Re-initialize on Astro page transitions
  document.addEventListener("astro:page-load", () => {
    decryptionPerformed = false;
    initDeobfuscation();
  });
}

if (typeof document !== "undefined") {
  init();
}
