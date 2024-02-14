function getWebSocketServer() {
  if (window.location.host === "localhost:8000") {
    return "ws://localhost:8001/";
  } else {
    throw new Error(`Unsupported host: ${window.location.host}`);
  }
}

function setPosition(characterId, x, y, angleRadians) {
  var character = document.getElementById(characterId);
  character.style.left = x + 'px';
  character.style.top = y + 'px';
  character.style.transform = 'translate(-50%, -50%) rotate(' + angleRadians + 'rad)';
}

function receivePosition(websocket) {
  // set the position & rotation of torso1
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    const torso_x = event["torso"]["x"];
    const torso_y = event["torso"]["y"];
    const torso_angle = event["torso"]["angle"];
    setPosition("torso", torso_x, torso_y, torso_angle);

    const leg_x = event["leg"]["x"];
    const leg_y = event["leg"]["y"];
    const leg_angle = event["leg"]["angle"];
    setPosition("leg", leg_x, leg_y, leg_angle);
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

  receivePosition(websocket);
  sendKeyEvents(websocket);
});