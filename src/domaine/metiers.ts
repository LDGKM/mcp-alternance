/**
 * Métiers recherchés et leur traduction pour chaque source.
 *
 * Codes ROME vérifiés sur des fiches métier publiques (novembre 2026) :
 *   - M1419 : Data analyst
 *   - M1405 : Data scientist
 *   - M1403 : Études et prospectives socio-économiques
 *   - M1805 : Études et développement informatique
 *   - H1206 : Ingénieur R&D en industrie
 *   - K2402 : Ingénieur de recherche scientifique
 *
 * Un métier peut interroger des codes « voisins » (ex. M1805 pour la data ou la R&D logicielle) :
 * leurs offres ne sont gardées que si le texte de l'annonce correspond à `filtreTexte`.
 * Les offres portant un code de `codesSansFiltre` sont gardées d'office.
 *
 * Pour ajouter un métier, ajoutez une entrée ici puis complétez les tests.
 */

export interface Metier {
  libelle: string;
  /** Codes ROME transmis aux API (vide = pas de filtre ROME). */
  codesRome: string[];
  /** Mots-clés transmis à France Travail (paramètre motsCles). */
  motsClesFranceTravail: string | null;
  /** Filtre appliqué au texte des annonces qui ne portent aucun code de `codesSansFiltre`. */
  filtreTexte: RegExp | null;
  /** Codes ROME propres au métier : une offre qui en porte un est gardée sans filtre de texte. */
  codesSansFiltre: string[];
  /** Codes transmis à La Bonne Boîte (qui ne voit pas le texte des annonces), si différents de codesRome. */
  codesEntreprises?: string[];
}

const DEFINITIONS = {
  data_analyst: {
    libelle: "Data analyst",
    codesRome: ["M1419"],
    motsClesFranceTravail: null,
    filtreTexte: null,
    codesSansFiltre: [],
  },
  data_scientist: {
    libelle: "Data scientist",
    codesRome: ["M1405"],
    motsClesFranceTravail: null,
    filtreTexte: null,
    codesSansFiltre: [],
  },
  data_large: {
    // Beaucoup d'offres « data » sont classées sous des métiers voisins :
    // M1403 (études et prospectives socio-économiques) et M1805 (études et développement informatique).
    // On les interroge aussi, puis on ne garde que les annonces qui parlent de données.
    libelle: "Data (large : analyse, science, BI, ingénierie de données)",
    codesRome: ["M1419", "M1405", "M1403", "M1805"],
    motsClesFranceTravail: null,
    filtreTexte: /\bdata\b|\bdonn[ée]es\b|\bBI\b|business intelligence|statistique|machine learning|\bIA\b|\bSQL\b/i,
    codesSansFiltre: ["M1419", "M1405"],
  },
  r_et_d: {
    // H1206 et K2402 sont des métiers de R&D par définition. M1805 (logiciel) et M1405 (data science)
    // couvrent la R&D en informatique et en IA, mais seulement quand l'annonce le dit.
    libelle: "Recherche et développement (R&D)",
    codesRome: ["H1206", "K2402", "M1805", "M1405"],
    motsClesFranceTravail: null,
    filtreTexte:
      /\bR\s?&\s?D\b|\bR et D\b|recherche\s+(et|&)\s+d[ée]veloppement|\bresearch\b|ing[ée]nieur(e)?\s+(de\s+)?recherche|recherche appliqu[ée]e|laboratoire de recherche|\bprototyp/i,
    codesSansFiltre: ["H1206", "K2402"],
    codesEntreprises: ["H1206", "K2402"],
  },
} satisfies Record<string, Metier>;

export type CleMetier = keyof typeof DEFINITIONS;
export const METIERS: Record<CleMetier, Metier> = DEFINITIONS;
export const CLES_METIERS = Object.keys(METIERS) as [CleMetier, ...CleMetier[]];
