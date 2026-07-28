import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import uploadRouter from "./upload.js";
import statusRouter from "./status.js";
import analyzeRouter from "./analyze.js";
import chatRouter from "./chat.js";
import exportRouter from "./export.js";
import deleteRouter from "./delete.js";
import authRouter from "./auth.js";
import debugRouter from "./debug.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(uploadRouter);
router.use(statusRouter);
router.use(analyzeRouter);
router.use(chatRouter);
router.use(exportRouter);
router.use(deleteRouter);
router.use(authRouter);
router.use(debugRouter);

export default router;
