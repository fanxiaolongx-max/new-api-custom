(function disableBrowserMouseSideButtonNavigation() {
  'use strict';

  var sideButtons = {
    3: true,
    4: true
  };

  function cancelSideButtonNavigation(event) {
    if (!sideButtons[event.button])
      return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  [
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'auxclick',
    'click'
  ].forEach(function registerSideButtonGuard(eventName) {
    window.addEventListener(eventName, cancelSideButtonNavigation, true);
  });
}());
