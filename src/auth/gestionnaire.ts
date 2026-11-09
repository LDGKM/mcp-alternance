/**
 * Gestionnaire « par défaut » de l'OAuthProvider : tout ce qui n'est ni /mcp ni un point
 * de terminaison OAuth géré par la bibliothèque. Il sert surtout la page /authorize,
 * où je saisis ma clé d'accès une seule fois quand je connecte Claude.
 */
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "../env.js";
import { cleConfiguree, clesIdentiques } from "./cle.js";
import { pageAutorisation, pageMessage, reponseHtml } from "./page.js";

const PAUSE_APRES_ECHEC_MS = 1500;

function encoder(r: AuthRequest): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(r))));
}

function decoder(s: string): AuthRequest {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))) as AuthRequest;
}

async function nomDuClient(env: Env, clientId: string): Promise<string> {
  const client = await env.OAUTH_PROVIDER.lookupClient(clientId);
  return client?.clientName ?? "Un client MCP";
}

function hote(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

async function afficherFormulaire(requete: Request, env: Env): Promise<Response> {
  const demande = await env.OAUTH_PROVIDER.parseAuthRequest(requete);
  if (!demande.clientId) return reponseHtml(pageMessage("Demande invalide", "Aucun client OAuth n'est indiqué."), 400);
  return reponseHtml(
    pageAutorisation({ client: await nomDuClient(env, demande.clientId), redirection: hote(demande.redirectUri), requete: encoder(demande) }),
  );
}

async function verifierCle(requete: Request, env: Env): Promise<Response> {
  const formulaire = await requete.formData();
  const cle = String(formulaire.get("cle") ?? "");
  let demande: AuthRequest;
  try {
    demande = decoder(String(formulaire.get("requete") ?? ""));
  } catch {
    return reponseHtml(pageMessage("Demande invalide", "Recommencez la connexion depuis Claude."), 400);
  }

  if (!(await clesIdentiques(cle, env.CLE_ACCES!))) {
    // Ralentit les essais au hasard ; la longueur de la clé fait le reste.
    await new Promise((r) => setTimeout(r, PAUSE_APRES_ECHEC_MS));
    return reponseHtml(
      pageAutorisation({
        client: await nomDuClient(env, demande.clientId),
        redirection: hote(demande.redirectUri),
        requete: encoder(demande),
        erreur: "Clé incorrecte.",
      }),
      401,
    );
  }

  // La bibliothèque revérifie le client et l'URI de redirection avant d'émettre le code.
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: demande,
    userId: "proprietaire",
    metadata: { autoriseLe: new Date().toISOString() },
    scope: demande.scope,
    props: { utilisateur: "proprietaire" },
  });
  return Response.redirect(redirectTo, 302);
}

export const gestionnaireParDefaut: ExportedHandler<Env> = {
  async fetch(requete, env) {
    const url = new URL(requete.url);

    if (url.pathname === "/") {
      return new Response("Serveur MCP personnel de recherche d'alternance. Accès réservé.\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/authorize") {
      // Sans clé solide configurée, personne ne peut se connecter (échec fermé).
      if (!cleConfiguree(env.CLE_ACCES)) {
        return reponseHtml(
          pageMessage("Serveur non configuré", "Le secret CLE_ACCES est absent ou trop court (32 caractères minimum). Voir le guide d'installation."),
          503,
        );
      }
      try {
        if (requete.method === "GET") return await afficherFormulaire(requete, env);
        if (requete.method === "POST") return await verifierCle(requete, env);
        return new Response("Méthode non autorisée", { status: 405, headers: { allow: "GET, POST" } });
      } catch (e) {
        return reponseHtml(pageMessage("Autorisation impossible", (e as Error).message), 400);
      }
    }

    return new Response("Introuvable", { status: 404 });
  },
};
