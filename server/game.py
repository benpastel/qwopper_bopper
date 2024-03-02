from time import time
import json
from websockets.server import WebSocketServerProtocol
from typing import Any, Callable

import asyncio

import pymunk  # type: ignore

from server.fighter import (
    add_fighter,
    TAKE_DAMAGE_COLLISION_TYPE,
    DEAL_DAMAGE_COLLISION_TYPE,
)
from server.state import State, Player, other_player


WIDTH = 1600
HEIGHT = 800
FPS = 60
IMPULSE = 1000
GRAVITY = 1000
STEPS_PER_FRAME = 10

WALL_GROUP = 1
RED_GROUP = 2
BLUE_GROUP = 3


async def _listen_for_keydown(
    player: Player, state: State, websocket: WebSocketServerProtocol
) -> None:
    """
    Listen for keydown and write it to `LAST_KEYDOWNS`.

    We'll use the most recent one per player when it's time for the next position.
    """
    while True:
        message = await websocket.recv()
        event = json.loads(message)

        if "keydown" in event:
            state.keydowns_this_frame[player] = event["keydown"]


def _apply_keypress(player: Player, state: State) -> None:
    """
    Read the last keydown & reset it to None
    Adjust the motor rates based on the keydown
    """
    fighter = state.fighters[player]
    keydown = state.keydowns_this_frame[player]
    state.keydowns_this_frame[player] = None  # reset the keydown

    if keydown:
        keydown = keydown.lower()

    # decay prexisting motor rates toward 0
    # for motor in fighter.motors():
    #     if motor.rate > 0:
    #         motor.rate -= 1
    #     if motor.rate < 0:
    #         motor.rate += 1

    # QW: open / close thighs
    # OP: open / close calves
    # ER: open / close arms
    #
    # negative motor rate means clockwise rotation
    # positive motor rate means counterclockwise rotation
    if keydown == "q":
        # open thighs
        neg, pos = "lthigh", "rthigh"
    elif keydown == "w":
        # close thighs
        neg, pos = "rthigh", "lthigh"
    elif keydown == "o":
        # open calves
        neg, pos = "lcalf", "rcalf"
    elif keydown == "p":
        # close calves
        neg, pos = "rcalf", "lcalf"
    elif keydown == "e":
        # open arms
        neg, pos = "rarm", "larm"
    elif keydown == "r":
        # close arms
        neg, pos = "larm", "rarm"
    else:
        return

    fighter.limbs[pos].body.apply_impulse_at_local_point((-10000, 10000), (0, 0))
    fighter.limbs[neg].body.apply_impulse_at_local_point((10000, -10000), (0, 0))


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
        w.friction = 0.9
        w.group = WALL_GROUP
        w.elasticity = 0.05

    space.add(*walls)


async def _broadcast_state(
    websockets: dict[Player, WebSocketServerProtocol], state: State
) -> None:
    """
    Send the position of each fighter to each player and the list of damage
    """
    # read & reset damage points
    hits_this_frame = state.hits_this_frame
    state.hits_this_frame = {player: set() for player in Player}

    event: dict[str, dict[str, Any]] = {}

    event["positions"] = {
        player.value: fighter.position_json()
        for player, fighter in state.fighters.items()
    }
    event["hits"] = {
        player.value: [{"x": x, "y": y} for x, y in points]
        for player, points in hits_this_frame.items()
    }
    event["scores"] = {player.value: state.scores[player] for player in Player}

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


def deal_damage_callback(state: State) -> Callable:
    """
    Returns a function for dealing damage to one player, with
    the state in the closure scope.
    """

    def deal_damage(arbiter: pymunk.Arbiter, space: pymunk.Space, data: dict) -> bool:
        shape_a, shape_b = arbiter.shapes

        # figure out which player took the damage
        receiving_player: Player | None = None
        for player, fighter in state.fighters.items():
            if shape_a in fighter.take_damage_shapes():
                receiving_player = player
        assert receiving_player
        dealing_player = other_player(receiving_player)

        state.scores[dealing_player] += 1

        for point in arbiter.contact_point_set.points:
            state.hits_this_frame[dealing_player].add(point.point_a)
        return True

    return deal_damage


async def play_game(websockets: dict[Player, WebSocketServerProtocol]) -> None:
    state = State()

    # listen for keypresses in background tasks
    # keep a reference until state is garbage-collected
    for player in Player:
        websocket = websockets[player]
        task = asyncio.create_task(_listen_for_keydown(player, state, websocket))
        task.add_done_callback(_keydown_exception_handler)
        state.keydown_listeners[player] = task

    space = pymunk.Space()
    space.gravity = 0, GRAVITY
    space.add_default_collision_handler()
    _add_walls(space)

    state.fighters[Player.RED] = add_fighter(space, RED_GROUP, (100, 100))
    state.fighters[Player.BLUE] = add_fighter(space, BLUE_GROUP, (WIDTH - 100, 100))
    damage_handler = space.add_collision_handler(
        TAKE_DAMAGE_COLLISION_TYPE, DEAL_DAMAGE_COLLISION_TYPE
    )
    damage_handler.post_solve = deal_damage_callback(state)

    last_frame = time()
    while True:
        # sleep until it's time to for the next frame
        next_frame = last_frame + 1 / FPS
        await asyncio.sleep(next_frame - time())
        last_frame = next_frame

        # update each player's motors based on their keypressed
        for player in Player:
            _apply_keypress(player, state)

        # advance physics
        for _ in range(STEPS_PER_FRAME):
            space.step(1.0 / (FPS * STEPS_PER_FRAME))

        await _broadcast_state(websockets, state)
