/**
 * Comparaison d'une offre avec le profil (outil evaluer_offre).
 *
 * L'analyse est volontairement simple et vérifiable : elle repère des mots-clés
 * dans le texte de l'annonce et compare des dates. Elle ne note pas l'offre et
 * ne suppose rien que l'annonce ne dise pas : ce qui n'est pas écrit est signalé
 * comme « non indiqué ».
 */
import type { OffreComplete } from "./offre.js";
import type { Competence, Fenetre, Profil } from "./profil.js";

/** Compétences souvent demandées en data et R&D, absentes du profil. */
interface CompetenceRepere extends Competence {
  /** Compétences du profil qui s'en approchent (à mettre en avant, sans prétendre la maîtriser). */
  proches?: string[];
}

export const VOCABULAIRE: CompetenceRepere[] = [
  { nom: "R", alias: ["langage r", "rstudio", "r studio", "r shiny", "python/r", "python ou r", "python, r", "r ou python", "r/python", "r, python"], proches: ["Python"] },
  { nom: "Machine learning", alias: ["machine learning", "apprentissage automatique", "ml"], proches: ["scikit-learn", "Régression logistique"] },
  { nom: "Deep learning", alias: ["deep learning", "apprentissage profond", "reseaux de neurones", "neural network"] },
  { nom: "PyTorch", alias: ["pytorch"] },
  { nom: "TensorFlow / Keras", alias: ["tensorflow", "keras"] },
  { nom: "NLP / traitement du langage", alias: ["nlp", "traitement automatique du langage", "natural language processing"], proches: ["RAG (recherche hybride, reclassement)"] },
  { nom: "LLM / IA générative", alias: ["llm", "ia generative", "generative ai", "genai", "large language model"], proches: ["RAG (recherche hybride, reclassement)", "Modèles locaux avec llama.cpp"] },
  { nom: "Vision par ordinateur", alias: ["vision par ordinateur", "computer vision", "opencv"] },
  { nom: "Spark", alias: ["spark", "pyspark"] },
  { nom: "Hadoop", alias: ["hadoop"] },
  { nom: "Scala", alias: ["scala"] },
  { nom: "SAS", alias: ["sas"] },
  { nom: "Power BI", alias: ["power bi", "powerbi"], proches: ["Visualisation de données", "Reporting"] },
  { nom: "Tableau", alias: ["tableau software", "tableau desktop", "dashboards tableau"], proches: ["Visualisation de données"] },
  { nom: "Looker / Looker Studio", alias: ["looker"], proches: ["Visualisation de données"] },
  { nom: "Qlik", alias: ["qlik", "qlikview", "qlik sense"], proches: ["Visualisation de données"] },
  { nom: "Excel", alias: ["excel"] },
  { nom: "VBA", alias: ["vba"] },
  { nom: "ETL / pipelines de données", alias: ["etl", "elt", "pipeline de donnees", "pipelines de donnees", "data pipeline"], proches: ["SQL", "Nettoyage et qualité des données"] },
  { nom: "Airflow", alias: ["airflow"] },
  { nom: "dbt", alias: ["dbt"], proches: ["SQL"] },
  { nom: "Docker", alias: ["docker"], proches: ["Linux"] },
  { nom: "Kubernetes", alias: ["kubernetes", "k8s"] },
  { nom: "MLOps", alias: ["mlops"] },
  { nom: "AWS", alias: ["aws", "amazon web services"] },
  { nom: "Azure", alias: ["azure"] },
  { nom: "Google Cloud", alias: ["gcp", "google cloud", "bigquery"] },
  { nom: "Snowflake", alias: ["snowflake"], proches: ["SQL"] },
  { nom: "Databricks", alias: ["databricks"] },
  { nom: "NoSQL / MongoDB", alias: ["nosql", "mongodb"] },
  { nom: "Elasticsearch", alias: ["elasticsearch", "elastic search"] },
  { nom: "Kafka", alias: ["kafka"] },
  { nom: "MATLAB", alias: ["matlab", "simulink"] },
  { nom: "JavaScript", alias: ["javascript", "js"], proches: ["TypeScript"] },
  { nom: "Rust", alias: ["rust"] },
  { nom: "Go", alias: ["golang"] },
  { nom: "Séries temporelles", alias: ["series temporelles", "time series", "forecasting"] },
  { nom: "Optimisation / recherche opérationnelle", alias: ["recherche operationnelle", "optimisation combinatoire", "operations research"] },
  { nom: "Anglais professionnel", alias: ["anglais courant", "anglais professionnel", "fluent english", "english fluent", "bilingue"] },
  { nom: "Allemand", alias: ["allemand", "german", "deutsch"] },
];

export type Statut = "compatible" | "a_verifier" | "incompatible" | "non_indique";

export interface Verification {
  statut: Statut;
  detail: string;
}

export interface Evaluation {
  offre: { id: string; intitule: string; entreprise: string | null; lien: string | null };
  type_contrat: Verification & { type: "alternance" | "stage" | "autre" };
  date_debut: Verification;
  niveau: Verification;
  distance: Verification;
  competences_qui_collent: Array<{ competence: string; repere: string }>;
  competences_qui_manquent: string[];
  a_mettre_en_avant: Array<{ demande: string; appui: string[] }>;
  projets_a_citer: string[];
  limites: string;
}

/** Minuscules, sans accents, espaces normalisés. */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ");
}

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cherche un alias comme mot entier (« java » ne correspond pas à « javascript »). */
export function trouverAlias(texteNormalise: string, alias: string[]): string | null {
  for (const a of alias) {
    const motif = new RegExp(`(?<![a-z0-9#+.])${echapper(normaliser(a))}(?![a-z0-9#+])`);
    if (motif.test(texteNormalise)) return a;
  }
  return null;
}

function texteDeLOffre(o: OffreComplete): string {
  return normaliser(
    [o.intitule, o.description, ...o.competences_demandees, ...o.competences_a_acquerir, ...o.conditions_acces, o.niveau_diplome, ...Object.values(o.autres_infos)]
      .filter(Boolean)
      .join(" \n "),
  );
}

export function typeDeLOffre(o: OffreComplete, texte: string): "alternance" | "stage" | "autre" {
  if (o.alternance === true || /\b(apprentissage|professionnalisation|alternance|alternant)\b/.test(normaliser(o.contrat ?? ""))) return "alternance";
  if (/\b(stage|stagiaire|internship|intern)\b/.test(normaliser(o.intitule)) || /\bconvention de stage\b/.test(texte)) return "stage";
  if (o.alternance === null && /\b(alternance|alternant|apprenti)\b/.test(texte)) return "alternance";
  return "autre";
}

function verifierDate(dateDebut: string | null, fenetre: Fenetre): Verification {
  if (!dateDebut) return { statut: "non_indique", detail: `La source n'indique pas de date de début : à demander au recruteur (votre disponibilité : ${fenetre.origine}).` };
  if (dateDebut < fenetre.debutAuPlusTot) {
    return { statut: "incompatible", detail: `Début annoncé le ${dateDebut}, avant votre disponibilité (${fenetre.origine}). Demandez si un démarrage plus tard est possible.` };
  }
  if (fenetre.debutAuPlusTard && dateDebut > fenetre.debutAuPlusTard) {
    return { statut: "a_verifier", detail: `Début annoncé le ${dateDebut}, après la fenêtre prévue (${fenetre.origine}).` };
  }
  return { statut: "compatible", detail: `Début annoncé le ${dateDebut}, dans votre fenêtre (${fenetre.origine}).` };
}

function verifierNiveau(niveau: string | null, profil: Profil): Verification {
  if (!niveau) return { statut: "non_indique", detail: "Niveau de diplôme non indiqué dans l'annonce." };
  const n = normaliser(niveau);
  if (/bac\s?\+\s?5|master|ingenieur|niveau 7|\b7\b/.test(n)) return { statut: "compatible", detail: `Niveau visé : ${niveau} — correspond à votre master.` };
  if (/doctorat|bac\s?\+\s?8|phd/.test(n)) return { statut: "a_verifier", detail: `Niveau visé : ${niveau} — au-dessus du master.` };
  if (/bac\s?\+\s?[234]|licence|bts|but|dut|bachelor/.test(n)) {
    return { statut: "a_verifier", detail: `Niveau visé : ${niveau} — inférieur au master que vous préparez ; vérifiez que l'offre accepte un master (${profil.formation}).` };
  }
  return { statut: "a_verifier", detail: `Niveau visé : ${niveau}.` };
}

function verifierDistance(o: OffreComplete, profil: Profil): Verification {
  if (o.distance_km === null) return { statut: "non_indique", detail: `Distance inconnue (lieu : ${o.lieu ?? "non indiqué"}).` };
  const detail = `${o.distance_km} km à vol d'oiseau de ${profil.ville.nom}${o.lieu ? ` (${o.lieu})` : ""}${o.teletravail ? `, ${o.teletravail}` : ""}.`;
  return { statut: o.distance_km <= 50 ? "compatible" : "a_verifier", detail };
}

export function evaluer(o: OffreComplete, profil: Profil): Evaluation {
  const texte = texteDeLOffre(o);

  const collent: Evaluation["competences_qui_collent"] = [];
  for (const c of profil.competences) {
    const repere = trouverAlias(texte, c.alias);
    if (repere) collent.push({ competence: c.nom, repere });
  }
  const nomsQuiCollent = new Set(collent.map((c) => c.competence));

  const manquent: string[] = [];
  const enAvant: Evaluation["a_mettre_en_avant"] = [];
  for (const v of VOCABULAIRE) {
    if (!trouverAlias(texte, v.alias)) continue;
    manquent.push(v.nom);
    const appui = (v.proches ?? []).filter((p) => profil.competences.some((c) => c.nom === p));
    if (appui.length) enAvant.push({ demande: v.nom, appui });
  }

  const projets = profil.projets
    .filter((p) => p.technologies.some((t) => [...nomsQuiCollent].some((n) => normaliser(t).includes(normaliser(n)))))
    .map((p) => (p.lien ? `${p.nom} (${p.lien})` : p.nom));

  const type = typeDeLOffre(o, texte);
  const fenetre = type === "stage" ? profil.disponibilite.stage : profil.disponibilite.alternance;
  const typeVerif: Evaluation["type_contrat"] =
    type === "autre"
      ? { type, statut: "incompatible", detail: `Contrat « ${o.contrat ?? "non indiqué"} » : ni alternance ni stage d'après l'annonce.` }
      : { type, statut: "compatible", detail: type === "alternance" ? `Contrat en alternance${o.contrat ? ` (${o.contrat})` : ""}.` : "Stage." };

  return {
    offre: { id: o.id, intitule: o.intitule, entreprise: o.entreprise, lien: o.lien_candidature },
    type_contrat: typeVerif,
    date_debut: verifierDate(o.date_debut, fenetre),
    niveau: verifierNiveau(o.niveau_diplome, profil),
    distance: verifierDistance(o, profil),
    competences_qui_collent: collent,
    competences_qui_manquent: manquent,
    a_mettre_en_avant: enAvant,
    projets_a_citer: projets,
    limites:
      "Analyse par mots-clés : une compétence absente du texte n'est pas comptée, et un mot repéré ne dit pas le niveau attendu. Relisez l'annonce avant de conclure.",
  };
}

const ICONES: Record<Statut, string> = { compatible: "✅", a_verifier: "⚠️", incompatible: "❌", non_indique: "❔" };

export function formaterEvaluation(e: Evaluation): string {
  const l: string[] = [`# Évaluation : ${e.offre.intitule}${e.offre.entreprise ? ` — ${e.offre.entreprise}` : ""}`, `Offre ${e.offre.id}`, ""];
  l.push("## Conditions");
  l.push(`- ${ICONES[e.type_contrat.statut]} Type : ${e.type_contrat.detail}`);
  l.push(`- ${ICONES[e.date_debut.statut]} Date de début : ${e.date_debut.detail}`);
  l.push(`- ${ICONES[e.niveau.statut]} Niveau : ${e.niveau.detail}`);
  l.push(`- ${ICONES[e.distance.statut]} Lieu : ${e.distance.detail}`);

  l.push("", "## Ce qui colle");
  l.push(e.competences_qui_collent.length ? e.competences_qui_collent.map((c) => `- ${c.competence} (repéré : « ${c.repere} »)`).join("\n") : "- Aucune compétence de votre profil n'est citée telle quelle dans l'annonce.");
  if (e.projets_a_citer.length) l.push("", "Projets à citer :", ...e.projets_a_citer.map((p) => `- ${p}`));

  l.push("", "## Ce qui manque");
  l.push(e.competences_qui_manquent.length ? e.competences_qui_manquent.map((c) => `- ${c}`).join("\n") : "- Aucune compétence demandée hors de votre profil n'a été repérée.");
  if (e.a_mettre_en_avant.length) {
    l.push("", "Pour y répondre, vous pouvez mettre en avant :");
    l.push(...e.a_mettre_en_avant.map((a) => `- ${a.demande} → ${a.appui.join(", ")}`));
  }
  l.push("", `_${e.limites}_`);
  if (e.offre.lien) l.push("", `Postuler : ${e.offre.lien}`);
  return l.join("\n");
}
