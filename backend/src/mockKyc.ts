/**
 * Server-rendered mock KYC page (prototype only, MOCK_KYC=true).
 *
 * Flow: the web app sends the voter to /mock-kyc?sessionId=... after
 * POST /api/kyc/start. The voter types a mock EPIC; the page calls
 * POST /api/kyc/complete itself and redirects back to the web app. The
 * short-lived kycToken travels in the URL *fragment* so it is never sent
 * to (or logged by) any server — fragments stay in the browser.
 */

function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escJsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\u003c");
}

export interface MockKycPageOpts {
  sessionId: string;
  /** Web app origin to return to, e.g. http://localhost:3000. */
  webAppUrl: string;
}

export function mockKycPageHtml(opts: MockKycPageOpts): string {
  const sessionId = escHtml(opts.sessionId);
  const webAppUrl = escJsString(opts.webAppUrl.replace(/\/+$/, ""));
  const sidJs = escJsString(opts.sessionId);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AIA Vote — Mock KYC (prototype)</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 560px; margin: 3rem auto; padding: 0 1rem; }
.card { border: 1px solid #ccc; border-radius: 8px; padding: 1.5rem; }
label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
input { width: 100%; padding: 0.5rem; font-size: 1rem; box-sizing: border-box; }
button { margin-top: 1rem; padding: 0.6rem 1.2rem; font-size: 1rem; cursor: pointer; }
#error { color: #a00; margin-top: 1rem; min-height: 1.2em; }
.notice { background: #fff8e1; border: 1px solid #e0c36a; border-radius: 6px; padding: 0.75rem; }
code { background: #f4f4f4; padding: 0 0.3em; }
</style>
</head>
<body>
<div class="card">
<h1>Mock KYC verification</h1>
<p class="notice"><strong>Prototype only.</strong> No real Aadhaar or DigiLocker
is involved. Enter a mock EPIC in the format <code>SS/DD/DDD/DDDDDD</code>,
e.g. <code>WB/12/345/678901</code>.</p>
<p>Session: <code>${sessionId}</code></p>
<form id="kyc-form">
<label for="epic">Mock EPIC</label>
<input id="epic" name="mockEpic" autocomplete="off" placeholder="WB/12/345/678901" required />
<button type="submit">Verify &amp; return to voting app</button>
</form>
<div id="error" role="alert"></div>
</div>
<script>
(function () {
  var sessionId = "${sidJs}";
  var webAppUrl = "${webAppUrl}";
  var form = document.getElementById("kyc-form");
  var errorBox = document.getElementById("error");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    errorBox.textContent = "";
    var mockEpic = document.getElementById("epic").value;
    fetch("/api/kyc/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionId, mockEpic: mockEpic })
    }).then(function (res) {
      return res.json().then(function (body) { return { status: res.status, body: body }; });
    }).then(function (out) {
      if (out.status !== 200 || !out.body.kycToken) {
        var msg = (out.body && out.body.error && out.body.error.message) || "Verification failed";
        errorBox.textContent = msg;
        return;
      }
      // Token in the fragment: never sent to any server.
      window.location.href =
        webAppUrl + "/kyc/callback?sessionId=" + encodeURIComponent(sessionId) +
        "#kycToken=" + encodeURIComponent(out.body.kycToken);
    }).catch(function () {
      errorBox.textContent = "Network error — is the backend running?";
    });
  });
})();
</script>
</body>
</html>
`;
}
