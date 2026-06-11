"""Pure unit tests for scoring.py — no DB required."""
from types import SimpleNamespace

import pytest

from scoring import score_match_for_team


def make_match(stage, status="FINISHED", winner=None, home_team_id=1, away_team_id=2):
    return SimpleNamespace(
        stage=stage,
        status=status,
        winner=winner,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
    )


# ---------------------------------------------------------------------------
# Group Stage
# ---------------------------------------------------------------------------

def test_group_stage_home_win():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="HOME_TEAM"), 1) == 3


def test_group_stage_away_win():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="AWAY_TEAM"), 2) == 3


def test_group_stage_home_loss():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="AWAY_TEAM"), 1) == 0


def test_group_stage_away_loss():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="HOME_TEAM"), 2) == 0


def test_group_stage_draw_home():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="DRAW"), 1) == 1


def test_group_stage_draw_away():
    assert score_match_for_team(make_match("GROUP_STAGE", winner="DRAW"), 2) == 1


# ---------------------------------------------------------------------------
# Knockout rounds — wins
# ---------------------------------------------------------------------------

def test_round_of_32_win():
    assert score_match_for_team(make_match("ROUND_OF_32", winner="HOME_TEAM"), 1) == 5


def test_round_of_16_win():
    assert score_match_for_team(make_match("ROUND_OF_16", winner="HOME_TEAM"), 1) == 8


def test_quarter_finals_win():
    assert score_match_for_team(make_match("QUARTER_FINALS", winner="HOME_TEAM"), 1) == 11


def test_semi_finals_win():
    assert score_match_for_team(make_match("SEMI_FINALS", winner="HOME_TEAM"), 1) == 14


def test_final_win():
    assert score_match_for_team(make_match("FINAL", winner="HOME_TEAM"), 1) == 20


# ---------------------------------------------------------------------------
# Knockout rounds — losses = 0
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("stage", ["ROUND_OF_32", "ROUND_OF_16", "QUARTER_FINALS", "SEMI_FINALS", "FINAL"])
def test_knockout_loss_returns_zero(stage):
    assert score_match_for_team(make_match(stage, winner="AWAY_TEAM"), 1) == 0


# ---------------------------------------------------------------------------
# 3rd place play-off
# ---------------------------------------------------------------------------

def test_third_place_winner():
    assert score_match_for_team(make_match("THIRD_PLACE", winner="HOME_TEAM"), 1) == -5


def test_third_place_loser():
    assert score_match_for_team(make_match("THIRD_PLACE", winner="HOME_TEAM"), 2) == -10


def test_third_place_away_winner():
    assert score_match_for_team(make_match("THIRD_PLACE", winner="AWAY_TEAM"), 2) == -5


def test_third_place_away_loser():
    assert score_match_for_team(make_match("THIRD_PLACE", winner="AWAY_TEAM"), 1) == -10


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("status", ["SCHEDULED", "TIMED", "IN_PLAY", "POSTPONED"])
def test_unfinished_match_returns_zero(status):
    match = make_match("GROUP_STAGE", status=status, winner=None)
    assert score_match_for_team(match, 1) == 0


def test_team_not_in_match_returns_zero():
    match = make_match("GROUP_STAGE", winner="HOME_TEAM")
    assert score_match_for_team(match, 99) == 0


def test_winner_null_finished_returns_zero():
    """Defensive: FINISHED match with no winner recorded yet."""
    match = make_match("GROUP_STAGE", status="FINISHED", winner=None)
    assert score_match_for_team(match, 1) == 0
