import { Router } from "express";
import fs from "fs";
import path from "path";
import type { Request, Response } from "express";

const router = Router();

router.get("/debug-logs", (req: Request, res: Response) => {
  const pathsToTry = [
    "/home/LogFiles/Application",
    "/home/LogFiles",
    "./logs"
  ];

  const targetFile = req.query["file"] as string | undefined;

  try {
    const allFiles: any[] = [];
    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        const files = fs.readdirSync(p);
        for (const file of files) {
          const fullPath = path.join(p, file);
          if (fs.statSync(fullPath).isFile()) {
            const stats = fs.statSync(fullPath);
            allFiles.push({
              dir: p,
              file,
              fullPath,
              size: stats.size,
              mtime: stats.mtimeMs
            });
          }
        }
      }
    }

    if (targetFile) {
      const match = allFiles.find(f => f.file === targetFile || f.fullPath === targetFile);
      if (!match) {
        res.status(404).json({ error: "File not found", targetFile });
        return;
      }
      const content = fs.readFileSync(match.fullPath, "utf8");
      res.type("text/plain").send(content.slice(-50000));
      return;
    }

    // Sort files by modification time descending
    allFiles.sort((a, b) => b.mtime - a.mtime);
    res.json({ availableFiles: allFiles });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/debug-env", (req: Request, res: Response) => {
  const maskKey = (key?: string) => {
    if (!key) return null;
    const clean = key.trim().replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, "").replace(/^["']|["']$/g, "");
    if (clean.length < 8) return "***";
    return clean.substring(0, 4) + "..." + clean.substring(clean.length - 4);
  };

  const aiKey = process.env.AI_API_KEY;

  res.json({
    AI_API_KEY: {
      exists: !!aiKey,
      length: aiKey ? aiKey.length : 0,
      masked: maskKey(aiKey)
    },
    AI_BASE_URL: process.env.AI_BASE_URL ?? null,
    AI_MODEL: process.env.AI_MODEL ?? null,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    WEBSITE_SITE_NAME: process.env.WEBSITE_SITE_NAME
  });
});

router.get("/test-ai", async (req: Request, res: Response) => {
  try {
    const key = process.env.AI_API_KEY;
    const baseUrl = (process.env.AI_BASE_URL ?? "").replace(/\/+$/, "");
    const model = process.env.AI_MODEL ?? "gpt-4o";

    if (!key || !baseUrl) {
      return res.status(400).json({ error: "AI_API_KEY and AI_BASE_URL must be configured" });
    }

    const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

    const aiRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with just the word 'ok'" }],
        max_tokens: 10,
      })
    });

    const status = aiRes.status;
    const text = await aiRes.text();

    return res.json({
      status,
      text
    });
  } catch (e) {
    return res.status(500).json({
      error: String(e)
    });
  }
});

export default router;
