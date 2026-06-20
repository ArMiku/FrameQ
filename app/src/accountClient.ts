import { invoke } from "@tauri-apps/api/core";
import type { InvokeArgs } from "@tauri-apps/api/core";
import type { AccountStatus } from "./accountState";

export type AccountCommandRunner = (
  command: string,
  args: InvokeArgs,
) => Promise<unknown>;

export type BeginAuthFlow = {
  authUrl: string;
  state: string;
};

export type CompleteAuthFlow = {
  authenticated: boolean;
  email: string;
  canProcess: boolean;
};

export type WechatCheckout = {
  orderId: string;
  amountFen: number;
  currency: string;
  codeUrl: string;
  expiresAt: string;
  status: string;
};

export type CheckoutStatus = {
  orderId: string;
  status: string;
  entitlementExpiresAt: string | null;
};

type AccountStatusResponse = {
  authenticated: boolean;
  email: string | null;
  entitlement_status: string;
  entitlement_expires_at: string | null;
  last_verified_at: string | null;
  can_process: boolean;
  server_error: string | null;
};

type BeginAuthFlowResponse = {
  auth_url: string;
  state: string;
};

type CompleteAuthFlowResponse = {
  authenticated: boolean;
  email: string;
  can_process: boolean;
};

type WechatCheckoutResponse = {
  order_id: string;
  amount_fen: number;
  currency: string;
  code_url: string;
  expires_at: string;
  status: string;
};

type CheckoutStatusResponse = {
  order_id: string;
  status: string;
  entitlement_expires_at: string | null;
};

const defaultRunner: AccountCommandRunner = (command, args) => invoke(command, args);

export async function getAccountStatus(
  runner: AccountCommandRunner = defaultRunner,
): Promise<AccountStatus> {
  return mapAccountStatus((await runner("get_account_status", {})) as AccountStatusResponse);
}

export async function beginAuthFlow(
  runner: AccountCommandRunner = defaultRunner,
): Promise<BeginAuthFlow> {
  const response = (await runner("begin_auth_flow", {})) as BeginAuthFlowResponse;
  return {
    authUrl: response.auth_url,
    state: response.state,
  };
}

export async function completeAuthFlow(
  callbackUrl: string,
  runner: AccountCommandRunner = defaultRunner,
): Promise<CompleteAuthFlow> {
  const response = (await runner("complete_auth_flow", { callbackUrl })) as CompleteAuthFlowResponse;
  return {
    authenticated: response.authenticated,
    email: response.email,
    canProcess: response.can_process,
  };
}

export async function logoutAccount(
  runner: AccountCommandRunner = defaultRunner,
): Promise<void> {
  await runner("logout_account", {});
}

export async function createWechatCheckout(
  runner: AccountCommandRunner = defaultRunner,
): Promise<WechatCheckout> {
  return mapWechatCheckout(
    (await runner("create_wechat_checkout", {})) as WechatCheckoutResponse,
  );
}

export async function getCheckoutStatus(
  orderId: string,
  runner: AccountCommandRunner = defaultRunner,
): Promise<CheckoutStatus> {
  return mapCheckoutStatus(
    (await runner("get_checkout_status", { orderId })) as CheckoutStatusResponse,
  );
}

function mapAccountStatus(response: AccountStatusResponse): AccountStatus {
  return {
    authenticated: response.authenticated,
    email: response.email,
    entitlementStatus: response.entitlement_status,
    entitlementExpiresAt: response.entitlement_expires_at,
    lastVerifiedAt: response.last_verified_at,
    canProcess: response.can_process,
    serverError: response.server_error,
  };
}

function mapWechatCheckout(response: WechatCheckoutResponse): WechatCheckout {
  return {
    orderId: response.order_id,
    amountFen: response.amount_fen,
    currency: response.currency,
    codeUrl: response.code_url,
    expiresAt: response.expires_at,
    status: response.status,
  };
}

function mapCheckoutStatus(response: CheckoutStatusResponse): CheckoutStatus {
  return {
    orderId: response.order_id,
    status: response.status,
    entitlementExpiresAt: response.entitlement_expires_at,
  };
}

