'use strict';

function createQueue() {
  const items = [];
  let running = false;
  let runner = null;
  let onIdle = () => {};
  const maxPending = 20;

  function pump() {
    if (running || !runner || items.length === 0) return;
    running = true;
    const item = items.shift();
    Promise.resolve()
      .then(() => runner(item))
      .catch((error) => {
        if (item && typeof item.onError === 'function') item.onError(error);
      })
      .finally(() => {
        running = false;
        if (items.length === 0) onIdle();
        else pump();
      });
  }

  function place(item, next) {
    if (items.length >= maxPending) return false;
    if (next) items.unshift(item);
    else items.push(item);
    pump();
    return true;
  }

  return {
    enqueue(item) {
      return place(item, false);
    },
    enqueueNext(item) {
      return place(item, true);
    },
    setRunner(fn) {
      runner = fn;
      pump();
    },
    setOnIdle(fn) {
      onIdle = typeof fn === 'function' ? fn : () => {};
    },
    pending() {
      return items.length;
    },
    isBusy() {
      return running;
    }
  };
}

module.exports = { createQueue };
