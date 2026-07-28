import { describe, expect, it } from "vitest";

import {
  processAllFiles,
  processFile,
} from "../artifacts/api-server/src/services/ocr";

describe("OCR file dispatch", () => {
  it("returns an annotated result for unsupported files", async () => {
    await expect(
      processFile("/tmp/notes.csv", "notes.csv", "text/csv"),
    ).resolves.toEqual({
      text: "[DOC: notes.csv | UNSUPPORTED_FORMAT]\n",
      pageCount: 0,
      docAnnotation: "[DOC: notes.csv]",
    });
  });

  it("combines multiple file results and summaries in input order", async () => {
    const result = await processAllFiles([
      {
        path: "/tmp/notes.csv",
        originalName: "notes.csv",
        mimetype: "text/csv",
      },
      {
        path: "/tmp/data.bin",
        originalName: "data.bin",
        mimetype: "application/x-custom",
      },
    ]);

    expect(result.unifiedContext).toBe(
      "[DOC: notes.csv | UNSUPPORTED_FORMAT]\n\n---\n\n" +
        "[DOC: data.bin | UNSUPPORTED_FORMAT]\n",
    );
    expect(result.fileSummaries).toEqual([
      { name: "notes.csv", pageCount: 0, lowQuality: undefined },
      { name: "data.bin", pageCount: 0, lowQuality: undefined },
    ]);
  });
});
