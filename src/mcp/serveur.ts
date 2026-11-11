import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { z } from "zod";
import { ETATS } from "../candidatures/depot.js";
import { evaluer, formaterEvaluation } from "../domaine/evaluation.js";
import { CLES_METIERS } from "../domaine/metiers.js";
import { formaterOffre } from "../domaine/offre.js";
import { chercherOffres, formaterRecherche } from "../outils/chercherOffres.js";
import { chargerOffre, type Contexte } from "../outils/contexte.js";
import { FORMAT_JOUR } from "../outils/dates.js";
import { chercherEntreprises } from "../outils/chercherEntreprises.js";
import { type ArgsSuivi, suivreCandidatures } from "../outils/suivreCandidatures.js";
import { veille } from "../outils/veille.js";

export const VERSION = "1.0.0";

const jour = z.string().regex(FORMAT_JOUR, "Format attendu : AAAA-MM-JJ");
const idOffre = z.string().min(4).describe("Identifiant renvoyé par chercher_offres, ex. « lba:6789abc » ou « ft:201XYZK »");

/** Exécute un outil et transforme toute erreur en message lisible, sans faire planter le serveur. */
async function proteger(action: () => Promise<string>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: await action() }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Erreur : ${(e as Error).message}` }], isError: true };
  }
}

export function creerServeur(ctx: Contexte): McpServer {
  const serveur = new McpServer(
    { name: "mcp-alternance", version: VERSION },
    {
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
      instructions:
        "Serveur personnel de recherche d'alternance et de stage de Deo Gratias Loutou (M1 informatique, Mulhouse). " +
        "Les offres viennent de La bonne alternance et de France Travail ; n'invente aucune information absente des résultats des outils. " +
        "Enchaînement conseillé : chercher_offres → lire_offre ou evaluer_offre → suivre_candidatures. veille fait ce travail pour les nouvelles offres. " +
        "Un brouillon de lettre n'utilise que les faits fournis par les outils ; rien n'est jamais envoyé à un recruteur.",
    },
  );

  serveur.registerTool(
    "chercher_offres",
    {
      title: "Chercher des offres",
      description:
        "Cherche des offres d'alternance ou de stage (data analyst, data scientist, R&D) autour d'une ville, dans La bonne alternance et France Travail. " +
        "Renvoie une liste triée par distance avec l'id de chaque offre.",
      inputSchema: {
        type: z.enum(["alternance", "stage"]).describe("alternance ou stage"),
        metier: z
          .enum(CLES_METIERS)
          .describe("data_analyst, data_scientist, data_large (métiers voisins inclus, filtrés sur la donnée : à préférer hors grandes villes) ou r_et_d"),
        ville: z.string().min(2).default("Mulhouse").describe("Nom de la commune ou code postal"),
        rayon_km: z.number().int().min(0).max(200).default(30).describe("Rayon de recherche en km"),
        date_debut: z
          .string()
          .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Format attendu : AAAA-MM ou AAAA-MM-JJ")
          .optional()
          .describe("Écarte les offres qui annoncent un début avant cette date (AAAA-MM ou AAAA-MM-JJ)"),
        mots_cles: z.string().max(200).optional().describe("Termes qui doivent tous figurer dans l'annonce, séparés par des virgules"),
        sources: z.array(z.enum(["lba", "ft"])).min(1).default(["lba", "ft"]).describe("lba = La bonne alternance, ft = France Travail"),
        limite: z.number().int().min(1).max(50).default(20).describe("Nombre maximum d'offres affichées"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => proteger(async () => formaterRecherche(await chercherOffres(ctx, args))),
  );

  serveur.registerTool(
    "lire_offre",
    {
      title: "Lire une offre",
      description: "Affiche l'annonce complète d'une offre et le lien pour postuler.",
      inputSchema: { id: idOffre },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => proteger(async () => formaterOffre(await chargerOffre(ctx, id))),
  );

  serveur.registerTool(
    "evaluer_offre",
    {
      title: "Évaluer une offre",
      description:
        "Compare une offre au profil de Deo (compétences du CV, projets, disponibilité, niveau, distance) et dit ce qui colle et ce qui manque. " +
        "Analyse par mots-clés : à compléter par la lecture de l'annonce.",
      inputSchema: { id: idOffre },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => proteger(async () => formaterEvaluation(evaluer(await chargerOffre(ctx, id), ctx.profil))),
  );

  serveur.registerTool(
    "suivre_candidatures",
    {
      title: "Suivre mes candidatures",
      description:
        "Ajoute, liste, lit ou met à jour mes candidatures (date, état, relance, brouillon). " +
        "action=ajouter : offre_id suffit pour une offre (entreprise, poste et lien sont repris de l'annonce) ; pour une entreprise La Bonne Boîte (lbb:…), donner aussi entreprise et poste ; " +
        "action=lister : filtre facultatif par état, ou a_relancer=true ; " +
        "action=lire : id obligatoire, affiche aussi le brouillon ; " +
        "action=mettre_a_jour : id obligatoire + champs à changer (dont brouillon). " +
        "Une candidature envoyée est à relancer 10 jours plus tard par défaut.",
      inputSchema: {
        action: z.enum(["ajouter", "lister", "lire", "mettre_a_jour"]),
        id: z.number().int().positive().optional().describe("Numéro de la candidature (lire, mettre_a_jour)"),
        offre_id: z.string().min(4).optional().describe("Id d'offre (lba:…, ft:…) ou d'entreprise La Bonne Boîte (lbb:…)"),
        entreprise: z.string().min(1).max(200).optional(),
        poste: z.string().min(1).max(200).optional(),
        type: z.enum(["alternance", "stage"]).optional(),
        lien: z.string().url().optional(),
        etat: z.enum(ETATS).optional().describe("a_envoyer, envoyee, relancee, entretien, acceptee, refusee, abandonnee"),
        date_candidature: jour.optional(),
        date_relance: jour.optional(),
        notes: z.string().max(2000).optional(),
        brouillon: z.string().max(8000).optional().describe("Brouillon de lettre ou de message, rédigé à partir des seuls faits du profil et de l'annonce"),
        a_relancer: z.boolean().optional().describe("lister : seulement les candidatures dont la relance est due"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      proteger(async () => {
        let demande: ArgsSuivi;
        if (args.action === "mettre_a_jour" || args.action === "lire") {
          if (args.id === undefined) throw new Error(`L'action ${args.action} demande l'id de la candidature.`);
          demande = args.action === "lire" ? { action: "lire", id: args.id } : { ...args, action: "mettre_a_jour", id: args.id };
        } else if (args.action === "lister") {
          demande = { action: "lister", etat: args.etat, a_relancer: args.a_relancer };
        } else {
          demande = { ...args, action: "ajouter" };
        }
        return suivreCandidatures(ctx, demande);
      }),
  );

  serveur.registerTool(
    "chercher_entreprises",
    {
      title: "Entreprises qui recrutent",
      description:
        "Liste les entreprises qui ont un fort potentiel d'embauche pour un métier autour d'une ville, même sans offre publiée (La Bonne Boîte, France Travail). " +
        "Pour des candidatures spontanées ciblées.",
      inputSchema: {
        metier: z.enum(CLES_METIERS).default("data_large").describe("data_analyst, data_scientist ou data_large (r_et_d n'a pas de code ROME)"),
        ville: z.string().min(2).default("Mulhouse"),
        rayon_km: z.number().int().min(1).max(200).default(30),
        limite: z.number().int().min(1).max(50).default(15),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => proteger(() => chercherEntreprises(ctx, args)),
  );

  serveur.registerTool(
    "veille",
    {
      title: "Veille des nouvelles offres",
      description:
        "Examine les offres apparues depuis la dernière veille, calcule pour chacune un score de correspondance sur 100, " +
        "ajoute celles qui atteignent le seuil à mes candidatures (état « à envoyer »), liste de nouvelles entreprises qui recrutent et les relances dues, " +
        "et fournit les faits à utiliser pour rédiger les brouillons. N'envoie rien à aucun recruteur.",
      inputSchema: {
        seuil: z.number().int().min(0).max(100).default(60).describe("Score minimum pour retenir une offre"),
        ville: z.string().min(2).default("Mulhouse"),
        rayon_km: z.number().int().min(1).max(200).default(60),
        metiers: z.array(z.enum(CLES_METIERS)).min(1).default(["data_large", "r_et_d"]),
        types: z.array(z.enum(["alternance", "stage"])).min(1).default(["alternance"]),
        ajouter_candidatures: z.boolean().default(true).describe("Ajouter les offres retenues aux candidatures « à envoyer »"),
        entreprises: z.number().int().min(0).max(20).default(5).describe("Nombre de nouvelles entreprises La Bonne Boîte à proposer (0 pour aucune)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (args) => proteger(() => veille(ctx, args)),
  );

  return serveur;
}
