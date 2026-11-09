# @functionfly/astro-mail-obfuscation

E-mail and phone obfuscation for Astro. The addresses are removed from the
built HTML, encrypted, and restored in the browser by a small script.

Fork of
[`astro-mail-obfuscation`](https://github.com/andreas-brunner/astro-mail-obfuscation);
see [`UPSTREAMS.md`](../../UPSTREAMS.md) in the repository root.

## What this fork changes

| Feature | Original | This fork |
| --- | --- | --- |
| Meta tag key material | Plaintext key | **AES-256-GCM**, under a key derived from the salt |
| Integrity check | None | **HMAC-SHA256**, verified by the browser before anything is decoded |
| Key extraction | Direct | Derived in one step, and compared in constant time |
| Script injection | Inline initialisation | **External module**, no inline script, no global state |
| A page that cannot be obfuscated | Logged, the build continues | **The build fails** — the address is never published in clear text |

## Installation

The package is not published to npm. Consume it from the repository:

```json
{
  "dependencies": {
    "@functionfly/astro-mail-obfuscation": "file:../../starlight-plugins/packages/astro-mail-obfuscation"
  }
}
```

## Usage

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import mailObfuscation from "@functionfly/astro-mail-obfuscation";

export default defineConfig({
  integrations: [
    mailObfuscation({
      fallbackText: "Enable JavaScript to see email",
      encryptedMeta: true, // protect the key material (recommended)
      randomMethod: true, // random method per element
    }),
  ],
});
```

## HTML usage

```html
<!-- E-mail obfuscation -->
<a href="mailto:info@example.com" data-obfuscation>info@example.com</a>

<!-- Phone number -->
<a href="tel:+1234567890" data-obfuscation>+1 (234) 567-890</a>

<!-- Specify the method manually -->
<span data-obfuscation="1">text to protect</span>

<!-- Random method (the default) -->
<span data-obfuscation="0">auto-selects a method</span>
```

## Configuration options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `fallbackText` | `string` | `"[PROTECTED!]"` | Text shown when JavaScript is disabled |
| `encryptedMeta` | `boolean` | `true` | Protect the key material in the meta tag with AES-256-GCM |
| `randomMethod` | `boolean` | `true` | Random method per element |
| `userKey` | `string` | auto-generated | Custom encryption key (hex) |
| `userSalt` | `string` | auto-generated | Custom salt (12 characters) |
| `allowedTags` | `string[]` | see below | Additional tags to allow |
| `concurrencyLimit` | `number` | `5` | Maximum concurrent file processing |

The default allowed tags are `h1`–`h6`, `p`, `span`, `a`, `label`, `ul`, `ol`,
`li`, `strong`, `b`, `em`, `i`, `div`, `section`, `article`, `td`, `th` and
`blockquote`.

## How it works

1. The integration post-processes the built HTML. Every element with a
   `data-obfuscation` attribute has its content — and its `href` — encrypted
   with a per-build key, and the address is replaced with a `<noscript>`
   fallback.
2. The key material is published in a `<meta name="x-mail-obf">` tag, as
   `v2:<payload>:<checksum>:<salt>`:
   - the payload is the key material encrypted with AES-256-GCM under a key
     derived from the salt,
   - the checksum is an HMAC-SHA256 over the payload.
3. The client script is injected as an **external module**. Astro bundles it
   into its own asset and emits `<script type="module" src="...">`, so the
   document contains no inline script and a strict Content-Security-Policy
   does not need `unsafe-inline`. The script's configuration travels in a
   `<meta name="x-mail-obf-config">` tag rather than a global, because a
   module's imports are hoisted above its statements.
4. In the browser the script derives the key from the salt, decrypts the
   payload, **verifies the checksum**, and only then restores the content.

### What the obfuscation protects against

The key material is recoverable by the browser, so it is recoverable by
anyone who reads the script as well. The obfuscation protects against a
scraper that reads the HTML and never runs the script — it is not encryption
against a determined reader. The checksum detects a corrupted or tampered
meta tag; it is not a signature.

### Failure is closed

If a page cannot be obfuscated, the build **fails**. The alternative — log
the error and continue — publishes the very addresses the integration
exists to protect.

## Migration from the original

The enhanced version is API-compatible with the original:

```js
// Original
import mailObfuscation from "astro-mail-obfuscation";

// This fork (drop-in replacement)
import mailObfuscation from "@functionfly/astro-mail-obfuscation";
```

### Breaking changes

- The meta tag name changed from `4758` to `x-mail-obf`.
- The data attributes changed from `data-7391`/`data-5647` to
  `data-mobfuscated`/`data-href`.
- The `cspCompatible` option was removed. The script is always injected as
  an external module and always initialises through event listeners, so
  there was nothing left to switch between.
- The minimum Node.js version is 20.

## License

MIT — the same licence as the original.
