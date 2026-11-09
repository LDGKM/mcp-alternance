/** Tests de bout en bout du protocole MCP (client et serveur reliés en mémoire) et de la page d'autorisation. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleConfiguree, clesIdentiques } from "../src/auth/cle.js";
import { gestionnaireParDefaut } from "../src/auth/gestionnaire.js";
import { echapperHtml } from "../src/auth/page.js";
import type { Env } from "../src/env.js";
import { creerServeur } from "../src/mcp/serveur.js";
import { viderCacheJeton } from "../src/sources/franceTravail.js";
import { contexte, fauxFetch, json, offreLba, routeGeo } from "./aides.js";

async function clientConnecte(ctx = contexte(fauxFetch())) {
  const [cote1, cote2] = InMemoryTransport.createLinkedPair();
  await creerServeur(ctx).connect(cote1);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(cote2);
  return client;
}

const texteDe = (r: Awaited<ReturnType<Client["callTool"]>>) => (r.content as Array<{ type: string; text: string }>)[0]!.text;

describe("serveur MCP", () => {
  afterEach(() => viderCacheJeton());

  it("expose les quatre outils", async () => {
    const client = await clientConnecte();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["chercher_offres", "evaluer_offre", "lire_offre", "suivre_candidatures"]);
  });

  it("appelle chercher_offres avec les valeurs par défaut", async () => {
    const f = fauxFetch(routeGeo, (u) => (u.pathname === "/api/job/v1/search" ? json({ jobs: [offreLba()], recruiters: [], warnings: [] }) : undefined));
    const client = await clientConnecte(contexte(f));
    const r = await client.callTool({ name: "chercher_offres", arguments: { type: "alternance", metier: "data_analyst", sources: ["lba"] } });
    expect(r.isError).toBeFalsy();
    expect(texteDe(r)).toContain("Alternant data analyst");
    expect(texteDe(r)).toContain("Mulhouse (68224) + 30 km");
  });

  it("renvoie une erreur lisible au lieu de planter", async () => {
    const client = await clientConnecte();
    const r = await client.callTool({ name: "lire_offre", arguments: { id: "inconnu:1" } });
    expect(r.isError).toBe(true);
    expect(texteDe(r)).toMatch(/^Erreur : Identifiant d'offre invalide/);
  });

  it("évalue une offre", async () => {
    const f = fauxFetch((u) => (u.pathname === "/api/job/v1/offer/lba-test-1" ? json(offreLba()) : undefined));
    const r = await (await clientConnecte(contexte(f))).callTool({ name: "evaluer_offre", arguments: { id: "lba:lba-test-1" } });
    expect(texteDe(r)).toContain("## Ce qui colle");
    expect(texteDe(r)).toContain("Power BI");
  });

  it("valide les arguments (date mal formée)", async () => {
    const r = await (await clientConnecte()).callTool({ name: "suivre_candidatures", arguments: { action: "ajouter", entreprise: "E", poste: "P", date_candidature: "09/11/2026" } });
    expect(r.isError).toBe(true);
  });
});

describe("clé d'accès", () => {
  it("compare les clés", async () => {
    expect(await clesIdentiques("abc", "abc")).toBe(true);
    expect(await clesIdentiques("abc", "abd")).toBe(false);
    expect(await clesIdentiques("", "abc")).toBe(false);
  });

  it("exige une clé d'au moins 32 caractères", () => {
    expect(cleConfiguree(undefined)).toBe(false);
    expect(cleConfiguree("courte")).toBe(false);
    expect(cleConfiguree("x".repeat(32))).toBe(true);
  });

  it("échappe le HTML", () => {
    expect(echapperHtml(`<script>"x"&'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;");
  });
});

describe("page d'autorisation", () => {
  const CLE = "cle-de-test-suffisamment-longue-0123456789";
  const demande = { responseType: "code", clientId: "client-1", redirectUri: "https://claude.ai/api/mcp/auth_callback", scope: [], state: "s" };

  function env(cle: string | null = CLE) {
    const completeAuthorization = vi.fn(async () => ({ redirectTo: "https://claude.ai/api/mcp/auth_callback?code=abc&state=s" }));
    const e = {
      CLE_ACCES: cle ?? undefined,
      OAUTH_PROVIDER: {
        parseAuthRequest: vi.fn(async () => demande),
        lookupClient: vi.fn(async () => ({ clientName: "Claude" })),
        completeAuthorization,
      },
    } as unknown as Env;
    return { e, completeAuthorization };
  }
  const appeler = (req: Request, e: Env) => gestionnaireParDefaut.fetch!(req as never, e, {} as ExecutionContext);
  const formulaire = (cle: string) =>
    new Request("https://mcp.exemple.fr/authorize", {
      method: "POST",
      body: new URLSearchParams({ cle, requete: btoa(JSON.stringify(demande)) }),
    });

  it("refuse tout si la clé n'est pas configurée", async () => {
    const r = await appeler(new Request("https://mcp.exemple.fr/authorize"), env(null).e);
    expect(r.status).toBe(503);
  });

  it("affiche le formulaire avec le nom du client", async () => {
    const r = await appeler(new Request("https://mcp.exemple.fr/authorize?client_id=client-1"), env().e);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await r.text();
    expect(html).toContain("<strong>Claude</strong>");
    expect(html).toContain("claude.ai");
  });

  it("refuse une mauvaise clé, après une pause", async () => {
    const { e, completeAuthorization } = env();
    const debut = Date.now();
    const r = await appeler(formulaire("mauvaise"), e);
    expect(Date.now() - debut).toBeGreaterThanOrEqual(1400);
    expect(r.status).toBe(401);
    expect(await r.text()).toContain("Clé incorrecte");
    expect(completeAuthorization).not.toHaveBeenCalled();
  });

  it("autorise avec la bonne clé et redirige vers Claude", async () => {
    const { e, completeAuthorization } = env();
    const r = await appeler(formulaire(CLE), e);
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain("code=abc");
    expect(completeAuthorization).toHaveBeenCalledWith(expect.objectContaining({ request: demande, userId: "proprietaire" }));
  });

  it("répond 404 ailleurs", async () => {
    expect((await appeler(new Request("https://mcp.exemple.fr/admin"), env().e)).status).toBe(404);
  });
});
