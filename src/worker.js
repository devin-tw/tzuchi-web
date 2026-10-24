// Edge worker routing for Tzu Chi Canada web platform and volunteer intake workflow.
// Handles localized routing, form validation, and session preservation.
import generated from "./generated.json";
import formEn from "./snap/form.en.html";
import formZh from "./snap/form.zh_TW.html";
import thanksEn from "./snap/thanks.en.html";
import thanksZh from "./snap/thanks.zh_TW.html";
import privacyEn from "./snap/privacy.en.html";
import privacyZh from "./snap/privacy.zh_TW.html";
import formFr from "./snap/form.fr.html";
import thanksFr from "./snap/thanks.fr.html";
import privacyFr from "./snap/privacy.fr.html";

const PAGES = {
  form: { en: formEn, zh_TW: formZh, fr: formFr },
  thanks: { en: thanksEn, zh_TW: thanksZh, fr: thanksFr },
  privacy: { en: privacyEn, zh_TW: privacyZh, fr: privacyFr },
};
const LOCALES = ["en", "zh_TW", "fr"];
const O = generated.options;
const PHONE = /^[0-9+().\-\s]{7,32}$/;
const POSTAL = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const TEXT = ["first_name", "last_name", "phone", "email", "city", "postal_code", "current_status_other", "languages_other"];
const ARRAYS = ["languages", "interests", "programs"];
// Fields the error summary can link to (same list as the app's form view).
const ANCHORS = ["first_name", "last_name", "phone", "email", "gender", "city", "province", "postal_code",
  "current_status", "current_status_other", "languages", "languages_other", "backgrounds", "availability",
  "education", "skills", "skills_other", "service_mode", "interests", "programs", "message", "newsletter_opt_in"];

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy":
    "default-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
// Answers stay in the visitor's tab for at most two minutes. Only the step and
// validation messages cross a redirect in the small, HttpOnly flash cookie.
const flashCookie = (o, errors = {}) => `demo_flash=${encodeURIComponent(JSON.stringify({ step: o.step, errors }))}; Path=/volunteer; Max-Age=120; SameSite=Lax; Secure; HttpOnly`;
const clearFlash = "demo_flash=; Path=/volunteer; Max-Age=0; SameSite=Lax; Secure; HttpOnly";

function readAnswers(form) {
  const o = {};
  for (const f of [...TEXT, "gender", "province", "current_status", "message", "step"]) o[f] = String(form.get(f) ?? "").trim();
  for (const f of ARRAYS) o[f] = form.getAll(f + "[]").map(String);
  o.newsletter_opt_in = form.get("newsletter_opt_in") ? "1" : "";
  o.availability = form.getAll("availability[]").map(String);
  const text = (name) => String(form.get(name) ?? "").trim();
  const indexes = [...new Set([...form.keys()].map((name) => /^backgrounds\[(\d+)\]/.exec(name)?.[1]).filter(Boolean))];
  o.backgrounds = indexes.slice(0, 6).map((index) => {
    const row = {};
    for (const field of ["organization", "industry", "start_month", "end_month", "is_current", "summary", "management_experience"]) {
      row[field] = text(`backgrounds[${index}][${field}]`);
    }
    row.work_fields = form.getAll(`backgrounds[${index}][work_fields][]`).map(String);
    if (row.is_current === "yes") row.end_month = "";
    return row;
  });
  o.education = {};
  for (const field of ["level", "school", "major", "certifications_other"]) o.education[field] = text(`education[${field}]`);
  o.education.certifications = form.getAll("education[certifications][]").map(String);
  o.skills = Object.fromEntries(Object.keys(O.skills).map((group) => [group, form.getAll(`skills[${group}][]`).map(String)]));
  o.skills_other = text("skills_other");
  o.service_mode = text("service_mode");
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
  const fail = (field, key) => { if (!e[field]) e[field] = M[key] ? key : "*.in"; };
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
  const allowed = (field, value, options) => { if (value && !options.includes(value)) fail(field, "*.in"); };
  const limit = (field, value, max) => { if (len(value || "") > max) fail(field, "message.max"); };
  const choices = (field, values, options) => { if (values.some((v) => !options.includes(v))) fail(field, "*.in"); };
  const month = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (o.backgrounds.length > 5) fail("backgrounds", "backgrounds.max");
  o.backgrounds.forEach((row, index) => {
    const key = `backgrounds.${index}`;
    limit(key + ".organization", row.organization, 160);
    limit(key + ".industry", row.industry, 160);
    limit(key + ".summary", row.summary, 2000);
    allowed(key + ".is_current", row.is_current, ["yes", "no"]);
    allowed(key + ".management_experience", row.management_experience, O.management_experience);
    choices(key + ".work_fields", row.work_fields, O.work_fields);
    for (const field of ["start_month", "end_month"]) {
      if (row[field] && !month(row[field])) fail(key + "." + field, "backgrounds.*." + field + ".date_format");
    }
    if (row.start_month && row.end_month && row.end_month < row.start_month) fail(key + ".end_month", "backgrounds.*.end_month.after_or_equal");
  });
  allowed("education.level", o.education.level, O.education_levels);
  limit("education.school", o.education.school, 255);
  limit("education.major", o.education.major, 255);
  limit("education.certifications_other", o.education.certifications_other, 500);
  choices("education.certifications", o.education.certifications, O.certifications);
  if (o.education.certifications.includes("other") && !o.education.certifications_other) fail("education.certifications_other", "education.certifications_other.required");
  for (const [group, options] of Object.entries(O.skills)) choices("skills." + group, o.skills[group], options);
  limit("skills_other", o.skills_other, 1000);
  allowed("service_mode", o.service_mode, O.service_modes);
  choices("availability", o.availability, O.days.flatMap((day) => O.form_slots.map((slot) => day + "_" + slot)));
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

  const SECTIONS = ['about', 'where', 'background', 'availability', 'help', 'review'];
  const STEP_OF_FIELD = {
    first_name: 'about', last_name: 'about', phone: 'about', email: 'about', gender: 'about',
    city: 'where', province: 'where', postal_code: 'where',
    current_status: 'background', current_status_other: 'background', languages: 'background', languages_other: 'background',
    backgrounds: 'availability', availability: 'availability', education: 'availability', skills: 'availability', skills_other: 'availability', service_mode: 'availability',
    interests: 'help', programs: 'help', message: 'help', newsletter_opt_in: 'help',
  };
  let activeStep = SECTIONS.includes(old.step) ? old.step : "about";
  if (has) {
    for (const s of SECTIONS) {
      if (Object.keys(errors).some((f) => (STEP_OF_FIELD[f.split(".")[0]] || "review") === s)) {
        activeStep = s;
        break;
      }
    }
  }
  rw.on('[data-wizard]', { element(el) { el.setAttribute('data-active', activeStep); } });
  rw.on('[data-step-input]', { element(el) { el.setAttribute('value', activeStep); } });

  for (const v of (old.availability || [])) {
    rw.on(`input[name="availability[]"][value="${v}"]`, { element(el) { el.setAttribute("checked", ""); } });
  }

  if (old.backgrounds && old.backgrounds[0]) {
    const b0 = old.backgrounds[0];
    if (b0.profession) {
      rw.on(`select[name="backgrounds[0][profession]"] option`, {
        element(el) { if (el.getAttribute("value") === b0.profession) el.setAttribute("selected", ""); }
      });
    }
    if (b0.organization) {
      rw.on('input[name="backgrounds[0][organization]"]', {
        element(el) { el.setAttribute("value", b0.organization); }
      });
    }
    if (b0.experience) {
      rw.on(`select[name="backgrounds[0][experience]"] option`, {
        element(el) { if (el.getAttribute("value") === b0.experience) el.setAttribute("selected", ""); }
      });
    }
    if (b0.certifications) {
      rw.on('input[name="backgrounds[0][certifications]"]', {
        element(el) { el.setAttribute("value", b0.certifications); }
      });
    }
  }

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
      .map(([f, m]) => `<li>${ANCHORS.includes(f.split(".")[0]) ? `<a href="#${f.split(".")[0]}">${esc(m)}</a>` : esc(m)}</li>`).join("");
    const summary = `<div class="errors" role="alert" aria-labelledby="error-summary-title"><h2 id="error-summary-title">${esc(E.summary)}</h2><ul>${items}</ul></div>`;
    rw.on(".sheet", { element(el) { el.prepend(summary, { html: true }); } });
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
        const old = { step: flash?.step };
        const errors = Object.fromEntries(Object.entries(flash?.errors || {}).map(([field, key]) => [field, generated.messages[locale][key] || generated.messages[locale]["*.in"]]));
        const res = renderForm(PAGES.form[locale], locale, old, errors);
        if (raw) res.headers.append("set-cookie", clearFlash);
        return res;
      }
      if (request.method === "POST") {
        const old = await answersFrom(request);
        const errors = validate(old, locale);
        if (Object.keys(errors).length) return redirect("/volunteer/signup", [flashCookie(old, errors)]);
        return redirect("/volunteer/signup/thanks");
      }
    }
    if ((m = path.match(/^\/volunteer\/signup\/locale\/(en|zh_TW|fr)$/)) && request.method === "POST") {
      return redirect("/volunteer/signup", [localeCookie(m[1]), flashCookie(await answersFrom(request))]);
    }
    if ((m = path.match(/^\/locale\/(en|zh_TW|fr)$/)) && request.method === "POST") {
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
  languages: [], interests: [], programs: [], backgrounds: [], availability: [], step: "about",
});