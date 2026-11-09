import { beforeEach, describe, expect, it } from "vitest";
import { lireOffreFt, rechercherFt, viderCacheJeton } from "../src/sources/franceTravail.js";
import { trouverCommune } from "../src/sources/geo.js";
import { lireOffreLba, rechercherLba } from "../src/sources/laBonneAlternance.js";
import { fauxFetch, json, offreFt, offreLba, routeGeo, routeJetonFt } from "./aides.js";

const ids = { clientId: "id-de-test", clientSecret: "secret-de-test" };

describe("géocodage", () => {
  it("trouve une commune par son nom", async () => {
    const f = fauxFetch(routeGeo);
    expect(await trouverCommune(f, "Mulhouse")).toMatchObject({ codeInsee: "68224", lat: 47.7526, lon: 7.3255, departement: "68" });
    expect(f.appels[0]!.url.searchParams.get("nom")).toBe("Mulhouse");
  });

  it("cherche par code postal quand on donne 5 chiffres", async () => {
    const f = fauxFetch(routeGeo);
    await trouverCommune(f, "68100");
    expect(f.appels[0]!.url.searchParams.get("codePostal")).toBe("68100");
  });

  it("explique quand la ville n'existe pas", async () => {
    const f = fauxFetch((u) => (u.hostname === "geo.api.gouv.fr" ? json([]) : undefined));
    await expect(trouverCommune(f, "Nullepart")).rejects.toThrow(/Ville introuvable/);
  });
});

describe("La bonne alternance", () => {
  it("envoie la clé en Bearer et les bons paramètres", async () => {
    const f = fauxFetch((u) => (u.pathname === "/api/job/v1/search" ? json({ jobs: [offreLba()], recruiters: [], warnings: [] }) : undefined));
    const r = await rechercherLba(f, "cle-lba", { latitude: 47.75, longitude: 7.33, rayonKm: 30, codesRome: ["M1419", "M1405"] });
    expect(r.offres).toHaveLength(1);
    const { url, init } = f.appels[0]!;
    expect(url.searchParams.get("romes")).toBe("M1419,M1405");
    expect(url.searchParams.get("radius")).toBe("30");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer cle-lba");
  });

  it("n'envoie pas de filtre ROME quand il n'y en a pas", async () => {
    const f = fauxFetch(() => json({ jobs: [], recruiters: [], warnings: [{ code: "W", message: "avertissement" }] }));
    const r = await rechercherLba(f, "cle", { latitude: 1, longitude: 1, rayonKm: 10, codesRome: [] });
    expect(f.appels[0]!.url.searchParams.has("romes")).toBe(false);
    expect(r.avertissements).toEqual(["La bonne alternance : avertissement"]);
  });

  it("explique l'absence de clé sans appeler l'API", async () => {
    const f = fauxFetch();
    await expect(lireOffreLba(f, undefined, "x")).rejects.toThrow(/LBA_API_KEY/);
    expect(f.appels).toHaveLength(0);
  });

  it("traduit une erreur 401 en message lisible", async () => {
    const f = fauxFetch(() => json({ message: "Unauthorized" }, 401));
    await expect(lireOffreLba(f, "mauvaise", "x")).rejects.toThrow(/accès refusé/);
  });
});

describe("France Travail", () => {
  beforeEach(() => viderCacheJeton());

  it("obtient un jeton puis cherche avec commune et distance", async () => {
    const f = fauxFetch(routeJetonFt, (u) => (u.pathname.endsWith("/offres/search") ? json({ resultats: [offreFt()] }, 206) : undefined));
    const r = await rechercherFt(f, ids, { codeInsee: "68224", departement: "68", rayonKm: 30, codesRome: ["M1405"], motsCles: null });
    expect(r).toHaveLength(1);
    const [jeton, recherche] = f.appels;
    expect(jeton!.url.searchParams.get("realm")).toBe("/partenaire");
    expect(String(jeton!.init?.body)).toContain("scope=api_offresdemploiv2+o2dsoffre");
    expect(recherche!.url.searchParams.get("commune")).toBe("68224");
    expect(recherche!.url.searchParams.get("distance")).toBe("30");
    expect(recherche!.url.searchParams.get("codeROME")).toBe("M1405");
    expect(new Headers(recherche!.init?.headers).get("authorization")).toBe("Bearer jeton-de-test");
  });

  it("réutilise le jeton tant qu'il est valide", async () => {
    const f = fauxFetch(routeJetonFt, () => new Response(null, { status: 204 }));
    await rechercherFt(f, ids, { codeInsee: "68224", departement: "68", rayonKm: 10, codesRome: [], motsCles: "stage" });
    await rechercherFt(f, ids, { codeInsee: "68224", departement: "68", rayonKm: 10, codesRome: [], motsCles: "stage" });
    expect(f.appels.filter((a) => a.url.hostname === "entreprise.francetravail.fr")).toHaveLength(1);
  });

  it("passe par le département pour Paris, Lyon et Marseille", async () => {
    const f = fauxFetch(routeJetonFt, () => new Response(null, { status: 204 }));
    await rechercherFt(f, ids, { codeInsee: "69123", departement: "69", rayonKm: 10, codesRome: [], motsCles: null });
    const recherche = f.appels[1]!.url.searchParams;
    expect(recherche.get("departement")).toBe("69");
    expect(recherche.has("commune")).toBe(false);
  });

  it("redemande un jeton une fois après un 401", async () => {
    let n = 0;
    const f = fauxFetch(routeJetonFt, (u) => {
      if (!u.pathname.includes("/offres/")) return undefined;
      n += 1;
      return n === 1 ? json({}, 401) : json(offreFt());
    });
    expect((await lireOffreFt(f, ids, "999TEST")).id).toBe("999TEST");
    expect(f.appels.filter((a) => a.url.hostname === "entreprise.francetravail.fr")).toHaveLength(2);
  });

  it("explique l'absence d'identifiants", async () => {
    await expect(lireOffreFt(fauxFetch(), { clientId: undefined, clientSecret: undefined }, "x")).rejects.toThrow(/FT_CLIENT_ID/);
  });
});
