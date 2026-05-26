import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getActor, requireActor, requireAdmin } from "@/lib/actor";
import { handleApiError } from "@/lib/api-helpers";
import { parseRowFromArray, type ParsedRow } from "@/lib/legacy-cartera-parser";
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

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function closerMatches(
  rawCloser: string,
  users: Array<{ name: string | null; email: string }>,
): boolean {
  const closer = normalizeName(rawCloser);
  return users.some((user) => {
    const firstName = normalizeName(user.name?.split(/\s+/)[0] ?? "");
    const emailPrefix = normalizeName(user.email.split("@")[0] ?? "");
    return (
      closer === firstName ||
      closer === emailPrefix ||
      (closer.length >= 3 &&
        firstName.length >= 3 &&
        (closer.startsWith(firstName) || firstName.startsWith(closer)))
    );
  });
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

    // Parse as arrays: the legacy header repeats "Medio de pago" and "Recibido".
    const rows = parse(csvText, {
      bom: true,
      from_line: 5,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];

    const parsedRows: ParsedRow[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    rows.forEach((row, index) => {
      if (!row[0]?.trim()) return;
      const legacyRowId = index + 5;
      try {
        parsedRows.push(parseRowFromArray(row, legacyRowId));
      } catch (err) {
        errors.push({
          row: legacyRowId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

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
      select: { name: true, email: true },
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
