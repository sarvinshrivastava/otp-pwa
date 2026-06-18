// Local biometric/PIN presence gate via WebAuthn. The relay has no WebAuthn
// verification endpoint, so this is deliberately a *local* check: we don't trust
// the assertion signature, we rely on the platform authenticator FORCING a
// biometric/PIN prompt (userVerification: 'required') before each OTP claim.
//
// We enrol one platform credential at onboarding and assert against it each
// time. The credential id is not secret; it lives in localStorage.

import { base64ToBuffer, bufferToBase64 } from "./crypto";

const CRED_ID_KEY = "otp-relay/webauthn-id";
const RP_NAME = "OTP Relay";

export function biometricSupported(): boolean {
  return typeof window !== "undefined" && !!window.PublicKeyCredential;
}

export function isEnrolled(): boolean {
  return localStorage.getItem(CRED_ID_KEY) !== null;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Enrols a platform authenticator credential. Triggers a biometric/PIN prompt. */
export async function enrolBiometric(): Promise<void> {
  if (!biometricSupported()) {
    throw new Error("This device does not support biometric/PIN unlock.");
  }
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: RP_NAME },
      user: {
        id: randomBytes(16),
        name: "otp-relay-device",
        displayName: "OTP Relay Device",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!cred) throw new Error("Biometric enrolment was cancelled.");
  localStorage.setItem(CRED_ID_KEY, bufferToBase64(new Uint8Array(cred.rawId)));
}

/**
 * Runs the biometric/PIN gate. Resolves on success, throws on failure/cancel.
 * If no credential is enrolled yet, enrols one (which also prompts), so the
 * first run still requires user verification.
 */
export async function runBiometricGate(): Promise<void> {
  if (!biometricSupported()) {
    throw new Error("This device does not support biometric/PIN unlock.");
  }
  const storedId = localStorage.getItem(CRED_ID_KEY);
  if (!storedId) {
    await enrolBiometric();
    return;
  }
  await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: base64ToBuffer(storedId), type: "public-key" }],
      userVerification: "required",
      timeout: 60_000,
    },
  });
}
