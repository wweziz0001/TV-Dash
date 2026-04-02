import type { FastifyReply } from "fastify";
import type { ZodTypeAny } from "zod";

export function parseWithSchema<TSchema extends ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  reply: FastifyReply,
) {
  const result = schema.safeParse(data);

  if (!result.success) {
    reply.status(400).send({
      message: "Validation failed",
      issues: result.error.flatten(),
    });
    return null;
  }

  return result.data;
}

