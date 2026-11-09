/**
 * Géocodage d'une ville avec l'API Découpage administratif (geo.api.gouv.fr),
 * gratuite et sans clé. Donne le code INSEE (pour France Travail) et
 * les coordonnées du centre (pour La bonne alternance).
 */
import { ErreurSource, type Fetch, lireJson } from "./http.js";

export interface Commune {
  nom: string;
  codeInsee: string;
  codePostal: string | null;
  departement: string | null;
  lat: number;
  lon: number;
}

interface CommuneBrute {
  nom: string;
  code: string;
  codesPostaux?: string[];
  codeDepartement?: string;
  centre?: { type: "Point"; coordinates: [number, number] };
}

export async function trouverCommune(fetcher: Fetch, ville: string): Promise<Commune> {
  const params = new URLSearchParams({
    fields: "nom,code,centre,codesPostaux,codeDepartement",
    boost: "population",
    limit: "1",
  });
  const saisie = ville.trim();
  if (/^\d{5}$/.test(saisie)) params.set("codePostal", saisie);
  else params.set("nom", saisie);

  const { donnees } = await lireJson<CommuneBrute[]>(
    fetcher,
    `https://geo.api.gouv.fr/communes?${params}`,
    { headers: { accept: "application/json" } },
    "L'API Géo",
  );
  const c = donnees?.[0];
  if (!c?.centre) throw new ErreurSource(`Ville introuvable : « ${ville} ». Essayez le nom exact de la commune ou son code postal.`);
  const [lon, lat] = c.centre.coordinates;
  return {
    nom: c.nom,
    codeInsee: c.code,
    codePostal: c.codesPostaux?.[0] ?? null,
    departement: c.codeDepartement ?? null,
    lat,
    lon,
  };
}
