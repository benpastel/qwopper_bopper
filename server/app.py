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

LAST_KEYDOWN: None | str = None


async def listen_for_keydown(websocket: WebSocketServerProtocol) -> None:
    global LAST_KEYDOWN
    print("listening for keydown")
    while True:
        message = await websocket.recv()
        event = json.loads(message)
        print(f"{event['keydown']=}, {LAST_KEYDOWN=}")
        LAST_KEYDOWN = event["keydown"]
    print("stopped listening for keydown")


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
            x = (x + 1) % WIDTH
            y = (y + 1) % HEIGHT
            degree = (degree + 1) % 360
            position = {"x": x, "y": y, "degree": degree}
            message = json.dumps(position)

            # sleep until it's time to send the frame
            next_frame = last_frame + 1 / FPS
            await asyncio.sleep(next_frame - time())
            last_frame = next_frame
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
