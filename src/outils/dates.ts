/** Dates au format AAAA-MM-JJ, dans le fuseau de Paris. */

export const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;

export function jourAParis(d: Date = new Date()): string {
  // Le format canadien-français produit directement AAAA-MM-JJ.
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** « 2027-09 » → « 2027-09-01 » ; « 2027-09-15 » inchangé. */
export function premierJour(saisie: string): string {
  return /^\d{4}-\d{2}$/.test(saisie) ? `${saisie}-01` : saisie;
}
