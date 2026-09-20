/* Talks to the backend. Every failure is turned into a message a reader can
   act on, because "TypeError: Failed to fetch" helps nobody. */

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
    var base = config.getApiBase();
    if (!base) {
      throw new ApiError('No backend address is set. Open Backend above and add one.', 'no_api_base');
    }
    return base + path;
  }

  function request(path, options) {
    var settings = options || {};
    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, config.requestTimeoutMs);

    var target = url(path);

    return window
      .fetch(target, {
        method: settings.method || 'GET',
        headers: settings.body ? { 'Content-Type': 'application/json' } : undefined,
        body: settings.body ? JSON.stringify(settings.body) : undefined,
        signal: controller.signal,
        mode: 'cors'
      })
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

        if (error.name === 'AbortError') {
          throw new ApiError('The backend took too long to answer. Try again.', 'timeout');
        }
        // A CORS rejection and an offline backend look identical from here.
        throw new ApiError(
          'Could not reach the backend at ' + config.getApiBase() + '. Check that it is running and that this origin is allowed.',
          'unreachable'
        );
      })
      .then(function (data) {
        window.clearTimeout(timer);
        return data;
      })
      .catch(function (error) {
        window.clearTimeout(timer);
        throw error;
      });
  }

  function explain(term) {
    var key = String(term || '').trim().toLowerCase();
    if (!key) {
      return Promise.reject(new ApiError('Enter a word first.', 'missing_query'));
    }

    if (sessionCache[key]) {
      return Promise.resolve(sessionCache[key]);
    }

    return request('/api/search?q=' + encodeURIComponent(term)).then(function (data) {
      sessionCache[key] = data;
      return data;
    });
  }

  function extract(text, options) {
    var settings = options || {};
    return request('/api/extract', {
      method: 'POST',
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

  function health() {
    return request('/api/health');
  }

  function prime(term, entry) {
    sessionCache[String(term).toLowerCase()] = entry;
  }

  return { explain: explain, extract: extract, health: health, prime: prime, ApiError: ApiError };
})();
