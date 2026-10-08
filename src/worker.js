// Edge worker routing for Tzu Chi Canada web platform and volunteer intake workflow.
// Handles localized routing, form validation, and session preservation.
import generated from "./generated.json";
import formEn from "./snap/form.en.html";
import formZh from "./snap/form.zh_TW.html";
import thanksEn from "./snap/thanks.en.html";
import thanksZh from "./snap/thanks.zh_TW.html";
import privacyEn from "./snap/privacy.en.html";
import privacyZh from "./snap/privacy.zh_TW.html";

const PAGES = {
  form: { en: formEn, zh_TW: formZh },
  thanks: { en: thanksEn, zh_TW: thanksZh },
  privacy: { en: privacyEn, zh_TW: privacyZh },
};
const LOCALES = ["en", "zh_TW"];
const O = generated.options;
const PHONE = /^[0-9+().\-\s]{7,32}$/;
const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const TEXT = ["first_name", "last_name", "phone", "email", "city", "postal_code", "current_status_other", "languages_other"];
const ARRAYS = ["languages", "interests", "programs"];
// Fields the error summary can link to (same list as the app's form view).
const ANCHORS = ["first_name", "last_name", "phone", "email", "gender", "city", "province", "postal_code",
  "current_status", "current_status_other", "languages", "languages_other", "interests", "programs",
  "message", "newsletter_opt_in"];

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'none'; img-src 'self' data:; style-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const len = (s) => [...s].length;

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get("cookie") || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

function localeOf(request) {
  const c = cookies(request).demo_locale;
  return LOCALES.includes(c) ? c : "en";
}

function redirect(location, cookieHeaders = []) {
  const headers = new Headers({ location, "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" });
  for (const c of cookieHeaders) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
}

const localeCookie = (l) => `demo_locale=${l}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
const flashCookie = (o, validate) => {
  const keep = { ...o };
  let value = encodeURIComponent(JSON.stringify({ o: keep, v: validate }));
  if (value.length > 3600) {
    keep.message = (keep.message || "").slice(0, 100);
    value = encodeURIComponent(JSON.stringify({ o: keep, v: validate }));
  }
  return `demo_flash=${value}; Path=/volunteer; Max-Age=120; SameSite=Lax; Secure; HttpOnly`;
};
const clearFlash = "demo_flash=; Path=/volunteer; Max-Age=0; SameSite=Lax; Secure; HttpOnly";

function readAnswers(form) {
  const o = {};
  for (const f of [...TEXT, "gender", "province", "current_status", "message"]) o[f] = String(form.get(f) ?? "").trim();
  for (const f of ARRAYS) o[f] = form.getAll(f + "[]").map(String);
  o.newsletter_opt_in = form.get("newsletter_opt_in") ? "1" : "";
  return o;
}

async function answersFrom(request) {
  try {
    return readAnswers(await request.formData());
  } catch {
    return readAnswers(new FormData());
  }
}

// Form field validation rules and localized messaging.
function validate(o, locale) {
  const M = generated.messages[locale];
  const e = {};
  const fail = (field, key) => { if (!e[field]) e[field] = M[key]; };
  const str = (field, max) => {
    if (!o[field]) return fail(field, field + ".required");
    if (len(o[field]) > max) fail(field, field + ".max");
  };
  str("first_name", 255);
  str("last_name", 255);
  if (!o.phone) fail("phone", "phone.required"); else if (!PHONE.test(o.phone)) fail("phone", "phone.regex");
  const email = o.email.toLowerCase();
  if (!email) fail("email", "email.required");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email", "email.email");
  else if (len(email) > 255) fail("email", "email.max");
  if (!O.genders.includes(o.gender)) fail("gender", "gender.required");
  str("city", 120);
  if (!O.provinces.includes(o.province)) fail("province", "province.required");
  if (!o.postal_code) fail("postal_code", "postal_code.required"); else if (!POSTAL.test(o.postal_code)) fail("postal_code", "postal_code.regex");
  if (!O.current_statuses.includes(o.current_status)) fail("current_status", "current_status.required");
  if (o.current_status === "other" && !o.current_status_other) fail("current_status_other", "current_status_other.required_if");
  else if (len(o.current_status_other) > 255) fail("current_status_other", "current_status_other.max");
  if (o.languages.length === 0) fail("languages", "languages.required");
  else if (o.languages.some((v) => !O.languages.includes(v))) fail("languages", "languages.*.in");
  if (o.languages.includes("other") && !o.languages_other) fail("languages_other", "languages_other.required");
  else if (len(o.languages_other) > 255) fail("languages_other", "languages_other.max");
  if (o.interests.length === 0) fail("interests", "interests.required");
  else if (o.interests.some((v) => !O.interests.includes(v))) fail("interests", "interests.*.in");
  if (o.programs.some((v) => !O.programs.includes(v))) fail("programs", "programs.*.in");
  if (len(o.message) > 2000) fail("message", "message.max");
  return e;
}

const errP = (field, message) => `<p class="field-error" id="${field}-error">${esc(message)}</p>`;

// Restore user answers and render localized validation errors.
function renderForm(html, locale, old, errors) {
  const has = Object.keys(errors).length > 0;
  const E = generated.errors[locale];
  const rw = new HTMLRewriter();
  const mark = (el, f) => { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", f + "-error"); };

  for (const f of TEXT) {
    rw.on(`input#${f}`, {
      element(el) {
        if (old[f]) el.setAttribute("value", old[f]);
        if (!errors[f]) return;
        mark(el, f);
        if (f !== "current_status_other" && f !== "languages_other") el.after(errP(f, errors[f]), { html: true });
      },
    });
  }
  rw.on("select#province", { element(el) { if (errors.province) { mark(el, "province"); el.after(errP("province", errors.province), { html: true }); } } });
  rw.on("select#province option", { element(el) { if (old.province && el.getAttribute("value") === old.province) el.setAttribute("selected", ""); } });
  rw.on("textarea#message", {
    element(el) {
      if (old.message) el.setInnerContent(old.message);
      if (errors.message) { mark(el, "message"); el.after(errP("message", errors.message), { html: true }); }
    },
  });
  for (const f of ["gender", "current_status"]) {
    rw.on(`input[name="${f}"]`, { element(el) { if (old[f] && el.getAttribute("value") === old[f]) el.setAttribute("checked", ""); } });
  }
  for (const f of ARRAYS) {
    rw.on(`input[name="${f}[]"]`, { element(el) { if ((old[f] || []).includes(el.getAttribute("value"))) el.setAttribute("checked", ""); } });
  }
  rw.on("input#newsletter_opt_in", { element(el) { if (old.newsletter_opt_in) el.setAttribute("checked", ""); } });

  const groups = { gender: ["gender"], current_status: ["current_status", "current_status_other"], languages: ["languages", "languages_other"], interests: ["interests"], programs: ["programs"] };
  for (const [id, fields] of Object.entries(groups)) {
    rw.on(`fieldset#${id}`, {
      element(el) {
        const shown = fields.filter((f) => errors[f]);
        if (errors[id]) el.setAttribute("aria-describedby", id + "-error");
        if (shown.length) el.append(shown.map((f) => errP(f, errors[f])).join(""), { html: true });
      },
    });
  }

  if (has) {
    const items = Object.entries(errors)
      .map(([f, m]) => `<li>${ANCHORS.includes(f) ? `<a href="#${f}">${esc(m)}</a>` : esc(m)}</li>`).join("");
    const summary = `<div class="errors" role="alert" aria-labelledby="error-summary-title"><h2 id="error-summary-title">${esc(E.summary)}</h2><ul>${items}</ul></div>`;
    rw.on("p.note", { element(el) { el.before(summary, { html: true }); } });
    rw.on("div.page", { element(el) { el.setAttribute("class", "page has-errors"); } });
    html = html.replace("<title>", "<title>" + esc(E.titlePrefix));
  }
  return rw.transform(new Response(html, { headers: HTML_HEADERS }));
}

const page = (name, locale) => new Response(PAGES[name][locale], { headers: HTML_HEADERS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const read = request.method === "GET" || request.method === "HEAD";
    const locale = localeOf(request);
    let m;

    if (path === "/volunteer/signup") {
      if (read) {
        const raw = cookies(request).demo_flash;
        let flash = null;
        try { flash = raw ? JSON.parse(decodeURIComponent(raw)) : null; } catch { /* ignore a damaged cookie */ }
        const old = flash?.o || {};
        const res = renderForm(PAGES.form[locale], locale, old, flash?.v ? validate({ ...blank(), ...old }, locale) : {});
        if (raw) res.headers.append("set-cookie", clearFlash);
        return res;
      }
      if (request.method === "POST") {
        const old = await answersFrom(request);
        if (Object.keys(validate(old, locale)).length) return redirect("/volunteer/signup", [flashCookie(old, true)]);
        return redirect("/volunteer/signup/thanks");
      }
    }
    if ((m = path.match(/^\/volunteer\/signup\/locale\/(en|zh_TW)$/)) && request.method === "POST") {
      return redirect("/volunteer/signup", [localeCookie(m[1]), flashCookie(await answersFrom(request), false)]);
    }
    if ((m = path.match(/^\/locale\/(en|zh_TW)$/)) && request.method === "POST") {
      const back = new URL(request.headers.get("referer") || "/volunteer/privacy", url);
      return redirect(back.origin === url.origin ? back.pathname : "/volunteer/privacy", [localeCookie(m[1])]);
    }
    if (read && path === "/volunteer/signup/thanks") return page("thanks", locale);
    if (read && path === "/volunteer/privacy") return page("privacy", locale);
    if (!read) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    return env.ASSETS.fetch(request);
  },
};

const blank = () => ({
  first_name: "", last_name: "", phone: "", email: "", city: "", postal_code: "", current_status_other: "",
  languages_other: "", gender: "", province: "", current_status: "", message: "", newsletter_opt_in: "",
  languages: [], interests: [], programs: [],
});