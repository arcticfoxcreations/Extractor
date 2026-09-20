/* Everything that writes to the DOM. Nothing here uses innerHTML with values
   that came from the network or the person, so a Wikipedia summary containing
   angle brackets renders as text instead of markup. */

window.UI = (function () {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  var elements = {};
  var toastTimer = null;
  var onRelatedClick = null;
  var currentEntry = null;
  var loadingTimer = null;
  var audioPlayer = null;

  // Rotated while a gloss is loading, in the spirit of the little status
  // lines Claude shows while it works - a paper-reading assistant gets to
  // have a bit of personality while it fetches a definition.
  var LOADING_MESSAGES = [
    'Extracting the meaning…',
    'Mumbling through Wikipedia…',
    'Untangling the jargon…',
    'Consulting the dictionary…',
    'Cross-referencing Wikidata…',
    'Memorising the definition…',
    'Chasing down a source…',
    'Making the long words shorter…'
  ];

  function cacheElements() {
    [
      'gloss', 'gloss-body', 'gloss-placeholder', 'gloss-loading', 'gloss-loading-text', 'gloss-error',
      'gloss-title', 'gloss-pronunciation', 'gloss-pronunciation-text', 'gloss-audio', 'gloss-definition',
      'gloss-facts', 'gloss-facts-section',
      'gloss-summary', 'gloss-summary-section',
      'gloss-related', 'gloss-related-section',
      'gloss-categories', 'gloss-categories-section',
      'gloss-sources', 'gloss-updated', 'gloss-close',
      'history', 'history-list', 'toast', 'theme-label'
    ].forEach(function (id) {
      elements[id] = $(id);
    });
  }

  function show(element, visible) {
    if (element) element.hidden = !visible;
  }

  function clear(element) {
    while (element && element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /* ---------- Gloss ---------- */

  function openSheet() {
    elements.gloss.classList.add('is-open');
  }

  function closeSheet() {
    elements.gloss.classList.remove('is-open');
  }

  function startLoadingMessages() {
    var order = LOADING_MESSAGES.slice().sort(function () { return Math.random() - 0.5; });
    var index = 0;

    function show() {
      elements['gloss-loading-text'].textContent = order[index % order.length];
      index += 1;
    }

    show();
    window.clearInterval(loadingTimer);
    loadingTimer = window.setInterval(show, 1400);
  }

  function stopLoadingMessages() {
    window.clearInterval(loadingTimer);
    loadingTimer = null;
  }

  function showGlossLoading(term) {
    currentEntry = null;
    show(elements['gloss-placeholder'], false);
    show(elements['gloss-body'], false);
    show(elements['gloss-error'], false);
    show(elements['gloss-loading'], true);
    startLoadingMessages();
    openSheet();

    if (term) {
      elements['gloss-loading'].setAttribute('aria-label', 'Looking up ' + term);
    }
  }

  // Swaps the rotating messages for one grounded status line once a request
  // is taking long enough that it is probably a cold backend waking up,
  // rather than letting the person assume something is broken.
  function showGlossSlow() {
    stopLoadingMessages();
    elements['gloss-loading-text'].textContent = 'Waking up the server — this can take up to a minute on the first request…';
  }

  function showGlossError(message, term) {
    currentEntry = null;
    stopLoadingMessages();
    show(elements['gloss-loading'], false);
    show(elements['gloss-body'], false);
    show(elements['gloss-placeholder'], false);

    var box = elements['gloss-error'];
    clear(box);

    var line = document.createElement('p');
    line.textContent = term ? 'Could not explain “' + term + '”.' : 'Something went wrong.';
    box.appendChild(line);

    var detail = document.createElement('p');
    detail.textContent = message;
    box.appendChild(detail);

    show(box, true);
    openSheet();
  }

  function renderGloss(entry) {
    currentEntry = entry;
    stopLoadingMessages();
    stopAudio();

    show(elements['gloss-loading'], false);
    show(elements['gloss-error'], false);
    show(elements['gloss-placeholder'], false);

    elements['gloss-title'].textContent = entry.title || entry.query;
    renderPronunciation(entry.pronunciation, entry.audio);

    elements['gloss-definition'].textContent = entry.definition
      || (entry.found ? 'No short definition was available for this term.'
                     : 'No reliable source described this term. Check the spelling, or try a broader word.');

    renderFacts(entry.keyFacts || []);
    renderSummary(entry.summary || '');
    renderRelated(entry.relatedTerms || []);
    renderCategories(entry.categories || []);
    renderSources(entry.sources || []);
    renderUpdated(entry);

    show(elements['gloss-body'], true);
    openSheet();
  }

  function renderPronunciation(pronunciation, audioUrl) {
    var wrap = elements['gloss-pronunciation'];
    var textNode = elements['gloss-pronunciation-text'];
    var button = elements['gloss-audio'];

    textNode.textContent = pronunciation || '';
    show(wrap, Boolean(pronunciation || audioUrl));

    if (audioUrl) {
      button.dataset.src = audioUrl;
      show(button, true);
    } else {
      delete button.dataset.src;
      show(button, false);
    }
  }

  function toggleAudio() {
    var button = elements['gloss-audio'];
    var src = button.dataset.src;
    if (!src) return;

    if (audioPlayer && !audioPlayer.paused && audioPlayer.src === src) {
      audioPlayer.pause();
      return;
    }

    stopAudio();
    audioPlayer = new Audio(src);
    audioPlayer.addEventListener('play', function () { button.classList.add('is-playing'); });
    audioPlayer.addEventListener('pause', function () { button.classList.remove('is-playing'); });
    audioPlayer.addEventListener('ended', function () { button.classList.remove('is-playing'); });
    audioPlayer.play().catch(function () {
      toast('Could not play the pronunciation audio.');
    });
  }

  function stopAudio() {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer = null;
    }
    if (elements['gloss-audio']) elements['gloss-audio'].classList.remove('is-playing');
  }

  function renderFacts(facts) {
    var list = elements['gloss-facts'];
    clear(list);

    facts.forEach(function (fact) {
      var row = document.createElement('div');
      var term = document.createElement('dt');
      term.textContent = fact.label;
      var value = document.createElement('dd');
      value.textContent = fact.value;
      row.appendChild(term);
      row.appendChild(value);
      list.appendChild(row);
    });

    show(elements['gloss-facts-section'], facts.length > 0);
  }

  function renderSummary(summary) {
    elements['gloss-summary'].textContent = summary;
    show(elements['gloss-summary-section'], summary.length > 0);
  }

  function renderRelated(terms) {
    var list = elements['gloss-related'];
    clear(list);

    terms.forEach(function (term) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = term;
      button.addEventListener('click', function () {
        if (onRelatedClick) onRelatedClick(term);
      });
      item.appendChild(button);
      list.appendChild(item);
    });

    show(elements['gloss-related-section'], terms.length > 0);
  }

  function renderCategories(categories) {
    var list = elements['gloss-categories'];
    clear(list);

    categories.forEach(function (name) {
      var item = document.createElement('li');
      item.textContent = name;
      list.appendChild(item);
    });

    show(elements['gloss-categories-section'], categories.length > 0);
  }

  function renderSources(sources) {
    var list = elements['gloss-sources'];
    clear(list);

    sources.forEach(function (source) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.name + ': ' + source.title;
      item.appendChild(link);
      list.appendChild(item);
    });
  }

  function renderUpdated(entry) {
    var parts = [];

    if (entry.lastUpdated) {
      parts.push('Source updated ' + formatDate(entry.lastUpdated));
    }
    if (entry.cache && entry.cache.status) {
      parts.push(entry.cache.status === 'miss' ? 'fetched just now' : 'served from cache');
    }

    elements['gloss-updated'].textContent = parts.join(' · ');
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return value;

    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }

  function glossAsText() {
    if (!currentEntry) return '';

    var entry = currentEntry;
    var lines = [entry.title || entry.query];

    if (entry.definition) lines.push('', entry.definition);
    if (entry.summary) lines.push('', entry.summary);

    if ((entry.keyFacts || []).length) {
      lines.push('', 'Key facts:');
      entry.keyFacts.forEach(function (fact) {
        lines.push('- ' + fact.label + ': ' + fact.value);
      });
    }

    if ((entry.relatedTerms || []).length) {
      lines.push('', 'Related: ' + entry.relatedTerms.join(', '));
    }

    if ((entry.sources || []).length) {
      lines.push('', 'Sources:');
      entry.sources.forEach(function (source) {
        lines.push('- ' + source.name + ': ' + source.url);
      });
    }

    return lines.join('\n');
  }

  function hasGloss() {
    return Boolean(currentEntry);
  }

  /* ---------- History ---------- */

  function renderHistory(list, onPick) {
    var container = elements['history-list'];
    clear(container);

    list.forEach(function (term) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = term;
      button.addEventListener('click', function () {
        onPick(term);
      });
      item.appendChild(button);
      container.appendChild(item);
    });

    show(elements.history, list.length > 0);
  }

  /* ---------- Feedback ---------- */

  function toast(message) {
    var node = elements.toast;
    node.textContent = message;
    show(node, true);

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      show(node, false);
    }, 2600);
  }

  function showNotice(element, message) {
    clear(element);
    var line = document.createElement('p');
    line.textContent = message;
    element.appendChild(line);
    show(element, true);
  }

  function hideNotice(element) {
    show(element, false);
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    elements['theme-label'].textContent =
      theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light';
  }

  function init(handlers) {
    cacheElements();
    onRelatedClick = handlers.onRelatedClick;
    elements['gloss-close'].addEventListener('click', closeSheet);
    elements['gloss-audio'].addEventListener('click', toggleAudio);
  }

  return {
    init: init,
    showGlossLoading: showGlossLoading,
    showGlossSlow: showGlossSlow,
    showGlossError: showGlossError,
    renderGloss: renderGloss,
    renderHistory: renderHistory,
    glossAsText: glossAsText,
    hasGloss: hasGloss,
    closeSheet: closeSheet,
    toast: toast,
    showNotice: showNotice,
    hideNotice: hideNotice,
    applyTheme: applyTheme
  };
})();
