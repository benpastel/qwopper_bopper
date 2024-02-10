#!/usr/bin/env python3

import asyncio
import json
import os
import signal
from time import time

from websockets.server import WebSocketServerProtocol, serve


WIDTH = 800
HEIGHT = 600
FPS = 60

VELOCITY = (0, 0)
MAX_VELOCITY = 20

# TODO: allow holding up & left simultaneously
# if you depress them, they should effect this frame but not next frame
# if you press a different key, that should replace previous single key presses?
#   ... or maybe not, all key presses accumulate until the frame?
#   ... well right should replace left, but should stack with up/down
LAST_KEYDOWN: None | str = None


async def listen_for_keydown(websocket: WebSocketServerProtocol) -> None:
    """Listen for keydown & keyup and update KEYS_DOWN"""
    global LAST_KEYDOWN
    while True:
        message = await websocket.recv()
        event = json.loads(message)

        if "keydown" in event:
            LAST_KEYDOWN = event["keydown"]


def update_velocity() -> tuple[int, int]:
    """
    Read the last keydown & reset it to None
    increase or decrease momentum up to a max
    set & return the new velocity
    """

    # read & reset the last keydown
    global LAST_KEYDOWN
    global VELOCITY
    keydown = LAST_KEYDOWN
    LAST_KEYDOWN = None

    # update velocity
    dx, dy = VELOCITY
    if keydown == "ArrowLeft":
        dx -= 1
    elif keydown == "ArrowRight":
        dx += 1
    elif keydown == "ArrowUp":
        dy -= 1
    elif keydown == "ArrowDown":
        dy += 1
    dx = min(MAX_VELOCITY, max(-MAX_VELOCITY, dx))
    dy = min(MAX_VELOCITY, max(-MAX_VELOCITY, dy))
    VELOCITY = dx, dy
    return dx, dy


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

    x = 0
    y = 0
    degree = 0

    last_frame = time()

    try:
        while True:
            # sleep until it's time to for the next frame
            next_frame = last_frame + 1 / FPS
            await asyncio.sleep(next_frame - time())
            last_frame = next_frame

            # set the new position based on last keypress arrow keys
            dx, dy = update_velocity()
            x = (x + dx) % WIDTH
            y = (y + dy) % HEIGHT

            degree = (degree + 1) % 360
            position = {"x": x, "y": y, "degree": degree}
            message = json.dumps(position)

            await websocket.send(message)
    except Exception as e:
        print(f"{e=}")
    finally:
        task.cancel()


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
