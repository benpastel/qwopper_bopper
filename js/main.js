
const BLUE_PLAYER = "blue";
const RED_PLAYER = "red";
const PLAYERS = [BLUE_PLAYER, RED_PLAYER];

// list of damage sparkles we are currently displaying
const SPARKLES = [];

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

function drawPart(player, part, position) {
  const elementId = `${player}-${part}`
  var character = document.getElementById(elementId);
  character.style.left = position.x + 'px';
  character.style.top = position.y + 'px';
  character.style.transform = 'translate(-50%, -50%) rotate(' + position.angle + 'rad)';
}

function receiveState(websocket) {
  websocket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);

    // draw each part of each player's fighters
    for (const player of PLAYERS) {
      const position = event[player];

      drawPart(player, "torso", position.torso);
      drawPart(player, "rleg", position.rleg);
      drawPart(player, "lleg", position.lleg);
    }

    // initialize a sparkle animation for each damage point
    const points = event.damagePoints;
    for (const point of points) {
      SPARKLES.push({
        x: point.x,
        y: point.y,
        alpha: 1.0,
        size: 50
      });
    }
  });
}

function drawSparkle(context, sparkle) {
  // Draw a red circle with alpha, representing damage
  context.strokeStyle = `rgba(255, 0, 0, ${sparkle.alpha})`; // Red with alpha
  context.beginPath();
  context.arc(sparkle.x, sparkle.y, sparkle.size, 0, 2 * Math.PI);
  context.stroke();
}

function animateSparkles() {
  const canvas = document.getElementById('canvas');
  canvas.width = document.getElementById('gameContainer').offsetWidth;
  canvas.height = document.getElementById('gameContainer').offsetHeight;
  const ctx = canvas.getContext('2d');

  function animate() {
     // clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // animate sparkles in reverse order
    // because additional sparkles may be appended while we animate
    for (let i = SPARKLES.length - 1; i >= 0; i--) {
      const sparkle = SPARKLES[i];
      sparkle.alpha -= 0.02; // fade out
      sparkle.size -= 0.5; // shrink

      if (sparkle.alpha <= 0 || sparkle.size <= 0) {
        // finished; remove the sparkle
        SPARKLES.splice(i, 1);
      } else {
        drawSparkle(ctx, sparkle);
      }
    }
    // schedule the next animate
    requestAnimationFrame(animate);
  }
  animate();
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
  animateSparkles();
});