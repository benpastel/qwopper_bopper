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

LAST_KEYDOWN: None | str = None


async def listen_for_keydown(websocket: WebSocketServerProtocol) -> None:
    """Listen for keydown & keyup and update KEYS_DOWN"""
    global LAST_KEYDOWN
    while True:
        message = await websocket.recv()
        event = json.loads(message)

        if "keydown" in event:
            LAST_KEYDOWN = event["keydown"]


def apply_force_from_keypress(body: pymunk.Body) -> None:
    """
    Read the last keydown & reset it to None
    use it to apply a force to the body
    """

    # read & reset the last keydown
    global LAST_KEYDOWN
    keydown = LAST_KEYDOWN
    LAST_KEYDOWN = None

    impulse = (0, 0)
    if keydown == "ArrowLeft":
        impulse = (-IMPULSE, 0)
    elif keydown == "ArrowRight":
        impulse = (IMPULSE, 0)
    elif keydown == "ArrowUp":
        impulse = (0, -IMPULSE)
    elif keydown == "ArrowDown":
        impulse = (0, IMPULSE)

    body.apply_impulse_at_local_point(impulse)


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
    torso = pymunk.Body(mass=10, moment=1000)
    torso.position = 500, 500
    torso.angle = 0

    poly = pymunk.Poly.create_box(torso, size=(164, 254))
    poly.group = 0
    poly.elasticity = 0.9

    # walls
    static: list[pymunk.Shape] = [
        pymunk.Segment(space.static_body, (0, HEIGHT), (0, 0), 5),
        pymunk.Segment(space.static_body, (0, 0), (WIDTH, 0), 5),
        pymunk.Segment(space.static_body, (WIDTH, 0), (WIDTH, HEIGHT), 5),
        pymunk.Segment(space.static_body, (0, HEIGHT), (WIDTH, HEIGHT), 5),
    ]
    for s in static:
        s.friction = 0.5
        s.group = 1
        s.elasticity = 0.9

    space.add(torso, poly, *static)
    space.add_default_collision_handler()

    last_frame = time()
    while True:
        # sleep until it's time to for the next frame
        next_frame = last_frame + 1 / FPS
        await asyncio.sleep(next_frame - time())
        last_frame = next_frame

        apply_force_from_keypress(torso)

        # step the position
        space.step(1.0 / FPS)

        # read the new position
        x, y = torso.position
        angle = torso.angle

        position = {"x": x, "y": y, "angle": angle}
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
