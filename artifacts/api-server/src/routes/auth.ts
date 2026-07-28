import { Router, type IRouter } from "express";
import type { Request, Response } from "express";

const router: IRouter = Router();

function getEnvSecure(key: string): string | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  return val.trim().replace(/[\u200B-\u200D\uFEFF\u2028\u2029]/g, "").replace(/^["']|["']$/g, "");
}

router.post("/verify-token", (req: Request, res: Response) => {
  const { token } = req.body as { token: string };
  const expectedToken = getEnvSecure("ENTRY_TOKEN") || "demo123";

  if (token === expectedToken) {
    res.json({ valid: true });
  } else {
    res.status(401).json({ valid: false, error: "Invalid access token" });
  }
});

export default router;
