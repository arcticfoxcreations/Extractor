/* Turns a block of paper text into readable paragraphs with the difficult
   terms marked as buttons.

   The rendering never uses innerHTML: matches are located by index and the
   surrounding text is appended as text nodes, so the person's document is
   always treated as data. */

window.Reader = (function () {
  'use strict';

  var container = null;
  var onTermSelect = null;
  var activeButton = null;
  var buttonsByTerm = Object.create(null);

  // Simple and predictable: escape every regex metacharacter.
  function escapeTerm(value) {
    return value.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  function isWordChar(character) {
    return character !== undefined && /[A-Za-z0-9]/.test(character);
  }

  /**
   * Builds one alternation regex for all terms, longest first so that
   * "electron transport" wins over "electron" when both are present.
   */
  function buildPattern(terms) {
    if (terms.length === 0) return null;

    var sorted = terms.slice().sort(function (a, b) {
      return b.length - a.length;
    });

    var alternation = sorted.map(escapeTerm).join('|');
    return new RegExp('(' + alternation + ')', 'gi');
  }

  function render(text, terms, handlers) {
    container = handlers.container;
    onTermSelect = handlers.onTermSelect;
    activeButton = null;
    buttonsByTerm = Object.create(null);

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    var names = terms.map(function (item) {
      return item.term;
    });
    var pattern = buildPattern(names);

    // Blank lines separate paragraphs; single newlines are soft wraps in
    // text copied out of a PDF, so they collapse to spaces.
    var paragraphs = text.split(/\n\s*\n/);

    paragraphs.forEach(function (raw) {
      var paragraph = raw.replace(/\s*\n\s*/g, ' ').trim();
      if (!paragraph) return;

      var node = document.createElement('p');
      fillParagraph(node, paragraph, pattern);
      container.appendChild(node);
    });
  }

  function fillParagraph(node, paragraph, pattern) {
    if (!pattern) {
      node.appendChild(document.createTextNode(paragraph));
      return;
    }

    pattern.lastIndex = 0;
    var cursor = 0;
    var match;

    while ((match = pattern.exec(paragraph)) !== null) {
      var start = match.index;
      var end = start + match[0].length;

      // Reject matches sitting inside a longer word: "ion" inside "region".
      if (isWordChar(paragraph[start - 1]) || isWordChar(paragraph[end])) {
        pattern.lastIndex = start + 1;
        continue;
      }

      if (start > cursor) {
        node.appendChild(document.createTextNode(paragraph.slice(cursor, start)));
      }

      node.appendChild(createTermButton(match[0]));
      cursor = end;
    }

    if (cursor < paragraph.length) {
      node.appendChild(document.createTextNode(paragraph.slice(cursor)));
    }
  }

  function createTermButton(label) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'term';
    button.textContent = label;
    button.setAttribute('aria-label', 'Explain ' + label);

    button.addEventListener('click', function () {
      setActive(button);
      onTermSelect(label);
    });

    var key = label.toLowerCase();
    if (!buttonsByTerm[key]) buttonsByTerm[key] = [];
    buttonsByTerm[key].push(button);

    return button;
  }

  function setActive(button) {
    if (activeButton) activeButton.classList.remove('is-active');
    activeButton = button;
    if (button) button.classList.add('is-active');
  }

  // Used when a term is reached from the related-terms list rather than a click.
  function highlightTerm(term) {
    var group = buttonsByTerm[String(term).toLowerCase()];
    if (group && group.length > 0) {
      setActive(group[0]);
      return true;
    }
    setActive(null);
    return false;
  }

  function reset() {
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    activeButton = null;
    buttonsByTerm = Object.create(null);
  }

  return { render: render, highlightTerm: highlightTerm, reset: reset };
})();
