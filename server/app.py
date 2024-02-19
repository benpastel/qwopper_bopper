#!/usr/bin/env python3
import asyncio
import json
import os
import signal
import gc

from websockets.server import WebSocketServerProtocol, serve

from server.game import Player, play_game

# For now we support at most one game at a time.
# this tracks the websocket of each connected player
# until both players are connected and we can start the game.
WEBSOCKETS: dict[Player, WebSocketServerProtocol] = {}


async def handler(websocket: WebSocketServerProtocol) -> None:
    """
    Register player => websocket in a global registry.
    If we are the 2nd connecting player, start the game.
    Otherwise, wait forever for another player.

    Consumes a single message from the websocket queue containing the Player.
    Future messages are handled inside the game task.
    """
    assert isinstance(websocket, WebSocketServerProtocol)
    message = await websocket.recv()
    event = json.loads(message)
    assert "type" in event and event["type"] == "join", f"unexpected {event=}"

    player = Player(event["player"])
    WEBSOCKETS[player] = websocket
    print(f"{player} connected")

    try:
        if len(WEBSOCKETS) == 2 and all(w.open for w in WEBSOCKETS.values()):
            # both players are connected, so start the match.
            print("New match.")
            await play_game(WEBSOCKETS)
        else:
            # wait forever for the other player to connect
            await websocket.wait_closed()
    finally:
        # whichever handler gets here closes both connections
        # both players will need to refresh to play a new game
        #
        # TODO: think the synchronization here through more carefully
        # and also what behavior you'd like if someone loses connection
        for websocket in WEBSOCKETS.values():
            print("Disconnecting.")
            await websocket.close()

    # trigger garbage collection between games
    # so there's less likely to be a big collection during the game
    gc.collect()


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
