/* ==== Избранное для справочника физики ==== */
(function () {
    'use strict';

    var FAV_KEY = 'physics_favorites';

    function getFavorites() {
        try {
            var raw = localStorage.getItem(FAV_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }
    function saveFavorites(arr) {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch (e) {}
    }
    function isFavorite(url) { return getFavorites().indexOf(url) !== -1; }
    function addFavorite(url) {
        var fav = getFavorites();
        if (fav.indexOf(url) === -1) { fav.push(url); saveFavorites(fav); }
    }
    function removeFavorite(url) {
        saveFavorites(getFavorites().filter(function (u) { return u !== url; }));
    }
    function toggleFavorite(url) {
        if (isFavorite(url)) removeFavorite(url); else addFavorite(url);
        updateAllStars();
        return isFavorite(url);
    }

    function getPageInfo(url) {
        var data = window.PHYSICS_DATA || [];
        var decoded = decodeURIComponent(url);
        var found = data.find(function (p) { return p.url === url || p.url === decoded; });
        if (found) return found;
        var name = url.replace('.html', '').replace(/-/g, ' ');
        return { title: name, category: 'Страница', desc: '' };
    }

    function categoryColorClass(cat) {
        var c = (cat || '').toLowerCase();
        if (c.indexOf('механик') >= 0) return 'cat-mech';
        if (c.indexOf('молекуляр') >= 0 || c.indexOf('термодинам') >= 0 || c.indexOf('мкт') >= 0) return 'cat-thermo';
        if (c.indexOf('электр') >= 0) return 'cat-elec';
        return 'cat-other';
    }

    /* ---------- Рендер favorites.html ---------- */
    function renderFavoritesPage() {
        var list = document.getElementById('favoritesList');
        var count = document.getElementById('favCount');
        if (!list || !count) return;

        var fav = getFavorites();
        count.textContent = fav.length;

        var searchInput = document.getElementById('favSearchInput');
        var query = (searchInput && searchInput.value || '').trim().toLowerCase();

        // Очистить кнопку «✖»
        var clearBtn = document.getElementById('favSearchClear');
        if (clearBtn) clearBtn.classList.toggle('show', query.length > 0);

        if (fav.length === 0) {
            list.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-icon">⭐</div>' +
                    '<p>У вас пока нет избранных страниц</p>' +
                    '<p class="hint">Нажмите на звёздочку ☆ в левом нижнем углу любой страницы справочника</p>' +
                '</div>';
            return;
        }

        // Превращаем url в объекты с info
        var items = fav.map(function (url) {
            var info = getPageInfo(url);
            return {
                url: url,
                title: info.title || url,
                category: info.category || 'Страница',
                desc: info.desc || ''
            };
        });

        // Фильтр по поиску
        if (query) {
            items = items.filter(function (it) {
                return it.title.toLowerCase().indexOf(query) !== -1 ||
                       it.category.toLowerCase().indexOf(query) !== -1 ||
                       it.desc.toLowerCase().indexOf(query) !== -1;
            });
        }

        if (items.length === 0) {
            list.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-icon">🔍</div>' +
                    '<p>По запросу «' + query.replace(/</g, '&lt;') + '» ничего не найдено</p>' +
                    '<p class="hint">Попробуйте другое слово</p>' +
                '</div>';
            return;
        }

        // Группировка по категории (по родительскому разделу — до «→»)
        var groups = {};
        items.forEach(function (it) {
            // Берём первую часть категории до «→», чтобы «Механика → Кинематика» попало в «Механика»
            var root = (it.category || '').split('→')[0].trim() || 'Другие';
            if (!groups[root]) groups[root] = [];
            groups[root].push(it);
        });

        // Сортируем категории по алфавиту
        var sortedKeys = Object.keys(groups).sort(function (a, b) {
            return a.localeCompare(b, 'ru');
        });

        var html = '';
        sortedKeys.forEach(function (key) {
            var items = groups[key];
            // Сортировка внутри категории по title
            items.sort(function (a, b) {
                return a.title.localeCompare(b.title, 'ru');
            });

            var cls = categoryColorClass(key);

            html += '<div class="fav-group">';
            html += '<div class="fav-group-title ' + cls + '">' +
                        '<span class="dot"></span>' +
                        '<span>' + escapeHtml(key) + '</span>' +
                        '<span class="badge">' + items.length + '</span>' +
                    '</div>';

            items.forEach(function (it) {
                var safe = it.url.replace(/'/g, "\\'");
                html +=
                    '<div class="favorite-item ripple-host" onclick="window.location.href=\'' + it.url + '\'">' +
                        '<div class="favorite-content">' +
                            '<div class="favorite-title">' + escapeHtml(it.title) + '</div>' +
                            '<div class="favorite-desc">' + escapeHtml(it.desc || '') + '</div>' +
                        '</div>' +
                        '<button class="remove-fav" title="Удалить" onclick="event.stopPropagation(); window.__favRemove(\'' + safe + '\')">✖</button>' +
                    '</div>';
            });

            html += '</div>';
        });

        list.innerHTML = html;

        // Перепривязываем ripple на новые карточки
        if (window.__bindRipple) window.__bindRipple();
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ---------- Текущая страница ---------- */
    function currentPageUrl() {
        var path = location.pathname.split('/').pop() || 'index.html';
        return decodeURIComponent(path);
    }

    /* ---------- Плавающая звезда внизу слева БЕЗ фона ---------- */
    function createStarButton() {
        if (document.getElementById('favToggleBtn')) return;
        if (currentPageUrl() === 'favorites.html') return;

        var btn = document.createElement('button');
        btn.id = 'favToggleBtn';
        btn.type = 'button';
        btn.title = 'В избранное';
        btn.setAttribute('aria-label', 'В избранное');
        btn.style.cssText =
            'position:fixed;left:16px;bottom:20px;' +
            'width:48px;height:48px;border-radius:0;border:none;' +
            'background:transparent;box-shadow:none;backdrop-filter:none;' +
            '-webkit-backdrop-filter:none;cursor:pointer;' +
            'font-size:26px;line-height:1;' +
            'display:flex;align-items:center;justify-content:center;' +
            'z-index:950;padding:0;' +
            'transition:transform 0.18s, color 0.2s, text-shadow 0.2s;' +
            'color:var(--text-secondary, #8ba5b8);' +
            '-webkit-tap-highlight-color:transparent;';

        btn.addEventListener('click', function () {
            toggleFavorite(currentPageUrl());
            btn.style.transform = 'scale(1.2)';
            setTimeout(function () { btn.style.transform = 'scale(1)'; }, 160);
        });
        document.body.appendChild(btn);
        updateAllStars();
    }

    function updateAllStars() {
        var btn = document.getElementById('favToggleBtn');
        if (!btn) return;
        var on = isFavorite(currentPageUrl());
        if (on) {
            btn.textContent = '★';
            btn.style.color = '#facc15';
            btn.style.textShadow = '0 0 8px rgba(250,204,21,0.7), 0 0 16px rgba(250,204,21,0.35)';
        } else {
            btn.textContent = '☆';
            btn.style.color = 'var(--text-secondary, #8ba5b8)';
            btn.style.textShadow = 'none';
        }
        document.querySelectorAll('.fav-toggle[data-fav-url]').forEach(function (el) {
            var on2 = isFavorite(el.getAttribute('data-fav-url'));
            el.textContent = on2 ? '★' : '☆';
            el.classList.toggle('active', on2);
        });
    }

    function watchTheme() {
        var observer = new MutationObserver(function () {
            var btn = document.getElementById('favToggleBtn');
            if (btn) updateAllStars();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- Публичные функции ---------- */
    window.__favRemove = function (url) {
        removeFavorite(url);
        renderFavoritesPage();
    };
    window.clearAllFavorites = function () {
        if (confirm('Удалить все страницы из избранного?')) {
            saveFavorites([]);
            renderFavoritesPage();
        }
    };

    /* ---------- Ripple для favorites.html ---------- */
    function bindRipple() {
        document.querySelectorAll('.favorite-item, .back-link, .bottom-nav a, .bottom-nav button').forEach(function(el){
            if (el.dataset.rippleBound) return;
            el.dataset.rippleBound = '1';
            el.classList.add('ripple-host');
            el.addEventListener('pointerdown', function(e){
                var rect = el.getBoundingClientRect();
                var size = Math.max(rect.width, rect.height);
                var r = document.createElement('span');
                r.className = 'ripple';
                r.style.width = r.style.height = size + 'px';
                r.style.left = (e.clientX - rect.left - size/2) + 'px';
                r.style.top  = (e.clientY - rect.top  - size/2) + 'px';
                el.appendChild(r);
                setTimeout(function(){ r.remove(); }, 650);
            });
        });
    }
    window.__bindRipple = bindRipple;

    /* ---------- Поиск по избранному ---------- */
    function bindSearch() {
        var input = document.getElementById('favSearchInput');
        var clearBtn = document.getElementById('favSearchClear');
        if (!input) return;
        var t = null;
        input.addEventListener('input', function () {
            clearTimeout(t);
            t = setTimeout(renderFavoritesPage, 180);
        });
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                input.value = '';
                renderFavoritesPage();
                input.focus();
            });
        }
    }

    /* ---------- Инициализация ---------- */
    function init() {
        bindSearch();
        renderFavoritesPage();
        createStarButton();
        watchTheme();
        bindRipple();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
