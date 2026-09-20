/* Wires the modules together and owns the small amount of app state:
   which mode is showing, and which term is currently being explained. */

(function () {
  'use strict';

  var config = window.WordExtractorConfig;
  var api = window.Api;
  var store = window.Store;
  var ui = window.UI;
  var reader = window.Reader;
  var voice = window.VoiceInput;

  var SAMPLE_TEXT =
    'Apoptosis is a form of programmed cell death that occurs in multicellular organisms. '
    + 'Biochemical events lead to characteristic cell changes and death, including blebbing, '
    + 'cell shrinkage, nuclear fragmentation, chromatin condensation and chromosomal DNA fragmentation.\n\n'
    + 'Oxidative phosphorylation occurs across the inner mitochondrial membrane, where the electron '
    + 'transport chain establishes a chemiosmotic gradient that drives ATP synthase. Dysregulation of '
    + 'this process has been implicated in neurodegenerative pathologies.';

  var state = {
    mode: 'reader',
    pendingTerm: null,
    dictationTarget: null
  };

  var dom = {};
  var recogniser = null;

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      'settings-toggle', 'settings-panel', 'api-base', 'api-save', 'api-test', 'api-status',
      'theme-toggle',
      'reader-form', 'paper-text', 'extract-button', 'sample-button', 'clear-reader',
      'reader-meta', 'reader-error', 'reading', 'reading-body', 'reader-empty',
      'lookup-form', 'lookup-input', 'lookup-button', 'clear-lookup',
      'history-clear', 'copy-button', 'gloss'
    ].forEach(function (id) {
      dom[id] = $(id);
    });

    dom.modeButtons = document.querySelectorAll('.modes__option');
    dom.panels = document.querySelectorAll('[data-panel]');
  }

  /* ---------- Modes ---------- */

  function setMode(mode) {
    state.mode = mode;

    Array.prototype.forEach.call(dom.modeButtons, function (button) {
      var active = button.getAttribute('data-mode') === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    Array.prototype.forEach.call(dom.panels, function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== mode;
    });

    if (mode === 'lookup') {
      dom['lookup-input'].focus();
    }
  }

  /* ---------- Explaining a term ---------- */

  function explainTerm(term) {
    var clean = String(term || '').trim();
    if (!clean) return;

    state.pendingTerm = clean;
    ui.showGlossLoading(clean);

    api
      .explain(clean)
      .then(function (entry) {
        // A slower earlier request must not overwrite a newer one.
        if (state.pendingTerm !== clean) return;

        ui.renderGloss(entry);
        ui.renderHistory(store.addHistory(clean), explainFromHistory);
      })
      .catch(function (error) {
        if (state.pendingTerm !== clean) return;
        ui.showGlossError(error.message, clean);
      });
  }

  function explainFromHistory(term) {
    if (state.mode === 'lookup') {
      dom['lookup-input'].value = term;
    }
    explainTerm(term);
  }

  function handleRelatedClick(term) {
    reader.highlightTerm(term);
    if (state.mode === 'lookup') {
      dom['lookup-input'].value = term;
    }
    explainTerm(term);
  }

  /* ---------- Reader mode ---------- */

  function runExtraction(event) {
    if (event) event.preventDefault();

    var text = dom['paper-text'].value.trim();
    ui.hideNotice(dom['reader-error']);

    if (text.length < 40) {
      ui.showNotice(dom['reader-error'], 'Paste at least a paragraph so there is something to work with.');
      return;
    }

    setBusy(dom['extract-button'], true, 'Reading…');
    dom['reader-meta'].textContent = '';

    api
      .extract(text, { limit: 30, explain: true, explainCount: 8 })
      .then(function (data) {
        renderExtraction(text, data);
      })
      .catch(function (error) {
        ui.showNotice(dom['reader-error'], error.message);
        dom['reading'].hidden = true;
        dom['reader-empty'].hidden = false;
      })
      .then(function () {
        setBusy(dom['extract-button'], false, 'Find hard words');
      });
  }

  function renderExtraction(text, data) {
    var terms = data.terms || [];

    if (terms.length === 0) {
      dom['reading'].hidden = true;
      dom['reader-empty'].hidden = false;
      dom['reader-meta'].textContent = 'No unusually hard words found in ' + data.totalWords + ' words.';
      return;
    }

    reader.render(text, terms, {
      container: dom['reading-body'],
      onTermSelect: explainTerm
    });

    dom['reader-empty'].hidden = true;
    dom['reading'].hidden = false;
    dom['reader-meta'].textContent =
      terms.length + ' terms marked in ' + data.totalWords + ' words · ' + data.durationMs + ' ms';

    store.setDraft(text);
  }

  function clearReader() {
    dom['paper-text'].value = '';
    dom['reader-meta'].textContent = '';
    ui.hideNotice(dom['reader-error']);
    reader.reset();
    dom['reading'].hidden = true;
    dom['reader-empty'].hidden = false;
    store.setDraft('');
    dom['paper-text'].focus();
  }

  /* ---------- Lookup mode ---------- */

  function runLookup(event) {
    if (event) event.preventDefault();

    var term = dom['lookup-input'].value.trim();
    if (!term) {
      dom['lookup-input'].focus();
      return;
    }

    setBusy(dom['lookup-button'], true, 'Explaining…');

    var finish = function () {
      setBusy(dom['lookup-button'], false, 'Explain');
    };

    state.pendingTerm = term;
    ui.showGlossLoading(term);

    api
      .explain(term)
      .then(function (entry) {
        if (state.pendingTerm !== term) return;
        ui.renderGloss(entry);
        ui.renderHistory(store.addHistory(term), explainFromHistory);
      })
      .catch(function (error) {
        if (state.pendingTerm !== term) return;
        ui.showGlossError(error.message, term);
      })
      .then(finish, finish);
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    button.textContent = label;
  }

  /* ---------- Voice ---------- */

  function setupVoice() {
    var buttons = document.querySelectorAll('[data-voice-target]');

    if (!voice.isSupported()) {
      Array.prototype.forEach.call(buttons, function (button) {
        button.disabled = true;
        button.title = 'This browser cannot record speech. Chrome, Edge and Safari can.';
        button.textContent = 'Voice unavailable';
      });
      return;
    }

    // One recogniser serves both fields; the active target decides where the
    // words land, so switching modes mid-dictation cannot cross the streams.
    recogniser = voice.create({
      continuous: true,
      onStart: function () {
        updateVoiceButtons(true);
        ui.toast('Listening. Speak now.');
      },
      onInterim: function (text) {
        writeDictation(text, false);
      },
      onFinal: function (text) {
        writeDictation(text, true);
      },
      onStop: function () {
        updateVoiceButtons(false);
        commitDictation();
      },
      onError: function (message) {
        updateVoiceButtons(false);
        ui.toast(message);
      }
    });

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        var targetId = button.getAttribute('data-voice-target');

        if (recogniser.isListening()) {
          recogniser.stop();
          return;
        }

        state.dictationTarget = {
          field: $(targetId),
          // Dictation appends to whatever is already typed rather than
          // wiping it, so voice and keyboard can be mixed freely.
          base: $(targetId).value,
          committed: ''
        };
        recogniser.start();
      });
    });
  }

  function writeDictation(text, isFinal) {
    var target = state.dictationTarget;
    if (!target || !target.field) return;

    if (isFinal) {
      target.committed = joinSpeech(target.committed, text);
    }

    var preview = isFinal ? target.committed : joinSpeech(target.committed, text);
    var base = target.base ? target.base.replace(/\s*$/, ' ') : '';

    target.field.value = base + preview;

    // Keep the caret and the scroll position at the end of the growing text.
    if (target.field.tagName === 'TEXTAREA') {
      target.field.scrollTop = target.field.scrollHeight;
    }
  }

  function joinSpeech(existing, addition) {
    if (!existing) return addition;
    if (!addition) return existing;
    return existing.replace(/\s*$/, '') + ' ' + addition;
  }

  function commitDictation() {
    var target = state.dictationTarget;
    if (!target || !target.field) return;

    var value = target.field.value.trim();
    target.field.value = value;

    if (target.field === dom['paper-text']) {
      store.setDraft(value);
    }

    // Dictating a single word almost always means "look this up now".
    if (target.field === dom['lookup-input'] && value) {
      runLookup();
    }

    state.dictationTarget = null;
  }

  function updateVoiceButtons(listening) {
    var buttons = document.querySelectorAll('[data-voice-target]');

    Array.prototype.forEach.call(buttons, function (button) {
      button.classList.toggle('is-listening', listening);
      button.setAttribute('aria-pressed', listening ? 'true' : 'false');
      button.textContent = listening ? 'Stop' : 'Speak';
    });
  }

  /* ---------- Settings ---------- */

  function setupSettings() {
    dom['api-base'].value = config.getApiBase();

    dom['settings-toggle'].addEventListener('click', function () {
      var open = dom['settings-panel'].hidden;
      dom['settings-panel'].hidden = !open;
      dom['settings-toggle'].setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    dom['api-save'].addEventListener('click', function () {
      var saved = config.setApiBase(dom['api-base'].value);
      setApiStatus(
        saved ? 'Saved. Requests now go to ' + config.getApiBase() : 'This browser blocked storage, so the address will reset on reload.',
        saved ? 'ok' : 'bad'
      );
    });

    dom['api-test'].addEventListener('click', function () {
      config.setApiBase(dom['api-base'].value);
      setApiStatus('Checking…', '');

      api
        .health()
        .then(function (data) {
          setApiStatus('Backend healthy · cache: ' + data.cache.driver + ' · ' + data.cache.entries + ' entries', 'ok');
        })
        .catch(function (error) {
          setApiStatus(error.message, 'bad');
        });
    });
  }

  function setApiStatus(message, tone) {
    dom['api-status'].textContent = message;
    dom['api-status'].setAttribute('data-state', tone || '');
  }

  /* ---------- Theme ---------- */

  function setupTheme() {
    var theme = store.getTheme();
    ui.applyTheme(theme);

    dom['theme-toggle'].addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      var next = order[(order.indexOf(store.getTheme()) + 1) % order.length];
      store.setTheme(next);
      ui.applyTheme(next);
    });
  }

  /* ---------- Boot ---------- */

  function init() {
    cacheDom();

    ui.init({ onRelatedClick: handleRelatedClick });
    setupTheme();
    setupSettings();
    setupVoice();

    Array.prototype.forEach.call(dom.modeButtons, function (button) {
      button.addEventListener('click', function () {
        setMode(button.getAttribute('data-mode'));
      });
    });

    dom['reader-form'].addEventListener('submit', runExtraction);
    dom['lookup-form'].addEventListener('submit', runLookup);
    dom['clear-reader'].addEventListener('click', clearReader);

    dom['sample-button'].addEventListener('click', function () {
      dom['paper-text'].value = SAMPLE_TEXT;
      runExtraction();
    });

    dom['clear-lookup'].addEventListener('click', function () {
      dom['lookup-input'].value = '';
      ui.closeSheet();
      dom['lookup-input'].focus();
    });

    dom['history-clear'].addEventListener('click', function () {
      ui.renderHistory(store.clearHistory(), explainFromHistory);
    });

    dom['copy-button'].addEventListener('click', copyGloss);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        ui.closeSheet();
        if (recogniser && recogniser.isListening()) recogniser.stop();
      }
    });

    var draft = store.getDraft();
    if (draft) dom['paper-text'].value = draft;

    ui.renderHistory(store.getHistory(), explainFromHistory);
    setMode('reader');
  }

  function copyGloss() {
    if (!ui.hasGloss()) {
      ui.toast('Nothing to copy yet.');
      return;
    }

    var text = ui.glossAsText();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { ui.toast('Explanation copied.'); },
        function () { fallbackCopy(text); }
      );
      return;
    }

    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    try {
      document.execCommand('copy');
      ui.toast('Explanation copied.');
    } catch (error) {
      ui.toast('Copying is blocked in this browser. Select the text instead.');
    }

    document.body.removeChild(area);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
