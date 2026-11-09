import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/** Liaisons et secrets du Worker (voir wrangler.jsonc). */
export interface Env {
  /** Jetons OAuth émis pour Claude (géré par @cloudflare/workers-oauth-provider). */
  OAUTH_KV: KVNamespace;
  /** Base D1 des candidatures. */
  DB: D1Database;
  /** Injecté par OAuthProvider dans le gestionnaire par défaut. */
  OAUTH_PROVIDER: OAuthHelpers;

  /** Clé d'accès personnelle, demandée une fois lors de la connexion de Claude. */
  CLE_ACCES?: string;
  /** Clé d'API La bonne alternance (en-tête Authorization: Bearer). */
  LBA_API_KEY?: string;
  /** Identifiants de l'application France Travail (OAuth2 client_credentials). */
  FT_CLIENT_ID?: string;
  FT_CLIENT_SECRET?: string;
}
