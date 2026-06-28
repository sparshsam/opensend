/**
 * Auth diagnostics tracker — records sign-in events and state for the
 * diagnostics page to surface.
 *
 * In-memory only (no persistence). Reset on page reload.
 */

let _signInClicked = 0;
let _nativeAttempted = false;
let _idTokenReceived = false;
let _lastAuthError: string | null = null;

export function trackSignInClicked() { _signInClicked++; }
export function trackNativeAttempted() { _nativeAttempted = true; }
export function trackIdTokenReceived() { _idTokenReceived = true; }
export function trackAuthError(msg: string) { _lastAuthError = msg; }

export function resetAuthDiag() {
  _signInClicked = 0;
  _nativeAttempted = false;
  _idTokenReceived = false;
  _lastAuthError = null;
}

export function getAuthDiag() {
  return {
    signInClicked: _signInClicked,
    nativeAttempted: _nativeAttempted,
    idTokenReceived: _idTokenReceived,
    lastAuthError: _lastAuthError,
  };
}
