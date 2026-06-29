"""
Pure scoring logic — no DB dependencies, fully unit-testable.

match argument must expose:
  .stage         — e.g. "GROUP_STAGE", "LAST_32", ...
  .status        — e.g. "FINISHED", "IN_PLAY", ...
  .winner        — "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | None
  .home_team_id  — int
  .away_team_id  — int
"""

_KNOCKOUT_POINTS: dict[str, int] = {
    "LAST_32": 5,
    "LAST_16": 8,
    "QUARTER_FINALS": 11,
    "SEMI_FINALS": 14,
    "FINAL": 20,
}


def score_match_for_team(match, team_id: int) -> int:
    """Return the points awarded to team_id for a single match."""
    if match.status != "FINISHED":
        return 0

    is_home = match.home_team_id == team_id
    is_away = match.away_team_id == team_id

    if not is_home and not is_away:
        return 0

    team_won = (
        (is_home and match.winner == "HOME_TEAM")
        or (is_away and match.winner == "AWAY_TEAM")
    )

    if match.stage == "GROUP_STAGE":
        if match.winner == "DRAW":
            return 1
        return 3 if team_won else 0

    if match.stage == "THIRD_PLACE":
        return -5 if team_won else -10

    # All other knockout rounds
    if team_won:
        return _KNOCKOUT_POINTS.get(match.stage, 0)
    return 0
