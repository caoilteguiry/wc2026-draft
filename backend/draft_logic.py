"""
Snake draft ordering logic.

With 4 players and 12 rounds (48 total picks):
  Even rounds (0, 2, 4, ...): draft_order[0..3]
  Odd rounds  (1, 3, 5, ...): draft_order[3..0] (reversed)
"""

NUM_PLAYERS = 4
TOTAL_PICKS = 48  # 4 players × 12 teams


def get_current_player_id(draft_order: list[int], pick_index: int) -> int | None:
    if pick_index >= TOTAL_PICKS:
        return None
    round_num = pick_index // NUM_PLAYERS
    position = pick_index % NUM_PLAYERS
    if round_num % 2 == 0:
        return draft_order[position]
    else:
        return draft_order[NUM_PLAYERS - 1 - position]
