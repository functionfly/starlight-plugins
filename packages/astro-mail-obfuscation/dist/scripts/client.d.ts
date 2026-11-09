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
export declare function readConfig(): MailObfuscationConfig;
/**
 * Decode a base64url string into bytes.
 */
export declare function base64UrlToBytes(value: string): Uint8Array;
/**
 * Decode a hex string into bytes.
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Encode bytes as a lowercase hex string.
 */
export declare function bytesToHex(bytes: Uint8Array): string;
/**
 * Compare two strings without leaking where they differ.
 */
export declare function constantTimeEqual(a: string, b: string): boolean;
/**
 * Recover the key material from the meta tag.
 *
 * Returns `null` when the meta tag is missing, malformed, or fails its
 * integrity check — in which case nothing is decoded, rather than something
 * wrong being decoded.
 */
export declare function getKeyMaterial(content: string | null, config: MailObfuscationConfig): Promise<KeyMaterial | null>;
/**
 * Decode one obfuscated value.
 */
export declare function decodeValue(value: string, method: string, keyHex: string): string | null;
/**
 * Restore every obfuscated element in the document.
 */
export declare function deobfuscateContent(): Promise<void>;
export {};
//# sourceMappingURL=client.d.ts.map