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


async def handler(websocket: WebSocketServerProtocol) -> None:
    assert isinstance(websocket, WebSocketServerProtocol)

    x = 0
    y = 0
    degree = 0

    last_frame = time()

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
