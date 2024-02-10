function getWebSocketServer() {
  if (window.location.host === "localhost:8000") {
    return "ws://localhost:8001/";
  } else {
    throw new Error(`Unsupported host: ${window.location.host}`);
  }
}

function setPosition(characterId, x, y, degree) {
  var character = document.getElementById(characterId);
  character.style.left = x + 'px';
  character.style.top = y + 'px';
  character.style.transform = 'rotate(' + degree + 'deg)';
}

function receivePosition(websocket) {
  // set the position & rotation of torso1
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    const x = event["x"];
    const y = event["y"];
    const degree = event["degree"];

    setPosition("torso1", x, y, degree);
  });
}

function sendKeyDowns(websocket) {
  // pass keydowns directly to python
  document.addEventListener('keydown', (event) => {
    const key = event.key;
    console.log(`Key down: ${key}`);

    websocket.send(
      JSON.stringify({
        keydown: key,
      })
    );
  });
}


window.addEventListener("DOMContentLoaded", () => {
  const websocket = new WebSocket(getWebSocketServer());

  receivePosition(websocket);
  sendKeyDowns(websocket);
});