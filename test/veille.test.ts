import { beforeEach, describe, expect, it } from "vitest";
import { calculerScore, evaluer } from "../src/domaine/evaluation.js";
import { PROFIL } from "../src/domaine/profil.js";
import { chercherEntreprises } from "../src/outils/chercherEntreprises.js";
import { suivreCandidatures } from "../src/outils/suivreCandidatures.js";
import { type ArgsVeille, veille } from "../src/outils/veille.js";
import { viderCacheJeton } from "../src/sources/franceTravail.js";
import { convertirLba } from "../src/sources/laBonneAlternance.js";
import { lireEntreprises, rechercherEntreprises } from "../src/sources/laBonneBoite.js";
import { contexte, fauxFetch, json, offreLba, routeGeo, type Route } from "./aides.js";

const ids = { clientId: "id", clientSecret: "secret" };

/** Réponse La Bonne Boîte fictive, au format lu par le client. */
const reponseLbb = {
  items: [
    { siret: "12345678900011", company_name: "Société Fictive Données", hiring_potential: 72.4, city: "Mulhouse", naf_label: "Programmation informatique", headcount_min: 20, headcount_max: 49 },
    { siret: "98765432100022", office_name: "Bureau Fictif", hiring_potential: 91, city: "Colmar" },
    { siret: "pas-un-siret", company_name: "Ignorée" },
  ],
};

const routeJetonLbb: Route = (u, init) => {
  if (u.hostname !== "entreprise.francetravail.fr") return undefined;
  const portee = new URLSearchParams(String(init?.body)).get("scope");
  // Simule une application qui n'a pas les sous-portées « search office ».
  return portee === "api_labonneboitev2" ? json({ access_token: "jeton-lbb", expires_in: 1499 }) : json({ error: "invalid_scope" }, 400);
};
const routeLbb: Route = (u) => (u.pathname.endsWith("/labonneboite/v2/recherche") ? json(reponseLbb) : undefined);
const routeLba = (jobs: unknown[]): Route => (u) => (u.pathname === "/api/job/v1/search" ? json({ jobs, recruiters: [], warnings: [] }) : undefined);

const args: ArgsVeille = { seuil: 60, ville: "Mulhouse", rayon_km: 60, metiers: ["data_analyst"], types: ["alternance"], ajouter_candidatures: true, entreprises: 5 };

describe("score de correspondance", () => {
  it("vaut 0 pour un contrat qui n'est ni alternance ni stage", () => {
    const e = evaluer(convertirLba(offreLba()), PROFIL);
    expect(calculerScore({ ...e, type_contrat: { type: "autre", statut: "incompatible", detail: "" } }).total).toBe(0);
  });

  it("détaille chaque part et reste sur 100", () => {
    const e = evaluer(convertirLba(offreLba(), PROFIL.ville), PROFIL);
    // Python et SQL dans le profil, Power BI hors profil : 2/3 de 50 = 33 ; date, niveau, distance compatibles.
    expect(e.score.total).toBe(33 + 20 + 15 + 15);
    expect(e.score.detail[0]).toContain("2 du profil, 1 hors profil");
  });
});

describe("La Bonne Boîte", () => {
  beforeEach(() => viderCacheJeton());

  it("lit la réponse de façon défensive et trie par potentiel", () => {
    const e = lireEntreprises(reponseLbb);
    expect(e.map((x) => x.nom)).toEqual(["Bureau Fictif", "Société Fictive Données"]);
    expect(e[1]).toMatchObject({ id: "lbb:12345678900011", potentiel: 72, effectif: "20 à 49 salariés", fiche: "https://annuaire-entreprises.data.gouv.fr/etablissement/12345678900011" });
    expect(lireEntreprises({ autre: 1 })).toEqual([]);
  });

  it("essaie la portée seule si les sous-portées sont refusées, et envoie rome, citycode, distance", async () => {
    const f = fauxFetch(routeJetonLbb, routeLbb);
    await rechercherEntreprises(f, ids, { codeInsee: "68224", rayonKm: 30, codesRome: ["M1419", "M1405"], taille: 20 });
    const portees = f.appels.filter((a) => a.url.hostname === "entreprise.francetravail.fr").map((a) => new URLSearchParams(String(a.init?.body)).get("scope"));
    expect(portees).toEqual(["api_labonneboitev2 search office", "api_labonneboitev2"]);
    const recherche = f.appels.find((a) => a.url.pathname.endsWith("/recherche"))!.url.searchParams;
    expect(recherche.getAll("rome")).toEqual(["M1419", "M1405"]);
    expect(recherche.get("citycode")).toBe("68224");
    expect(recherche.get("distance")).toBe("30");
  });

  it("refuse un métier sans code ROME", async () => {
    await expect(rechercherEntreprises(fauxFetch(), ids, { codeInsee: "68224", rayonKm: 30, codesRome: [], taille: 5 })).rejects.toThrow(/code ROME/);
  });

  it("chercher_entreprises explique l'absence d'identifiants", async () => {
    const ctx = contexte(fauxFetch());
    ctx.secrets = {};
    await expect(chercherEntreprises(ctx, { metier: "data_large", ville: "Mulhouse", rayon_km: 30, limite: 5 })).rejects.toThrow(/FT_CLIENT_ID/);
  });
});

describe("veille", () => {
  beforeEach(() => viderCacheJeton());

  it("note les nouvelles offres, ajoute celles au-dessus du seuil et ne les signale qu'une fois", async () => {
    const faible = offreLba({ id: "faible" });
    faible.offer = { ...faible.offer, title: "Alternance data", description: "Spark, Hadoop, Scala, Kafka, AWS.", desired_skills: [] };
    const ctx = contexte(fauxFetch(routeGeo, routeLba([offreLba(), faible]), routeJetonLbb, routeLbb));
    ctx.franceTravailOffres = false;

    const premier = await veille(ctx, args);
    expect(premier).toContain("**2 nouvelle(s)**");
    expect(premier).toContain("**1 au-dessus du seuil**");
    expect(premier).toContain("Alternant data analyst — Exemple Données SAS · **83/100**");
    expect(premier).toContain("## Autres nouvelles offres (sous le seuil) — 1");
    expect(premier).toContain("Bureau Fictif");
    expect(premier).toContain("## Pour rédiger les brouillons");
    expect(premier).toContain("Stagiaire développeur web et analyste, PetitAvis");

    const [c] = await ctx.depot.lister();
    expect(c).toMatchObject({ offre_id: "lba:lba-test-1", etat: "a_envoyer", notes: "Veille du 2026-11-09 — score 83/100" });
    expect(await ctx.depot.lister()).toHaveLength(1);

    const second = await veille(ctx, args);
    expect(second).toContain("**0 nouvelle(s)**");
    expect(second).toContain("0 nouvelle(s) entreprise(s)");
    expect(await ctx.depot.lister()).toHaveLength(1);
  });

  it("continue sans La Bonne Boîte et le signale", async () => {
    const ctx = contexte(fauxFetch(routeGeo, routeLba([])));
    ctx.secrets = { LBA_API_KEY: "cle" };
    const texte = await veille(ctx, args);
    expect(texte).toContain("La Bonne Boîte non configurée");
    expect(texte).toContain("Aucune nouvelle offre n'atteint le seuil.");
  });
});

describe("brouillons", () => {
  it("enregistre et relit un brouillon", async () => {
    const ctx = contexte(fauxFetch());
    await suivreCandidatures(ctx, { action: "ajouter", offre_id: "lbb:12345678900011", entreprise: "Société Fictive Données", poste: "Candidature spontanée — alternance data" });
    const maj = await suivreCandidatures(ctx, { action: "mettre_a_jour", id: 1, brouillon: "Madame, Monsieur, …" });
    expect(maj).toContain("brouillon prêt");
    const lu = await suivreCandidatures(ctx, { action: "lire", id: 1 });
    expect(lu).toContain("## Brouillon\nMadame, Monsieur, …");
    expect(lu).toContain("https://annuaire-entreprises.data.gouv.fr/etablissement/12345678900011");
  });
});
