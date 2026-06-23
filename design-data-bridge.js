/* Expose dashboard lexical globals to preview-only enhancement files. */
(function () {
  'use strict';

  function expose(name, getter) {
    try {
      if (!Object.getOwnPropertyDescriptor(window, name)) {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: false,
          get: getter
        });
      }
    } catch (error) {
      console.warn('Preview bridge could not expose ' + name + '.', error);
    }
  }

  expose('D', function () {
    try { return D; } catch (error) { return null; }
  });

  expose('esc', function () {
    try { return esc; } catch (error) { return function (value) { return String(value || ''); }; }
  });

  expose('CONFIG', function () {
    try { return CONFIG; } catch (error) { return null; }
  });
})();
