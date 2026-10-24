/* Volunteer sign-up: one step at a time. Plain JavaScript, no libraries, no network calls.
   The page is complete without this file: the server renders the right step as active, and
   without scripts every step is shown at once. This adds Back / Next, a check of the required
   answers before moving on, repeatable professional backgrounds, and the review summary. */
(function () {
    'use strict';

    var root = document.querySelector('[data-wizard]');
    if (!root) return;

    var keys = root.getAttribute('data-steps').split(',');
    var last = keys[keys.length - 1];
    var steps = {};
    root.querySelectorAll('[data-step]').forEach(function (el) { steps[el.getAttribute('data-step')] = el; });
    var progressItems = root.querySelectorAll('[data-progress-step]');
    var linkItems = document.querySelectorAll('[data-step-link]');
    var stepInput = root.querySelector('[data-step-input]');
    var progressText = root.querySelector('[data-progress-text]');
    var sheet = root.querySelector('.sheet');
    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function current() { return root.getAttribute('data-active'); }

    function stateOf(index, activeIndex) {
        return index < activeIndex ? 'is-done' : index === activeIndex ? 'is-current' : '';
    }

    function paint(list, attr, activeIndex) {
        list.forEach(function (item) {
            var index = keys.indexOf(item.getAttribute(attr));
            item.classList.remove('is-done', 'is-current');
            var state = stateOf(index, activeIndex);
            if (state) item.classList.add(state);
            var link = item.querySelector('a');
            if (index === activeIndex) link.setAttribute('aria-current', 'step');
            else link.removeAttribute('aria-current');
        });
    }

    function goTo(key, options) {
        options = options || {};
        if (!steps[key]) return;
        var index = keys.indexOf(key);

        root.setAttribute('data-active', key);
        Object.keys(steps).forEach(function (k) { steps[k].classList.toggle('is-active', k === key); });
        paint(progressItems, 'data-progress-step', index);
        paint(linkItems, 'data-step-link', index);
        if (stepInput) stepInput.value = key;
        if (progressText) {
            progressText.textContent = progressText.getAttribute('data-pattern')
                .replace(':current', index + 1).replace(':total', keys.length);
        }
        if (key === last) buildReview();

        if (options.hash !== false) {
            try { history.replaceState(null, '', '#' + key); } catch (e) { /* the address bar is a courtesy */ }
        }

        if (options.scroll !== false && sheet.getBoundingClientRect().top < 0) {
            sheet.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
        }
        if (options.focus !== false) {
            var heading = steps[key].querySelector('h2');
            if (heading) heading.focus({ preventScroll: true });
        }
    }

    /* ---- Checking the required answers before moving on ---- */

    function clearProblems(scope) {
        scope.querySelectorAll('[data-js-error]').forEach(function (el) { el.remove(); });
        scope.querySelectorAll('[data-js-invalid]').forEach(function (el) {
            el.removeAttribute('data-js-invalid');
            el.setAttribute('aria-invalid', 'false');
            el.removeAttribute('aria-describedby');
        });
    }

    var counter = 0;
    function problem(node, message) {
        var p = document.createElement('p');
        p.className = 'field-error';
        p.id = 'js-error-' + (++counter);
        p.setAttribute('data-js-error', '');
        p.textContent = message;
        if (node.tagName === 'FIELDSET') {
            node.appendChild(p);
        } else {
            node.insertAdjacentElement('afterend', p);
            node.setAttribute('aria-invalid', 'true');
            node.setAttribute('data-js-invalid', '');
            node.setAttribute('aria-describedby', p.id);
        }
        return node;
    }

    /* Returns true when every required answer on the step is there. Format checks (phone,
       postal code) stay with the server, which has the plain-language messages for them. */
    function stepIsComplete(step) {
        clearProblems(step);
        var first = null;

        step.querySelectorAll('[required]:not([type="radio"]):not([type="checkbox"])').forEach(function (el) {
            var message = null;
            if (!el.value.trim()) message = el.getAttribute('data-msg') || el.validationMessage;
            else if (!el.checkValidity()) message = el.validationMessage;
            if (message) { var bad = problem(el, message); first = first || bad; }
        });

        step.querySelectorAll('[data-required-group]').forEach(function (group) {
            if (!group.querySelector('input:checked')) {
                var bad = problem(group, group.getAttribute('data-msg'));
                first = first || (group.querySelector('input') || bad);
            }
        });

        if (first) first.focus();
        return !first;
    }

    root.addEventListener('input', function (event) {
        var holder = event.target.closest('.field, fieldset');
        if (holder) clearProblems(holder);
    });

    /* ---- Moving around ---- */

    function next() {
        var key = current();
        if (!stepIsComplete(steps[key])) return;
        var i = keys.indexOf(key);
        if (i < keys.length - 1) goTo(keys[i + 1]);
    }

    function previous() {
        var i = keys.indexOf(current());
        if (i > 0) goTo(keys[i - 1]);
    }

    root.querySelector('[data-next]').addEventListener('click', next);
    root.querySelector('[data-prev]').addEventListener('click', previous);

    /* Enter inside a field means "next", not "send the application half-finished". */
    root.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' || current() === last) return;
        var tag = event.target.tagName;
        if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A' || tag === 'SELECT') return;
        event.preventDefault();
        next();
    });

    /* Links to a step or to a field inside one (progress bar, side list, error summary, Edit). */
    document.addEventListener('click', function (event) {
        var link = event.target.closest('a[href^="#"], [data-goto]');
        if (!link || !root.contains(link) && !link.closest('.steps')) return;

        var id = link.getAttribute('data-goto') || link.getAttribute('href').slice(1);
        var target = id ? document.getElementById(id) : null;
        var step = steps[id] ? steps[id] : (target ? target.closest('[data-step]') : null);
        if (!step) return;

        event.preventDefault();
        var key = step.getAttribute('data-step');
        goTo(key, { focus: target === step || !target });
        if (target && target !== step) {
            var field = target.matches('input, select, textarea') ? target : (target.querySelector('input, select, textarea') || target);
            field.focus();
            target.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
        }
    });

    /* ---- Professional backgrounds: add and remove rows ---- */

    var bgList = root.querySelector('[data-bg-list]');
    if (bgList) {
        var bgRows = bgList.querySelector('[data-bg-rows]');
        var bgTemplate = bgList.querySelector('[data-bg-template]');
        var bgAdd = bgList.querySelector('[data-bg-add]');
        var bgMax = parseInt(bgList.getAttribute('data-max'), 10) || 5;
        var nextIndex = 0;

        bgRows.querySelectorAll('[name^="backgrounds["]').forEach(function (el) {
            var found = /^backgrounds\[(\d+)\]/.exec(el.name);
            if (found) nextIndex = Math.max(nextIndex, parseInt(found[1], 10) + 1);
        });

        var renumber = function () {
            var rows = bgRows.querySelectorAll('[data-bg-row]');
            rows.forEach(function (row, i) {
                var title = row.querySelector('[data-bg-title]');
                title.textContent = title.getAttribute('data-pattern').replace(':number', i + 1);
                row.querySelector('[data-bg-remove]').hidden = rows.length === 1;
            });
            bgAdd.hidden = rows.length >= bgMax;
        };

        bgAdd.addEventListener('click', function () {
            if (bgRows.querySelectorAll('[data-bg-row]').length >= bgMax) return;
            var holder = document.createElement('template');
            holder.innerHTML = bgTemplate.innerHTML.split('__INDEX__').join(nextIndex++).split('__NUMBER__').join('');
            var row = holder.content.querySelector('[data-bg-row]');
            bgRows.appendChild(holder.content);
            renumber();
            var firstField = row.querySelector('select, input');
            if (firstField) firstField.focus();
        });

        bgList.addEventListener('click', function (event) {
            var remove = event.target.closest('[data-bg-remove]');
            if (!remove) return;
            remove.closest('[data-bg-row]').remove();
            renumber();
            bgAdd.focus();
        });

        renumber();
    }

    function updateConditionalFields() {
        root.querySelectorAll('[data-bg-row]').forEach(function (row) {
            var currentPosition = row.querySelector('select[name$="[is_current]"]');
            var endMonth = row.querySelector('input[name$="[end_month]"]');
            if (currentPosition && endMonth) {
                endMonth.disabled = currentPosition.value === 'yes';
            }
        });
        var other = root.querySelector('input[name="education[certifications_other]"]');
        var selected = root.querySelector('input[name="education[certifications][]"][value="other"]');
        if (other && selected) {
            other.closest('.field').hidden = !selected.checked;
            other.disabled = !selected.checked;
            other.required = selected.checked;
        }
    }
    root.addEventListener('change', updateConditionalFields);
    updateConditionalFields();

    /* ---- Review: read the answers back from the form itself ---- */

    var reviewTarget = root.querySelector('[data-review-target]');

    function textOf(el) {
        var copy = el.cloneNode(true);
        copy.querySelectorAll('.req, .vh').forEach(function (x) { x.remove(); });
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function labelOf(node) {
        if (node.hasAttribute('data-review-label')) return node.getAttribute('data-review-label');
        var heading = node.querySelector(':scope > legend, :scope > label:not(.sub):not(.choice)');
        return heading ? textOf(heading) : '';
    }

    /* One answer as {label, lines}, or null to leave it out. */
    function describe(node) {
        var type = node.getAttribute('data-review-type');

        if (type === 'availability') {
            var days = [];
            node.querySelectorAll('input:checked').forEach(function (box) {
                var day = box.getAttribute('data-day');
                var found = days.filter(function (d) { return d.day === day; })[0];
                if (!found) days.push(found = { day: day, slots: [] });
                found.slots.push(box.getAttribute('data-slot'));
            });
            return { label: labelOf(node), lines: days.map(function (d) { return d.day + ': ' + d.slots.join(', '); }) };
        }

        if (type === 'background') {
            var parts = [];
            node.querySelectorAll('[data-review]').forEach(function (field) {
                var item = describe(field);
                if (item && item.lines.length) parts.push(item.label + ': ' + item.lines.join(', '));
            });
            var title = node.querySelector('[data-bg-title]');
            return { label: title ? title.textContent : labelOf(node), lines: parts, optionalRow: true };
        }

        if (node.hasAttribute('data-review-yes')) {
            return node.querySelector('input').checked ? { label: labelOf(node), lines: [node.getAttribute('data-review-yes')] } : null;
        }

        var lines = [];
        var chosen = node.querySelectorAll('input:checked');
        if (chosen.length) {
            var names = [];
            chosen.forEach(function (input) { names.push(textOf(input.closest('.choice') || input.parentNode)); });
            lines.push(names.join(', '));
        }
        node.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="month"], textarea').forEach(function (el) {
            if (!el.disabled && el.value.trim()) lines.push(el.value.trim());
        });
        node.querySelectorAll('select').forEach(function (el) {
            if (el.value) lines.push(el.options[el.selectedIndex].text);
        });
        return { label: labelOf(node), lines: lines };
    }

    function buildReview() {
        if (!reviewTarget) return;
        var missing = reviewTarget.getAttribute('data-not-provided');
        var edit = reviewTarget.getAttribute('data-edit');
        reviewTarget.replaceChildren();
        var shown = 0;

        keys.slice(0, -1).forEach(function (key) {
            var items = [];
            steps[key].querySelectorAll('[data-review]').forEach(function (node, i) {
                if (node.parentElement.closest('[data-review-type="background"]')) return;
                var item = describe(node);
                if (item && !(item.optionalRow && !item.lines.length && i > 0)) items.push(item);
            });
            if (!items.length) return;

            var group = document.createElement('section');
            group.className = 'review-group';
            var head = document.createElement('div');
            head.className = 'review-head';
            var title = document.createElement('h3');
            title.textContent = textOf(root.querySelector('[data-progress-step="' + key + '"] .lbl'));
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'link-button';
            button.textContent = edit;
            button.addEventListener('click', function () { goTo(key); });
            head.append(title, button);

            var list = document.createElement('dl');
            items.forEach(function (item) {
                var row = document.createElement('div');
                var term = document.createElement('dt');
                term.textContent = item.label;
                var detail = document.createElement('dd');
                if (item.lines.length) {
                    item.lines.forEach(function (line) {
                        var p = document.createElement('span');
                        p.textContent = line;
                        detail.appendChild(p);
                    });
                } else {
                    detail.className = 'is-empty';
                    detail.textContent = missing;
                }
                row.append(term, detail);
                list.appendChild(row);
            });

            group.append(head, list);
            reviewTarget.appendChild(group);
            shown++;
        });

        if (!shown) reviewTarget.textContent = reviewTarget.getAttribute('data-empty');
    }

    /* ---- Start ---- */

    /* A link such as /volunteer/signup#availability opens that step, unless the server is
       already showing problems, which come first. */
    var hash = decodeURIComponent(location.hash.slice(1));
    var hasProblems = !!document.querySelector('.page.has-errors');
    if (hash && steps[hash] && !hasProblems) {
        goTo(hash, { focus: false, scroll: false, hash: false });
        window.scrollTo(0, 0); // the browser has already jumped to the step; show the progress bar again
    }
    else goTo(current(), { focus: false, scroll: false, hash: false });

    root.classList.add('is-ready');
})();
