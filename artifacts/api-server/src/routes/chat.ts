import { Router } from "express";
import { getJob, linkSessionToJob } from "../store.js";
import { chatStore, reportContextStore } from "../store.js";
import { streamAI } from "../pipelineRouter.js";
import { logger } from "../lib/logger.js";
import { sanitizeChatMessage } from "../lib/sanitize.js";
import type { Request, Response } from "express";

const router = Router();

function buildChatSystemPrompt(reportContext: string): string {
  return `You are a warm, knowledgeable clinical assistant reviewing a patient's complete medical case on the CDSI platform.

You have been given the patient's full clinical report below. Use it as your primary reference for all questions.

Your communication style:
- Speak like a caring, senior doctor explaining results to a patient or their family
- Use plain language first, then medical terms in brackets when helpful
- Be warm, clear, and reassuring - the user may be anxious about their health results
- Give complete, thorough answers - don't cut off with "consult a doctor" without first answering the actual question
- Remember the full conversation history and build on previous answers
- When referencing lab values, cite the specific number and its reference range

Your knowledge scope:
- Lab value interpretation and clinical significance
- Possible underlying conditions based on the findings
- Drug interactions and medication questions
- Diet, lifestyle, and follow-up recommendations
- Explaining medical terminology in plain language
- Next steps and what to expect

IMPORTANT RULES:
- Begin every response with a brief, reassuring tone but don't use a boilerplate disclaimer every time - say it naturally once if relevant
- Never state AI-generated possibilities as confirmed diagnoses
- If asked about something genuinely outside your clinical scope, redirect gently
- Be concise but thorough - 3-6 sentences minimum for clinical questions

${reportContext}

DISCLAIMER REMINDER (embed naturally, not as a header): This is AI decision support. Always verify with a licensed physician for clinical decisions.`;
}

router.post("/chat", async (req: Request, res: Response) => {
  const correlationId = req.id || 'unknown';
  const { sessionId, jobId, message, language = "English" } = req.body as {
    sessionId: string;
    jobId: string;
    message: string;
    language?: string;
  };

  if (!sessionId || !jobId || !message) {
    res.status(400).json({ error: "sessionId, jobId, and message are required", correlationId });
    return;
  }

  // Sanitize user input
  const sanitizedMessage = sanitizeChatMessage(message);
  if (sanitizedMessage.length === 0) {
    res.status(400).json({ error: "Invalid message content", correlationId });
    return;
  }

  linkSessionToJob(jobId, sessionId);

  const job = getJob(jobId);
  const report = job?.report as Record<string, unknown> | null | undefined;

  if (!chatStore.has(sessionId)) {
    chatStore.set(sessionId, []);
  }
  const history = chatStore.get(sessionId)!;
  history.push({ role: "user", content: sanitizedMessage, timestamp: new Date().toISOString() });

  // Build rich report context block
  let contextBlock = "";
  if (report) {
    const labParams = (report["labParameters"] as unknown[]) ?? [];
    const findings = (report["findings"] as unknown[]) ?? [];
    const abnormalLabs = labParams.filter((l) => {
      const lab = l as { status: string };
      return lab.status !== "normal";
    });

    contextBlock = `\n\n=== PATIENT CLINICAL REPORT ===\n${JSON.stringify({
      patientSummary: report["patientSummary"],
      clinicalConclusion: report["clinicalConclusion"],
      riskAssessment: report["riskAssessment"],
      criticalValues: report["criticalValues"],
      possibleConditions: report["possibleConditions"],
      abnormalLabParameters: abnormalLabs.slice(0, 20),
      allLabParameters: labParams.slice(0, 30),
      prescriptions: report["prescriptions"],
      findings: findings.slice(0, 25),
      nextSteps: report["nextSteps"],
      organSystems: report["organSystems"],
      psychiatricSummary: report["psychiatricSummary"],
    }, null, 2)}\n=== END REPORT ===`;
  } else {
    // Use stored medical context if report not yet ready
    const storedContext = reportContextStore.get(jobId);
    if (storedContext) {
      contextBlock = `\n\n=== MEDICAL DOCUMENT CONTEXT ===\n${storedContext.slice(0, 8000)}\n=== END CONTEXT ===`;
    }
  }

  const systemWithContext = buildChatSystemPrompt(contextBlock);

  // Keep last 30 messages for rich context (15 conversation turns)
  const recentHistory = history.slice(-30);
  const aiMessages = recentHistory.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullResponse = "";

  try {
    for await (const token of streamAI(
      [...aiMessages, { role: "user", content: sanitizedMessage }],
      systemWithContext,
      language
    )) {
      fullResponse += token;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    history.push({ role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
    chatStore.set(sessionId, history);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    logger.error({ e, sessionId, correlationId }, "Chat streaming error");
    res.write(`data: ${JSON.stringify({ error: "Streaming error occurred", correlationId })}\n\n`);
    res.end();
  }
});

router.get("/chat/history/:sessionId", (req: Request, res: Response) => {
  const sessionId = req.params["sessionId"] as string;
  const messages = chatStore.get(sessionId) ?? [];
  res.json({ sessionId, messages });
});

export default router;
