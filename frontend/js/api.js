/* Talks to the backend. Every failure is turned into a message a reader can
   act on, because "TypeError: Failed to fetch" helps nobody.

   Free-tier hosting (Render) puts the backend to sleep after a period of
   inactivity; the first request after that can take 20-50 seconds to wake
   it. That is not a bug, so it is never reported as one - the timeout is
   long enough to survive a cold start, and callers can pass onSlow to show
   a "waking up" message once the wait stops looking like a normal request. */

window.Api = (function () {
  'use strict';

  var config = window.WordExtractorConfig;

  // A term looked up twice in one session should not touch the network again.
  var sessionCache = Object.create(null);

  function ApiError(message, code) {
    this.name = 'ApiError';
    this.message = message;
    this.code = code || 'request_failed';
  }
  ApiError.prototype = Object.create(Error.prototype);

  function url(path) {
    return config.getApiBase() + path;
  }

  function request(path, options) {
    var settings = options || {};
    var controller = new AbortController();
    var timedOut = false;

    var hintTimer = settings.onSlow
      ? window.setTimeout(settings.onSlow, config.coldStartHintMs)
      : null;

    var abortTimer = window.setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, config.coldStartTimeoutMs);

    function stopTimers() {
      window.clearTimeout(hintTimer);
      window.clearTimeout(abortTimer);
    }

    var fetchOptions = {
      method: settings.method || 'GET',
      signal: controller.signal,
      mode: 'cors'
    };

    if (settings.formData) {
      // Let the browser set the multipart boundary itself.
      fetchOptions.body = settings.formData;
    } else if (settings.body) {
      fetchOptions.headers = { 'Content-Type': 'application/json' };
      fetchOptions.body = JSON.stringify(settings.body);
    }

    return window
      .fetch(url(path), fetchOptions)
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            throw new ApiError('The backend sent a response that could not be read.', 'bad_response');
          })
          .then(function (payload) {
            if (!response.ok || payload.ok === false) {
              var detail = (payload && payload.error) || {};
              throw new ApiError(
                detail.message || 'The request failed with status ' + response.status + '.',
                detail.code
              );
            }
            return payload.data;
          });
      })
      .catch(function (error) {
        if (error instanceof ApiError) throw error;

        if (error.name === 'AbortError' && timedOut) {
          throw new ApiError(
            'The backend is taking unusually long to answer. Please try again in a moment.',
            'timeout'
          );
        }
        // A CORS rejection and an offline backend look identical from here.
        throw new ApiError('Could not reach the backend right now. Check your connection and try again.', 'unreachable');
      })
      .then(
        function (data) {
          stopTimers();
          return data;
        },
        function (error) {
          stopTimers();
          throw error;
        }
      );
  }

  function explain(term, handlers) {
    var key = String(term || '').trim().toLowerCase();
    if (!key) {
      return Promise.reject(new ApiError('Enter a word first.', 'missing_query'));
    }

    if (sessionCache[key]) {
      return Promise.resolve(sessionCache[key]);
    }

    return request('/api/search?q=' + encodeURIComponent(term), handlers).then(function (data) {
      sessionCache[key] = data;
      return data;
    });
  }

  function extract(text, options) {
    var settings = options || {};
    return request('/api/extract', {
      method: 'POST',
      onSlow: settings.onSlow,
      body: {
        text: text,
        limit: settings.limit || 30,
        minScore: settings.minScore || 4,
        explain: settings.explain !== false,
        explainCount: settings.explainCount || 8
      }
    }).then(function (data) {
      // Seed the session cache so clicking a pre-explained term is instant.
      (data.terms || []).forEach(function (item) {
        if (item.explanation) {
          sessionCache[item.term.toLowerCase()] = item.explanation;
        }
      });
      return data;
    });
  }

  /**
   * Uploads a document and gets back its extracted text. The File object is
   * only ever read into this one request; nothing here keeps a reference
   * to it once the promise settles, so it is left for the browser to
   * garbage-collect immediately.
   */
  function extractFile(file, options) {
    var settings = options || {};
    var formData = new FormData();
    formData.append('file', file, file.name);

    return request('/api/extract-file', {
      method: 'POST',
      formData: formData,
      onSlow: settings.onSlow
    });
  }

  function health() {
    return request('/api/health');
  }

  /**
   * Fires a health check without the caller waiting on it and swallows any
   * failure. Used to wake a sleeping backend the moment the page loads, so
   * by the time the person actually clicks a word the server is usually
   * already warm.
   */
  function warmUp() {
    health().catch(function () {
      // A failed prewarm just means the first real request pays the cold
      // start cost instead - nothing to surface to the person here.
    });
  }

  function prime(term, entry) {
    sessionCache[String(term).toLowerCase()] = entry;
  }

  return {
    explain: explain,
    extract: extract,
    extractFile: extractFile,
    health: health,
    warmUp: warmUp,
    prime: prime,
    ApiError: ApiError
  };
})();
