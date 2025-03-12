#!/usr/bin/env python3
import asyncio
import json
import os
import signal
import gc

from websockets.server import WebSocketServerProtocol, serve

from server.game import Player, play_game, other_player

# For now we support at most one game at a time.
# this tracks the websocket of each connected player
# until both players are connected and we can start the game.
WEBSOCKETS: dict[Player, WebSocketServerProtocol] = {}

IS_AI: dict[Player, bool] = {}


async def handler(websocket: WebSocketServerProtocol) -> None:
    """
    Register player => websocket in a global registry.
    If we are the 2nd connecting player, start the game.
    Otherwise, wait forever for another player.

    Consumes a single message from the websocket queue containing the Player.
    Future messages are handled inside the game task.

    TODO: use a game id to track multiple games
    """
    assert isinstance(websocket, WebSocketServerProtocol)

    # wait for the first joining message from a client
    while True:
        message = await websocket.recv()
        event = json.loads(message)
        if "type" in event and event["type"] == 'join':
            break
        else:
            print(f"unexpected {event=}")

    # either way, register the client's websocket
    WEBSOCKETS[player] = websocket

    if event["player"] == SOLO_PLAYER:
        # in solo mode, the player is red and the AI is blue
        player = Player.RED
        vs_ai = True
    else:
        # in pvp, the player is the one specified in the url
        player = Player(event["player"])
        vs_ai = False

    IS_AI[player] = False
    IS_AI[other_player(player)] = vs_ai
    print(f"{player} connected {vs_ai=}")

    try:
        if vs_ai:
            # play the game against the AI
            IS_AI[other_player(player)] = True
            await play_game(WEBSOCKETS, IS_AI)
        else:
            # in pvp, check if we are the 2nd player to join.
            # 1st player waits forever; 2nd player starts the game.
            if len(WEBSOCKETS) == 2 and all(w.open for w in WEBSOCKETS.values()):
                assert len(IS_AI) == 2 and all(not ai for ai in IS_AI.values())
                # both players are connected, so start the match.
                print("New match.")
                await play_game(WEBSOCKETS, IS_AI)
            else:
                # wait forever for the other player to connect
                await websocket.wait_closed()
    finally:
        # close all connections and wipe the registry
        # both players will need to refresh to play a new game
        for websocket in WEBSOCKETS.values():
            print("Disconnecting.")
            await websocket.close()

        WEBSOCKETS.clear()
        IS_AI.clear()

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
