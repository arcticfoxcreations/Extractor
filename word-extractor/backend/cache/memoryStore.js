'use strict';

/**
 * Map preserves insertion order, which gives us LRU eviction for free:
 * re-inserting a key on read moves it to the end of the iteration order.
 */
class MemoryStore {
  constructor({ maxEntries }) {
    this.name = 'memory';
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  async get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  async set(key, entry) {
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, entry);

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      this.entries.delete(oldest);
    }
  }

  async delete(key) {
    return this.entries.delete(key);
  }

  async clear() {
    const removed = this.entries.size;
    this.entries.clear();
    return removed;
  }

  async size() {
    return this.entries.size;
  }

  async keys(limit) {
    return Array.from(this.entries.keys()).slice(-limit).reverse();
  }

  async ready() {
    return true;
  }
}

module.exports = MemoryStore;
