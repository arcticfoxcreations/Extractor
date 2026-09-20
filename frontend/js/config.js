/* The backend address is fixed at build time rather than exposed as a
   setting in the UI - a reader has no reasonable reason to point this app
   at a different server, and a stale value saved in their browser storage
   was the exact bug that broke this app for new visitors before. Local
   development still works: running the frontend from localhost picks up
   LOCAL_API automatically instead. */

window.WordExtractorConfig = (function () {
  'use strict';

  var PRODUCTION_API = 'https://extractor-efku.onrender.com';
  var LOCAL_API = 'http://localhost:8080';

  function isLocal() {
    var host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '';
  }

  function getApiBase() {
    return isLocal() ? LOCAL_API : PRODUCTION_API;
  }

  return {
    getApiBase: getApiBase,
    requestTimeoutMs: 12000,
    // A sleeping free-tier backend can take 20-50s to wake up on its first
    // request. Rather than fail fast and call that a bug, requests to the
    // backend get a much longer ceiling, with a friendlier status shown to
    // the person after the "this should have answered by now" mark.
    coldStartTimeoutMs: 55000,
    coldStartHintMs: 4000,
    maxHistory: 12
  };
})();
