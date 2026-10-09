const statusPill = document.querySelector("#plan-status");
const deviceId = document.querySelector("#device-id");
const notice = document.querySelector("#notice");
const codeInput = document.querySelector("#activation-code");
const activateButton = document.querySelector("#activate");
const onlinePayment = document.querySelector("#online-payment");
const paymentProgress = document.querySelector("#payment-progress");
const accountProgress = document.querySelector("#account-progress");
const checkoutTimer = document.querySelector("#checkout-timer");
const signinModal = document.querySelector("#signin-modal");
const googleButton = document.querySelector("#google-sign-in");
let signedInEmail = null;
let signedInProvider = null;
let signedInName = null;
let expiresAt = null;
let selectedPlan = null;
let paymentOpening = false;

function renderAccount(email, provider = null, name = null) {
  signedInEmail = email;
  signedInProvider = email ? provider : null;
  signedInName = email ? name : null;
  document.querySelector("#signed-in-email").textContent = email ? `Verified: ${email}` : "";
}

function closeSignIn() {
  signinModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function requestSignIn(plan) {
  selectedPlan = plan;
  const paid = plan === "paid";
  document.querySelector("#signin-heading").textContent = paid
    ? "Sign in to continue to payment" : "Sign in to start your free trial";
  document.querySelector("#signin-copy").textContent = paid
    ? "Sign in with Google or an email code. Payment opens automatically after sign-in."
    : "Continue with Google, or verify your email with a one-time code.";
  document.querySelector(".signin-divider").hidden = false;
  document.querySelector("#email-entry").hidden = false;
  document.querySelector("#code-entry").hidden = document.querySelector("#email-code").dataset.requested !== "yes";
  document.querySelector("#signed-in-email").textContent = "";
  accountProgress.textContent = "";
  googleButton.hidden = false;
  signinModal.hidden = false;
  document.body.classList.add("modal-open");
  setTimeout(() => googleButton.focus(), 0);
}

async function beginPayment() {
  if (!signedInEmail || paymentOpening) return;
  paymentOpening = true;
  closeSignIn();
  onlinePayment.hidden = false;
  document.querySelector("#retry-payment").hidden = true;
  paymentProgress.textContent = "Opening secure payment in your browser…";
  onlinePayment.scrollIntoView({ behavior: "smooth", block: "center" });
  try {
    const fallbackName = signedInEmail.split("@")[0].replace(/[._-]+/g, " ").trim();
    const result = await window.pdfrootDesktop.startPayment(signedInName || fallbackName || "PDFRoot customer");
    if (result.error) throw new Error(result.error);
    expiresAt = result.expiresAt || null;
    showTimer();
    paymentProgress.textContent = `Secure payment opened (₹${(result.amountPaise / 100).toFixed(2)}). Waiting for confirmation…`;
  } catch (error) {
    paymentProgress.textContent = "Payment could not open. " + error.message;
    document.querySelector("#retry-payment").hidden = false;
    setNotice("Select Retry payment to try again.", "error");
  } finally {
    paymentOpening = false;
  }
}

async function startSelectedTrial() {
  closeSignIn();
  setNotice("Starting your 14-day free trial…");
  const result = await window.pdfrootDesktop.startTrial();
  if (result.error) throw new Error(result.error);
  renderStatus(result);
  await refreshAccountSummary();
  setNotice("Your free trial is active. Opening your tools…", "success");
}

async function continueSelectedPlan() {
  if (!signedInEmail || !selectedPlan) return;
  if (selectedPlan === "paid") {
    await beginPayment();
    return;
  }
  await startSelectedTrial();
}

async function refreshAccountSummary() {
  if (!signedInEmail) return;
  const summary = await window.pdfrootDesktop.accountSummary();
  if (summary.error) return;
  const offer = summary.availablePlan;
  if (Number.isSafeInteger(offer?.amountPaise) && offer.amountPaise > 0) {
    const amount = `₹${(offer.amountPaise / 100).toLocaleString("en-IN")}`;
    document.querySelector("#pro-choice-price").firstChild.textContent = amount;
    document.querySelector("#payment-card-price").firstChild.textContent = amount;
  }
}

function showTimer() {
  if (!expiresAt) { checkoutTimer.textContent = ""; return; }
  const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
  checkoutTimer.textContent = remaining
    ? `Complete payment within ${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
    : "Payment time expired. Checking for any completed payment…";
}

function setNotice(message = "", kind = "") {
  notice.textContent = message;
  notice.className = `notice ${kind}`.trim();
}

function renderStatus(status) {
  deviceId.textContent = status.deviceId || deviceId.textContent || "Unavailable";
  const isActive = status.ok;
  const trialButton = document.querySelector("#start-trial");
  trialButton.disabled = isActive;
  trialButton.textContent = isActive
    ? (status.payload?.plan === "trial" ? "Free trial active" : "Plan already active")
    : "Choose Free Trial";
  statusPill.textContent = isActive ? (status.payload?.plan === "trial" ? "Free trial active" : "Plan active") : "Choose a plan";
  statusPill.className = `status-pill ${isActive ? (status.state === "grace" ? "warn" : "") : "locked"}`.trim();

  if (isActive) {
    document.querySelector("#activation-title").textContent = status.payload?.plan === "trial" ? "Your free trial is active" : "PDFRoot Shortcut Pro is active";
    document.querySelector("#activation-copy").textContent = status.message;
    activateButton.textContent = "Update activation code";
  } else if (status.state === "expired") {
    document.querySelector("#activation-title").textContent = status.payload?.plan === "trial" ? "Your free trial has ended" : "Your plan needs renewal";
    document.querySelector("#activation-copy").textContent = status.message;
  }
}

async function refreshStatus() {
  renderStatus(await window.pdfrootDesktop.licenseStatus());
}

async function checkPayment() {
  if (paymentOpening) return;
  const result = await window.pdfrootDesktop.checkPayment();
  if (result.expiresAt) expiresAt = result.expiresAt;
  if (result.state === "pending" && !onlinePayment.hidden && document.querySelector("#retry-payment").hidden) paymentProgress.textContent = "Waiting for confirmed payment… This screen will activate automatically.";
  if (result.state === "expired") paymentProgress.textContent = "Payment time expired. If you already paid, PDFRoot will still activate when confirmed. Otherwise, choose the plan again.";
  if (result.state === "active") {
    if (result.newlyActivated && result.status?.payload?.plan === "monthly") {
      expiresAt = null;
      document.querySelector("#retry-payment").hidden = true;
      paymentProgress.textContent = "Payment confirmed. PDFRoot Shortcut Pro is active.";
    }
    renderStatus(result.status);
    refreshAccountSummary().catch(() => {});
  }
  if (result.state === "error") paymentProgress.textContent = result.message;
  showTimer();
}

document.querySelector("#send-code").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  accountProgress.textContent = "Sending a code to your email…";
  try {
    const result = await window.pdfrootDesktop.sendLoginCode(document.querySelector("#account-email").value);
    if (result.error) throw new Error(result.error);
    document.querySelector("#email-code").dataset.requested = "yes";
    document.querySelector("#code-entry").hidden = false;
    accountProgress.textContent = "Check your inbox. The code is valid for 10 minutes.";
  } catch (error) { accountProgress.textContent = error.message; }
  finally { button.disabled = false; }
});

document.querySelector("#verify-code").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  accountProgress.textContent = "Verifying email…";
  try {
    const result = await window.pdfrootDesktop.verifyLoginCode(
      document.querySelector("#account-email").value, document.querySelector("#email-code").value.trim());
    if (result.error) throw new Error(result.error);
    renderAccount(result.email, result.provider || "email", result.name);
    await continueSelectedPlan();
    refreshAccountSummary().catch(() => {});
  } catch (error) { accountProgress.textContent = error.message; }
  finally { button.disabled = false; }
});

document.querySelector("#start-trial").addEventListener("click", async (event) => {
  selectedPlan = "trial";
  if (!signedInEmail) return requestSignIn("trial");
  const button = event.currentTarget;
  button.disabled = true;
  try { await startSelectedTrial(); }
  catch (error) { setNotice(error.message, "error"); }
  finally { button.disabled = false; }
});

document.querySelector("#choose-pro").addEventListener("click", async () => {
  selectedPlan = "paid";
  if (!signedInEmail) return requestSignIn("paid");
  await beginPayment();
});

googleButton.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  accountProgress.textContent = "Opening Google sign-in in your browser…";
  try {
    const plan = selectedPlan;
    const result = await window.pdfrootDesktop.googleSignIn(plan);
    if (result.error) throw new Error(result.error);
    renderAccount(result.email, result.provider || "google", result.name);
    if (plan === "paid" && (result.payment || result.paymentError)) {
      closeSignIn();
      onlinePayment.hidden = false;
      onlinePayment.scrollIntoView({ behavior: "smooth", block: "center" });
      expiresAt = result.payment?.expiresAt || null;
      paymentProgress.textContent = result.paymentError
        ? "Payment could not open. " + result.paymentError
        : "Complete payment in your browser. PDFRoot will activate automatically.";
      document.querySelector("#retry-payment").hidden = !result.paymentError;
      showTimer();
    } else { await continueSelectedPlan(); }
    refreshAccountSummary().catch(() => {});
  } catch (error) { accountProgress.textContent = error.message + " You can also use an email code below."; }
  finally { button.disabled = false; }
});

document.querySelector("#retry-payment").addEventListener("click", beginPayment);

document.querySelector("#close-signin").addEventListener("click", closeSignIn);
document.querySelector(".signin-backdrop").addEventListener("click", closeSignIn);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !signinModal.hidden) closeSignIn(); });

document.querySelector("#copy-device").addEventListener("click", async () => {
  await window.pdfrootDesktop.copyDeviceId();
  setNotice("Device ID copied.", "success");
});

activateButton.addEventListener("click", async () => {
  const code = codeInput.value.trim();
  if (!code) return setNotice("Paste the activation code first.", "error");
  activateButton.disabled = true;
  activateButton.textContent = "Verifying…";
  const result = await window.pdfrootDesktop.activate(code);
  activateButton.disabled = false;
  activateButton.textContent = result.ok ? "Activated" : "Activate & Continue";
  setNotice(result.message, result.ok ? "success" : "error");
  renderStatus(result);
});

document.querySelector("#contact").addEventListener("click", () => window.pdfrootDesktop.openSupport());
document.querySelector("#exit").addEventListener("click", () => window.pdfrootDesktop.quit());
refreshStatus();
window.pdfrootDesktop.accountStatus().then(async (result) => {
  renderAccount(result.email, result.provider, result.name);
  await refreshAccountSummary();
});
window.pdfrootDesktop.paymentAvailable().then((available) => {
  if (available) { checkPayment(); setInterval(checkPayment, 5000); }
  else setNotice("Account service is temporarily unavailable. Use an existing activation code or try later.", "error");
});
setInterval(showTimer, 1000);
