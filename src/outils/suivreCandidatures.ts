import { type Candidature, type Etat, ETATS, LIBELLES_ETATS, type ModificationCandidature } from "../candidatures/depot.js";
import { typeDeLOffre, normaliser } from "../domaine/evaluation.js";
import { chargerOffre, type Contexte } from "./contexte.js";
import { ajouterJours } from "./dates.js";

/** Délai par défaut avant de relancer un recruteur. Modifiable ici. */
export const JOURS_AVANT_RELANCE = 10;

export interface ArgsAjout {
  offre_id?: string | undefined;
  entreprise?: string | undefined;
  poste?: string | undefined;
  type?: "alternance" | "stage" | undefined;
  lien?: string | undefined;
  etat?: Etat | undefined;
  date_candidature?: string | undefined;
  date_relance?: string | undefined;
  notes?: string | undefined;
}

export interface ArgsMiseAJour extends Omit<ArgsAjout, "offre_id"> {
  id: number;
}

export type ArgsSuivi =
  | ({ action: "ajouter" } & ArgsAjout)
  | { action: "lister"; etat?: Etat | undefined; a_relancer?: boolean | undefined }
  | ({ action: "mettre_a_jour" } & ArgsMiseAJour);

export async function suivreCandidatures(ctx: Contexte, args: ArgsSuivi): Promise<string> {
  switch (args.action) {
    case "ajouter":
      return ajouter(ctx, args);
    case "lister":
      return lister(ctx, args.etat, args.a_relancer ?? false);
    case "mettre_a_jour":
      return mettreAJour(ctx, args);
  }
}

async function ajouter(ctx: Contexte, a: ArgsAjout): Promise<string> {
  let { entreprise, poste, type, lien } = a;
  const offreId = a.offre_id?.trim() || null;

  if (offreId) {
    const existante = await ctx.depot.trouverParOffre(offreId);
    if (existante) return `Cette offre est déjà suivie :\n\n${ligne(existante, ctx.aujourdhui())}\n\nUtilisez l'action mettre_a_jour avec l'id ${existante.id} pour la modifier.`;
    // Complète les champs manquants à partir de l'annonce.
    if (!entreprise || !poste || !lien || !type) {
      try {
        const offre = await chargerOffre(ctx, offreId);
        entreprise ||= offre.entreprise ?? undefined;
        poste ||= offre.intitule;
        lien ||= offre.lien_candidature ?? undefined;
        if (!type) {
          const t = typeDeLOffre(offre, normaliser(`${offre.intitule} ${offre.description ?? ""}`));
          type = t === "autre" ? undefined : t;
        }
      } catch (e) {
        // L'annonce n'est plus lisible : on continue si l'essentiel a été fourni.
        if (!entreprise || !poste) throw e;
      }
    }
  }
  if (!entreprise || !poste) {
    throw new Error("Indiquez au moins l'entreprise et le poste (ou un offre_id dont l'annonce nomme l'entreprise).");
  }

  const aujourdhui = ctx.aujourdhui();
  const etat: Etat = a.etat ?? (a.date_candidature ? "envoyee" : "a_envoyer");
  const dateCandidature = a.date_candidature ?? (etat === "envoyee" ? aujourdhui : null);
  const dateRelance = a.date_relance ?? (etat === "envoyee" && dateCandidature ? ajouterJours(dateCandidature, JOURS_AVANT_RELANCE) : null);

  const c = await ctx.depot.ajouter({
    offre_id: offreId,
    entreprise,
    poste,
    type: type ?? null,
    lien: lien ?? null,
    etat,
    date_candidature: dateCandidature,
    date_relance: dateRelance,
    notes: a.notes ?? null,
  });
  return `Candidature enregistrée :\n\n${ligne(c, aujourdhui)}`;
}

async function lister(ctx: Contexte, etat: Etat | undefined, aRelancer: boolean): Promise<string> {
  const aujourdhui = ctx.aujourdhui();
  const liste = await ctx.depot.lister({ etat, aRelancerAu: aRelancer ? aujourdhui : undefined });
  const titre = aRelancer ? "Candidatures à relancer" : etat ? `Candidatures « ${LIBELLES_ETATS[etat]} »` : "Toutes les candidatures";
  if (liste.length === 0) return `${titre} : aucune.`;

  const compte = new Map<Etat, number>();
  for (const c of liste) compte.set(c.etat, (compte.get(c.etat) ?? 0) + 1);
  const resume = ETATS.filter((e) => compte.has(e)).map((e) => `${LIBELLES_ETATS[e]} : ${compte.get(e)}`).join(" · ");
  return [`# ${titre} (${liste.length})`, resume, "", ...liste.map((c) => ligne(c, aujourdhui))].join("\n");
}

async function mettreAJour(ctx: Contexte, a: ArgsMiseAJour): Promise<string> {
  const avant = await ctx.depot.lire(a.id);
  if (!avant) throw new Error(`Aucune candidature avec l'id ${a.id}. Utilisez l'action lister pour voir les id.`);

  const aujourdhui = ctx.aujourdhui();
  const changements: ModificationCandidature = {
    entreprise: a.entreprise,
    poste: a.poste,
    type: a.type,
    lien: a.lien,
    etat: a.etat,
    date_candidature: a.date_candidature,
    date_relance: a.date_relance,
    notes: a.notes,
  };
  // Passage à « envoyée » : date du jour et relance programmée si rien n'est précisé.
  if (a.etat === "envoyee" && !avant.date_candidature && !a.date_candidature) changements.date_candidature = aujourdhui;
  const dateEnvoi = changements.date_candidature ?? avant.date_candidature;
  if (a.etat === "envoyee" && !a.date_relance && !avant.date_relance && dateEnvoi) changements.date_relance = ajouterJours(dateEnvoi, JOURS_AVANT_RELANCE);
  // Après une relance, la suivante est reprogrammée.
  if (a.etat === "relancee" && !a.date_relance) changements.date_relance = ajouterJours(aujourdhui, JOURS_AVANT_RELANCE);

  const apres = await ctx.depot.modifier(a.id, changements);
  if (!apres) throw new Error(`La candidature ${a.id} n'a pas pu être modifiée.`);
  return `Candidature mise à jour :\n\n${ligne(apres, aujourdhui)}`;
}

function ligne(c: Candidature, aujourdhui: string): string {
  const enAttente = c.etat === "envoyee" || c.etat === "relancee";
  const relance =
    c.date_relance && enAttente ? (c.date_relance <= aujourdhui ? ` · ⏰ à relancer (depuis le ${c.date_relance})` : ` · relance le ${c.date_relance}`) : "";
  const morceaux = [
    `**#${c.id} ${c.poste}** — ${c.entreprise}`,
    `   ${LIBELLES_ETATS[c.etat]}${c.type ? ` · ${c.type}` : ""}${c.date_candidature ? ` · envoyée le ${c.date_candidature}` : ""}${relance}`,
  ];
  if (c.lien) morceaux.push(`   ${c.lien}`);
  if (c.offre_id) morceaux.push(`   offre \`${c.offre_id}\``);
  if (c.notes) morceaux.push(`   Notes : ${c.notes}`);
  return morceaux.join("\n");
}
