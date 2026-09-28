'use strict';

const icon = document.getElementById('icon');
desk.onGhost((src) => {
  icon.src = src || '';
  icon.style.visibility = src ? 'visible' : 'hidden';
});
