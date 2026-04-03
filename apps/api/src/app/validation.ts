import type { FastifyReply } from "fastify";
import type { ZodTypeAny } from "zod";
import { writeStructuredLog } from "./structured-log.js";

function summarizeValidationPayload(data: unknown) {
  if (Array.isArray(data)) {
    return {
      payloadType: "array",
      topLevelKeys: data.length ? `0..${Math.min(data.length - 1, 7)}` : "none",
    };
  }

  if (data && typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>);

    return {
      payloadType: "object",
      topLevelKeys: keys.length ? keys.slice(0, 8).join(", ") : "none",
    };
  }

  if (data === null) {
    return {
      payloadType: "null",
      topLevelKeys: "none",
    };
  }

  return {
    payloadType: typeof data,
    topLevelKeys: "none",
  };
}

function buildIssueSummary(path: string, message: string) {
  return `${path}: ${message}`;
}

export function parseWithSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  reply: FastifyReply,
) {
  const result = schema.safeParse(data);

  if (!result.success) {
    const request = reply.request;
    const issueSummaries = result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";

      return buildIssueSummary(path, issue.message);
    });
    const payloadSummary = summarizeValidationPayload(data);

    writeStructuredLog("warn", {
      event: "api.validation.failed",
      actorUserId: request.user?.sub ?? null,
      detail: {
        method: request.method,
        route: request.url,
        issueCount: result.error.issues.length,
        fields: issueSummaries
          .map((issue) => issue.slice(0, issue.indexOf(":")))
          .slice(0, 8)
          .join(", "),
        issueSummary: issueSummaries.slice(0, 4).join(" | "),
        payloadType: payloadSummary.payloadType,
        topLevelKeys: payloadSummary.topLevelKeys,
      },
    });

    reply.status(400).send({
      message: "Validation failed",
      issues: result.error.flatten(),
    });
    return null;
  }

  return result.data;
}
