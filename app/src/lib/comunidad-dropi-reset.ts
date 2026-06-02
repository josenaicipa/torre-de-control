/**
 * Core, side-effect-free building blocks for the Comunidad Dropi data reset.
 *
 * The deletion order matters: child rows that hold required foreign keys are
 * removed before their parents so a reset never trips a constraint mid-way.
 * Audit/follow-up/weekly/monthly all hang off a member; importBatch is only
 * referenced by weekly/monthly via SetNull, so it is cleared after those and
 * before the members themselves.
 */

export const RESET_CONFIRM_PHRASE = "BORRAR SOLO COMUNIDAD DROPI";

export const RESET_TABLE_ORDER = [
  "DropiStudentLinkAudit",
  "DropiFollowUp",
  "DropiWeeklyMetric",
  "DropiMonthlyMetric",
  "DropiImportBatch",
  "DropiCommunityMember",
] as const;

export type ResetTableName = (typeof RESET_TABLE_ORDER)[number];

const DELEGATE_BY_TABLE: Record<ResetTableName, keyof ResetClient> = {
  DropiStudentLinkAudit: "dropiStudentLinkAudit",
  DropiFollowUp: "dropiFollowUp",
  DropiWeeklyMetric: "dropiWeeklyMetric",
  DropiMonthlyMetric: "dropiMonthlyMetric",
  DropiImportBatch: "dropiImportBatch",
  DropiCommunityMember: "dropiCommunityMember",
};

interface ResetDelegate {
  count(args?: unknown): Promise<number>;
  findMany(args?: unknown): Promise<unknown[]>;
  deleteMany(args?: unknown): Promise<{ count: number }>;
}

/**
 * Structural shape satisfied by both the Prisma client and a transaction
 * client. Only the six Dropi delegates this reset touches are required, which
 * keeps unit tests free of a full Prisma mock.
 */
export interface ResetClient {
  dropiStudentLinkAudit: ResetDelegate;
  dropiFollowUp: ResetDelegate;
  dropiWeeklyMetric: ResetDelegate;
  dropiMonthlyMetric: ResetDelegate;
  dropiImportBatch: ResetDelegate;
  dropiCommunityMember: ResetDelegate;
}

export type ResetCounts = Record<ResetTableName, number>;

export interface BackupSummary {
  performed: boolean;
  totalRows: number;
  tables: ResetCounts;
  file?: string;
}

export interface BackupResult {
  data: Record<ResetTableName, unknown[]>;
  summary: BackupSummary;
}

function emptyCounts(): ResetCounts {
  return Object.fromEntries(
    RESET_TABLE_ORDER.map((table) => [table, 0]),
  ) as ResetCounts;
}

export async function countResetTables(client: ResetClient): Promise<ResetCounts> {
  const entries = await Promise.all(
    RESET_TABLE_ORDER.map(
      async (table) =>
        [table, await client[DELEGATE_BY_TABLE[table]].count()] as const,
    ),
  );
  return Object.fromEntries(entries) as ResetCounts;
}

export async function backupResetTables(client: ResetClient): Promise<BackupResult> {
  const data = {} as Record<ResetTableName, unknown[]>;
  const tables = emptyCounts();
  let totalRows = 0;

  for (const table of RESET_TABLE_ORDER) {
    const rows = await client[DELEGATE_BY_TABLE[table]].findMany();
    data[table] = rows;
    tables[table] = rows.length;
    totalRows += rows.length;
  }

  return { data, summary: { performed: true, totalRows, tables } };
}

/**
 * Deletes the six Dropi tables in the safe order. Pass a transaction client so
 * the whole reset is atomic.
 */
export async function deleteResetTables(tx: ResetClient): Promise<ResetCounts> {
  const deleted = emptyCounts();
  for (const table of RESET_TABLE_ORDER) {
    const res = await tx[DELEGATE_BY_TABLE[table]].deleteMany();
    deleted[table] = res.count;
  }
  return deleted;
}

export function isConfirmPhraseValid(phrase: string | undefined): boolean {
  return phrase === RESET_CONFIRM_PHRASE;
}
