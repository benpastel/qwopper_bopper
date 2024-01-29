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
  // update the UI with changes to the current (partially) selected moves.
  // the server should call this again with null selections to clear the highlights.
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    const x = event["x"];
    const y = event["y"];
    const degree = event["degree"];

    setPosition("torso1", x, y, degree);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const websocket = new WebSocket(getWebSocketServer());

  receivePosition(websocket);
});