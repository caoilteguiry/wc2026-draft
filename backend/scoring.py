"""
Pure scoring logic — no DB dependencies, fully unit-testable.

match argument must expose:
  .stage         — e.g. "GROUP_STAGE", "LAST_32", ...
  .status        — e.g. "FINISHED", "IN_PLAY", ...
  .winner        — "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | None
  .home_team_id  — int
  .away_team_id  — int
"""

CATEGORY_POINTS: dict[str, int] = {
    "gw": 3,
    "gd": 1,
    "gl": 0,
    "last32w": 5,
    "last16w": 8,
    "qfw": 11,
    "sfw": 14,
    "third": -5,
    "fourth": -10,
    "fw": 20,
}


def score_match_for_team(match, team_id: int) -> int:
    """Return the points awarded to team_id for a single match."""
    bd = breakdown_match_for_team(match, team_id)
    return sum(CATEGORY_POINTS[k] * v for k, v in bd.items())


def breakdown_match_for_team(match, team_id: int) -> dict:
    """Return a dict of {category: count} for a single match. All values are 0 or 1.
    Categories: gw, gd, gl, last32w, last16w, qfw, sfw, third, fourth, fw."""
    zero = {k: 0 for k in ("gw", "gd", "gl", "last32w", "last16w", "qfw", "sfw", "third", "fourth", "fw")}

    if match.status != "FINISHED":
        return zero

    is_home = match.home_team_id == team_id
    is_away = match.away_team_id == team_id
    if not is_home and not is_away:
        return zero

    team_won = (is_home and match.winner == "HOME_TEAM") or (is_away and match.winner == "AWAY_TEAM")

    if match.stage == "GROUP_STAGE":
        if match.winner == "DRAW":
            return {**zero, "gd": 1}
        return {**zero, "gw": 1} if team_won else {**zero, "gl": 1}

    if match.stage == "THIRD_PLACE":
        return {**zero, "third": 1} if team_won else {**zero, "fourth": 1}

    knockout_key = {
        "LAST_32": "last32w",
        "LAST_16": "last16w",
        "QUARTER_FINALS": "qfw",
        "SEMI_FINALS": "sfw",
        "FINAL": "fw",
    }.get(match.stage)

    if team_won and knockout_key:
        return {**zero, knockout_key: 1}
    return zero
