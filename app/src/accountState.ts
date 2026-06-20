export type AccountStatus = {
  authenticated: boolean;
  email: string | null;
  entitlementStatus: string;
  entitlementExpiresAt: string | null;
  lastVerifiedAt: string | null;
  canProcess: boolean;
  serverError: string | null;
};

export function createGuestAccountStatus(): AccountStatus {
  return {
    authenticated: false,
    email: null,
    entitlementStatus: "inactive",
    entitlementExpiresAt: null,
    lastVerifiedAt: null,
    canProcess: false,
    serverError: null,
  };
}

export function canProcessWithAccount(account: AccountStatus): boolean {
  return account.authenticated && account.entitlementStatus === "active" && account.canProcess;
}

