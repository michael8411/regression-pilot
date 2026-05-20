export type OAuthProvider = "entra" | "github" | "atlassian";

export interface IdentityProfile {
  display_name: string;
  email: string;
  tenant_id?: string;
}

export interface ProviderIdentityStatus {
  connected: boolean;
  needs_reconnect: boolean;
  auth_mode?: "oauth" | "manual" | "none";
  display?: string;
  expires_at?: number;
  error?: string;
}

export interface IdentityStatus {
  signed_in: boolean;
  profile: IdentityProfile | null;
  providers: Record<OAuthProvider, ProviderIdentityStatus>;
  manual_fallbacks: Record<"jira" | "github" | "ado", boolean>;
}

export interface StartOAuthResponse {
  flow_id: string;
  authorize_url: string;
  provider: OAuthProvider;
}

export interface OAuthConfigErrorResponse {
  error: "oauth_not_configured";
  missing: string[];
  detail?: string;
}
