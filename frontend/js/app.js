/* Wires the modules together and owns the small amount of app state:
   which mode is showing, and which term is currently being explained. */

(function () {
  'use strict';

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
    dictationTarget: null,
    activeVoiceButton: null,
    lookupTimer: null
  };

  var dom = {};
  var recogniser = null;

  function $(id) {
    return document.getElementById(id);
  }

  function cacheDom() {
    [
      'theme-toggle',
      'reader-form', 'paper-text', 'extract-button', 'sample-button', 'clear-reader',
      'reader-meta', 'reader-error', 'reading', 'reading-body', 'reader-empty',
      'file-input', 'file-label',
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
      .explain(clean, { onSlow: ui.showGlossSlow })
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
      .extract(text, { limit: 30, explain: true, explainCount: 8, onSlow: onExtractionSlow })
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

  function onExtractionSlow() {
    dom['reader-meta'].textContent = 'Waking up the server — the first request after a while can take up to a minute…';
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

  /* ---------- File attach ---------- */

  var CLIENT_SIDE_EXTENSIONS = ['.txt', '.md'];
  var ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.xlsx', '.xls', '.pptx'];

  function extensionOf(filename) {
    var match = /\.[a-z0-9]+$/i.exec(String(filename || ''));
    return match ? match[0].toLowerCase() : '';
  }

  function setupFileUpload() {
    dom['file-input'].addEventListener('change', function () {
      var file = dom['file-input'].files && dom['file-input'].files[0];
      // The input is cleared immediately regardless of outcome: once the
      // text (or the error) is in hand, the File object itself is not kept
      // around anywhere, and picking the same file again should still fire
      // a change event.
      dom['file-input'].value = '';
      if (!file) return;

      var ext = extensionOf(file.name);
      if (ACCEPTED_EXTENSIONS.indexOf(ext) === -1) {
        ui.toast('That file type is not supported. Use .txt, .md, .pdf, .docx, .xlsx, .xls or .pptx.');
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        ui.toast('That file is larger than 15 MB.');
        return;
      }

      setFileBusy(true);
      ui.hideNotice(dom['reader-error']);

      var handled = CLIENT_SIDE_EXTENSIONS.indexOf(ext) !== -1
        ? readTextFile(file)
        : api.extractFile(file, { onSlow: onExtractionSlow });

      handled
        .then(function (result) {
          var text = typeof result === 'string' ? result : result.text;
          dom['paper-text'].value = text;
          store.setDraft(text);
          dom['reader-meta'].textContent = '';
          ui.toast('Text pulled from “' + file.name + '”.');
        })
        .catch(function (error) {
          ui.showNotice(dom['reader-error'], (error && error.message) || 'Could not read that file.');
        })
        .then(function () {
          setFileBusy(false);
        });
    });
  }

  function readTextFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('That file could not be read.')); };
      reader.readAsText(file);
    });
  }

  function setFileBusy(busy) {
    dom['file-label'].classList.toggle('is-busy', busy);
    dom['file-label'].textContent = busy ? 'Reading…' : 'Attach file';
    dom['file-input'].disabled = busy;
  }

  /* ---------- Lookup mode ---------- */

  function runLookup(event) {
    if (event) event.preventDefault();
    window.clearTimeout(state.lookupTimer);

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
      .explain(term, { onSlow: ui.showGlossSlow })
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

  /* Typing pauses for a beat, then the lookup fires on its own - the
     "Explain" button stays as a fallback for anyone who prefers pressing
     it, but nobody has to. History is only recorded for a lookup someone
     deliberately committed to (Enter or the button), not every keystroke
     pause, so it does not fill up with half-typed words. */
  function scheduleAutoLookup() {
    window.clearTimeout(state.lookupTimer);

    var term = dom['lookup-input'].value.trim();
    if (term.length < 2) {
      if (!term) ui.closeSheet();
      return;
    }

    state.lookupTimer = window.setTimeout(function () {
      state.pendingTerm = term;
      ui.showGlossLoading(term);

      api
        .explain(term, { onSlow: ui.showGlossSlow })
        .then(function (entry) {
          if (state.pendingTerm !== term) return;
          ui.renderGloss(entry);
        })
        .catch(function (error) {
          if (state.pendingTerm !== term) return;
          ui.showGlossError(error.message, term);
        });
    }, 550);
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
        state.activeVoiceButton = null;
      },
      onError: function (message) {
        updateVoiceButtons(false);
        ui.toast(message);
      }
    });

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        var targetId = button.getAttribute('data-voice-target');

        // Clicking the mic that is already dictating stops it.
        if (recogniser.isListening() && state.activeVoiceButton === button) {
          recogniser.stop();
          return;
        }

        // Clicking the OTHER mic while already listening switches which
        // field receives speech instead of just going silent - the
        // recognition session itself never has to restart.
        beginDictation(targetId, button);

        if (!recogniser.isListening()) {
          recogniser.start();
        } else {
          updateVoiceButtons(true);
        }
      });
    });
  }

  function beginDictation(targetId, button) {
    // Tidy up whatever field was receiving speech before the switch, so it
    // is left trimmed rather than mid-word.
    if (state.dictationTarget && state.dictationTarget.field && state.dictationTarget.field.id !== targetId) {
      finalizeField(state.dictationTarget.field);
    }

    var field = $(targetId);
    state.activeVoiceButton = button;
    state.dictationTarget = {
      field: field,
      // Dictation appends to whatever is already typed rather than
      // wiping it, so voice and keyboard can be mixed freely.
      base: field.value,
      committed: ''
    };
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

  function finalizeField(field) {
    var value = field.value.trim();
    field.value = value;

    if (field === dom['paper-text']) {
      store.setDraft(value);
    }

    return value;
  }

  function commitDictation() {
    var target = state.dictationTarget;
    if (!target || !target.field) return;

    var value = finalizeField(target.field);

    // Dictating a single word almost always means "look this up now".
    if (target.field === dom['lookup-input'] && value) {
      runLookup();
    }

    state.dictationTarget = null;
  }

  function updateVoiceButtons(listening) {
    var buttons = document.querySelectorAll('[data-voice-target]');

    Array.prototype.forEach.call(buttons, function (button) {
      // Only the field currently receiving speech shows "Stop"; the other
      // mic stays inviting so clicking it switches dictation over to it.
      var isActive = listening && button === state.activeVoiceButton;
      button.classList.toggle('is-listening', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.textContent = isActive ? 'Stop' : 'Speak';
    });
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
    setupVoice();
    setupFileUpload();

    // Fires as soon as the page loads so a sleeping free-tier backend is
    // usually already awake by the time someone clicks a word.
    api.warmUp();

    Array.prototype.forEach.call(dom.modeButtons, function (button) {
      button.addEventListener('click', function () {
        setMode(button.getAttribute('data-mode'));
      });
    });

    dom['reader-form'].addEventListener('submit', runExtraction);
    dom['lookup-form'].addEventListener('submit', runLookup);
    dom['lookup-input'].addEventListener('input', scheduleAutoLookup);
    dom['clear-reader'].addEventListener('click', clearReader);

    dom['sample-button'].addEventListener('click', function () {
      dom['paper-text'].value = SAMPLE_TEXT;
      runExtraction();
    });

    dom['clear-lookup'].addEventListener('click', function () {
      window.clearTimeout(state.lookupTimer);
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

  // Registering this is what makes the browser offer to install the site
  // as an app; it has no effect on how the page behaves otherwise.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Installability is a nice-to-have; the site works fine without it.
      });
    });
  }
})();
