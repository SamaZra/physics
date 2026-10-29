/* ==== Поиск по содержимому текущей страницы (аналог Ctrl+F) ==== */
(function () {
    'use strict';

    // Не запускаем на главной и избранном — там свои системы поиска
    var page = (location.pathname.split('/').pop() || '').toLowerCase();
    if (page === 'index.html' || page === 'favorites.html' || page === '') return;

    // ---------- Стили ----------
    var css = `
    .ps-fab {
        position: fixed; right: 12px; top: 64px; z-index: 1001;
        width: 44px; height: 44px; border-radius: 0;
        border: none;
        cursor: pointer;
        background: transparent;
        color: var(--text-secondary, #8ba5b8);
        display: flex; align-items: center; justify-content: center;
        padding: 0;
        transition: color 0.2s, transform 0.18s;
        -webkit-tap-highlight-color: transparent;
        opacity: 0.85;
        box-shadow: none;
    }
    .ps-fab:hover {
        opacity: 1;
        color: var(--accent, #3b82f6);
        transform: scale(1.08);
    }
    .ps-fab.open {
        opacity: 1;
        color: var(--accent, #3b82f6);
    }
    :root.light-mode .ps-fab {
        background: transparent;
        border-color: transparent;
    }
    :root.light-mode .ps-fab:hover,
    :root.light-mode .ps-fab.open {
        color: var(--accent, #2563eb);
        background: transparent;
    }

    .ps-bar {
        position: fixed; left: 50%; top: 8px; transform: translate(-50%, -120%);
        width: calc(100% - 32px); max-width: 640px; z-index: 9600;
        background: rgba(30, 53, 69, 0.95);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--border, rgba(59,130,246,0.15));
        border-radius: 20px;
        box-shadow: 0 12px 32px -10px rgba(0,0,0,0.55);
        padding: 10px 14px;
        display: flex; align-items: center; gap: 10px;
        transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s;
        opacity: 0;
    }
    .ps-bar.show { transform: translate(-50%, 0); opacity: 1; }
    :root.light-mode .ps-bar { background: rgba(255,255,255,0.95); }

    .ps-input {
        flex: 1; border: none; outline: none; background: transparent;
        color: var(--text, #fff); font-size: 1rem; padding: 6px 0;
    }
    .ps-input::placeholder { color: var(--text-secondary, #8ba5b8); }
    .ps-count {
        font-size: 0.72rem; font-weight: 600; color: var(--text-secondary, #8ba5b8);
        background: var(--menu-item-hover, rgba(255,255,255,0.08));
        padding: 4px 10px; border-radius: 999px; white-space: nowrap;
    }
    .ps-count.no { color: #ef4444; }
    .ps-btn {
        background: transparent; border: none; cursor: pointer;
        color: var(--text-secondary, #8ba5b8);
        width: 36px; height: 36px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 18px; transition: background 0.2s, color 0.2s;
    }
    .ps-btn:hover { background: rgba(59,130,246,0.15); color: var(--accent, #3b82f6); }

    mark.ps-mark {
        background: rgba(250, 204, 21, 0.45);
        color: inherit;
        border-radius: 3px;
        padding: 0 2px;
        transition: background 0.25s;
    }
    mark.ps-mark.ps-current {
        background: rgba(250, 204, 21, 0.85);
        box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.55);
    }
    :root.light-mode mark.ps-mark {
        background: rgba(250, 204, 21, 0.55);
    }
    :root.light-mode mark.ps-mark.ps-current {
        background: rgba(250, 204, 21, 0.95);
    }
    `;
    var style = document.createElement('style');
    style.id = 'page-search-style';
    style.textContent = css;
    document.head.appendChild(style);

    // ---------- Кнопка-лупа ----------
    var fab = document.createElement('button');
    fab.className = 'ps-fab';
    fab.type = 'button';
    fab.title = 'Поиск по странице';
    fab.setAttribute('aria-label', 'Поиск по странице');
    fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
    document.body.appendChild(fab);

    // ---------- Панель поиска ----------
    var bar = document.createElement('div');
    bar.className = 'ps-bar';
    bar.innerHTML =
        '<input type="text" class="ps-input" placeholder="Поиск по странице..." autocomplete="off">' +
        '<span class="ps-count">0</span>' +
        '<button class="ps-btn ps-prev" title="Предыдущее">▲</button>' +
        '<button class="ps-btn ps-next" title="Следующее">▼</button>' +
        '<button class="ps-btn ps-close" title="Закрыть">✖</button>';
    document.body.appendChild(bar);

    var input = bar.querySelector('.ps-input');
    var countEl = bar.querySelector('.ps-count');
    var prevBtn = bar.querySelector('.ps-prev');
    var nextBtn = bar.querySelector('.ps-next');
    var closeBtn = bar.querySelector('.ps-close');

    var marks = [];
    var currentIndex = -1;
    var originalHtml = null;   // снимок HTML для восстановления
    var searchTimer = null;

    // ---------- Снимок HTML (без скриптов и панелей) ----------
    function snapshotRoot() {
        // Ищем основной контейнер: .container, .main-content, main или body
        var root = document.querySelector('.container') || document.querySelector('main') || document.body;
        return root;
    }

    function clearMarks() {
        // Удаляем <mark class="ps-mark">, возвращая текст
        document.querySelectorAll('mark.ps-mark').forEach(function (m) {
            var parent = m.parentNode;
            while (m.firstChild) parent.insertBefore(m.firstChild, m);
            parent.removeChild(m);
        });
        marks = [];
        currentIndex = -1;
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ---------- Подсветка ----------
    function highlight(query) {
        clearMarks();
        countEl.classList.remove('no');

        if (!query || query.length < 2) {
            countEl.textContent = '0';
            return;
        }

        var root = snapshotRoot();
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                // Не трогаем скрипты, стили, панель поиска, панель навигации, звёздочку
                var p = node.parentNode;
                while (p && p !== root) {
                    if (p.tagName === 'SCRIPT' || p.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
                    if (p.classList && (
                        p.classList.contains('ps-bar') ||
                        p.classList.contains('ps-fab') ||
                        p.classList.contains('bottom-nav') ||
                        p.classList.contains('nav-back-btn') ||
                        p.id === 'favToggleBtn' ||
                        p.id === 'search-overlay-style' ||
                        p.id === 'reading-progress-bar'
                    )) return NodeFilter.FILTER_REJECT;
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        var regex = new RegExp(escapeRegex(query), 'gi');
        var nodes = [];
        var n;
        while ((n = walker.nextNode())) nodes.push(n);

        nodes.forEach(function (textNode) {
            var text = textNode.nodeValue;
            if (!regex.test(text)) return;
            regex.lastIndex = 0;

            var frag = document.createDocumentFragment();
            var lastIndex = 0;
            var m;
            while ((m = regex.exec(text)) !== null) {
                if (m.index > lastIndex) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
                }
                var mark = document.createElement('mark');
                mark.className = 'ps-mark';
                mark.textContent = m[0];
                frag.appendChild(mark);
                marks.push(mark);
                lastIndex = m.index + m[0].length;
            }
            if (lastIndex < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex)));
            }
            textNode.parentNode.replaceChild(frag, textNode);
        });

        countEl.textContent = marks.length ? '1 / ' + marks.length : '0';
        if (marks.length === 0) countEl.classList.add('no');

        if (marks.length > 0) {
            currentIndex = 0;
            scrollToCurrent();
        }
    }

    function scrollToCurrent() {
        if (currentIndex < 0 || currentIndex >= marks.length) return;
        marks.forEach(function (m, i) { m.classList.toggle('ps-current', i === currentIndex); });
        var el = marks[currentIndex];
        var rect = el.getBoundingClientRect();
        var top = window.scrollY + rect.top - 100;
        window.scrollTo({ top: top, behavior: 'smooth' });
        countEl.textContent = (currentIndex + 1) + ' / ' + marks.length;
    }

    function next() {
        if (!marks.length) return;
        currentIndex = (currentIndex + 1) % marks.length;
        scrollToCurrent();
    }
    function prev() {
        if (!marks.length) return;
        currentIndex = (currentIndex - 1 + marks.length) % marks.length;
        scrollToCurrent();
    }

    // ---------- Открытие / закрытие ----------
    function openBar() {
        bar.classList.add('show');
        fab.classList.add('open');
        setTimeout(function () { input.focus(); }, 60);
    }
    function closeBar() {
        bar.classList.remove('show');
        fab.classList.remove('open');
        clearMarks();
        input.value = '';
        countEl.textContent = '0';
        countEl.classList.remove('no');
    }

    // ---------- События ----------
    fab.addEventListener('click', function () {
        if (bar.classList.contains('show')) closeBar();
        else openBar();
    });
    closeBtn.addEventListener('click', closeBar);
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);

    input.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { highlight(input.value.trim()); }, 200);
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) prev(); else next();
        }
        if (e.key === 'Escape') closeBar();
    });

    document.addEventListener('keydown', function (e) {
        // Ctrl+F или Cmd+F — открываем свой поиск вместо браузерного
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
            e.preventDefault();
            openBar();
        }
    });

    // При закрытии снимаем подсветку (чтобы не оставалось выделения)
    window.addEventListener('beforeunload', clearMarks);
})();



