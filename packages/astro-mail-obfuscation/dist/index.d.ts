import type { AstroIntegration } from "astro";
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
export default function astroMailObfuscation(userOptions?: AstroMailObfuscationOptions): AstroIntegration;
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
export declare function buildMetaContent(salt: string, encryptedMeta: boolean, keyHash: Buffer): string;
/**
 * Encrypt content using the specified method.
 * Method 1: AES-like confusion (XOR with key hash)
 * Method 2: XOR with reversal
 * Method 3: XOR with salt mixing
 *
 * Exported so the test suite can round-trip a value through the client.
 */
export declare function encryptContent(content: string, method: string, key: Buffer): string | undefined;
//# sourceMappingURL=index.d.ts.map