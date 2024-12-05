from time import time
import json
from websockets.server import WebSocketServerProtocol
from typing import Any, Callable
import random

import asyncio

import pymunk  # type: ignore

from server.fighter import (
    add_fighter,
    TAKE_DAMAGE_COLLISION_TYPE,
    DEAL_DAMAGE_COLLISION_TYPE,
    Fighter,
)
from server.state import State, Player, other_player


WIDTH = 1700
HEIGHT = 1200
FPS = 60
IMPULSE = 10000
GRAVITY = 1000
STEPS_PER_FRAME = 10

RED_START_POSITION = (300, 400)
BLUE_START_POSITION = (WIDTH - 300, 400)

WALL_GROUP = 1
RED_GROUP = 2
BLUE_GROUP = 3

DETACH_LIMB_SCORE = 1000


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

    # QW: open / close thighs
    # OP: open / close calves
    # ER: open / close arms
    #
    # in local coordinate to the limb:
    # negative x impulse causes counterclockwise rotation
    # positive x impulse causes clockwise rotation
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

    neg_limb = fighter.limbs[neg]
    pos_limb = fighter.limbs[pos]

    # apply impulses if the limb is still attached via joint
    if neg_limb.joint:
        neg_limb.body.apply_impulse_at_local_point((-IMPULSE, 0), (0, 0))
    if pos_limb.joint:
        pos_limb.body.apply_impulse_at_local_point((IMPULSE, 0), (0, 0))


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


def _detach_limb(fighter: Fighter, space: pymunk.Space) -> None:
    """
    Detach a random limb from player's torso
    by removing joint.

    First arms or calves, then thighs, then head.
    """

    first_names = ["larm", "rarm", "lcalf", "rcalf"]
    second_names = ["lthigh", "rthigh"]
    third_names = ["head"]

    first_candidates = [
        fighter.limbs[name] for name in first_names if fighter.limbs[name].joint
    ]
    second_candidates = [
        fighter.limbs[name] for name in second_names if fighter.limbs[name].joint
    ]
    third_candidates = [
        fighter.limbs[name] for name in third_names if fighter.limbs[name].joint
    ]

    if first_candidates:
        target = random.choice(first_candidates)
    elif second_candidates:
        target = random.choice(second_candidates)
    elif third_candidates:
        target = random.choice(third_candidates)
    else:
        # all limbs already removed
        return

    space.remove(target.joint, target.spring)
    target.joint = None
    target.spring = None
    if target.rotary_limit:
        space.remove(target.rotary_limit)
        target.rotary_limit = None


def deal_damage_callback(state: State) -> Callable:
    """
    Returns a function for dealing damage to one player, with
    the state in the closure scope.
    """

    def deal_damage(arbiter: pymunk.Arbiter, space: pymunk.Space, data: dict) -> bool:
        shape_a, shape_b = arbiter.shapes

        # figure out which player took the damage
        receiving_player: Player | None = None
        a_is_hit: bool | None = None
        for player, fighter in state.fighters.items():
            if shape_a in fighter.take_damage_shapes():
                receiving_player = player
                a_is_hit = True
            elif shape_b in fighter.take_damage_shapes():
                receiving_player = player
                a_is_hit = False

        if not receiving_player:
            # nobody was hit
            return True

        assert a_is_hit is not None
        dealing_player = other_player(receiving_player)

        state.scores[dealing_player] += 1
        if (state.scores[dealing_player] % DETACH_LIMB_SCORE) == 0:
            receiving_fighter = state.fighters[receiving_player]
            _detach_limb(receiving_fighter, space)

        for point in arbiter.contact_point_set.points:
            hit_point = point.point_a if a_is_hit else point.point_b
            state.hits_this_frame[dealing_player].add(hit_point)
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

    state.fighters[Player.RED] = add_fighter(space, RED_GROUP, RED_START_POSITION)
    state.fighters[Player.BLUE] = add_fighter(space, BLUE_GROUP, BLUE_START_POSITION)
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

        # update each player's fighters based on their keypressed
        for player in Player:
            _apply_keypress(player, state)

        # advance physics
        for _ in range(STEPS_PER_FRAME):
            space.step(1.0 / (FPS * STEPS_PER_FRAME))

        await _broadcast_state(websockets, state)
