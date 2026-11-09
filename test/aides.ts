/** Outils communs aux tests : fausses réponses HTTP, base SQLite en mémoire, offres fictives. */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DepotCandidatures } from "../src/candidatures/depot.js";
import { PROFIL } from "../src/domaine/profil.js";
import type { Contexte } from "../src/outils/contexte.js";
import type { OffreFtBrute } from "../src/sources/franceTravail.js";
import type { Fetch } from "../src/sources/http.js";
import type { OffreLbaBrute } from "../src/sources/laBonneAlternance.js";

export type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response> | undefined;

/** Faux fetch : chaque route reconnaît une URL et répond ; les appels sont enregistrés. */
export function fauxFetch(...routes: Route[]): Fetch & { appels: Array<{ url: URL; init: RequestInit | undefined }> } {
  const appels: Array<{ url: URL; init: RequestInit | undefined }> = [];
  const f = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(entree instanceof Request ? entree.url : String(entree));
    appels.push({ url, init });
    for (const r of routes) {
      const reponse = await r(url, init);
      if (reponse) return reponse;
    }
    throw new Error(`Appel réseau inattendu dans un test : ${url}`);
  }) as Fetch & { appels: typeof appels };
  f.appels = appels;
  return f;
}

export const json = (donnees: unknown, statut = 200) =>
  new Response(JSON.stringify(donnees), { status: statut, headers: { "content-type": "application/json" } });

export const routeGeo: Route = (url) =>
  url.hostname === "geo.api.gouv.fr"
    ? json([{ nom: "Mulhouse", code: "68224", codesPostaux: ["68100", "68200"], codeDepartement: "68", centre: { type: "Point", coordinates: [7.3255, 47.7526] } }])
    : undefined;

export const routeJetonFt: Route = (url) =>
  url.hostname === "entreprise.francetravail.fr" ? json({ access_token: "jeton-de-test", expires_in: 1499, token_type: "Bearer" }) : undefined;

/** Base SQLite en mémoire exposée avec la même interface que D1 (sous-ensemble utilisé). */
export function baseEnMemoire(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_candidatures.sql", import.meta.url), "utf8"));
  const normaliser = (ligne: unknown) => (ligne ? { ...(ligne as object) } : null);
  return {
    prepare(sql: string) {
      let valeurs: unknown[] = [];
      const instruction = {
        bind(...v: unknown[]) {
          valeurs = v.map((x) => (x === undefined ? null : x));
          return instruction;
        },
        async first() {
          return normaliser(db.prepare(sql).get(...(valeurs as never[])));
        },
        async all() {
          return { results: db.prepare(sql).all(...(valeurs as never[])).map(normaliser), success: true, meta: {} };
        },
        async run() {
          db.prepare(sql).run(...(valeurs as never[]));
          return { success: true, meta: {} };
        },
      };
      return instruction;
    },
  } as unknown as D1Database;
}

export function contexte(fetcher: Fetch, aujourdhui = "2026-11-09"): Contexte {
  return {
    fetch: fetcher,
    secrets: { LBA_API_KEY: "cle-lba-de-test", FT_CLIENT_ID: "id-de-test", FT_CLIENT_SECRET: "secret-de-test" },
    depot: new DepotCandidatures(baseEnMemoire(), () => new Date(`${aujourdhui}T10:00:00Z`)),
    profil: PROFIL,
    aujourdhui: () => aujourdhui,
  };
}

/* ---- Offres fictives (structure conforme aux schémas des API, contenu inventé pour les tests) ---- */

export function offreLba(surcharge: Partial<OffreLbaBrute> & { id?: string } = {}): OffreLbaBrute {
  const { id = "lba-test-1", ...reste } = surcharge;
  return {
    identifier: { id, partner_job_id: null, partner_label: "La bonne alternance" },
    workplace: {
      name: "Exemple Données SAS",
      brand: null,
      legal_name: "EXEMPLE DONNEES",
      description: "Entreprise fictive pour les tests.",
      website: null,
      size: "50-99",
      location: { address: "1 rue de l'Exemple 68100 Mulhouse", geopoint: { type: "Point", coordinates: [7.34, 47.75] } },
    },
    apply: { url: "https://exemple.invalid/postuler/1", phone: null, recipient_id: null },
    contract: { start: "2027-09-01T00:00:00.000Z", duration: 12, type: ["Apprentissage"], remote: "hybrid", start_type: "precise_date", start_is_flexible: false },
    offer: {
      title: "Alternant data analyst",
      description: "Analyse de données de production en Python et SQL, tableaux de bord Power BI.",
      desired_skills: ["Python", "SQL", "Power BI"],
      to_be_acquired_skills: [],
      access_conditions: [],
      opening_count: 1,
      rome_codes: ["M1419"],
      status: "Active",
      target_diploma: { european: "7", label: "Master, titre ingénieur, autres formations niveau (Bac+5)" },
      publication: { creation: "2026-11-02T08:00:00.000Z", expiration: "2027-01-02T08:00:00.000Z" },
    },
    ...reste,
  };
}

export function offreFt(surcharge: Partial<OffreFtBrute> = {}): OffreFtBrute {
  return {
    id: "999TEST",
    intitule: "Data scientist en alternance (H/F)",
    description: "Modèles de machine learning avec scikit-learn, déploiement Docker.",
    dateCreation: "2026-11-05T09:00:00.000Z",
    lieuTravail: { libelle: "68 - COLMAR", latitude: 48.08, longitude: 7.36, codePostal: "68000", commune: "68066" },
    romeCode: "M1405",
    romeLibelle: "Data scientist",
    entreprise: { nom: "Entreprise Fictive" },
    typeContrat: "CDD",
    typeContratLibelle: "Contrat à durée déterminée - 24 Mois",
    alternance: true,
    competences: [{ libelle: "Python", exigence: "E" }],
    origineOffre: { urlOrigine: "https://candidat.francetravail.fr/offres/recherche/detail/999TEST" },
    ...surcharge,
  };
}
