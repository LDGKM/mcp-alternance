import { beforeEach, describe, expect, it } from "vitest";
import { chercherOffres, formaterRecherche, type ArgsRecherche } from "../src/outils/chercherOffres.js";
import { ajouterJours, jourAParis, premierJour } from "../src/outils/dates.js";
import { suivreCandidatures } from "../src/outils/suivreCandidatures.js";
import { viderCacheJeton } from "../src/sources/franceTravail.js";
import { contexte, fauxFetch, json, offreFt, offreLba, routeGeo, routeJetonFt } from "./aides.js";

const base: ArgsRecherche = { type: "alternance", metier: "data_analyst", ville: "Mulhouse", rayon_km: 30, sources: ["lba", "ft"], limite: 20 };

function routesRecherche(lba: unknown[], ft: unknown[]) {
  return fauxFetch(
    routeGeo,
    routeJetonFt,
    (u) => (u.pathname === "/api/job/v1/search" ? json({ jobs: lba, recruiters: [], warnings: [] }) : undefined),
    (u) => (u.pathname.endsWith("/offres/search") ? json({ resultats: ft }) : undefined),
  );
}

describe("dates", () => {
  it("calcule les dates utiles", () => {
    expect(ajouterJours("2026-12-28", 10)).toBe("2027-01-07");
    expect(premierJour("2027-09")).toBe("2027-09-01");
    expect(jourAParis(new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
  });
});

describe("chercher_offres", () => {
  beforeEach(() => viderCacheJeton());

  it("fusionne les deux sources, garde l'alternance et trie par distance", async () => {
    const ctx = contexte(routesRecherche([offreLba()], [offreFt(), offreFt({ id: "CDI1", alternance: false, intitule: "Data analyst CDI" })]));
    const r = await chercherOffres(ctx, base);
    expect(r.offres.map((o) => o.id)).toEqual(["lba:lba-test-1", "ft:999TEST"]);
    expect(r.par_source).toEqual({ "La bonne alternance": 1, "France Travail": 1 });
    expect(r.criteres.code_insee).toBe("68224");
  });

  it("supprime les doublons rediffusés par La bonne alternance", async () => {
    const copie = offreLba({ id: "lba-copie" });
    copie.identifier = { id: "lba-copie", partner_job_id: "999TEST", partner_label: "France Travail" };
    const r = await chercherOffres(contexte(routesRecherche([copie], [offreFt()])), base);
    expect(r.offres.map((o) => o.id)).toEqual(["ft:999TEST"]);
    expect(r.remarques.some((m) => m.includes("doublon"))).toBe(true);
  });

  it("écarte les débuts trop tôt et garde les dates inconnues en le disant", async () => {
    const tot = offreLba({ id: "tot" });
    tot.contract = { ...tot.contract, start: "2027-01-15T00:00:00.000Z" };
    const r = await chercherOffres(contexte(routesRecherche([offreLba(), tot], [offreFt()])), { ...base, date_debut: "2027-07" });
    expect(r.offres.map((o) => o.id)).toEqual(["lba:lba-test-1", "ft:999TEST"]);
    expect(r.remarques.join(" ")).toMatch(/1 offre\(s\) écartée/);
    expect(r.remarques.join(" ")).toMatch(/sans date de début connue/);
  });

  it("continue avec une source quand l'autre échoue", async () => {
    const f = fauxFetch(routeGeo, routeJetonFt, (u) => (u.pathname === "/api/job/v1/search" ? json({}, 500) : undefined), (u) =>
      u.pathname.endsWith("/offres/search") ? json({ resultats: [offreFt()] }) : undefined,
    );
    const r = await chercherOffres(contexte(f), base);
    expect(r.offres).toHaveLength(1);
    expect(r.remarques[0]).toMatch(/La bonne alternance indisponible/);
  });

  it("pour un stage, n'interroge que France Travail avec le mot-clé « stage »", async () => {
    const stage = offreFt({ id: "STG1", intitule: "Stage data analyst", alternance: false });
    const f = routesRecherche([], [stage, offreFt()]);
    const r = await chercherOffres(contexte(f), { ...base, type: "stage" });
    expect(r.offres.map((o) => o.id)).toEqual(["ft:STG1"]);
    expect(f.appels.some((a) => a.url.pathname === "/api/job/v1/search")).toBe(false);
    expect(f.appels.find((a) => a.url.pathname.endsWith("/offres/search"))!.url.searchParams.get("motsCles")).toBe("stage");
  });

  it("filtre la R&D sur le texte de l'annonce", async () => {
    const rd = offreLba({ id: "rd" });
    rd.offer = { ...rd.offer, title: "Alternance ingénieur R&D logiciel" };
    const r = await chercherOffres(contexte(routesRecherche([rd, offreLba()], [])), { ...base, metier: "r_et_d", sources: ["lba"] });
    expect(r.offres.map((o) => o.id)).toEqual(["lba:rd"]);
  });

  it("signale les offres déjà suivies", async () => {
    const ctx = contexte(routesRecherche([offreLba()], []));
    await ctx.depot.ajouter({ offre_id: "lba:lba-test-1", entreprise: "E", poste: "P", type: "alternance", lien: null, etat: "envoyee", date_candidature: null, date_relance: null, notes: null });
    const texte = formaterRecherche(await chercherOffres(ctx, { ...base, sources: ["lba"] }));
    expect(texte).toContain("déjà dans vos candidatures (envoyée)");
  });
});

describe("suivre_candidatures", () => {
  beforeEach(() => viderCacheJeton());

  it("ajoute une candidature à partir d'un offre_id et programme la relance", async () => {
    const f = fauxFetch((u) => (u.pathname === "/api/job/v1/offer/lba-test-1" ? json(offreLba()) : undefined));
    const ctx = contexte(f);
    const texte = await suivreCandidatures(ctx, { action: "ajouter", offre_id: "lba:lba-test-1", etat: "envoyee" });
    expect(texte).toContain("Alternant data analyst");
    expect(texte).toContain("Exemple Données SAS");
    const [c] = await ctx.depot.lister();
    expect(c).toMatchObject({ etat: "envoyee", date_candidature: "2026-11-09", date_relance: "2026-11-19", type: "alternance", lien: "https://exemple.invalid/postuler/1" });
  });

  it("refuse un doublon sur la même offre", async () => {
    const ctx = contexte(fauxFetch());
    await suivreCandidatures(ctx, { action: "ajouter", offre_id: "ft:1", entreprise: "E", poste: "P" });
    expect(await suivreCandidatures(ctx, { action: "ajouter", offre_id: "ft:1", entreprise: "E", poste: "P" })).toContain("déjà suivie");
    expect(await ctx.depot.lister()).toHaveLength(1);
  });

  it("exige entreprise et poste sans offre_id", async () => {
    await expect(suivreCandidatures(contexte(fauxFetch()), { action: "ajouter", entreprise: "E" })).rejects.toThrow(/entreprise et le poste/);
  });

  it("liste les relances dues et met à jour l'état", async () => {
    const ctx = contexte(fauxFetch(), "2026-11-25");
    await suivreCandidatures(ctx, { action: "ajouter", entreprise: "A", poste: "Data analyst", date_candidature: "2026-11-01" });
    await suivreCandidatures(ctx, { action: "ajouter", entreprise: "B", poste: "Data scientist", date_candidature: "2026-11-20" });
    await suivreCandidatures(ctx, { action: "ajouter", entreprise: "C", poste: "R&D" });

    const dues = await suivreCandidatures(ctx, { action: "lister", a_relancer: true });
    expect(dues).toContain("(1)");
    expect(dues).toContain("**#1 Data analyst** — A");
    expect(dues).toContain("⏰ à relancer");

    const maj = await suivreCandidatures(ctx, { action: "mettre_a_jour", id: 1, etat: "relancee" });
    expect(maj).toContain("relance le 2026-12-05");
    expect(await suivreCandidatures(ctx, { action: "lister", a_relancer: true })).toContain("aucune");

    const tout = await suivreCandidatures(ctx, { action: "lister" });
    expect(tout).toContain("à envoyer : 1");
    expect(tout).toContain("relancée : 1");
  });

  it("explique quand l'id n'existe pas", async () => {
    await expect(suivreCandidatures(contexte(fauxFetch()), { action: "mettre_a_jour", id: 42, etat: "refusee" })).rejects.toThrow(/Aucune candidature/);
  });
});
