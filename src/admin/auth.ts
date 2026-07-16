import { internalDatabase } from "../storage/internalDatabase";

const SESSION_KEY = "rr_admin_session";
const REMEMBER_KEY = "rr_admin_remember";
const REMEMBERED_USER_KEY = "rr_admin_remembered_user";
const DEFAULT_USER = "adminbboy";
const DEFAULT_PASS = "12345678";

export function getExpectedCredentials(): { user: string; pass: string } {
  return {
    user: (internalDatabase.getSetting("adminUser") || DEFAULT_USER).trim(),
    pass: internalDatabase.getSetting("adminPassword") || DEFAULT_PASS,
  };
}

export function isAdminAuthenticated(): boolean {
  try {
    return (
      sessionStorage.getItem(SESSION_KEY) === "1" ||
      localStorage.getItem(SESSION_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setAdminAuthenticated(ok: boolean, remember = false): void {
  try {
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, "1");
      if (remember) localStorage.setItem(SESSION_KEY, "1");
      else localStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setRememberMe(remember: boolean, user = ""): void {
  try {
    if (remember) {
      localStorage.setItem(REMEMBER_KEY, "1");
      if (user) localStorage.setItem(REMEMBERED_USER_KEY, user.trim());
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(REMEMBERED_USER_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getRememberedUser(): string {
  try {
    return localStorage.getItem(REMEMBERED_USER_KEY) || "";
  } catch {
    return "";
  }
}

export function validateAdminLogin(user: string, pass: string): boolean {
  const expected = getExpectedCredentials();
  return (
    user.trim().toLowerCase() === expected.user.toLowerCase() &&
    pass === expected.pass
  );
}

export function logoutAdmin(): void {
  setAdminAuthenticated(false);
  // Keep username preference if Remember me was checked; clear only the session
}
