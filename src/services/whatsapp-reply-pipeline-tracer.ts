/**
 * Central WhatsApp Customer Reply Pipeline Tracer
 *
 * Tracks every accepted inbound message across all 10 canonical lifecycle stages
 * and guarantees an explicit terminal outcome (no abandoned in-progress traces).
 */

export type PipelineStage =
  | "INBOUND_DETECTED"
  | "ACCEPTED_FOR_PROCESSING"
  | "ACCOUNT_INSTANCE_CHECKED"
  | "HISTORY_CONTEXT_LOADED"
  | "AI_REQUEST_STARTED"
  | "AI_RESPONSE_RECEIVED"
  | "RESPONSE_VALIDATED"
  | "WHATSAPP_SEND_STARTED"
  | "WHATSAPP_SEND_SUCCEEDED"
  | "CONVERSATION_STATE_RELEASED";

export type TerminalOutcome =
  | "SENT"
  | "INTENTIONALLY_BLOCKED"
  | "DUPLICATE_SUPPRESSED"
  | "SUPERSEDED"
  | "AI_FAILED"
  | "VALIDATION_FAILED"
  | "SEND_FAILED"
  | "HISTORY_FAILED"
  | "MEDIA_FAILED"
  | "WORKER_INTERRUPTED";

export interface StageRecord {
  stage: PipelineStage;
  timestamp: number;
  durationFromStartMs: number;
  details?: Record<string, any>;
}

export interface PipelineTraceSnapshot {
  traceId: string;
  botId: string;
  customerJid: string;
  maskedCustomer: string;
  messageId: string;
  source: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  currentStage: PipelineStage;
  terminalOutcome?: TerminalOutcome;
  terminalReason?: string;
  stages: StageRecord[];
  error?: {
    stage: PipelineStage;
    errorType: string;
    message: string;
    status?: number | string;
    retryCount?: number;
  };
}

export function maskJid(jid: any): string {
  const raw = String(jid || "").trim();
  const [user, domain] = raw.split("@");
  if (!user) return "";
  const masked = user.length <= 4
    ? `${user.slice(0, 1)}***`
    : `${user.slice(0, 3)}...${user.slice(-2)}`;
  return domain ? `${masked}@${domain}` : masked;
}

export function sanitizeErrorMessage(msg: any): string {
  let clean = String(msg?.message || msg || "unknown_error");
  // Redact API keys and authorization headers
  clean = clean.replace(/(?:key|token|auth|bearer|secret|password|otp|pin|cvv)=([a-zA-Z0-9_-]{4,})/gi, "key=[REDACTED]");
  clean = clean.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, "Bearer [REDACTED]");
  clean = clean.replace(/AIza[a-zA-Z0-9_-]+/g, "[REDACTED_API_KEY]");
  return clean.slice(0, 200);
}

export class WhatsAppReplyPipelineTrace {
  public readonly traceId: string;
  public readonly botId: string;
  public readonly customerJid: string;
  public readonly maskedCustomer: string;
  public readonly messageId: string;
  public readonly source: string;
  public readonly startedAt: number;

  public currentStage: PipelineStage = "INBOUND_DETECTED";
  public terminalOutcome?: TerminalOutcome;
  public terminalReason?: string;
  public completedAt?: number;
  public stages: StageRecord[] = [];
  public error?: {
    stage: PipelineStage;
    errorType: string;
    message: string;
    status?: number | string;
    retryCount?: number;
  };

  private io?: any;

  constructor(options: {
    botId: string;
    customerJid: string;
    messageId?: string;
    source?: string;
    io?: any;
    traceId?: string;
  }) {
    this.botId = String(options.botId || "").trim();
    this.customerJid = String(options.customerJid || "").trim();
    this.maskedCustomer = maskJid(this.customerJid);
    this.messageId = String(options.messageId || "").slice(0, 32);
    this.source = String(options.source || "inbound").slice(0, 40);
    this.io = options.io;
    this.startedAt = Date.now();

    const shortId = Math.random().toString(36).slice(2, 8);
    const jidPrefix = this.customerJid.split("@")[0].slice(-4) || "chat";
    this.traceId = options.traceId || `trace_${jidPrefix}_${this.startedAt}_${shortId}`;

    this.recordStage("INBOUND_DETECTED", { source: this.source });
  }

  recordStage(stage: PipelineStage, details?: Record<string, any>): void {
    const now = Date.now();
    this.currentStage = stage;
    this.stages.push({
      stage,
      timestamp: now,
      durationFromStartMs: now - this.startedAt,
      details,
    });

    if (this.io?.emit) {
      this.io.emit("system-log", {
        type: "info",
        msg: `pipeline_trace traceId=${this.traceId} stage=${stage} customer=${this.maskedCustomer}${details?.reason ? ` reason=${details.reason}` : ""}`,
      });
    }
  }

  recordFailure(
    stageOrInput: PipelineStage | { stage: PipelineStage; error: any; terminalOutcome?: TerminalOutcome; retryCount?: number; status?: number | string },
    error?: any,
    options?: { terminalOutcome?: TerminalOutcome; retryCount?: number; status?: number | string }
  ): void {
    let stage: PipelineStage;
    let err: any;
    let terminalOutcome: TerminalOutcome | undefined;
    let retryCount: number | undefined;
    let status: number | string | undefined;

    if (typeof stageOrInput === "string") {
      stage = stageOrInput;
      err = error;
      terminalOutcome = options?.terminalOutcome;
      retryCount = options?.retryCount;
      status = options?.status;
    } else {
      stage = stageOrInput.stage;
      err = stageOrInput.error;
      terminalOutcome = stageOrInput.terminalOutcome;
      retryCount = stageOrInput.retryCount;
      status = stageOrInput.status;
    }

    const errorType = err?.name || err?.code || "RuntimeError";
    const message = sanitizeErrorMessage(err);
    this.error = {
      stage,
      errorType,
      message,
      status: status || err?.status,
      retryCount: retryCount || 0,
    };

    if (terminalOutcome) {
      this.recordTerminal(terminalOutcome, message);
    } else if (this.io?.emit) {
      this.io.emit("system-log", {
        type: "warning",
        msg: `pipeline_failure traceId=${this.traceId} stage=${stage} errorType=${errorType} message=${message}`,
      });
    }
  }

  recordTerminal(outcome: TerminalOutcome, reason?: string, details?: Record<string, any>): void {
    this.completedAt = Date.now();
    this.terminalOutcome = outcome;
    this.terminalReason = reason || outcome;

    // Always guarantee conversation state released is marked as final step if not already done
    if (this.currentStage !== "CONVERSATION_STATE_RELEASED") {
      this.recordStage("CONVERSATION_STATE_RELEASED", { terminalOutcome: outcome, reason });
    }

    if (this.io?.emit) {
      const logType = outcome === "SENT" ? "success" : outcome.includes("BLOCKED") || outcome === "SUPERSEDED" || outcome === "DUPLICATE_SUPPRESSED" ? "info" : "warning";
      this.io.emit("system-log", {
        type: logType,
        msg: `pipeline_terminal traceId=${this.traceId} outcome=${outcome} reason=${this.terminalReason} durationMs=${this.completedAt - this.startedAt}`,
      });
    }
  }

  snapshot(): PipelineTraceSnapshot {
    return {
      traceId: this.traceId,
      botId: this.botId,
      customerJid: this.customerJid,
      maskedCustomer: this.maskedCustomer,
      messageId: this.messageId,
      source: this.source,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      totalDurationMs: this.completedAt ? this.completedAt - this.startedAt : Date.now() - this.startedAt,
      currentStage: this.currentStage,
      terminalOutcome: this.terminalOutcome,
      terminalReason: this.terminalReason,
      stages: [...this.stages],
      error: this.error ? { ...this.error } : undefined,
    };
  }
}

export function createReplyPipelineTrace(options: {
  botId: string;
  customerJid: string;
  messageId?: string;
  source?: string;
  io?: any;
}): WhatsAppReplyPipelineTrace {
  return new WhatsAppReplyPipelineTrace(options);
}
