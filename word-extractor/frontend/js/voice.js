/* Real-time voice input built on the Web Speech API.

   Two things make this usable rather than a demo toggle:
   - interim results are surfaced while the person is still speaking, so the
     field updates live instead of jumping at the end of a sentence;
   - the recogniser is restarted automatically when the browser ends a session
     early, which Chrome does after a few seconds of silence. Without that,
     dictating a long abstract would cut out halfway through. */

window.VoiceInput = (function () {
  'use strict';

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function isSupported() {
    return Boolean(Recognition);
  }

  /**
   * options: { lang, continuous, onInterim, onFinal, onStart, onStop, onError }
   * onInterim receives the unstable text being spoken right now.
   * onFinal receives each committed chunk of speech.
   */
  function create(options) {
    var settings = options || {};
    var lang = settings.lang || 'en-US';
    var continuous = settings.continuous !== false;

    var recognition = null;
    var listening = false;
    // Distinguishes "the browser stopped on its own" from "the user stopped",
    // because only the first one should restart.
    var stoppedByUser = false;
    var restartTimer = null;

    function emit(name, payload) {
      if (typeof settings[name] === 'function') {
        settings[name](payload);
      }
    }

    function build() {
      var instance = new Recognition();
      instance.lang = lang;
      instance.continuous = continuous;
      instance.interimResults = true;
      instance.maxAlternatives = 1;

      instance.onstart = function () {
        listening = true;
        emit('onStart');
      };

      instance.onresult = function (event) {
        var interim = '';

        for (var i = event.resultIndex; i < event.results.length; i += 1) {
          var result = event.results[i];
          var transcript = result[0].transcript;

          if (result.isFinal) {
            emit('onFinal', transcript.trim());
          } else {
            interim += transcript;
          }
        }

        if (interim) {
          emit('onInterim', interim.trim());
        }
      };

      instance.onerror = function (event) {
        // 'no-speech' and 'aborted' are routine and should not alarm anyone.
        if (event.error === 'no-speech' || event.error === 'aborted') return;

        stoppedByUser = true;
        listening = false;
        emit('onError', describeError(event.error));
      };

      instance.onend = function () {
        listening = false;

        if (!stoppedByUser && continuous) {
          // A short delay avoids a tight restart loop if the mic is busy.
          restartTimer = window.setTimeout(function () {
            try {
              instance.start();
            } catch (error) {
              emit('onStop');
            }
          }, 250);
          return;
        }

        emit('onStop');
      };

      return instance;
    }

    function start() {
      if (!isSupported()) {
        emit('onError', 'This browser cannot record speech. Chrome, Edge and Safari can.');
        return false;
      }
      if (listening) return true;

      stoppedByUser = false;
      recognition = recognition || build();

      try {
        recognition.start();
        return true;
      } catch (error) {
        // start() throws if called while a previous session is still closing.
        return false;
      }
    }

    function stop() {
      stoppedByUser = true;
      window.clearTimeout(restartTimer);

      if (recognition && listening) {
        recognition.stop();
      } else {
        listening = false;
        emit('onStop');
      }
    }

    function toggle() {
      if (listening) {
        stop();
        return false;
      }
      return start();
    }

    function setLanguage(value) {
      lang = value;
      if (recognition) recognition.lang = value;
    }

    return {
      start: start,
      stop: stop,
      toggle: toggle,
      setLanguage: setLanguage,
      isListening: function () { return listening; }
    };
  }

  function describeError(code) {
    switch (code) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microphone access was blocked. Allow it in the address bar, then try again.';
      case 'audio-capture':
        return 'No microphone was found. Connect one and try again.';
      case 'network':
        return 'Speech recognition needs a network connection.';
      case 'language-not-supported':
        return 'That language is not available for dictation in this browser.';
      default:
        return 'Dictation stopped unexpectedly. Try again.';
    }
  }

  return { isSupported: isSupported, create: create };
})();
