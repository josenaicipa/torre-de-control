export function normalizeAreaForSelectedTeam(
  selectedAreaId: string | null,
  selectedTeamAreaId: string | null,
): string | null {
  if (!selectedTeamAreaId) return selectedAreaId;
  return selectedTeamAreaId;
}
