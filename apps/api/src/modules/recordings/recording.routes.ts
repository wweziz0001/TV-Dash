import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { recordingJobInputSchema, recordingJobUpdateInputSchema, recordingRuleInputSchema } from "@tv-dash/shared";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { requirePermission } from "../../app/auth-guards.js";
import {
  channelIdParamSchema,
  idParamSchema,
  recordingJobsQuerySchema,
  recordingPlaybackQuerySchema,
  recordingRulesQuerySchema,
} from "../../app/request-schemas.js";
import { parseWithSchema } from "../../app/validation.js";
import {
  cancelRecordingJobForViewer,
  createRecordingJobForViewer,
  createRecordingRuleForViewer,
  deleteRecordingJobForViewer,
  deleteRecordingRuleForViewer,
  getRecordingJobForViewer,
  getRecordingMediaByPlaybackToken,
  getRecordingPlaybackAccessForViewer,
  getRecordingQualityOptionsForViewer,
  getRecordingRuleForViewer,
  listRecordingJobsForViewer,
  listRecordingRulesForViewer,
  stopRecordingJobForViewer,
  updateRecordingJobForViewer,
  updateRecordingRuleForViewer,
} from "./recording.service.js";
import { resolveRecordingAbsolutePath } from "./recording-storage.js";

function mapRecordingErrorStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  if (error.message === "Channel not found" || error.message === "Recording job not found") {
    return 404;
  }

  if (error.message === "Guide program not found" || error.message === "Recording rule not found") {
    return 404;
  }

  if (error.message === "Recording media is not available") {
    return 409;
  }

  if (
    error.message.includes("Guide program") ||
    error.message.includes("cannot start in the future") ||
    error.message.includes("must be in the future") ||
    error.message.includes("can be edited") ||
    error.message.includes("can be canceled") ||
    error.message.includes("can be stopped") ||
    error.message.includes("Stop the active recording") ||
    error.message.includes("Cancel recurring occurrences") ||
    error.message.includes("Edit the recurring rule")
  ) {
    return 409;
  }

  return 500;
}

function getViewer(request: FastifyRequest) {
  if (!request.authUser) {
    throw new Error("Unauthorized");
  }

  return request.authUser;
}

function parseByteRange(rangeHeader: string, fileSize: number) {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return null;
  }

  const [, startText, endText] = match;
  const start = startText ? Number(startText) : 0;
  const end = endText ? Number(endText) : fileSize - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= fileSize) {
    return null;
  }

  return { start, end };
}

export const recordingRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/recordings/channels/:channelId/qualities",
    { preHandler: [requirePermission("recordings:manage-own")] },
    async (request, reply) => {
      const params = parseWithSchema(channelIdParamSchema, request.params, reply);
      if (!params) {
        return;
      }

      try {
        const qualities = await getRecordingQualityOptionsForViewer(getViewer(request), params.channelId);
        return { qualities };
      } catch (error) {
        return reply.status(mapRecordingErrorStatus(error)).send({
          message: error instanceof Error ? error.message : "Unable to load recording qualities",
        });
      }
    },
  );

  fastify.get("/recordings", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const query = parseWithSchema(recordingJobsQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const jobs = await listRecordingJobsForViewer(getViewer(request), {
      search: query.search,
      statuses: query.status.length ? query.status : undefined,
      channelId: query.channelId,
    });

    return { jobs };
  });

  fastify.get("/recording-rules", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const query = parseWithSchema(recordingRulesQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const rules = await listRecordingRulesForViewer(getViewer(request), {
      channelId: query.channelId,
      isActive: query.isActive ? query.isActive === "true" : undefined,
    });

    return { rules };
  });

  fastify.post("/recordings", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const payload = parseWithSchema(recordingJobInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const job = await createRecordingJobForViewer(getViewer(request), payload);
      return reply.status(201).send({ job });
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to create recording job",
      });
    }
  });

  fastify.post("/recording-rules", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const payload = parseWithSchema(recordingRuleInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const rule = await createRecordingRuleForViewer(getViewer(request), payload);
      return reply.status(201).send({ rule });
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to create recording rule",
      });
    }
  });

  fastify.get("/recordings/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const job = await getRecordingJobForViewer(getViewer(request), params.id);
      return { job };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to load recording job",
      });
    }
  });

  fastify.get("/recording-rules/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const rule = await getRecordingRuleForViewer(getViewer(request), params.id);
      return { rule };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to load recording rule",
      });
    }
  });

  fastify.put("/recordings/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(recordingJobUpdateInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const job = await updateRecordingJobForViewer(getViewer(request), params.id, payload);
      return { job };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to update recording job",
      });
    }
  });

  fastify.put("/recording-rules/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const payload = parseWithSchema(recordingRuleInputSchema, request.body, reply);
    if (!payload) {
      return;
    }

    try {
      const rule = await updateRecordingRuleForViewer(getViewer(request), params.id, payload);
      return { rule };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to update recording rule",
      });
    }
  });

  fastify.post("/recordings/:id/cancel", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const job = await cancelRecordingJobForViewer(getViewer(request), params.id);
      return { job };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to cancel recording job",
      });
    }
  });

  fastify.post("/recordings/:id/stop", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      const job = await stopRecordingJobForViewer(getViewer(request), params.id);
      return { job };
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to stop recording job",
      });
    }
  });

  fastify.delete("/recordings/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteRecordingJobForViewer(getViewer(request), params.id);
      return reply.status(204).send();
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to delete recording job",
      });
    }
  });

  fastify.delete("/recording-rules/:id", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      await deleteRecordingRuleForViewer(getViewer(request), params.id);
      return reply.status(204).send();
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to delete recording rule",
      });
    }
  });

  fastify.get("/recordings/:id/playback-access", { preHandler: [requirePermission("recordings:manage-own")] }, async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    try {
      return await getRecordingPlaybackAccessForViewer(getViewer(request), params.id);
    } catch (error) {
      return reply.status(mapRecordingErrorStatus(error)).send({
        message: error instanceof Error ? error.message : "Unable to open recording playback",
      });
    }
  });

  fastify.get("/recordings/:id/media", async (request, reply) => {
    const params = parseWithSchema(idParamSchema, request.params, reply);
    if (!params) {
      return;
    }

    const query = parseWithSchema(recordingPlaybackQuerySchema, request.query, reply);
    if (!query) {
      return;
    }

    const asset = await getRecordingMediaByPlaybackToken(params.id, query.token);

    if (!asset) {
      return reply.status(404).send({ message: "Recording media not found" });
    }

    const absolutePath = resolveRecordingAbsolutePath(asset.storagePath);
    const fileStats = await stat(absolutePath);
    const rangeHeader = typeof request.headers.range === "string" ? request.headers.range : null;
    const byteRange = rangeHeader ? parseByteRange(rangeHeader, fileStats.size) : null;

    reply.header("accept-ranges", "bytes");
    reply.header("content-type", asset.mimeType);
    reply.header("cache-control", "private, max-age=300");

    if (rangeHeader && !byteRange) {
      return reply.status(416).send({ message: "Invalid range" });
    }

    if (byteRange) {
      reply.status(206);
      reply.header("content-length", byteRange.end - byteRange.start + 1);
      reply.header("content-range", `bytes ${byteRange.start}-${byteRange.end}/${fileStats.size}`);
      return reply.send(createReadStream(absolutePath, { start: byteRange.start, end: byteRange.end }));
    }

    reply.header("content-length", fileStats.size);
    return reply.send(createReadStream(absolutePath));
  });
};
