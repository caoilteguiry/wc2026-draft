from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, JSON, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base

STAGE_ORDER = [
    "GROUP_STAGE",
    "LAST_32",
    "LAST_16",
    "QUARTER_FINALS",
    "SEMI_FINALS",
    "THIRD_PLACE",
    "FINAL",
]


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    group = Column(String)
    crest_url = Column(String)
    external_id = Column(Integer, unique=True)


class DraftSession(Base):
    __tablename__ = "draft_sessions"

    id = Column(Integer, primary_key=True)
    token = Column(String, unique=True, nullable=False)
    admin_token = Column(String, unique=True, nullable=False)
    status = Column(String, default="waiting")  # waiting | drafting | complete
    draft_order = Column(JSON)  # ordered list of player ids for snake draft
    current_pick_index = Column(Integer, default=0)
    pick_started_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    players = relationship("Player", back_populates="session")
    picks = relationship("Pick", back_populates="session")


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    session_id = Column(Integer, ForeignKey("draft_sessions.id"), nullable=False)

    session = relationship("DraftSession", back_populates="players")
    picks = relationship("Pick", back_populates="player")

    __table_args__ = (UniqueConstraint("session_id", "name"),)


class Pick(Base):
    __tablename__ = "picks"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("draft_sessions.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    pick_number = Column(Integer, nullable=False)

    session = relationship("DraftSession", back_populates="picks")
    player = relationship("Player", back_populates="picks")
    team = relationship("Team")

    __table_args__ = (
        UniqueConstraint("session_id", "team_id"),
        UniqueConstraint("session_id", "pick_number"),
    )


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True)
    external_id = Column(Integer, unique=True, nullable=False)
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)
    # HOME_TEAM / AWAY_TEAM / DRAW / null — reflects penalty shootout outcomes
    winner = Column(String, nullable=True)
    stage = Column(String, nullable=False)
    matchday = Column(Integer, nullable=True)
    status = Column(String, nullable=False)  # SCHEDULED / IN_PLAY / FINISHED / POSTPONED
    utc_date = Column(DateTime, nullable=False)

    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
