/* Preserve form answers across redirects in this tab. Load before the signup wizard. */
(function () {
    'use strict';
    var key = 'tzuchi-signup-state';
    var root = document.querySelector('[data-wizard]');
    var form = root && root.closest('form');
    if (!form) {
        if (location.pathname.replace(/\/+$/, '').endsWith('/signup/thanks')) {
            try { sessionStorage.removeItem(key); } catch (e) { /* storage may be unavailable */ }
        }
        return;
    }

    var saved;
    try {
        saved = JSON.parse(sessionStorage.getItem(key));
        if (!saved || saved.expires < Date.now()) {
            sessionStorage.removeItem(key);
            saved = null;
        }
    } catch (e) { saved = null; }

    if (saved && Array.isArray(saved.entries)) {
        var answers = new Map();
        saved.entries.forEach(function (entry) {
            if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[1] !== 'string') return;
            var values = answers.get(entry[0]) || [];
            values.push(entry[1]);
            answers.set(entry[0], values);
        });
        var indexes = [];
        answers.forEach(function (values, name) {
            var match = /^backgrounds\[(\d+)\]/.exec(name);
            if (match && indexes.indexOf(match[1]) < 0) indexes.push(match[1]);
        });
        var rows = root.querySelector('[data-bg-rows]');
        var template = root.querySelector('[data-bg-template]');
        if (rows && template && indexes.length) {
            rows.replaceChildren();
            indexes.slice(0, 5).forEach(function (index, number) {
                var holder = document.createElement('template');
                holder.innerHTML = template.innerHTML.split('__INDEX__').join(index).split('__NUMBER__').join(number + 1);
                rows.appendChild(holder.content);
            });
        }
        Array.from(form.elements).forEach(function (el) {
            if (!el.name || el.tagName === 'BUTTON') return;
            var values = answers.get(el.name) || [];
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = values.indexOf(el.value) >= 0;
            else if (values.length) el.value = values[0];
        });
        var step = (answers.get('step') || [])[0];
        if (!document.querySelector('.page.has-errors') && root.dataset.steps.split(',').includes(step)) root.dataset.active = step;
    }

    form.addEventListener('submit', function () {
        try {
            var entries = Array.from(new FormData(form).entries()).filter(function (entry) { return typeof entry[1] === 'string'; });
            sessionStorage.setItem(key, JSON.stringify({ expires: Date.now() + 120000, entries: entries }));
        } catch (e) { /* The form still submits when browser storage is disabled. */ }
    }, true);
})();