/**
 * Mon profil, utilisé par evaluer_offre.
 *
 * Source : mon CV (deogratias-loutou.fr/cv/Deo_Gratias_Loutou_CV_FR.pdf) et mon portfolio,
 * relus en novembre 2026. Rien ici ne doit être ajouté sans figurer dans mon CV :
 * mettez ce fichier à jour en même temps que le CV.
 */

export interface Competence {
  /** Nom affiché. */
  nom: string;
  /** Formes recherchées dans le texte des annonces (insensible à la casse et aux accents). */
  alias: string[];
}

export interface Projet {
  nom: string;
  date: string;
  technologies: string[];
  lien?: string;
}

export interface Fenetre {
  /** Première date de début acceptable (AAAA-MM-JJ). */
  debutAuPlusTot: string;
  /** Dernière date de début acceptable (AAAA-MM-JJ), ou null si ouverte. */
  debutAuPlusTard: string | null;
  /** D'où vient cette fenêtre (pour que l'évaluation le dise). */
  origine: string;
}

export interface Profil {
  nom: string;
  ville: { nom: string; lat: number; lon: number };
  formation: string;
  /** Niveau européen du diplôme en cours (7 = master). */
  niveauEuropeenVise: string;
  competences: Competence[];
  langues: string[];
  projets: Projet[];
  disponibilite: { alternance: Fenetre; stage: Fenetre };
}

export const PROFIL: Profil = {
  nom: "Deo Gratias Loutou",
  // Coordonnées du centre de Mulhouse (geo.api.gouv.fr, code INSEE 68224).
  ville: { nom: "Mulhouse", lat: 47.7526, lon: 7.3255 },
  formation: "Master Informatique (M1 en 2026-2027), Université de Haute-Alsace, Mulhouse",
  niveauEuropeenVise: "7",
  competences: [
    // Analyse et statistiques
    { nom: "Analyse exploratoire", alias: ["analyse exploratoire", "exploratory data analysis", "eda"] },
    { nom: "Statistiques", alias: ["statistique", "statistiques", "statistics", "statistical"] },
    { nom: "Régression logistique", alias: ["regression logistique", "logistic regression"] },
    { nom: "Visualisation de données", alias: ["visualisation", "dataviz", "data visualization", "data visualisation"] },
    { nom: "Reporting", alias: ["reporting"] },
    // Python
    { nom: "Python", alias: ["python"] },
    { nom: "pandas", alias: ["pandas"] },
    { nom: "NumPy", alias: ["numpy"] },
    { nom: "statsmodels", alias: ["statsmodels"] },
    { nom: "scikit-learn", alias: ["scikit-learn", "scikit learn", "sklearn"] },
    { nom: "Matplotlib", alias: ["matplotlib"] },
    { nom: "Jupyter", alias: ["jupyter"] },
    // Données
    { nom: "SQL", alias: ["sql"] },
    { nom: "DuckDB", alias: ["duckdb"] },
    { nom: "MySQL", alias: ["mysql"] },
    { nom: "PostgreSQL", alias: ["postgresql", "postgres"] },
    { nom: "SQLite", alias: ["sqlite"] },
    { nom: "Nettoyage et qualité des données", alias: ["nettoyage", "qualite des donnees", "data quality", "data cleaning"] },
    { nom: "Open data", alias: ["open data", "donnees ouvertes"] },
    // IA
    { nom: "RAG (recherche hybride, reclassement)", alias: ["rag", "retrieval augmented", "retrieval-augmented"] },
    { nom: "Modèles locaux avec llama.cpp", alias: ["llama.cpp"] },
    // Programmation
    { nom: "C++", alias: ["c++", "cpp"] },
    { nom: "C#", alias: ["c#", ".net"] },
    { nom: "TypeScript", alias: ["typescript"] },
    { nom: "Java", alias: ["java"] },
    // Outils
    { nom: "Git", alias: ["git"] },
    { nom: "GitHub Actions", alias: ["github actions", "github"] },
    { nom: "Tests automatisés", alias: ["tests automatises", "tests unitaires", "unit tests", "automated tests"] },
    { nom: "Linux", alias: ["linux", "unix"] },
    { nom: "Jira", alias: ["jira"] },
  ],
  langues: ["Français (langue maternelle)", "Anglais (B2)"],
  projets: [
    { nom: "Vigie, assistant RAG avec citation des sources", date: "nov. 2026", technologies: ["C++20", "SQLite", "llama.cpp"] },
    {
      nom: "Accidents de la route en France, 2019–2024",
      date: "oct. 2026",
      technologies: ["Python", "SQL (DuckDB)"],
      lien: "https://deogratias-loutou.fr/etudes/accidents-route.html",
    },
    {
      nom: "Remboursements de médicaments en France, 2019–2025",
      date: "oct. 2026",
      technologies: ["Python", "SQL (DuckDB)"],
      lien: "https://deogratias-loutou.fr/etudes/medicaments.html",
    },
    {
      nom: "Bloc opératoire : planification avec régression quantile conforme et solveur d'optimisation",
      date: "2026",
      technologies: ["régression quantile conforme", "optimisation"],
      lien: "https://deogratias-loutou.fr/etudes/bloc-operatoire.html",
    },
  ],
  disponibilite: {
    // Le CV dit « alternance pour 2027-2028 » sans mois précis : la fenêtre ci-dessous
    // couvre les rentrées habituelles. À ajuster quand le calendrier du M2 sera connu.
    alternance: {
      debutAuPlusTot: "2027-07-01",
      debutAuPlusTard: "2027-12-31",
      origine: "alternance pour l'année 2027-2028 (fenêtre juillet–décembre 2027 réglée dans profil.ts)",
    },
    stage: { debutAuPlusTot: "2027-05-01", debutAuPlusTard: null, origine: "stage à partir de mai 2027" },
  },
};
