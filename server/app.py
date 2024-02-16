#!/usr/bin/env python3

import asyncio
import json
import os
import signal
from time import time

import pymunk  # type: ignore
from websockets.server import WebSocketServerProtocol, serve


WIDTH = 800
HEIGHT = 600
FPS = 60
IMPULSE = 1000
GRAVITY = 500
STEPS_PER_FRAME = 10
TORSO_SIZE = (164, 254)
LEG_SIZE = (60, 275)

WALL_GROUP = 1
BODY_GROUP = 2

# how many pixels from each edge
# are the torso & leg anchors?
LEG_JOINT_OFFSET = 30

LAST_KEYDOWN: None | str = None


async def listen_for_keydown(websocket: WebSocketServerProtocol) -> None:
    """Listen for keydown & keyup and update KEYS_DOWN"""
    global LAST_KEYDOWN
    while True:
        message = await websocket.recv()
        event = json.loads(message)

        if "keydown" in event:
            LAST_KEYDOWN = event["keydown"]


def apply_force_from_keypress(body: pymunk.Body, motor: pymunk.SimpleMotor) -> None:
    """
    Read the last keydown & reset it to None
    use it to apply a force to the body
    """

    # read & reset the last keydown
    global LAST_KEYDOWN
    keydown = LAST_KEYDOWN
    LAST_KEYDOWN = None

    impulse = (0, 0)

    if motor.rate > 0:
        motor.rate -= 1
    if motor.rate < 0:
        motor.rate += 1

    if keydown == "ArrowLeft":
        impulse = (-IMPULSE, 0)
    elif keydown == "ArrowRight":
        impulse = (IMPULSE, 0)
    elif keydown == "ArrowUp":
        impulse = (0, -IMPULSE)
    elif keydown == "ArrowDown":
        impulse = (0, IMPULSE)
    elif keydown and keydown.lower() == "q":
        motor.rate = -10
    elif keydown and keydown.lower() == "w":
        motor.rate = 10

    body.apply_impulse_at_local_point(impulse)


def add_walls(space: pymunk.Space) -> None:
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


async def handler(websocket: WebSocketServerProtocol) -> None:
    assert isinstance(websocket, WebSocketServerProtocol)
    task = asyncio.create_task(listen_for_keydown(websocket))

    def task_exception_handler(task: asyncio.Task):
        try:
            exception = task.exception()
            if exception:
                raise exception
        except asyncio.CancelledError:
            pass

    task.add_done_callback(task_exception_handler)

    space = pymunk.Space()
    space.gravity = 0, GRAVITY
    space.add_default_collision_handler()
    add_walls(space)

    torso = pymunk.Body(mass=10, moment=1000)
    torso.position = 100, 100
    torso.angle = 0

    rleg = pymunk.Body(mass=10, moment=500)
    rleg.position = 100, 100
    rleg.angle = 0

    torso_box = pymunk.Poly.create_box(torso, size=TORSO_SIZE)
    torso_box.group = BODY_GROUP
    torso_box.elasticity = 0.5

    rleg_box = pymunk.Poly.create_box(rleg, size=LEG_SIZE)
    rleg_box.group = BODY_GROUP
    rleg_box.elasticity = 0.5

    torso_box.filter = pymunk.ShapeFilter(group=BODY_GROUP)
    rleg_box.filter = pymunk.ShapeFilter(group=BODY_GROUP)

    torso_anchor = (
        TORSO_SIZE[0] / 2 - LEG_JOINT_OFFSET,
        TORSO_SIZE[1] / 2 - LEG_JOINT_OFFSET,
    )
    rleg_anchor = LEG_JOINT_OFFSET - LEG_SIZE[0] / 2, LEG_JOINT_OFFSET - LEG_SIZE[1] / 2
    joint = pymunk.PivotJoint(torso, rleg, torso_anchor, rleg_anchor)

    motor = pymunk.SimpleMotor(torso, rleg, rate=0)

    space.add(torso, torso_box, rleg, rleg_box, joint, motor)

    last_frame = time()
    while True:
        # sleep until it's time to for the next frame
        next_frame = last_frame + 1 / FPS
        await asyncio.sleep(next_frame - time())
        last_frame = next_frame

        apply_force_from_keypress(torso, motor)

        # step the position
        for _ in range(STEPS_PER_FRAME):
            space.step(1.0 / (FPS * STEPS_PER_FRAME))

        # read the new position
        torso_x, torso_y = torso.position
        rleg_x, rleg_y = rleg.position

        position = {
            "torso": {"x": torso_x, "y": torso_y, "angle": torso.angle},
            "rleg": {"x": rleg_x, "y": rleg_y, "angle": rleg.angle},
        }
        message = json.dumps(position)

        await websocket.send(message)


async def main() -> None:
    # heroku sends SIGTERM when shutting down a dyno; listen & exit gracefully
    loop = asyncio.get_running_loop()
    stop = loop.create_future()
    loop.add_signal_handler(signal.SIGTERM, stop.set_result, None)

    port = int(os.environ.get("PORT", "8001"))
    print(f"Serving websocket server on port {port}.")

    async with serve(handler, "", port):
        await stop


if __name__ == "__main__":
    asyncio.run(main(), debug=True)
