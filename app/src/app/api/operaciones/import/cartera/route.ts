import { NextResponse } from "next/server";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { type ParsedRow } from "@/lib/legacy-cartera-parser";
import {
  type CloserCandidate,
  closerMatchesUser,
  parseCarteraCsv,
} from "@/lib/legacy-cartera-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface PreviewSummary {
  totalRows: number;
  validRows: number;
  rowsWithWarnings: number;
  newStudents: number;
  matchedStudents: number;
  unmatchedClosers: string[];
  sample: ParsedRow[];
  errors: Array<{ row: number; error: string }>;
}

function closerMatches(rawCloser: string, users: CloserCandidate[]): boolean {
  return users.some((user) => closerMatchesUser(rawCloser, user));
}

export async function POST(req: Request) {
  try {
    const actor = await getActor();
    requireActor(actor);
    requireAdmin(actor);

    const contentType = req.headers.get("content-type") ?? "";
    let csvText = "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Falta archivo CSV" }, { status: 400 });
      }
      csvText = await file.text();
    } else {
      const body = (await req.json()) as { csv?: unknown };
      csvText = typeof body.csv === "string" ? body.csv : "";
    }
    if (csvText.length < 10) {
      return NextResponse.json({ error: "CSV vacío o inválido" }, { status: 400 });
    }

    // The legacy header repeats "Medio de pago" and "Recibido"; the shared
    // parser reads fixed columns to stay robust against the duplicated header.
    const { parsedRows, errors } = parseCarteraCsv(csvText);

    const allEmails = Array.from(
      new Set(
        parsedRows
          .flatMap((row) => [row.head.email, ...row.members.map((member) => member.email)])
          .filter((email): email is string => Boolean(email)),
      ),
    );
    const existingStudents = await prisma.student.findMany({
      where: { email: { in: allEmails } },
      select: { email: true },
    });
    const existingEmails = new Set(
      existingStudents.map((student) => student.email.toLowerCase()),
    );

    let matchedStudents = 0;
    for (const row of parsedRows) {
      if (row.head.email && existingEmails.has(row.head.email.toLowerCase())) {
        matchedStudents += 1;
      }
    }

    const closerUsers = await prisma.user.findMany({
      where: {
        active: true,
        OR: [{ position: "CLOSER" }, { position: "ADMIN" }],
      },
      select: { id: true, name: true, email: true },
    });
    const closers = Array.from(
      new Set(
        parsedRows
          .map((row) => row.closerNameRaw)
          .filter((name): name is string => Boolean(name)),
      ),
    );
    const unmatchedClosers = closers.filter((closer) => !closerMatches(closer, closerUsers));

    const summary: PreviewSummary = {
      totalRows: parsedRows.length + errors.length,
      validRows: parsedRows.length,
      rowsWithWarnings: parsedRows.filter((row) => row.warnings.length > 0).length,
      newStudents: parsedRows.length - matchedStudents,
      matchedStudents,
      unmatchedClosers,
      sample: parsedRows.slice(0, 5),
      errors,
    };

    return NextResponse.json({ preview: summary, parsedRows });
  } catch (err) {
    return handleApiError(err);
  }
}
