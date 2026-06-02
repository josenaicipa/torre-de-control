import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { writeAudit } from "@/lib/audit";
import {
  RESET_CONFIRM_PHRASE,
  RESET_TABLE_ORDER,
  backupResetTables,
  countResetTables,
  deleteResetTables,
  isConfirmPhraseValid,
  type BackupSummary,
} from "@/lib/comunidad-dropi-reset";
import { writeBackupFile } from "@/lib/comunidad-dropi-reset-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  dryRun: z.boolean().default(true),
  confirmPhrase: z.string().optional(),
  backup: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);

    const raw = await req.json().catch(() => ({}));
    const { dryRun, confirmPhrase, backup } = bodySchema.parse(raw ?? {});

    const countsBefore = await countResetTables(prisma);

    if (dryRun) {
      await writeAudit({
        actorId: actor.userId,
        action: "comunidad_dropi.reset.dry_run",
        target: "DropiCommunityMember",
        metadata: { countsBefore, affectedTables: [...RESET_TABLE_ORDER] },
      });

      return NextResponse.json({
        ok: true,
        data: {
          dryRun: true,
          countsBefore,
          countsAfter: countsBefore,
          affectedTables: [...RESET_TABLE_ORDER],
          backupSummary: {
            performed: false,
            totalRows: 0,
            tables: countsBefore,
          } satisfies BackupSummary,
        },
      });
    }

    if (!isConfirmPhraseValid(confirmPhrase)) {
      return jsonError(
        400,
        `Para borrar enviá confirmPhrase exactamente "${RESET_CONFIRM_PHRASE}"`,
      );
    }

    let backupSummary: BackupSummary = {
      performed: false,
      totalRows: 0,
      tables: countsBefore,
    };

    if (backup) {
      try {
        const { data, summary } = await backupResetTables(prisma);
        const file = await writeBackupFile(data);
        backupSummary = { ...summary, file };
      } catch (backupErr) {
        console.error("comunidad-dropi reset backup failed:", backupErr);
        return jsonError(
          500,
          "No se pudo generar el respaldo previo; no se borró ningún dato.",
        );
      }
    }

    const deleted = await prisma.$transaction((tx) => deleteResetTables(tx));
    const countsAfter = await countResetTables(prisma);

    await writeAudit({
      actorId: actor.userId,
      action: "comunidad_dropi.reset.executed",
      target: "DropiCommunityMember",
      metadata: {
        countsBefore,
        deleted,
        countsAfter,
        affectedTables: [...RESET_TABLE_ORDER],
        backup: { performed: backupSummary.performed, totalRows: backupSummary.totalRows },
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        dryRun: false,
        countsBefore,
        countsAfter,
        affectedTables: [...RESET_TABLE_ORDER],
        backupSummary,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
