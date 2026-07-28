import { describe, expect, it } from "vitest";

import {
  GAD7_QUESTIONS,
  LANGUAGES,
  PHQ9_QUESTIONS,
  t,
  translations,
} from "../artifacts/cdsi-platform/src/translations";

describe("translations", () => {
  it("returns the requested localized value", () => {
    expect(t("upload", "Spanish")).toBe("Subir");
  });

  it("falls back to English for unknown languages", () => {
    expect(t("clinicalReport", "Unknown")).toBe("Clinical Report");
  });

  it("falls back to English when a known language is missing a key", () => {
    const original = translations.Hindi.upload;
    delete translations.Hindi.upload;

    try {
      expect(t("upload", "Hindi")).toBe("Upload");
    } finally {
      translations.Hindi.upload = original;
    }
  });

  it("returns the key when no translation exists", () => {
    expect(t("missing.translation.key", "English")).toBe(
      "missing.translation.key",
    );
  });

  it("exposes the supported languages and complete screening questionnaires", () => {
    expect(LANGUAGES).toHaveLength(20);
    expect(new Set(LANGUAGES.map(({ code }) => code)).size).toBe(20);
    expect(PHQ9_QUESTIONS).toHaveLength(9);
    expect(GAD7_QUESTIONS).toHaveLength(7);
  });
});
