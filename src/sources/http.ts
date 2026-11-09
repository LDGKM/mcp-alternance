/** Utilitaires HTTP partagés par les clients d'API. */

export type Fetch = typeof fetch;

/** Erreur d'API dont le message est fait pour être lu par l'utilisateur. */
export class ErreurSource extends Error {
  constructor(
    message: string,
    readonly statut?: number,
  ) {
    super(message);
    this.name = "ErreurSource";
  }
}

const DELAI_MS = 15_000;

export async function lireJson<T>(
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  nomSource: string,
): Promise<{ donnees: T | null; reponse: Response }> {
  let reponse: Response;
  try {
    reponse = await fetcher(url, { ...init, signal: AbortSignal.timeout(DELAI_MS) });
  } catch (e) {
    throw new ErreurSource(`${nomSource} ne répond pas (${(e as Error).message}).`);
  }
  if (reponse.status === 204) return { donnees: null, reponse };
  if (!reponse.ok) {
    const corps = (await reponse.text().catch(() => "")).slice(0, 300);
    throw new ErreurSource(`${nomSource} a renvoyé l'erreur HTTP ${reponse.status}${messageStatut(reponse.status)}${corps ? ` : ${corps}` : ""}`, reponse.status);
  }
  const texte = await reponse.text();
  if (texte.trim() === "") return { donnees: null, reponse };
  try {
    return { donnees: JSON.parse(texte) as T, reponse };
  } catch {
    throw new ErreurSource(`${nomSource} a renvoyé une réponse illisible (JSON attendu).`);
  }
}

function messageStatut(statut: number): string {
  switch (statut) {
    case 401:
    case 403:
      return " (accès refusé : vérifiez la clé ou les identifiants enregistrés dans les secrets du serveur)";
    case 404:
      return " (introuvable : l'offre a peut-être été retirée)";
    case 429:
      return " (trop de requêtes : réessayez dans une minute)";
    default:
      return "";
  }
}
