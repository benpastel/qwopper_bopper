function setPosition(characterId, x, y, degree) {
  var character = document.getElementById(characterId);
  character.style.left = x + 'px';
  character.style.top = y + 'px';
  character.style.transform = 'rotate(' + degree + 'deg)';
}

setPosition('torso1', 400, 400, 80);