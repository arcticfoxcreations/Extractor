/* Search history and theme preference. Every read and write is guarded:
   Safari private mode throws on localStorage access rather than failing soft. */

window.Store = (function () {
  'use strict';

  var HISTORY_KEY = 'wx.history';
  var THEME_KEY = 'wx.theme';
  var DRAFT_KEY = 'wx.draft';
  var max = window.WordExtractorConfig.maxHistory;

  function read(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function getHistory() {
    var list = read(HISTORY_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  function addHistory(term) {
    var clean = String(term || '').trim();
    if (!clean) return getHistory();

    var list = getHistory().filter(function (item) {
      return item.toLowerCase() !== clean.toLowerCase();
    });

    list.unshift(clean);
    list = list.slice(0, max);
    write(HISTORY_KEY, list);
    return list;
  }

  function clearHistory() {
    write(HISTORY_KEY, []);
    return [];
  }

  function getTheme() {
    var value = read(THEME_KEY, 'auto');
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  function setTheme(value) {
    write(THEME_KEY, value);
  }

  function getDraft() {
    var value = read(DRAFT_KEY, '');
    return typeof value === 'string' ? value : '';
  }

  function setDraft(value) {
    // Long papers would blow the storage quota; the draft is a convenience.
    write(DRAFT_KEY, String(value || '').slice(0, 20000));
  }

  return {
    getHistory: getHistory,
    addHistory: addHistory,
    clearHistory: clearHistory,
    getTheme: getTheme,
    setTheme: setTheme,
    getDraft: getDraft,
    setDraft: setDraft
  };
})();
