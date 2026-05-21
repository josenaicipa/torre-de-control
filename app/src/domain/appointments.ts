// Pure appointment-metric domain logic, ported from the Python sync.
//
// SOURCE-OF-TRUTH RULE (do not weaken):
// GHL is the source of truth for show-up status. Any lead whose status is in
// SHOWED_LEAD_STATUSES counts as a showed appointment regardless of whether its
// startTime is in the past or the future, or even missing. Corrections happen in
// GHL, not here. Non-showed statuses are booked but do not count as show-ups.

export const SHOWED_LEAD_STATUSES = [
  "showed",
  "show",
  "show_up",
  "showup",
] as const;

const SHOWED_SET = new Set<string>(SHOWED_LEAD_STATUSES);

export interface AppointmentLead {
  contactId?: string | null;
  email?: string | null;
  status?: string | null;
  startTime?: string | null;
  /** Low-ticket leads are excluded from these high-ticket metrics. */
  isLowTicket?: boolean;
}

export interface DayMetrics {
  /** Unique high-ticket appointments booked for the day. */
  booked: number;
  /** Subset of `booked` that GHL marks as showed. */
  showed: number;
}

export function isShowedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return SHOWED_SET.has(status.trim().toLowerCase());
}

function dedupeKey(lead: AppointmentLead, index: number): string {
  const cid = typeof lead.contactId === "string" ? lead.contactId.trim() : "";
  if (cid) return `c:${cid}`;
  const email = (lead.email ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  // Anonymous row: keep it, but make the dedupe key unique per row.
  return `r:${index}`;
}

// Counts booked + showed for one day's leads. Dedupes by contactId, then email,
// then row index (matching the Python `appointment_unique_contacts` behavior).
export function buildDayMetrics(leads: AppointmentLead[]): DayMetrics {
  const metrics: DayMetrics = { booked: 0, showed: 0 };
  if (!Array.isArray(leads)) return metrics;

  const seen = new Set<string>();
  leads.forEach((lead, index) => {
    if (!lead || typeof lead !== "object") return;
    if (lead.isLowTicket) return;

    const key = dedupeKey(lead, index);
    if (seen.has(key)) return;
    seen.add(key);

    metrics.booked += 1;
    if (isShowedStatus(lead.status)) {
      metrics.showed += 1;
    }
  });

  return metrics;
}

// Deterministic local date key (YYYY-MM-DD) for an ISO timestamp in a given IANA
// timezone. Used to bucket appointments by their scheduled-for local day so that
// "today/agenda" calculations don't drift with the server's timezone.
export function localDateKey(
  iso: string,
  timeZone: string = "America/Bogota",
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // en-CA yields YYYY-MM-DD
}
