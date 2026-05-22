// Authorization / data-scope helper.
//
// Turns a user's panel-controlled configuration (position + dataScope + area /
// team / GHL identity) into a *safe backend filter descriptor*. The descriptor
// is intentionally declarative: the dashboard data pipeline (a later phase)
// reads it and translates it into a concrete query filter. This file owns the
// access rule; query layers must not re-derive it.
//
// FAIL-CLOSED CONTRACT (do not weaken):
//   - A SETTER or CLOSER on OWN scope with no ghlUserId resolves to `deny`.
//   - CUSTOM scope is `deny` until bespoke rules exist.
//   - Anything unrecognized resolves to `deny`.
// Denial means "no data", never "all data".
//
// Future rule encoded by the descriptor (explicit on purpose):
//   Admin / ALL          => all data
//   Director / AREA      => records in user's areaId
//   Director / TEAM      => records in user's teamId
//   Closer  / OWN        => ghlCloserUserId OR assigned GHL user id == ghlUserId
//   Setter  / OWN        => ghlSetterUserId OR created-by GHL user id == ghlUserId
//   Missing GHL for own-scoped setter/closer => deny / no data

import type { DataScope, OperationalPosition } from "@prisma/client";

// GHL attribution fields a record may carry, matched against the user's
// ghlUserId. Named here so the future query layer and this helper agree.
export const CLOSER_MATCH_FIELDS = ["ghlCloserUserId", "ghlAssignedUserId"] as const;
export const SETTER_MATCH_FIELDS = ["ghlSetterUserId", "ghlCreatedByUserId"] as const;

export interface ScopeUser {
  position: OperationalPosition;
  dataScope: DataScope;
  areaId?: string | null;
  teamId?: string | null;
  ghlUserId?: string | null;
}

export type DataScopeFilter =
  | { kind: "all" }
  | { kind: "area"; areaId: string }
  | { kind: "team"; teamId: string }
  | {
      kind: "own";
      attribution: "closer" | "setter" | "generic";
      ghlUserId: string;
      // OR-matched: a record is in scope if any of these equals ghlUserId.
      matchFields: readonly string[];
    }
  | { kind: "none"; reason: string };

function deny(reason: string): DataScopeFilter {
  return { kind: "none", reason };
}

function ownMatchFields(position: OperationalPosition): {
  attribution: "closer" | "setter" | "generic";
  matchFields: readonly string[];
} {
  if (position === "CLOSER") return { attribution: "closer", matchFields: CLOSER_MATCH_FIELDS };
  if (position === "SETTER") return { attribution: "setter", matchFields: SETTER_MATCH_FIELDS };
  // Director/Viewer on OWN still attribute to their own GHL id across both sides.
  return {
    attribution: "generic",
    matchFields: [...CLOSER_MATCH_FIELDS, ...SETTER_MATCH_FIELDS],
  };
}

/**
 * Resolve a user's effective backend data filter. Always returns a descriptor;
 * an unconfigured or under-configured user resolves to `{ kind: "none" }` so
 * callers fail closed.
 */
export function resolveDataScope(user: ScopeUser): DataScopeFilter {
  // Admin always sees everything, regardless of the stored scope.
  if (user.position === "ADMIN") return { kind: "all" };

  switch (user.dataScope) {
    case "ALL":
      return { kind: "all" };

    case "AREA": {
      const areaId = user.areaId?.trim();
      if (!areaId) return deny("area-scope-missing-area");
      return { kind: "area", areaId };
    }

    case "TEAM": {
      const teamId = user.teamId?.trim();
      if (!teamId) return deny("team-scope-missing-team");
      return { kind: "team", teamId };
    }

    case "OWN": {
      const ghlUserId = user.ghlUserId?.trim();
      if (!ghlUserId) {
        // Fail closed: own-scoped users with no GHL identity get no data.
        if (user.position === "CLOSER") return deny("closer-own-missing-ghl");
        if (user.position === "SETTER") return deny("setter-own-missing-ghl");
        return deny("own-scope-missing-ghl");
      }
      const { attribution, matchFields } = ownMatchFields(user.position);
      return { kind: "own", attribution, ghlUserId, matchFields };
    }

    case "CUSTOM":
      // Bespoke rules are not configured in this phase: deny by design.
      return deny("custom-scope-not-configured");

    default:
      return deny("unknown-scope");
  }
}

/** Convenience predicate: does this descriptor grant any data at all? */
export function grantsData(filter: DataScopeFilter): boolean {
  return filter.kind !== "none";
}
