/**
 * Client de l'API La bonne alternance (https://api.apprentissage.beta.gouv.fr).
 * Routes : GET /api/job/v1/search et GET /api/job/v1/offer/{id}.
 * Authentification : en-tête « Authorization: Bearer <clé d'API> ».
 * Usage gratuit, réservé aux usages non commerciaux (conditions de l'API).
 */
import { distanceKm, idPrefixe, jourIso, NOM_SOURCE, type OffreComplete } from "../domaine/offre.js";
import { ErreurSource, type Fetch, lireJson } from "./http.js";

const BASE = "https://api.apprentissage.beta.gouv.fr/api";
const NOM = NOM_SOURCE.lba;

/** Forme (partielle) d'une offre renvoyée par l'API, d'après son schéma OpenAPI. */
export interface OffreLbaBrute {
  identifier: { id: string | null; partner_job_id?: string | null; partner_label?: string | null };
  workplace: {
    name?: string | null;
    brand?: string | null;
    legal_name?: string | null;
    description?: string | null;
    website?: string | null;
    size?: string | null;
    location?: { address?: string | null; geopoint?: { type: "Point"; coordinates: [number, number] } | null } | null;
  };
  apply?: { url?: string | null; phone?: string | null; recipient_id?: string | null } | null;
  contract?: {
    start?: string | null;
    duration?: number | null;
    type?: string[] | null;
    remote?: "onsite" | "remote" | "hybrid" | null;
    start_type?: "des_que_possible" | "precise_date" | null;
    start_is_flexible?: boolean | null;
  } | null;
  offer?: {
    title?: string | null;
    description?: string | null;
    desired_skills?: string[] | null;
    to_be_acquired_skills?: string[] | null;
    access_conditions?: string[] | null;
    opening_count?: number | null;
    rome_codes?: string[] | null;
    status?: string | null;
    target_diploma?: { european?: string; label?: string } | null;
    publication?: { creation?: string | null; expiration?: string | null } | null;
  } | null;
}

interface ReponseRecherche {
  jobs: OffreLbaBrute[];
  recruiters: unknown[];
  warnings: Array<{ code: string; message: string }>;
}

export interface CriteresLba {
  latitude: number;
  longitude: number;
  rayonKm: number;
  codesRome: string[];
}

function entetes(cle: string | undefined): HeadersInit {
  if (!cle) {
    throw new ErreurSource(
      "La clé d'API La bonne alternance n'est pas configurée (secret LBA_API_KEY). Voir le guide, étape « La bonne alternance ».",
    );
  }
  return { authorization: `Bearer ${cle}`, accept: "application/json" };
}

export async function rechercherLba(
  fetcher: Fetch,
  cle: string | undefined,
  criteres: CriteresLba,
): Promise<{ offres: OffreLbaBrute[]; avertissements: string[] }> {
  const params = new URLSearchParams({
    latitude: String(criteres.latitude),
    longitude: String(criteres.longitude),
    radius: String(Math.min(Math.max(criteres.rayonKm, 0), 200)),
  });
  if (criteres.codesRome.length > 0) params.set("romes", criteres.codesRome.join(","));

  const { donnees } = await lireJson<ReponseRecherche>(fetcher, `${BASE}/job/v1/search?${params}`, { headers: entetes(cle) }, NOM);
  return {
    offres: donnees?.jobs ?? [],
    avertissements: (donnees?.warnings ?? []).map((w) => `${NOM} : ${w.message}`),
  };
}

export async function lireOffreLba(fetcher: Fetch, cle: string | undefined, idBrut: string): Promise<OffreLbaBrute> {
  const { donnees } = await lireJson<OffreLbaBrute>(
    fetcher,
    `${BASE}/job/v1/offer/${encodeURIComponent(idBrut)}`,
    { headers: entetes(cle) },
    NOM,
  );
  if (!donnees) throw new ErreurSource(`${NOM} n'a renvoyé aucune donnée pour l'offre ${idBrut}.`);
  return donnees;
}

const TELETRAVAIL: Record<string, string> = { onsite: "sur site", remote: "télétravail", hybrid: "hybride" };

export function convertirLba(brute: OffreLbaBrute, origine?: { lat: number; lon: number }): OffreComplete {
  const w = brute.workplace ?? {};
  const c = brute.contract ?? {};
  const o = brute.offer ?? {};
  const coords = w.location?.geopoint?.coordinates;
  const autres: Record<string, string> = {};
  if (brute.identifier.partner_label) autres["Diffusée par"] = brute.identifier.partner_label;
  if (w.size) autres["Effectif"] = w.size;
  if (w.website) autres["Site de l'entreprise"] = w.website;
  if (o.opening_count) autres["Postes"] = String(o.opening_count);
  if (o.status) autres["Statut"] = o.status;
  if (c.start_type === "des_que_possible") autres["Démarrage"] = "dès que possible";
  if (c.start_is_flexible) autres["Date de début"] = "flexible";
  if (o.publication?.expiration) autres["Expire le"] = jourIso(o.publication.expiration) ?? o.publication.expiration;
  if (o.rome_codes?.length) autres["Codes ROME"] = o.rome_codes.join(", ");

  const types = c.type ?? [];
  return {
    id: idPrefixe("lba", brute.identifier.id ?? ""),
    source: NOM,
    intitule: o.title?.trim() || "(sans intitulé)",
    entreprise: w.brand || w.name || w.legal_name || null,
    lieu: w.location?.address ?? null,
    distance_km: coords && origine ? distanceKm(origine, { lat: coords[1], lon: coords[0] }) : null,
    contrat: types.length ? types.join(" ou ") : null,
    date_debut: jourIso(c.start),
    date_publication: jourIso(o.publication?.creation),
    lien_candidature: brute.apply?.url ?? null,
    description: [o.description, w.description ? `\n**À propos de l'entreprise** : ${w.description}` : null].filter(Boolean).join("\n") || null,
    duree_mois: c.duration ?? null,
    teletravail: c.remote ? (TELETRAVAIL[c.remote] ?? c.remote) : null,
    niveau_diplome: o.target_diploma?.label ?? null,
    competences_demandees: o.desired_skills ?? [],
    competences_a_acquerir: o.to_be_acquired_skills ?? [],
    conditions_acces: o.access_conditions ?? [],
    // Toutes les offres de La bonne alternance sont des contrats d'alternance.
    alternance: true,
    salaire: null,
    telephone: brute.apply?.phone ?? null,
    autres_infos: autres,
  };
}
