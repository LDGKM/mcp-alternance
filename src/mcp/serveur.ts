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
import { type ArgsSuivi, suivreCandidatures } from "../outils/suivreCandidatures.js";

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
        "Enchaînement conseillé : chercher_offres → lire_offre ou evaluer_offre → suivre_candidatures.",
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
        "Ajoute, liste ou met à jour mes candidatures (date, état, relance). " +
        "action=ajouter : offre_id suffit (entreprise, poste et lien sont repris de l'annonce) ; " +
        "action=lister : filtre facultatif par état, ou a_relancer=true ; " +
        "action=mettre_a_jour : id obligatoire + champs à changer. " +
        "Une candidature envoyée est à relancer 10 jours plus tard par défaut.",
      inputSchema: {
        action: z.enum(["ajouter", "lister", "mettre_a_jour"]),
        id: z.number().int().positive().optional().describe("Numéro de la candidature (mettre_a_jour)"),
        offre_id: idOffre.optional(),
        entreprise: z.string().min(1).max(200).optional(),
        poste: z.string().min(1).max(200).optional(),
        type: z.enum(["alternance", "stage"]).optional(),
        lien: z.string().url().optional(),
        etat: z.enum(ETATS).optional().describe("a_envoyer, envoyee, relancee, entretien, acceptee, refusee, abandonnee"),
        date_candidature: jour.optional(),
        date_relance: jour.optional(),
        notes: z.string().max(2000).optional(),
        a_relancer: z.boolean().optional().describe("lister : seulement les candidatures dont la relance est due"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args) =>
      proteger(async () => {
        let demande: ArgsSuivi;
        if (args.action === "mettre_a_jour") {
          if (args.id === undefined) throw new Error("L'action mettre_a_jour demande l'id de la candidature.");
          demande = { ...args, action: "mettre_a_jour", id: args.id };
        } else if (args.action === "lister") {
          demande = { action: "lister", etat: args.etat, a_relancer: args.a_relancer };
        } else {
          demande = { ...args, action: "ajouter" };
        }
        return suivreCandidatures(ctx, demande);
      }),
  );

  return serveur;
}
