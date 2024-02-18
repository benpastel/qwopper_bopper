from time import time
import json
from enum import Enum
from websockets.server import WebSocketServerProtocol

import asyncio

import pymunk  # type: ignore

from server.fighter import Fighter, add_fighter


class Player(str, Enum):
    RED = "red"
    BLUE = "blue"


def other_player(p: Player) -> Player:
    return Player.RED if p == Player.BLUE else Player.BLUE


WIDTH = 1600
HEIGHT = 800
FPS = 60
IMPULSE = 1000
GRAVITY = 500
STEPS_PER_FRAME = 10

WALL_GROUP = 1
RED_GROUP = 2
BLUE_GROUP = 3

# player -> last key pressed down this turn, if any
LAST_KEYDOWNS: dict[Player, str | None] = {player: None for player in Player}

FIGHTERS: dict[Player, Fighter] = {}  # TODO

# a persistent reference to each keydown listener so they don't get
# garbage collected
KEYDOWN_LISTENERS: dict[Player, asyncio.Task] = {}


async def _listen_for_keydown(
    player: Player, websocket: WebSocketServerProtocol
) -> None:
    """
    Listen for keydown and write it to `LAST_KEYDOWNS`.

    We'll use the most recent one per player when it's time for the next position.
    """
    while True:
        message = await websocket.recv()
        event = json.loads(message)

        if "keydown" in event:
            LAST_KEYDOWNS[player] = event["keydown"]


def _apply_keypress(player: Player) -> None:
    """
    Read the last keydown & reset it to None
    Adjust the motor rates based on the keydown
    """

    fighter = FIGHTERS[player]
    keydown = LAST_KEYDOWNS[player]
    LAST_KEYDOWNS[player] = None  # reset last keydown
    lmotor = fighter.lleg_motor
    rmotor = fighter.rleg_motor

    # decay prexisting motor rates toward 0
    for motor in [lmotor, rmotor]:
        if motor.rate > 0:
            motor.rate -= 1
        if motor.rate < 0:
            motor.rate += 1

    # update based on keydown
    if keydown and keydown.lower() == "q":
        # open legs
        lmotor.rate = -10
        rmotor.rate = 10
    elif keydown and keydown.lower() == "w":
        # close legs
        lmotor.rate = 10
        rmotor.rate = -10


def _add_walls(space: pymunk.Space) -> None:
    walls: list[pymunk.Shape] = [
        pymunk.Segment(space.static_body, (-10, -10), (-10, HEIGHT + 10), 10),
        pymunk.Segment(space.static_body, (-10, -10), (WIDTH + 10, -10), 10),
        pymunk.Segment(
            space.static_body, (WIDTH + 10, -10), (WIDTH + 10, HEIGHT + 10), 10
        ),
        pymunk.Segment(
            space.static_body, (-10, HEIGHT + 10), (WIDTH + 10, HEIGHT + 10), 10
        ),
    ]
    for w in walls:
        w.friction = 0.5
        w.group = WALL_GROUP
        w.elasticity = 0.5

    space.add(*walls)


async def _broadcast_positions(
    websockets: dict[Player, WebSocketServerProtocol]
) -> None:
    """
    Send the position of each fighter to each player.
    """
    event = {
        player.value: fighter.position_json() for player, fighter in FIGHTERS.items()
    }
    async with asyncio.TaskGroup() as tg:
        for websocket in websockets.values():
            message = json.dumps(event)
            coroutine = websocket.send(message)
            tg.create_task(coroutine)


def _keydown_exception_handler(task: asyncio.Task) -> None:
    try:
        exception = task.exception()
        if exception:
            raise exception
    except asyncio.CancelledError:
        pass


async def play_game(websockets: dict[Player, WebSocketServerProtocol]) -> None:
    # listen for keypresses in background tasks
    for player in Player:
        websocket = websockets[player]
        task = asyncio.create_task(_listen_for_keydown(player, websocket))
        task.add_done_callback(_keydown_exception_handler)
        KEYDOWN_LISTENERS[player] = task

    space = pymunk.Space()
    space.gravity = 0, GRAVITY
    space.add_default_collision_handler()
    _add_walls(space)

    FIGHTERS[Player.RED] = add_fighter(space, RED_GROUP, (100, 100))
    FIGHTERS[Player.BLUE] = add_fighter(space, BLUE_GROUP, (WIDTH - 100, 100))

    last_frame = time()
    while True:
        # sleep until it's time to for the next frame
        next_frame = last_frame + 1 / FPS
        await asyncio.sleep(next_frame - time())
        last_frame = next_frame

        # update each player's motors based on their keypressed
        for player in Player:
            _apply_keypress(player)

        # advance physics
        for _ in range(STEPS_PER_FRAME):
            space.step(1.0 / (FPS * STEPS_PER_FRAME))

        await _broadcast_positions(websockets)
