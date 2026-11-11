/**
 * Modèle commun aux deux sources. Chaque champ vient tel quel de l'API d'origine ;
 * un champ que la source ne fournit pas vaut `null` (jamais une valeur supposée).
 */

export type Source = "lba" | "ft";

export const NOM_SOURCE: Record<Source, string> = {
  lba: "La bonne alternance",
  ft: "France Travail",
};

export interface ResumeOffre {
  /** Identifiant préfixé par la source : « lba:… » ou « ft:… ». */
  id: string;
  source: string;
  intitule: string;
  entreprise: string | null;
  lieu: string | null;
  /** Distance à vol d'oiseau depuis la ville recherchée, si la source donne des coordonnées. */
  distance_km: number | null;
  contrat: string | null;
  /** Date de début annoncée (AAAA-MM-JJ), si la source la donne. */
  date_debut: string | null;
  date_publication: string | null;
  lien_candidature: string | null;
}

export interface OffreComplete extends ResumeOffre {
  description: string | null;
  duree_mois: number | null;
  teletravail: string | null;
  niveau_diplome: string | null;
  competences_demandees: string[];
  competences_a_acquerir: string[];
  conditions_acces: string[];
  /** Vrai si l'annonce est un contrat d'alternance (apprentissage ou professionnalisation). */
  alternance: boolean | null;
  salaire: string | null;
  telephone: string | null;
  /** Codes ROME attribués par la source (peut être vide). */
  codes_rome: string[];
  autres_infos: Record<string, string>;
}

export function idPrefixe(source: Source, idBrut: string): string {
  return `${source}:${idBrut}`;
}

export function decouperId(id: string): { source: Source; idBrut: string } {
  const separateur = id.indexOf(":");
  const prefixe = separateur > 0 ? id.slice(0, separateur) : "";
  const idBrut = separateur > 0 ? id.slice(separateur + 1) : "";
  if ((prefixe !== "lba" && prefixe !== "ft") || idBrut.trim() === "") {
    throw new Error(
      `Identifiant d'offre invalide : « ${id} ». Utilisez l'identifiant renvoyé par chercher_offres (ex. « lba:… » ou « ft:… »).`,
    );
  }
  return { source: prefixe, idBrut };
}

/** Garde la partie date (AAAA-MM-JJ) d'un horodatage ISO, ou null. */
export function jourIso(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valeur);
  return m?.[1] ?? null;
}

/** Distance à vol d'oiseau (formule de haversine), arrondie au km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

export function resumer(o: OffreComplete): ResumeOffre {
  return {
    id: o.id,
    source: o.source,
    intitule: o.intitule,
    entreprise: o.entreprise,
    lieu: o.lieu,
    distance_km: o.distance_km,
    contrat: o.contrat,
    date_debut: o.date_debut,
    date_publication: o.date_publication,
    lien_candidature: o.lien_candidature,
  };
}

/** Texte lisible d'une annonce complète (pour lire_offre). */
export function formaterOffre(o: OffreComplete): string {
  const lignes: string[] = [`# ${o.intitule}`, ""];
  const champ = (libelle: string, valeur: string | number | null | undefined) => {
    if (valeur !== null && valeur !== undefined && `${valeur}`.trim() !== "") lignes.push(`- **${libelle}** : ${valeur}`);
  };
  champ("Identifiant", o.id);
  champ("Source", o.source);
  champ("Entreprise", o.entreprise);
  champ("Lieu", o.lieu);
  champ("Contrat", o.contrat);
  champ("Alternance", o.alternance === null ? null : o.alternance ? "oui" : "non");
  champ("Début", o.date_debut);
  champ("Durée (mois)", o.duree_mois);
  champ("Télétravail", o.teletravail);
  champ("Niveau visé", o.niveau_diplome);
  champ("Salaire", o.salaire);
  champ("Publiée le", o.date_publication);
  champ("Téléphone", o.telephone);
  for (const [cle, valeur] of Object.entries(o.autres_infos)) champ(cle, valeur);
  lignes.push("", `**Pour postuler** : ${o.lien_candidature ?? "la source ne fournit pas de lien de candidature pour cette offre."}`);

  const liste = (titre: string, elements: string[]) => {
    if (elements.length === 0) return;
    lignes.push("", `## ${titre}`, ...elements.map((e) => `- ${e}`));
  };
  liste("Compétences demandées", o.competences_demandees);
  liste("Compétences à acquérir", o.competences_a_acquerir);
  liste("Conditions d'accès", o.conditions_acces);
  lignes.push("", "## Description", o.description?.trim() || "(aucune description fournie par la source)");
  return lignes.join("\n");
}
