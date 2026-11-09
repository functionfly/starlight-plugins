import { describe, expect, test } from "bun:test";

import { markdownToHtmlSimple } from "../src/utils";

describe("markdownToHtmlSimple", () => {
  test("a heading is not wrapped in a paragraph", () => {
    const html = markdownToHtmlSimple("## Release notes\n\nSome body text.");

    expect(html).toContain("<h2>Release notes</h2>");
    expect(html).not.toContain("</p><p>");
    expect(html).toContain("<p>Some body text.</p>");
  });

  test("the markup of the note is escaped", () => {
    const html = markdownToHtmlSimple("<script>alert(1)</script>");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("a link target cannot break out of the attribute", () => {
    const html = markdownToHtmlSimple('[x](https://example.com/"onmouseover="alert(1))');

    expect(html).not.toContain('"onmouseover="alert(1)');
    expect(html).toContain("&quot;");
  });

  test("inline code is not treated as emphasis", () => {
    const html = markdownToHtmlSimple("run `bun *test*` now");

    expect(html).toContain("<code>bun *test*</code>");
    expect(html).not.toContain("<em>");
  });

  test("lists become list items", () => {
    const html = markdownToHtmlSimple("- one\n- two");

    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
  });
});
