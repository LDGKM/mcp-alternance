/**
 * Point d'entrée du Worker.
 *
 * OAuthProvider protège /mcp : Claude doit d'abord obtenir un jeton, ce qui passe par
 * la page /authorize où je saisis ma clé d'accès. Les jetons sont stockés dans OAUTH_KV.
 */
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { gestionnaireParDefaut } from "./auth/gestionnaire.js";
import { DepotCandidatures } from "./candidatures/depot.js";
import { PROFIL } from "./domaine/profil.js";
import type { Env } from "./env.js";
import { creerServeur } from "./mcp/serveur.js";
import type { Contexte } from "./outils/contexte.js";
import { jourAParis } from "./outils/dates.js";

export function creerContexte(env: Env): Contexte {
  return {
    fetch: (entree, init) => fetch(entree, init),
    secrets: { LBA_API_KEY: env.LBA_API_KEY, FT_CLIENT_ID: env.FT_CLIENT_ID, FT_CLIENT_SECRET: env.FT_CLIENT_SECRET },
    franceTravailOffres: env.FT_OFFRES_ACTIVE === "oui",
    depot: new DepotCandidatures(env.DB),
    profil: PROFIL,
    aujourdhui: () => jourAParis(),
  };
}

/** Serveur MCP sans état : une instance par requête (transport « Streamable HTTP »). */
const gestionnaireMcp: ExportedHandler<Env> = {
  async fetch(requete, env) {
    const serveur = creerServeur(creerContexte(env));
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await serveur.connect(transport);
    return transport.handleRequest(requete);
  },
};

/**
 * Le champ « resource » des métadonnées OAuth doit être exactement l'URL saisie dans Claude.
 * On la déduit de l'origine de la requête, ce qui marche aussi bien sur *.workers.dev
 * que sur le sous-domaine personnalisé. Un fournisseur est créé par origine, puis réutilisé.
 */
const fournisseurs = new Map<string, OAuthProvider<Env>>();

function fournisseurPour(origine: string): OAuthProvider<Env> {
  let f = fournisseurs.get(origine);
  if (!f) {
    f = new OAuthProvider<Env>({
      apiRoute: "/mcp",
      apiHandler: gestionnaireMcp as ExportedHandler<Env> & Pick<Required<ExportedHandler<Env>>, "fetch">,
      defaultHandler: gestionnaireParDefaut,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
      resourceMetadata: { resource: `${origine}/mcp`, resource_name: "Recherche d'alternance (Deo Gratias Loutou)" },
      // Jeton d'accès d'une heure, renouvelé automatiquement par Claude.
      accessTokenTTL: 3600,
    });
    fournisseurs.set(origine, f);
  }
  return f;
}

export default {
  fetch(requete, env, ctx) {
    return fournisseurPour(new URL(requete.url).origin).fetch(requete, env, ctx);
  },
} satisfies ExportedHandler<Env>;
