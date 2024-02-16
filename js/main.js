function getWebSocketServer() {
  if (window.location.host === "localhost:8000") {
    return "ws://localhost:8001/";
  } else {
    throw new Error(`Unsupported host: ${window.location.host}`);
  }
}

function setPosition(characterId, position) {
  var character = document.getElementById(characterId);
  character.style.left = position.x + 'px';
  character.style.top = position.y + 'px';
  character.style.transform = 'translate(-50%, -50%) rotate(' + position.angle + 'rad)';
}

function receivePosition(websocket) {
  // set the position & rotation of torso1
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    setPosition("torso", event.torso);
    setPosition("rleg", event.rleg);
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