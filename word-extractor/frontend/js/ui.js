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

  function cacheElements() {
    [
      'gloss', 'gloss-body', 'gloss-placeholder', 'gloss-loading', 'gloss-error',
      'gloss-title', 'gloss-pronunciation', 'gloss-definition',
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

  function showGlossLoading(term) {
    currentEntry = null;
    show(elements['gloss-placeholder'], false);
    show(elements['gloss-body'], false);
    show(elements['gloss-error'], false);
    show(elements['gloss-loading'], true);
    openSheet();

    if (term) {
      elements['gloss-loading'].setAttribute('aria-label', 'Looking up ' + term);
    }
  }

  function showGlossError(message, term) {
    currentEntry = null;
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

    show(elements['gloss-loading'], false);
    show(elements['gloss-error'], false);
    show(elements['gloss-placeholder'], false);

    elements['gloss-title'].textContent = entry.title || entry.query;

    if (entry.pronunciation) {
      elements['gloss-pronunciation'].textContent = entry.pronunciation;
      show(elements['gloss-pronunciation'], true);
    } else {
      show(elements['gloss-pronunciation'], false);
    }

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
  }

  return {
    init: init,
    showGlossLoading: showGlossLoading,
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
