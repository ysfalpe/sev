export class MemoryManager {
    constructor() {
        this.intervals = new Set();
        this.timeouts = new Set();
        this.eventListeners = new Map();
    }

    addInterval(interval) {
        this.intervals.add(interval);
        return interval;
    }

    addTimeout(timeout) {
        this.timeouts.add(timeout);
        return timeout;
    }

    addEventListener(element, event, listener, options) {
        if (!this.eventListeners.has(element)) {
            this.eventListeners.set(element, new Map());
        }

        const elementListeners = this.eventListeners.get(element);
        if (!elementListeners.has(event)) {
            elementListeners.set(event, new Set());
        }

        elementListeners.get(event).add(listener);
        element.addEventListener(event, listener, options);
    }

    clearAll() {
        this.intervals.forEach(clearInterval);
        this.intervals.clear();

        this.timeouts.forEach(clearTimeout);
        this.timeouts.clear();

        this.eventListeners.forEach((elementListeners, element) => {
            if (element) {
                elementListeners.forEach((listeners, event) => {
                    listeners.forEach(listener => {
                        element.removeEventListener(event, listener);
                    });
                });
            }
        });
        this.eventListeners.clear();
    }
} 