import { prisma } from "./prisma";

export interface AuditPayload {
  actorId: string | null;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(payload: AuditPayload): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: payload.actorId,
      action: payload.action,
      target: payload.target ?? null,
      metadata: (payload.metadata ?? null) as never,
    },
  });
}
