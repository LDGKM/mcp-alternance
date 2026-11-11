import type { DepotCandidatures } from "../candidatures/depot.js";
import { decouperId, type OffreComplete } from "../domaine/offre.js";
import type { Profil } from "../domaine/profil.js";
import { convertirFt, lireOffreFt } from "../sources/franceTravail.js";
import type { Fetch } from "../sources/http.js";
import { convertirLba, lireOffreLba } from "../sources/laBonneAlternance.js";

/** Tout ce dont les outils ont besoin, injecté pour pouvoir les tester sans réseau. */
export interface Contexte {
  fetch: Fetch;
  secrets: {
    LBA_API_KEY?: string | undefined;
    FT_CLIENT_ID?: string | undefined;
    FT_CLIENT_SECRET?: string | undefined;
  };
  /** Vrai seulement si France Travail a accordé l'accès à l'API Offres d'emploi (variable FT_OFFRES_ACTIVE). */
  franceTravailOffres: boolean;
  depot: DepotCandidatures;
  profil: Profil;
  /** Date du jour (AAAA-MM-JJ, heure de Paris). */
  aujourdhui: () => string;
}

/** Récupère une offre complète, quelle que soit sa source. */
export async function chargerOffre(ctx: Contexte, id: string): Promise<OffreComplete> {
  if (id.trim().startsWith("lbb:")) {
    throw new Error("Cet identifiant désigne une entreprise (La Bonne Boîte), pas une offre : il n'y a pas d'annonce à lire. Voir sa fiche publique avec chercher_entreprises.");
  }
  const { source, idBrut } = decouperId(id.trim());
  const origine = { lat: ctx.profil.ville.lat, lon: ctx.profil.ville.lon };
  if (source === "lba") return convertirLba(await lireOffreLba(ctx.fetch, ctx.secrets.LBA_API_KEY, idBrut), origine);
  const ids = { clientId: ctx.secrets.FT_CLIENT_ID, clientSecret: ctx.secrets.FT_CLIENT_SECRET };
  return convertirFt(await lireOffreFt(ctx.fetch, ids, idBrut), origine);
}
