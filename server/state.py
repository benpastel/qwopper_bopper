from enum import Enum
import asyncio

from server.fighter import Fighter


class Player(str, Enum):
    RED = "red"
    BLUE = "blue"


def other_player(p: Player) -> Player:
    return Player.RED if p == Player.BLUE else Player.BLUE


class State:
    fighters: dict[Player, Fighter]

    scores: dict[Player, int]

    # striking player => set of points in global coordinates that took damage
    # added during physics collision
    # read & reset to empty when broadcasting state at end of frame
    hits_this_frame: dict[Player, set[tuple[int, int]]]

    # player -> key pressed down this frame, if any
    # read & reset to None when the keypress is used to update velocities
    keydowns_this_frame: dict[Player, str | None]

    # a persistent reference to each keydown callback so they don't get
    # garbage collected until the game is over
    keydown_listeners: dict[Player, asyncio.Task]

    def __init__(self):
        self.fighters = {}
        self.scores = {player: 0 for player in Player}
        self.hits_this_frame = {player: set() for player in Player}
        self.keydowns_this_frame = {player: None for player in Player}
        self.keydown_listeners = {}
