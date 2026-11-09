/**
 * Client de l'API Offres d'emploi v2 de France Travail (https://francetravail.io).
 * Jeton : OAuth2 « client_credentials » sur le royaume /partenaire.
 * Routes : GET /offres/search et GET /offres/{id}.
 */
import { distanceKm, idPrefixe, jourIso, NOM_SOURCE, type OffreComplete } from "../domaine/offre.js";
import { ErreurSource, type Fetch, lireJson } from "./http.js";

const URL_JETON = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const BASE = "https://api.francetravail.io/partenaire/offresdemploi/v2";
const PORTEE = "api_offresdemploiv2 o2dsoffre";
const NOM = NOM_SOURCE.ft;

/** Communes à arrondissements : France Travail attend un code d'arrondissement, on passe alors par le département. */
const COMMUNES_A_ARRONDISSEMENTS = new Set(["75056", "69123", "13055"]);

export interface OffreFtBrute {
  id: string;
  intitule?: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  lieuTravail?: { libelle?: string; latitude?: number; longitude?: number; codePostal?: string; commune?: string };
  romeCode?: string;
  romeLibelle?: string;
  appellationlibelle?: string;
  entreprise?: { nom?: string; description?: string };
  typeContrat?: string;
  typeContratLibelle?: string;
  natureContrat?: string;
  experienceLibelle?: string;
  salaire?: { libelle?: string; commentaire?: string };
  dureeTravailLibelle?: string;
  alternance?: boolean;
  nombrePostes?: number;
  qualificationLibelle?: string;
  secteurActiviteLibelle?: string;
  contact?: { urlPostulation?: string; telephone?: string };
  origineOffre?: { urlOrigine?: string };
  competences?: Array<{ libelle?: string; exigence?: string }>;
  formations?: Array<{ niveauLibelle?: string; domaineLibelle?: string; exigence?: string }>;
  langues?: Array<{ libelle?: string; exigence?: string }>;
  qualitesProfessionnelles?: Array<{ libelle?: string }>;
}

interface ReponseRecherche {
  resultats?: OffreFtBrute[];
}

export interface IdentifiantsFt {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

export interface CriteresFt {
  codeInsee: string;
  departement: string | null;
  rayonKm: number;
  codesRome: string[];
  motsCles: string | null;
}

/** Cache du jeton, partagé par les requêtes d'une même instance du Worker. */
let jetonEnCache: { valeur: string; expireA: number } | null = null;

export function viderCacheJeton(): void {
  jetonEnCache = null;
}

async function obtenirJeton(fetcher: Fetch, ids: IdentifiantsFt): Promise<string> {
  if (!ids.clientId || !ids.clientSecret) {
    throw new ErreurSource(
      "Les identifiants France Travail ne sont pas configurés (secrets FT_CLIENT_ID et FT_CLIENT_SECRET). Voir le guide, étape « France Travail ».",
    );
  }
  if (jetonEnCache && jetonEnCache.expireA > Date.now()) return jetonEnCache.valeur;

  const corps = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ids.clientId,
    client_secret: ids.clientSecret,
    scope: PORTEE,
  });
  const { donnees } = await lireJson<{ access_token: string; expires_in: number }>(
    fetcher,
    URL_JETON,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: corps },
    `${NOM} (jeton)`,
  );
  if (!donnees?.access_token) throw new ErreurSource(`${NOM} n'a pas délivré de jeton d'accès.`);
  // Marge d'une minute avant l'expiration annoncée.
  jetonEnCache = { valeur: donnees.access_token, expireA: Date.now() + (donnees.expires_in - 60) * 1000 };
  return donnees.access_token;
}

async function appeler<T>(fetcher: Fetch, ids: IdentifiantsFt, url: string): Promise<T | null> {
  const jeton = await obtenirJeton(fetcher, ids);
  try {
    const { donnees } = await lireJson<T>(fetcher, url, { headers: { authorization: `Bearer ${jeton}`, accept: "application/json" } }, NOM);
    return donnees;
  } catch (e) {
    // Jeton révoqué avant son expiration : on en redemande un, une seule fois.
    if (e instanceof ErreurSource && e.statut === 401 && jetonEnCache) {
      viderCacheJeton();
      const nouveau = await obtenirJeton(fetcher, ids);
      return (await lireJson<T>(fetcher, url, { headers: { authorization: `Bearer ${nouveau}`, accept: "application/json" } }, NOM)).donnees;
    }
    throw e;
  }
}

export async function rechercherFt(fetcher: Fetch, ids: IdentifiantsFt, criteres: CriteresFt): Promise<OffreFtBrute[]> {
  const params = new URLSearchParams({ range: "0-149", sort: "1" });
  if (COMMUNES_A_ARRONDISSEMENTS.has(criteres.codeInsee) && criteres.departement) {
    params.set("departement", criteres.departement);
  } else {
    params.set("commune", criteres.codeInsee);
    params.set("distance", String(Math.min(Math.max(Math.round(criteres.rayonKm), 0), 200)));
  }
  if (criteres.codesRome.length > 0) params.set("codeROME", criteres.codesRome.join(","));
  if (criteres.motsCles) params.set("motsCles", criteres.motsCles);

  const donnees = await appeler<ReponseRecherche>(fetcher, ids, `${BASE}/offres/search?${params}`);
  return donnees?.resultats ?? [];
}

export async function lireOffreFt(fetcher: Fetch, ids: IdentifiantsFt, idBrut: string): Promise<OffreFtBrute> {
  const donnees = await appeler<OffreFtBrute>(fetcher, ids, `${BASE}/offres/${encodeURIComponent(idBrut)}`);
  if (!donnees) throw new ErreurSource(`${NOM} n'a renvoyé aucune donnée pour l'offre ${idBrut} (retirée ?).`);
  return donnees;
}

export function convertirFt(brute: OffreFtBrute, origine?: { lat: number; lon: number }): OffreComplete {
  const lieu = brute.lieuTravail;
  const autres: Record<string, string> = {};
  if (brute.romeLibelle) autres["Métier (ROME)"] = `${brute.romeLibelle}${brute.romeCode ? ` (${brute.romeCode})` : ""}`;
  if (brute.experienceLibelle) autres["Expérience"] = brute.experienceLibelle;
  if (brute.dureeTravailLibelle) autres["Durée du travail"] = brute.dureeTravailLibelle;
  if (brute.qualificationLibelle) autres["Qualification"] = brute.qualificationLibelle;
  if (brute.secteurActiviteLibelle) autres["Secteur"] = brute.secteurActiviteLibelle;
  if (brute.natureContrat) autres["Nature du contrat"] = brute.natureContrat;
  if (brute.nombrePostes) autres["Postes"] = String(brute.nombrePostes);
  if (brute.langues?.length) autres["Langues"] = brute.langues.map((l) => l.libelle).filter(Boolean).join(", ");

  const formations = (brute.formations ?? [])
    .map((f) => [f.niveauLibelle, f.domaineLibelle].filter(Boolean).join(" – ") + (f.exigence === "E" ? " (exigé)" : ""))
    .filter((f) => f.trim() !== "");

  return {
    id: idPrefixe("ft", brute.id),
    source: NOM,
    intitule: brute.intitule?.trim() || "(sans intitulé)",
    entreprise: brute.entreprise?.nom ?? null,
    lieu: lieu?.libelle ?? null,
    distance_km:
      origine && typeof lieu?.latitude === "number" && typeof lieu.longitude === "number"
        ? distanceKm(origine, { lat: lieu.latitude, lon: lieu.longitude })
        : null,
    contrat: brute.typeContratLibelle ?? brute.typeContrat ?? null,
    // L'API Offres d'emploi ne publie pas de date de début de contrat.
    date_debut: null,
    date_publication: jourIso(brute.dateCreation),
    lien_candidature:
      brute.contact?.urlPostulation ?? brute.origineOffre?.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(brute.id)}`,
    description: [brute.description, brute.entreprise?.description ? `\n**À propos de l'entreprise** : ${brute.entreprise.description}` : null]
      .filter(Boolean)
      .join("\n") || null,
    duree_mois: null,
    teletravail: null,
    niveau_diplome: formations.length ? formations.join(" ; ") : null,
    competences_demandees: [
      ...(brute.competences ?? []).map((c) => (c.libelle ?? "") + (c.exigence === "E" ? " (exigé)" : "")),
      ...(brute.qualitesProfessionnelles ?? []).map((q) => q.libelle ?? ""),
    ].filter((c) => c.trim() !== ""),
    competences_a_acquerir: [],
    conditions_acces: [],
    alternance: typeof brute.alternance === "boolean" ? brute.alternance : null,
    salaire: [brute.salaire?.libelle, brute.salaire?.commentaire].filter(Boolean).join(" – ") || null,
    telephone: brute.contact?.telephone ?? null,
    autres_infos: autres,
  };
}
