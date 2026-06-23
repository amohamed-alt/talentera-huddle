/* Expose the dashboard's global lexical data to preview-only enhancement files. */
(function () {
  'use strict';
  try {
    if (!Object.getOwnPropertyDescriptor(window, 'D')) {
      Object.defineProperty(window, 'D', {
        configurable: true,
        enumerable: false,
        get: function () {
          try {
            return D;
          } catch (error) {
            return null;
          }
        }
      });
    }
  } catch (error) {
    console.warn('Preview data bridge could not be initialized.', error);
  }
})();
