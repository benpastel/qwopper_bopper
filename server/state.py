from enum import Enum
import asyncio

import pymunk  # type: ignore

from server.fighter import Fighter


class Player(str, Enum):
    RED = "red"
    BLUE = "blue"


def other_player(p: Player) -> Player:
    return Player.RED if p == Player.BLUE else Player.BLUE


class State:
    fighters: dict[Player, Fighter]

    scores: dict[Player, int]

    # points in global coordinates that took damage this frame
    # added during physics collision
    # read & reset to empty when broadcasting state at end of frame
    damage_points_this_frame: set[pymunk.vec2d.Vec2d]

    # player -> key pressed down this frame, if any
    # read & reset to None when the keypress is used to update velocities
    keydowns_this_frame: dict[Player, str | None]

    # a persistent reference to each keydown callback so they don't get
    # garbage collected until the game is over
    keydown_listeners: dict[Player, asyncio.Task]

    def __init__(self):
        self.fighters = {}
        self.scores = {player: 0 for player in Player}
        self.damage_points_this_frame = set()
        self.keydowns_this_frame = {player: None for player in Player}
        self.keydown_listeners = {}
