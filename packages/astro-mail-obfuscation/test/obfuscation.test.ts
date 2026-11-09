import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { buildMetaContent, encryptContent } from "../src/index";
import { decodeValue, getKeyMaterial } from "../src/scripts/client";

function deriveKeyHash(userKey: string, salt: string): Buffer {
  return createHash("sha256").update(userKey + salt).digest();
}

describe("mail obfuscation", () => {
  test("the browser recovers the key from the protected meta tag", async () => {
    const salt = "abcdefghijkl";
    const keyHash = deriveKeyHash("user-key", salt);

    const meta = buildMetaContent(salt, true, keyHash);
    expect(meta.split(":")).toHaveLength(4);

    const material = await getKeyMaterial(meta, { encrypted: true });
    expect(material).not.toBeNull();
    expect(material?.key).toBe(keyHash.toString("hex"));
  });

  test("every encryption method round-trips through the client", async () => {
    const salt = "abcdefghijkl";
    const keyHash = deriveKeyHash("user-key", salt);
    const material = await getKeyMaterial(
      buildMetaContent(salt, true, keyHash),
      { encrypted: true },
    );

    for (const method of ["1", "2", "3"]) {
      const encrypted = encryptContent("info@example.com", method, keyHash);
      expect(encrypted).toBeTruthy();
      expect(decodeValue(encrypted!, method, material!.key)).toBe(
        "info@example.com",
      );
    }
  });

  test("the legacy meta format still decodes", async () => {
    const salt = "abcdefghijkl";
    const keyHash = deriveKeyHash("user-key", salt);

    const meta = buildMetaContent(salt, false, keyHash);
    expect(meta.startsWith("v1:")).toBe(true);

    const material = await getKeyMaterial(meta, { encrypted: true });
    expect(material?.key).toBe(keyHash.toString("hex"));
  });

  test("a tampered payload fails the integrity check", async () => {
    const salt = "abcdefghijkl";
    const keyHash = deriveKeyHash("user-key", salt);
    const meta = buildMetaContent(salt, true, keyHash);

    const parts = meta.split(":");
    const payload = parts[1] ?? "";
    // Flip one character of the encrypted payload.
    parts[1] = `${payload.slice(0, -1)}${payload.at(-1) === "A" ? "B" : "A"}`;

    expect(await getKeyMaterial(parts.join(":"), { encrypted: true })).toBeNull();
  });

  test("a malformed meta tag yields no key material", async () => {
    expect(await getKeyMaterial("nonsense", { encrypted: true })).toBeNull();
    expect(await getKeyMaterial(null, { encrypted: true })).toBeNull();
  });
});
