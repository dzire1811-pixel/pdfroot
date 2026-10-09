"use strict";
const crypto = require("node:crypto");
const http = require("node:http");

function googleClientId(configPath) {
  try {
    const value = JSON.parse(require("node:fs").readFileSync(configPath, "utf8")).googleClientId;
    return typeof value === "string" && /^[\w-]+\.apps\.googleusercontent\.com$/.test(value) ? value : "";
  } catch { return ""; }
}

function callbackPage(title, message) {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDFRoot Desktop Pro</title><style>body{margin:0;background:#f6f7f9;color:#171717;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{background:white;border:1px solid #ddd;border-radius:18px;padding:36px;max-width:440px;margin:20px}h1{font-size:24px;font-weight:500}p{line-height:1.6}strong{color:#e52222}</style><main><strong>PDF</strong>Root Desktop Pro<h1>${escape(title)}</h1><p>${escape(message)}</p></main></html>`;
}

function sendCallbackPage(response, status, title, message) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer" })
    .end(callbackPage(title, message));
}

async function signInWithGoogle({ clientId, openExternal, exchange, onCallback = () => {}, fetchImpl = fetch, timeoutMs = 120000 }) {
  if (!clientId) throw new Error("Google sign-in needs a PDFRoot Google OAuth desktop client ID.");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(32).toString("base64url");
  let finish;
  const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  let settled = false;
  let used = false;
  let timer;
  let redirectUri = "";
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method !== "GET" || url.pathname !== "/callback") {
      response.writeHead(404).end(); return;
    }
    if (used || url.searchParams.get("state") !== state) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid sign-in request."); return;
    }
    used = true;
    clearTimeout(timer);
    try {
      onCallback();
      if (url.searchParams.get("error")) throw new Error("Google sign-in was canceled.");
      const code = url.searchParams.get("code");
      if (!code) throw new Error("Google did not return a sign-in code.");
      const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, code, code_verifier: verifier,
          grant_type: "authorization_code", redirect_uri: redirectUri }),
        signal: AbortSignal.timeout(12000),
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok || typeof tokens.id_token !== "string") throw new Error("Google could not finish sign-in.");
      const result = await exchange(tokens.id_token, nonce);
      if (result.payment?.paymentUrl) {
        const paymentUrl = new URL(result.payment.paymentUrl);
        if (paymentUrl.protocol !== "https:" || paymentUrl.username || paymentUrl.password ||
            !/(^|\.)(razorpay\.com|rzp\.io)$/.test(paymentUrl.hostname)) throw new Error("Invalid secure payment link.");
        response.writeHead(303, { Location: paymentUrl.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).end();
      } else if (result.paymentError) {
        sendCallbackPage(response, 200, "Signed in — payment needs another try", "PDFRoot is open on your computer. Select Retry payment there. No payment has been confirmed.");
      } else {
        sendCallbackPage(response, 200, "You are signed in", "PDFRoot is open on your computer and will continue with your selected plan. You can close this tab.");
      }
      if (!settled) { settled = true; finish.resolve(result); }
    } catch (error) {
      sendCallbackPage(response, 400, "Sign-in could not finish", "Return to the PDFRoot window and try again, or use the email code option. Your plan has not been activated.");
      if (!settled) { settled = true; finish.reject(error); }
    }
    finally { clearTimeout(timer); server.close(); }
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    for (const [key, value] of Object.entries({ client_id: clientId, redirect_uri: redirectUri,
      response_type: "code", scope: "openid email profile", code_challenge: challenge,
      code_challenge_method: "S256", state, nonce })) url.searchParams.set(key, value);
    timer = setTimeout(() => {
      if (!settled) { settled = true; finish.reject(new Error("Google sign-in timed out. Try again.")); }
      server.close();
    }, timeoutMs);
    await openExternal(url.toString());
    return await done;
  } catch (error) { clearTimeout(timer); server.close(); throw error; }
}

module.exports = { googleClientId, signInWithGoogle };
