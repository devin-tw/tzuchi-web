#!/usr/bin/env python3
"""Syncs localized volunteer intake pages and form validation assets."""
import http.cookiejar, json, os, re, shutil, subprocess, sys, urllib.parse, urllib.request

APP = "http://127.0.0.1:8001"
APP_DIR = os.path.expanduser("~/tzu-chi-signup")
SITE = os.environ.get("SITE_URL", "https://tzuchi.devin.tw")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCALES = ["en", "zh_TW"]
BANNER = {
    "en": "Demonstration page. Nothing you enter here is sent or saved.",
    "zh_TW": "示範頁面。您在此填寫的內容不會被送出或儲存。",
}


def session():
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def token(html):
    return re.search(r'name="_token" value="([^"]+)"', html).group(1)


def transform(html, locale):
    html = re.sub(r'<input[^>]*name="(_token|form_token|website)"[^>]*>', "", html)
    html = re.sub(r'<div class="hp"[^>]*>\s*</div>', "", html)
    html = re.sub(r'(<meta property="og:url" content="|<link rel="canonical" href="|<meta property="og:image" content=")' + re.escape(APP),
                  lambda m: m.group(1) + SITE, html)
    html = re.sub(r"/css/signup\.css\?v=\d+", "/volunteer/assets/signup.css", html)
    html = html.replace(APP, "")
    html = re.sub(r'<div class="brand">(.*?)</div>', r'<a class="brand" href="/">\1</a>', html, count=1, flags=re.S)
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n    <meta name="robots" content="noindex, nofollow">', 1)
    html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + '\n<p class="demo-banner" role="note">%s</p>' % BANNER[locale], html, count=1)
    html = re.sub(r'\s*<span><button type="submit" formaction="/volunteer/signup/locale/fr".*?</button></span>', "", html, flags=re.S)
    html = receipts_look(html)
    assert "127.0.0.1" not in html, "app URL left in the snapshot"
    return html


def receipts_look(html):
    """Pages in the sign-in look (thank-you, sign-in, forgot password) use receipts.css and carry the
    temple as an inline style. The demo's policy forbids inline styles, so the style moves to the css file."""
    html = re.sub(r"<style>@media \(min-width: 64rem\) \{ \.auth-main \{ background-image: url\(data:image/webp.*?</style>\s*", "", html, flags=re.S)
    html = re.sub(r"/css/receipts\.css\?v=\d+", "/volunteer/assets/receipts.css", html)
    html = re.sub(r'<input[^>]*name="_token"[^>]*>', "", html)
    html = html.replace(APP, "")
    # The French button has no page behind it in the demo.
    html = re.sub(r'\s*<form method="POST" action="/locale/fr">.*?</form>', "", html, flags=re.S)
    return html


def inert(html):
    """Sign-in and password pages are look-only copies: every control is disabled, so nothing can be typed or sent."""
    html = re.sub(r'<form method="POST" action="[^"]*"', '<form method="get" action="#"', html)
    html = re.sub(r"<(input|button)\b(?![^>]*\bdisabled)", r"<\1 disabled", html)
    return html


AUTH_PAGES = {"/receipts/login": "receipts/login", "/login": "login", "/forgot-password": "forgot-password"}
AUTH_BANNER = "Design preview. This page is not connected to anything, and nothing you type is sent or saved."


def php_json(expr):
    out = subprocess.run(["php", "-r", expr], cwd=APP_DIR, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def flatten(d, prefix=""):
    flat = {}
    for k, v in d.items():
        key = prefix + k
        if isinstance(v, dict):
            flat.update(flatten(v, key + "."))
        else:
            flat[key] = v
    return flat


def main():
    for locale in LOCALES:
        op = session()
        html = op.open(APP + "/volunteer/signup").read().decode()
        body = urllib.parse.urlencode({"_token": token(html)}).encode()
        form = op.open(APP + "/volunteer/signup/locale/" + locale, data=body).read().decode()
        pages = {"form": form,
                 "thanks": op.open(APP + "/volunteer/signup/thanks").read().decode(),
                 "privacy": op.open(APP + "/volunteer/privacy").read().decode()}
        for name, page in pages.items():
            with open(os.path.join(ROOT, "src/snap/%s.%s.html" % (name, locale)), "w") as f:
                f.write(transform(page, locale))

    generated = {"messages": {}, "errors": {}}
    for locale in LOCALES:
        lang = php_json('echo json_encode(require "lang/%s/signup.php");' % locale)
        generated["messages"][locale] = flatten(lang["validation"])
        generated["errors"][locale] = {"summary": lang["errors"]["summary"], "titlePrefix": lang["errors"]["title_prefix"]}
    options = open(os.path.join(APP_DIR, "app/Support/SignupOptions.php")).read()
    generated["options"] = {
        name.lower(): re.findall(r"'([^']+)'", body)
        for name, body in re.findall(r"public const ([A-Z_]+) = \[(.*?)\];", options, re.S)
    }
    with open(os.path.join(ROOT, "src/generated.json"), "w") as f:
        json.dump(generated, f, ensure_ascii=False, indent=1)

    css = open(os.path.join(APP_DIR, "public/css/signup.css")).read().replace("'../img/temple.webp'", "'/img/temple.webp'")
    css += ("\n/* Notification banner */\n.demo-banner { margin: 0; padding: .55rem var(--gutter, 1rem); background: var(--lotus-wash);"
            " color: var(--ink); text-align: center; font-size: .9rem; border-bottom: 1px solid var(--rule); }\n")
    with open(os.path.join(ROOT, "public/volunteer/assets/signup.css"), "w") as f:
        f.write(css)
    receipts = open(os.path.join(APP_DIR, "public/css/receipts.css")).read()
    receipts += ("\n/* Receipts header layout */\n"
                 "@media (min-width: 64rem) { .auth-main { background-image: url('/img/receipts-temple.webp'), linear-gradient(to bottom, #fff 30%, #e4e9f2); } }\n"
                 ".demo-banner { margin: 0; padding: .55rem 1rem; background: var(--lotus-wash); color: var(--ink); text-align: center; font-size: .9rem; border-bottom: 1px solid var(--rule); }\n")
    with open(os.path.join(ROOT, "public/volunteer/assets/receipts.css"), "w") as f:
        f.write(receipts)
    shutil.copyfile(os.path.join(APP_DIR, "public/img/receipts-temple.webp"), os.path.join(ROOT, "public/img/receipts-temple.webp"))

    for route, folder in AUTH_PAGES.items():
        page = urllib.request.urlopen(APP + route).read().decode()
        page = inert(receipts_look(page))
        page = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + '\n<p class="demo-banner" role="note">%s</p>' % AUTH_BANNER, page, count=1)
        assert "127.0.0.1" not in page and "localhost" not in page, "app URL left in " + route
        os.makedirs(os.path.join(ROOT, "public", folder), exist_ok=True)
        with open(os.path.join(ROOT, "public", folder, "index.html"), "w") as f:
            f.write(page)
    print("snapshot written")


if __name__ == "__main__":
    sys.exit(main())