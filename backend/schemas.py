from pydantic import BaseModel
from typing import Optional


class TeamOut(BaseModel):
    id: int
    name: str
    group: Optional[str]
    crest_url: Optional[str]

    model_config = {"from_attributes": True}


class PlayerOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class PickOut(BaseModel):
    pick_number: int
    player_id: int
    team_id: int

    model_config = {"from_attributes": True}


class SessionOut(BaseModel):
    token: str
    status: str
    players: list[PlayerOut]
    picks: list[PickOut]
    current_pick_index: int
    current_player_id: Optional[int]

    model_config = {"from_attributes": True}


class CreateSessionResponse(BaseModel):
    invite_url: str
    admin_url: str
    token: str
    admin_token: str


class JoinRequest(BaseModel):
    name: str


class PickRequest(BaseModel):
    player_id: int
    team_id: int
    admin_token: Optional[str] = None
