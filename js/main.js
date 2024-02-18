
const BLUE_PLAYER = "blue";
const RED_PLAYER = "red";
const PLAYERS = [BLUE_PLAYER, RED_PLAYER];

function joinGame(websocket) {
  websocket.addEventListener("open", () => {
    // send an "join" event informing the server which player we are
    // based on hardcoded url ?player=blue or ?player=red
    const params = new URLSearchParams(window.location.search);
    const player = params.get("player");
    if (! (player === BLUE_PLAYER || player === RED_PLAYER)) {
      const msg = `⚠️⚠️⚠️<br>Set your url to ?player=${BLUE_PLAYER} or ?player=${RED_PLAYER}<br>⚠️⚠️⚠️`;
      alert(msg);
      console.log(params);
      throw new Error(msg);
    }
    const event = {
      type: "join",
      player
    };
    websocket.send(JSON.stringify(event));
  });
}

function getWebSocketServer() {
  if (window.location.host === "localhost:8000") {
    return "ws://localhost:8001/";
  } else {
    throw new Error(`Unsupported host: ${window.location.host}`);
  }
}

function setPosition(player, part, position) {
  const elementId = `${player}-${part}`
  var character = document.getElementById(elementId);
  character.style.left = position.x + 'px';
  character.style.top = position.y + 'px';
  character.style.transform = 'translate(-50%, -50%) rotate(' + position.angle + 'rad)';
}

function receiveState(websocket) {
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    for (const player of PLAYERS) {
      const position = event[player];

      setPosition(player, "torso", position.torso);
      setPosition(player, "rleg", position.rleg);
      setPosition(player, "lleg", position.lleg);
    }

    const damagePoints = event.damagePoints;
    if (damagePoints.length > 0) {
      console.log(damagePoints);
    }
  });
}

function sendKeyEvents(websocket) {
  // send key up & down events directly to python
  document.addEventListener('keydown', (event) => {
    const key = event.key;
    websocket.send(
      JSON.stringify({
        keydown: key,
      })
    );
  });
  document.addEventListener('keyup', (event) => {
    const key = event.key;
    websocket.send(
      JSON.stringify({
        keyup: key,
      })
    );
  });
}


window.addEventListener("DOMContentLoaded", () => {
  const websocket = new WebSocket(getWebSocketServer());
  joinGame(websocket);
  receiveState(websocket);
  sendKeyEvents(websocket);
});