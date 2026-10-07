// Static assets do the serving. The only code here answers form posts on the demo sign-up pages,
// so the public mockup never receives or stores anything a visitor types.
const NOTICE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Demonstration page · Tzu Chi Canada</title>
<link rel="stylesheet" href="/volunteer/signup/signup.css"></head>
<body><main id="main"><div class="inner" style="max-width:36rem;margin:4rem auto;padding:0 1.25rem">
<h1>This is a demonstration</h1>
<p>Nothing you entered was sent or saved. The real sign-up form will run on the Tzu Chi Canada website.</p>
<p><a href="/volunteer/signup/">Back to the sign-up page</a> · <a href="/">Back to the homepage</a></p>
</div></main></body></html>`;

export default {
  async fetch(request, env) {
    if (request.method === "GET" || request.method === "HEAD") return env.ASSETS.fetch(request);
    return new Response(NOTICE, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      },
    });
  },
};