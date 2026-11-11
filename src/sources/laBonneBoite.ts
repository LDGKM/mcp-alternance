/**
 * Client de l'API La Bonne Boîte v2 (France Travail) : entreprises ayant un fort potentiel
 * d'embauche sur les 6 prochains mois pour un métier et une zone, qu'elles aient publié une offre ou non.
 * Usage : candidatures spontanées ciblées.
 *
 * Route : GET https://api.francetravail.io/partenaire/labonneboite/v2/recherche
 * Paramètres : rome (répété), citycode (code INSEE), distance (km, 200 max), page_size.
 * Portée : « api_labonneboitev2 search office », ou « api_labonneboitev2 » seule selon l'application.
 *
 * La forme exacte de la réponse n'est pas publiée : elle est lue de façon défensive
 * (champs absents = null, entrées sans SIRET valide ignorées). À confirmer au premier appel réel.
 */
import { ErreurSource, type Fetch } from "./http.js";
import { appelerFt, type IdentifiantsFt } from "./jetonFranceTravail.js";

const URL_RECHERCHE = "https://api.francetravail.io/partenaire/labonneboite/v2/recherche";
const API = { cle: "labonneboite", portees: ["api_labonneboitev2 search office", "api_labonneboitev2"], nom: "La Bonne Boîte" };

export interface Entreprise {
  /** « lbb:<siret> », utilisable comme offre_id dans suivre_candidatures. */
  id: string;
  siret: string;
  nom: string;
  /** Potentiel d'embauche donné par La Bonne Boîte (0 à 100), ou null s'il est absent. */
  potentiel: number | null;
  ville: string | null;
  activite: string | null;
  effectif: string | null;
  /** Fiche publique de l'établissement (annuaire des entreprises de l'État). */
  fiche: string;
}

export interface CriteresLbb {
  codeInsee: string;
  rayonKm: number;
  codesRome: string[];
  taille: number;
}

type Json = Record<string, unknown>;
const estObjet = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const entier = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+\s*$/.test(v) ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

export function lireEntreprises(reponse: unknown): Entreprise[] {
  const elements = estObjet(reponse) && Array.isArray(reponse.items) ? reponse.items.filter(estObjet) : [];
  const entreprises: Entreprise[] = [];
  for (const e of elements) {
    const siret = texte(e.siret);
    const nom = texte(e.company_name) ?? texte(e.office_name);
    if (!siret || !/^\d{14}$/.test(siret) || !nom) continue;
    const [min, max] = [entier(e.headcount_min), entier(e.headcount_max)];
    entreprises.push({
      id: `lbb:${siret}`,
      siret,
      nom,
      potentiel: typeof e.hiring_potential === "number" ? Math.round(e.hiring_potential) : null,
      ville: texte(e.city),
      activite: texte(e.naf_label),
      effectif: min === null ? null : max !== null && max >= min ? `${min} à ${max} salariés` : `${min} salariés et plus`,
      fiche: `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}`,
    });
  }
  return entreprises.sort((a, b) => (b.potentiel ?? -1) - (a.potentiel ?? -1));
}

export async function rechercherEntreprises(fetcher: Fetch, ids: IdentifiantsFt, c: CriteresLbb): Promise<Entreprise[]> {
  if (c.codesRome.length === 0) throw new ErreurSource("La Bonne Boîte cherche par code ROME : choisissez un métier qui en a un (pas r_et_d).");
  const params = new URLSearchParams();
  for (const code of c.codesRome) params.append("rome", code);
  params.set("citycode", c.codeInsee);
  params.set("distance", String(Math.min(Math.max(Math.round(c.rayonKm), 1), 200)));
  params.set("page_size", String(Math.min(Math.max(c.taille, 1), 100)));
  return lireEntreprises(await appelerFt<unknown>(fetcher, ids, API, `${URL_RECHERCHE}?${params}`));
}
