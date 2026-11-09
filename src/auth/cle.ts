/** Vérification de la clé d'accès personnelle. */

/** Longueur minimale exigée pour que le serveur accepte de fonctionner. */
export const LONGUEUR_MINIMALE = 32;

export function cleConfiguree(cle: string | undefined): cle is string {
  return typeof cle === "string" && cle.length >= LONGUEUR_MINIMALE;
}

/**
 * Compare deux chaînes en temps constant : on compare les empreintes SHA-256,
 * de longueur fixe, octet par octet sans s'arrêter au premier écart.
 */
export async function clesIdentiques(saisie: string, attendue: string): Promise<boolean> {
  const encodeur = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encodeur.encode(saisie)),
    crypto.subtle.digest("SHA-256", encodeur.encode(attendue)),
  ]);
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  let ecart = 0;
  for (let i = 0; i < va.length; i++) ecart |= va[i]! ^ vb[i]!;
  return ecart === 0;
}
