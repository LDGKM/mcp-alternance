/**
 * Jetons OAuth2 « client_credentials » de France Travail (royaume /partenaire).
 *
 * Chaque API a sa propre portée : on demande un jeton par API, avec ses seules portées,
 * pour qu'une API non accordée (ex. Offres d'emploi) n'empêche pas d'utiliser les autres.
 */
import { ErreurSource, type Fetch, lireJson } from "./http.js";

const URL_JETON = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";

export interface IdentifiantsFt {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/** Cache par API, partagé par les requêtes d'une même instance du Worker. */
const cache = new Map<string, { valeur: string; expireA: number }>();

export function viderCacheJeton(): void {
  cache.clear();
}

export function identifiantsPresents(ids: IdentifiantsFt): boolean {
  return Boolean(ids.clientId && ids.clientSecret);
}

async function demanderJeton(fetcher: Fetch, ids: Required<{ [K in keyof IdentifiantsFt]: string }>, portee: string, nom: string): Promise<{ valeur: string; expireA: number }> {
  const corps = new URLSearchParams({ grant_type: "client_credentials", client_id: ids.clientId, client_secret: ids.clientSecret, scope: portee });
  const { donnees } = await lireJson<{ access_token: string; expires_in: number }>(
    fetcher,
    URL_JETON,
    { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: corps },
    `${nom} (jeton)`,
  );
  if (!donnees?.access_token) throw new ErreurSource(`${nom} n'a pas délivré de jeton d'accès.`);
  // Marge d'une minute avant l'expiration annoncée.
  return { valeur: donnees.access_token, expireA: Date.now() + (donnees.expires_in - 60) * 1000 };
}

/**
 * Jeton pour une API. `portees` liste les jeux de portées à essayer dans l'ordre :
 * le premier accepté est gardé (certaines applications n'ont pas toutes les sous-portées).
 */
async function obtenirJeton(fetcher: Fetch, ids: IdentifiantsFt, api: string, portees: string[], nom: string): Promise<string> {
  if (!ids.clientId || !ids.clientSecret) {
    throw new ErreurSource(
      "Les identifiants France Travail ne sont pas configurés (secrets FT_CLIENT_ID et FT_CLIENT_SECRET). Voir le guide, étape « France Travail ».",
    );
  }
  const enCache = cache.get(api);
  if (enCache && enCache.expireA > Date.now()) return enCache.valeur;

  let derniere: unknown;
  for (const portee of portees) {
    try {
      const jeton = await demanderJeton(fetcher, { clientId: ids.clientId, clientSecret: ids.clientSecret }, portee, nom);
      cache.set(api, jeton);
      return jeton.valeur;
    } catch (e) {
      derniere = e;
      // 400/401/403 : portée refusée, on essaie la suivante ; autre erreur : on s'arrête.
      if (!(e instanceof ErreurSource && e.statut !== undefined && [400, 401, 403].includes(e.statut))) throw e;
    }
  }
  throw derniere instanceof ErreurSource
    ? new ErreurSource(`${nom} : accès refusé. Vérifiez que l'API est bien ajoutée à votre application France Travail.`, derniere.statut)
    : derniere;
}

/** GET authentifié sur une API France Travail, avec un nouvel essai si le jeton a été révoqué. */
export async function appelerFt<T>(fetcher: Fetch, ids: IdentifiantsFt, api: { cle: string; portees: string[]; nom: string }, url: string): Promise<T | null> {
  const essai = async () => {
    const jeton = await obtenirJeton(fetcher, ids, api.cle, api.portees, api.nom);
    return (await lireJson<T>(fetcher, url, { headers: { authorization: `Bearer ${jeton}`, accept: "application/json" } }, api.nom)).donnees;
  };
  try {
    return await essai();
  } catch (e) {
    if (e instanceof ErreurSource && e.statut === 401 && cache.has(api.cle)) {
      cache.delete(api.cle);
      return essai();
    }
    throw e;
  }
}
