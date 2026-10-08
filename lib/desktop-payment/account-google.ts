import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client();
export async function verifyGoogleIdentity(idToken: string, nonce: string, clientId: string) {
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  // The desktop's PKCE flow generates this nonce before opening Google's browser.
  if (!payload || payload.email_verified !== true || !payload.email || payload.nonce !== nonce) {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }
  // For external email accounts, verify current ownership with the email code.
  if (!payload.email.toLowerCase().endsWith("@gmail.com") && !payload.hd) {
    throw new Error("Please use an email code to verify this email address.");
  }
  return { email: payload.email.toLowerCase(), name: payload.name || "" };
}
