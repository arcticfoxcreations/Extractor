/* Where the API lives. GitHub Pages serves static files only, so the backend
   address has to be configurable at runtime rather than baked in at build. */

window.WordExtractorConfig = (function () {
  'use strict';

  // Change this to your deployed backend before publishing to Pages.
  var DEFAULT_API = 'https://extractor-efku.onrender.com';
  var STORAGE_KEY = 'wx.apiBase';

  function isLocal() {
    var host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  }

  function normalize(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  function read() {
    try {
      var saved = normalize(window.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (error) {
      // Private browsing blocks storage; the default still works.
    }
    return isLocal() ? DEFAULT_API : normalize(DEFAULT_API);
  }

  function save(value) {
    var clean = normalize(value);
    try {
      if (clean) {
        window.localStorage.setItem(STORAGE_KEY, clean);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  return {
    getApiBase: read,
    setApiBase: save,
    defaultApiBase: DEFAULT_API,
    requestTimeoutMs: 15000,
    maxHistory: 12
  };
})();
