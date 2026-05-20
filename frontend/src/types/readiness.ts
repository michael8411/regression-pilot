export type ReadinessState = "ready" | "partial" | "not_ready";
export type AuthMode = "oauth" | "manual" | "connection_string" | "none";

export interface ProviderReadiness {
  configured: boolean;
  usable: boolean;
  auth_mode: AuthMode;
  powers: string[];
  message: string;
}

export interface OAuthReadiness {
  configured: boolean;
  usable_for_signin: boolean;
  missing_settings: string[];
  message: string;
}

export interface LiveReadiness {
  state: ReadinessState;
  summary: string;
  providers: Record<string, ProviderReadiness>;
}

export interface RegressionReadiness {
  state: ReadinessState;
  summary: string;
  providers: Record<string, ProviderReadiness>;
}

export interface ManagedMcpConnectionReadiness {
  provider: string;
  configured: boolean;
  state: string;
  message: string;
}

export interface AssistantMcpReadiness {
  state: ReadinessState;
  summary: string;
  managed_connections: Record<string, ManagedMcpConnectionReadiness>;
  manual_connections_count: number;
}

export interface ConnectionReadiness {
  oauth: OAuthReadiness;
  live_generation: LiveReadiness;
  regression: RegressionReadiness;
  assistant_mcp: AssistantMcpReadiness;
}
