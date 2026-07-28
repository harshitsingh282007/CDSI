import { describe, expect, it } from "vitest";

import {
  sanitizeChatMessage,
  sanitizePatientName,
  sanitizeText,
} from "../artifacts/api-server/src/lib/sanitize";

describe("input sanitizers", () => {
  it("removes markup delimiters, script protocols, and event handlers", () => {
    const sanitized = sanitizeText(
      '<img src="javascript:alert(1)" onclick=run()>Hello</img>',
    );

    expect(sanitized).not.toMatch(/[<>]/);
    expect(sanitized).not.toMatch(/javascript:/i);
    expect(sanitized).not.toMatch(/onclick=/i);
    expect(sanitized).toContain("Hello");
  });

  it("trims chat messages before sanitizing them", () => {
    expect(sanitizeChatMessage("  <b onclick=>Hi</b>  ")).toBe("b Hi/b");
  });

  it("trims, strips markup, and limits patient names to 100 characters", () => {
    const name = ` <${"A".repeat(120)}> `;
    const sanitized = sanitizePatientName(name);

    expect(sanitized).toBe("A".repeat(100));
    expect(sanitized).toHaveLength(100);
  });
});
