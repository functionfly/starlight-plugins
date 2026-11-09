import type { AstroIntegration } from "astro";
import * as cheerio from "cheerio";
import { globby } from "globby";
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { promises as fs } from "node:fs";
import pLimit from "p-limit";
import { fileURLToPath } from "url";

/**
 * The name of the meta tag that carries the key material.
 */
const META_TAG_NAME = "x-mail-obf";

/**
 * The name of the meta tag that carries the integration's configuration.
 */
const CONFIG_META_TAG_NAME = "x-mail-obf-config";

/**
 * The context string mixed into the salt to derive the meta-tag key.
 *
 * The browser has to be able to reproduce the key that protects the key
 * material, and the only thing it is guaranteed to have is the salt that
 * ships next to it in the meta tag. The salt is therefore not a secret:
 * what the obfuscation protects against is a naive scraper that reads the
 * HTML and never runs the client script — not an attacker who reads the
 * JavaScript as well.
 */
const KEY_DERIVATION_CONTEXT = "functionfly/mail-obfuscation/v2:";

/**
 * Generate a random user key for encryption purposes (32 bytes, hex).
 */
function generateUserKey(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a random user salt for encryption (12 chars, base64url-safe).
 */
function generateUserSalt(length: number): string {
  const bytes = randomBytes(length);
  // Use base64url encoding for safe characters
  return bytes.toString("base64url").slice(0, length);
}

/**
 * Derive the key that protects the key material in the meta tag.
 *
 * The derivation is deterministic in the salt, so the browser can repeat it.
 */
function deriveMetaKey(salt: string): Buffer {
  return createHash("sha256")
    .update(KEY_DERIVATION_CONTEXT + salt)
    .digest();
}

/**
 * Create HMAC-SHA256 integrity checksum for data.
 */
function createIntegrityChecksum(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Encrypt data using AES-256-GCM.
 *
 * Returns a single base64url-encoded blob of `iv || ciphertext || authTag`.
 *
 * The three parts used to be joined with `:`, which made the meta tag
 * ambiguous: the tag is itself colon-separated, so the payload had to be
 * parsed out of a variable number of fields. The parts have fixed lengths
 * — a 12-byte IV and a 16-byte tag — so they are concatenated instead, in
 * the order WebCrypto expects the ciphertext and the tag.
 */
function aesEncrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString("base64url");
}

/**
 * Default allowed tags for obfuscation.
 */
const defaultAllowedTags = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "label",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "div",
  "section",
  "article",
  "td",
  "th",
  "blockquote",
];

/**
 * Interface defining the options for the Astro Mail Obfuscation integration.
 */
export interface AstroMailObfuscationOptions {
  /** Text shown when JS is disabled */
  fallbackText?: string;
  /** Encryption key (auto-generated if not provided) */
  userKey?: string;
  /** Encryption salt (auto-generated if not provided, 12 chars) */
  userSalt?: string;
  /** Additional HTML tags to allow */
  allowedTags?: string[];
  /** Max concurrent file processing */
  concurrencyLimit?: number;
  /**
   * Protect the key material in the meta tag with AES-256-GCM instead of
   * publishing it in the clear — recommended for production.
   */
  encryptedMeta?: boolean;
  /** Generate random method per-element (increases variability) */
  randomMethod?: boolean;
}

/**
 * Astro integration function to obfuscate content in the HTML output.
 */
export default function astroMailObfuscation(
  userOptions: AstroMailObfuscationOptions = {},
): AstroIntegration {
  const userKey = userOptions.userKey || generateUserKey();
  const userSalt = userOptions.userSalt || generateUserSalt(12);

  // Derive actual encryption key from userKey using HKDF-like approach
  const keyHash = createHash("sha256")
    .update(userKey + userSalt)
    .digest();

  const options: Required<AstroMailObfuscationOptions> = {
    fallbackText: userOptions.fallbackText || "[PROTECTED!]",
    userKey,
    userSalt,
    allowedTags: mergeAllowedTags(userOptions.allowedTags),
    concurrencyLimit: userOptions.concurrencyLimit || 5,
    encryptedMeta: userOptions.encryptedMeta !== false, // Default true for security
    randomMethod: userOptions.randomMethod ?? true,
  };

  return {
    name: "@functionfly/astro-mail-obfuscation",
    hooks: {
      "astro:config:setup": ({ injectScript }) => {
        try {
          const scriptUrl = new URL("./scripts/client.js", import.meta.url)
            .href;
          // The script is injected as an external module: Astro bundles the
          // injected code into its own asset and emits a `<script
          // type="module" src=...>` tag, so no inline script is added to
          // the document and a strict Content-Security-Policy does not need
          // `unsafe-inline`.
          //
          // The configuration travels in a meta tag rather than a global,
          // because a module's imports are hoisted above its statements: a
          // global assigned next to an `import` statement is assigned
          // AFTER the imported module has already run.
          injectScript("page", `import "${scriptUrl}";`);
        } catch (err) {
          console.error(
            "[@functionfly/astro-mail-obfuscation] Failed to inject script.",
            err,
          );
          throw err;
        }
      },
      "astro:build:done": async ({ dir }) => {
        const outDir = fileURLToPath(dir);
        const htmlFiles = await globby("**/*.html", {
          cwd: outDir,
          absolute: true,
        });

        const limit = pLimit(options.concurrencyLimit);
        const failures: string[] = [];

        const tasks = htmlFiles.map((file: string) =>
          limit(async () => {
            const failure = await processHtmlFile(
              file,
              options,
              keyHash,
            );
            if (failure) failures.push(failure);
          }),
        );

        await Promise.all(tasks);

        if (failures.length > 0) {
          // A page that could not be obfuscated still carries the e-mail
          // address in clear text. Failing the build is the only outcome
          // that does not publish the address the integration exists to
          // protect.
          throw new Error(
            `[@functionfly/astro-mail-obfuscation] Failed to obfuscate ${failures.length} page(s):\n${failures
              .slice(0, 10)
              .join("\n")}`,
          );
        }

        console.log(
          `[@functionfly/astro-mail-obfuscation] Completed (${htmlFiles.length} page(s)).`,
        );
      },
    },
  };
}

/**
 * Merge default allowed tags with user-provided ones.
 */
function mergeAllowedTags(userTags?: string[]): string[] {
  const combinedTags = new Set<string>();
  defaultAllowedTags.forEach((tag) => combinedTags.add(tag.toLowerCase()));
  if (userTags) {
    userTags.forEach((tag) => combinedTags.add(tag.toLowerCase()));
  }
  return Array.from(combinedTags);
}

/**
 * Process a single HTML file for obfuscation.
 *
 * Returns a description of the failure, or `undefined` when the page was
 * processed successfully.
 */
async function processHtmlFile(
  filePath: string,
  options: Required<AstroMailObfuscationOptions>,
  keyHash: Buffer,
): Promise<string | undefined> {
  try {
    const html = await fs.readFile(filePath, "utf-8");
    const modifiedHtml = await modifyHtml(html, options, keyHash);
    await fs.writeFile(filePath, modifiedHtml, "utf-8");
    return undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[@functionfly/astro-mail-obfuscation] Error processing file ${filePath}: ${message}`,
    );
    return `${filePath}: ${message}`;
  }
}

/**
 * Modify HTML content by obfuscating tags with 'data-obfuscation'.
 */
async function modifyHtml(
  html: string,
  options: Required<AstroMailObfuscationOptions>,
  keyHash: Buffer,
): Promise<string> {
  const $ = cheerio.load(html);
  const selector = "[data-obfuscation]";

  $(selector).each((_, element) => {
    const $el = $(element);
    const tagName = $el[0].tagName.toLowerCase();

    if (!options.allowedTags.includes(tagName)) {
      console.warn(
        `[@functionfly/astro-mail-obfuscation] <${tagName}> is not allowed. Skipping.`,
      );
      return;
    }

    const href = $el.attr("href") || "";
    const type = $el.attr("data-obfuscation") || "";

    // Determine encryption method
    let method: string;
    if (options.randomMethod) {
      method = (Math.floor(Math.random() * 3) + 1).toString();
    } else {
      const validTypes = ["1", "2", "3"];
      method = validTypes.includes(type) ? type : "1";
    }

    const content = $el.html() || "";

    // Encrypt content
    const encryptedContent = encryptContent(content, method, keyHash);
    const encryptedHref = href ? encryptContent(href, method, keyHash) : null;

    if (encryptedContent) {
      $el.empty();
      $el.append(`<noscript>${options.fallbackText}</noscript>`);
      $el.attr("data-mobfuscated", encryptedContent);
      $el.attr("data-method", method);

      if (encryptedHref) {
        $el.attr("data-href", encryptedHref);
        $el.removeAttr("href");
      }
    } else {
      console.error(
        "[@functionfly/astro-mail-obfuscation] Encryption failed for element",
      );
    }
  });

  // Inject meta tag with key material (either encrypted or plaintext)
  if ($("[data-mobfuscated]").length) {
    const metaContent = buildMetaContent(
      options.userSalt,
      options.encryptedMeta,
      keyHash,
    );
    $("head").append(`<meta name="${META_TAG_NAME}" content="${metaContent}">`);
    // The client script reads its configuration from the document instead
    // of a global, so the configuration survives the module's hoisted
    // imports.
    const config = JSON.stringify({ encrypted: options.encryptedMeta });
    $("head").append(
      `<meta name="${CONFIG_META_TAG_NAME}" content='${config}'>`,
    );
  }

  return $.html();
}

/**
 * Build meta tag content - either protected or plain format.
 *
 * `v2:<payload>:<checksum>:<salt>` — the payload is the key material
 * encrypted with a key derived from the salt, and the checksum is an
 * HMAC over the payload that the browser can verify once it has recovered
 * the key.
 *
 * `v1:<key>:<checksum>:<salt>` — the legacy format, in which the key
 * material is published in the clear.
 */
export function buildMetaContent(
  salt: string,
  encryptedMeta: boolean,
  keyHash: Buffer,
): string {
  const keyHex = keyHash.toString("hex");

  if (encryptedMeta) {
    const payload = aesEncrypt(keyHex, deriveMetaKey(salt));
    const checksum = createIntegrityChecksum(payload, keyHex);
    return `v2:${payload}:${checksum}:${salt}`;
  }

  const checksum = createIntegrityChecksum(keyHex, keyHex);
  return `v1:${keyHex}:${checksum}:${salt}`;
}

/**
 * Encrypt content using the specified method.
 * Method 1: AES-like confusion (XOR with key hash)
 * Method 2: XOR with reversal
 * Method 3: XOR with salt mixing
 *
 * Exported so the test suite can round-trip a value through the client.
 */
export function encryptContent(
  content: string,
  method: string,
  key: Buffer,
): string | undefined {
  if (!content || !key) return undefined;

  try {
    const contentBuffer = Buffer.from(content, "utf8");
    const encrypted = Buffer.alloc(contentBuffer.length);

    for (let i = 0; i < contentBuffer.length; i++) {
      const keyByte = key[i % key.length];

      switch (method) {
        case "1":
          // Simple XOR with key
          encrypted[i] = contentBuffer[i] ^ keyByte;
          break;
        case "2":
          // XOR with character position mixing
          encrypted[i] = contentBuffer[i] ^ keyByte ^ (i & 0xff);
          break;
        case "3":
          // XOR with key and salt-based diffusion
          const saltMix = key[(i * 7 + 13) % key.length];
          encrypted[i] = contentBuffer[i] ^ keyByte ^ saltMix;
          break;
        default:
          encrypted[i] = contentBuffer[i] ^ keyByte;
      }
    }

    // Encode with base64url for safe HTML attributes
    return encrypted.toString("base64url");
  } catch (err) {
    console.error(
      `[@functionfly/astro-mail-obfuscation] Encryption error in method ${method}.`,
      err,
    );
    return undefined;
  }
}
