export class NavigationManager {
    constructor() {
        this.routes = new Map();
        this.currentRoute = null;
        this.history = [];
        this.maxHistoryLength = 50;
        this.loadingIndicator = null;
        this.transitionDuration = 300;
        
        this.init();
    }

    init() {
        this.setupLoadingIndicator();
        this.setupEventListeners();
        this.setupInitialRoute();
    }

    setupLoadingIndicator() {
        this.loadingIndicator = document.createElement('div');
        this.loadingIndicator.className = 'loading-indicator';
        this.loadingIndicator.setAttribute('role', 'progressbar');
        this.loadingIndicator.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.loadingIndicator);
    }

    setupEventListeners() {
        // Sayfa geçişleri için event listener
        window.addEventListener('popstate', (e) => this.handlePopState(e));

        // Link tıklamaları için event listener
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]:not([target="_blank"])');
            if (link && this.shouldHandleLink(link)) {
                e.preventDefault();
                this.navigate(link.href);
            }
        });

        // Form submitleri için event listener
        document.addEventListener('submit', (e) => {
            const form = e.target;
            if (form.getAttribute('data-navigate') !== 'false') {
                e.preventDefault();
                this.handleFormSubmit(form);
            }
        });
    }

    setupInitialRoute() {
        const path = window.location.pathname;
        const route = this.findMatchingRoute(path);
        
        if (route) {
            this.currentRoute = route;
            this.loadRoute(route, path);
        } else {
            this.navigate('/404');
        }
    }

    addRoute(path, options = {}) {
        const route = {
            path: this.normalizePath(path),
            pattern: this.createRoutePattern(path),
            component: options.component,
            title: options.title,
            middleware: options.middleware || [],
            loadingDelay: options.loadingDelay || 200,
            cache: options.cache || false,
            template: options.template,
            onBeforeEnter: options.onBeforeEnter,
            onAfterEnter: options.onAfterEnter,
            onBeforeLeave: options.onBeforeLeave,
            onAfterLeave: options.onAfterLeave
        };

        this.routes.set(route.path, route);
    }

    async navigate(url, options = {}) {
        const path = this.getPathFromUrl(url);
        const route = this.findMatchingRoute(path);

        if (!route) {
            console.error(`Route not found: ${path}`);
            return this.navigate('/404');
        }

        // Mevcut rotadan ayrılma kontrolü
        if (this.currentRoute && this.currentRoute.onBeforeLeave) {
            const canLeave = await this.currentRoute.onBeforeLeave();
            if (!canLeave) return false;
        }

        // Yeni rotaya girme kontrolü
        if (route.onBeforeEnter) {
            const canEnter = await route.onBeforeEnter();
            if (!canEnter) return false;
        }

        // Middleware'leri çalıştır
        for (const middleware of route.middleware) {
            const result = await middleware();
            if (!result) return false;
        }

        // Loading göstergesi
        this.showLoading();

        try {
            // Rota yükleme
            await this.loadRoute(route, path, options);

            // History güncelleme
            if (!options.replace) {
                window.history.pushState({}, route.title, path);
                this.addToHistory(path);
            } else {
                window.history.replaceState({}, route.title, path);
            }

            // Başlık güncelleme
            if (route.title) {
                document.title = route.title;
            }

            // Scroll pozisyonunu sıfırla
            if (!options.preserveScroll) {
                window.scrollTo(0, 0);
            }

            // After enter hook'unu çalıştır
            if (route.onAfterEnter) {
                await route.onAfterEnter();
            }

            return true;
        } catch (error) {
            console.error('Navigation error:', error);
            this.hideLoading();
            return false;
        }
    }

    async loadRoute(route, path, options = {}) {
        // Cache kontrolü
        if (route.cache && route.cachedContent) {
            this.updateContent(route.cachedContent);
            this.hideLoading();
            return;
        }

        // Component yükleme
        let content;
        if (typeof route.component === 'function') {
            content = await route.component();
        } else if (route.template) {
            content = route.template;
        } else {
            throw new Error(`No content source for route: ${path}`);
        }

        // Cache'e alma
        if (route.cache) {
            route.cachedContent = content;
        }

        // İçeriği güncelle
        await this.updateContent(content);

        this.hideLoading();
        this.currentRoute = route;
    }

    async updateContent(content) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) {
            console.error('Main content container not found');
            return;
        }

        // Geçiş animasyonu
        mainContent.style.opacity = '0';
        await this.wait(this.transitionDuration / 2);

        // İçeriği güncelle
        if (typeof content === 'string') {
            mainContent.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            mainContent.innerHTML = '';
            mainContent.appendChild(content);
        } else {
            console.error('Invalid content type');
            return;
        }

        // Yeni içeriği göster
        mainContent.style.opacity = '1';
        await this.wait(this.transitionDuration / 2);

        // Scriptleri çalıştır
        this.executeScripts(mainContent);
    }

    executeScripts(container) {
        const scripts = container.getElementsByTagName('script');
        Array.from(scripts).forEach(script => {
            const newScript = document.createElement('script');
            
            Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            newScript.textContent = script.textContent;
            script.parentNode.replaceChild(newScript, script);
        });
    }

    async handleFormSubmit(form) {
        const action = form.action;
        const method = form.method.toUpperCase();
        const formData = new FormData(form);

        this.showLoading();

        try {
            let response;
            if (method === 'GET') {
                const params = new URLSearchParams(formData);
                response = await fetch(`${action}?${params}`);
            } else {
                response = await fetch(action, {
                    method,
                    body: formData
                });
            }

            if (!response.ok) throw new Error('Form submission failed');

            const contentType = response.headers.get('Content-Type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.redirect) {
                    await this.navigate(data.redirect);
                }
            } else {
                const html = await response.text();
                await this.updateContent(html);
            }
        } catch (error) {
            console.error('Form submission error:', error);
        } finally {
            this.hideLoading();
        }
    }

    handlePopState(event) {
        const path = window.location.pathname;
        const route = this.findMatchingRoute(path);

        if (route) {
            this.loadRoute(route, path, { preserveScroll: true });
        }
    }

    showLoading() {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = setTimeout(() => {
            this.loadingIndicator.setAttribute('aria-hidden', 'false');
            this.loadingIndicator.style.display = 'block';
        }, 200);
    }

    hideLoading() {
        clearTimeout(this.loadingTimeout);
        this.loadingIndicator.setAttribute('aria-hidden', 'true');
        this.loadingIndicator.style.display = 'none';
    }

    findMatchingRoute(path) {
        path = this.normalizePath(path);
        
        for (const [routePath, route] of this.routes) {
            if (route.pattern.test(path)) {
                return route;
            }
        }

        return null;
    }

    createRoutePattern(path) {
        return new RegExp(
            '^' + 
            this.normalizePath(path)
                .replace(/:[^\s/]+/g, '([^/]+)')
                .replace(/\*/g, '.*') + 
            '$'
        );
    }

    normalizePath(path) {
        return path.replace(/\/+$/, '').replace(/^\/+/, '/');
    }

    getPathFromUrl(url) {
        try {
            const urlObj = new URL(url, window.location.origin);
            return urlObj.pathname;
        } catch (e) {
            return url;
        }
    }

    shouldHandleLink(link) {
        const url = new URL(link.href);
        const isSameOrigin = url.origin === window.location.origin;
        const isNotDownload = !link.hasAttribute('download');
        const isNotMailto = !link.href.startsWith('mailto:');
        const isNotTel = !link.href.startsWith('tel:');

        return isSameOrigin && isNotDownload && isNotMailto && isNotTel;
    }

    addToHistory(path) {
        this.history.push(path);
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }
    }

    back() {
        window.history.back();
    }

    forward() {
        window.history.forward();
    }

    getHistory() {
        return [...this.history];
    }

    clearHistory() {
        this.history = [];
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default NavigationManager; 