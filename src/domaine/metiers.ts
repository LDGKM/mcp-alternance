/**
 * Métiers recherchés et leur traduction pour chaque source.
 *
 * Codes ROME vérifiés sur des fiches métier publiques (novembre 2026) :
 *   - M1419 : Data analyst
 *   - M1405 : Data scientist
 *   - M1403 : Études et prospectives socio-économiques
 *   - M1805 : Études et développement informatique
 * La R&D n'a pas de code ROME unique : la recherche passe par des mots-clés
 * et un filtre sur l'intitulé et la description.
 *
 * Pour ajouter un métier, ajoutez une entrée ici puis complétez les tests.
 */

export interface Metier {
  libelle: string;
  /** Codes ROME transmis aux API (vide = pas de filtre ROME). */
  codesRome: string[];
  /** Mots-clés transmis à France Travail (paramètre motsCles). */
  motsClesFranceTravail: string | null;
  /** Filtre appliqué au texte de l'annonce quand il n'y a pas de code ROME. */
  filtreTexte: RegExp | null;
}

export const METIERS = {
  data_analyst: {
    libelle: "Data analyst",
    codesRome: ["M1419"],
    motsClesFranceTravail: null,
    filtreTexte: null,
  },
  data_scientist: {
    libelle: "Data scientist",
    codesRome: ["M1405"],
    motsClesFranceTravail: null,
    filtreTexte: null,
  },
  data_large: {
    // Beaucoup d'offres « data » sont classées sous des métiers voisins :
    // M1403 (études et prospectives socio-économiques) et M1805 (études et développement informatique).
    // On les interroge aussi, puis on ne garde que les annonces qui parlent de données.
    libelle: "Data (large : analyse, science, BI, ingénierie de données)",
    codesRome: ["M1419", "M1405", "M1403", "M1805"],
    motsClesFranceTravail: null,
    filtreTexte: /\bdata\b|\bdonn[ée]es\b|\bBI\b|business intelligence|statistique|machine learning|\bIA\b|\bSQL\b/i,
  },
  r_et_d: {
    libelle: "Recherche et développement (R&D)",
    codesRome: [],
    motsClesFranceTravail: "R&D",
    filtreTexte: /\bR\s?&\s?D\b|recherche\s+(et|&)\s+d[ée]veloppement|\bresearch\b/i,
  },
} as const satisfies Record<string, Metier>;

export type CleMetier = keyof typeof METIERS;
export const CLES_METIERS = Object.keys(METIERS) as [CleMetier, ...CleMetier[]];
