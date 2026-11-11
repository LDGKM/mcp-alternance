/**
 * Veille : examine les nouvelles offres (et entreprises) depuis le dernier passage,
 * les note, ajoute celles qui dépassent le seuil à « à envoyer », et prépare
 * la matière factuelle pour rédiger les brouillons.
 *
 * Rien n'est envoyé à un recruteur : l'envoi reste fait par Deo, après relecture.
 */
import { type Candidature, LIBELLES_ETATS } from "../candidatures/depot.js";
import { evaluer, type Evaluation } from "../domaine/evaluation.js";
import { type CleMetier, METIERS } from "../domaine/metiers.js";
import type { OffreComplete } from "../domaine/offre.js";
import type { Profil } from "../domaine/profil.js";
import { trouverCommune } from "../sources/geo.js";
import { identifiantsPresents } from "../sources/jetonFranceTravail.js";
import { type Entreprise, rechercherEntreprises } from "../sources/laBonneBoite.js";
import { idsFranceTravail, ligneEntreprise } from "./chercherEntreprises.js";
import { trouverOffres } from "./chercherOffres.js";
import type { Contexte } from "./contexte.js";

export interface ArgsVeille {
  seuil: number;
  ville: string;
  rayon_km: number;
  metiers: CleMetier[];
  types: Array<"alternance" | "stage">;
  ajouter_candidatures: boolean;
  entreprises: number;
}

interface OffreNotee {
  offre: OffreComplete;
  evaluation: Evaluation;
  candidature: Candidature | null;
}

export async function veille(ctx: Contexte, args: ArgsVeille): Promise<string> {
  const jour = ctx.aujourdhui();
  const commune = await trouverCommune(ctx.fetch, args.ville);
  const remarques = new Set<string>();

  // 1. Recherche sur chaque combinaison métier × type, sans doublon.
  const parId = new Map<string, OffreComplete>();
  for (const metier of args.metiers) {
    for (const type of args.types) {
      const r = await trouverOffres(ctx, { type, metier, ville: args.ville, rayon_km: args.rayon_km, sources: ["lba", "ft"] }, commune);
      r.remarques.forEach((m) => remarques.add(m));
      for (const o of r.offres) if (!parId.has(o.id)) parId.set(o.id, o);
    }
  }

  // 2. Seules les offres jamais examinées sont notées.
  const deja = await ctx.depot.dejaVues([...parId.keys()]);
  const nouvelles = [...parId.values()].filter((o) => !deja.has(o.id));
  const notees = nouvelles
    .map((offre) => ({ offre, evaluation: evaluer(offre, ctx.profil) }))
    .sort((a, b) => b.evaluation.score.total - a.evaluation.score.total);

  // 3. Au-dessus du seuil : ajout aux candidatures « à envoyer » (sauf si déjà suivie).
  const suivies = new Map((await ctx.depot.lister()).filter((c) => c.offre_id).map((c) => [c.offre_id as string, c]));
  const retenues: OffreNotee[] = [];
  for (const n of notees.filter((x) => x.evaluation.score.total >= args.seuil)) {
    let candidature = suivies.get(n.offre.id) ?? null;
    if (!candidature && args.ajouter_candidatures) {
      const type = n.evaluation.type_contrat.type;
      candidature = await ctx.depot.ajouter({
        offre_id: n.offre.id,
        entreprise: n.offre.entreprise ?? "(entreprise non indiquée)",
        poste: n.offre.intitule,
        type: type === "autre" ? null : type,
        lien: n.offre.lien_candidature,
        etat: "a_envoyer",
        date_candidature: null,
        date_relance: null,
        notes: `Veille du ${jour} — score ${n.evaluation.score.total}/100`,
      });
    }
    retenues.push({ ...n, candidature });
  }
  await ctx.depot.marquerVues(notees.map((n) => ({ id: n.offre.id, score: n.evaluation.score.total })), jour);

  // 4. Entreprises susceptibles de recruter (La Bonne Boîte), nouvelles seulement.
  let entreprises: Entreprise[] = [];
  if (args.entreprises > 0) {
    const codes = [...new Set(args.metiers.flatMap((m) => METIERS[m].codesEntreprises ?? METIERS[m].codesRome))];
    if (!identifiantsPresents(idsFranceTravail(ctx))) {
      remarques.add("La Bonne Boîte non configurée (secrets FT_CLIENT_ID et FT_CLIENT_SECRET) : pas de liste d'entreprises.");
    } else if (codes.length > 0) {
      try {
        const toutes = await rechercherEntreprises(ctx.fetch, idsFranceTravail(ctx), { codeInsee: commune.codeInsee, rayonKm: args.rayon_km, codesRome: codes, taille: 50 });
        const vues = await ctx.depot.dejaVues(toutes.map((e) => e.id));
        entreprises = toutes.filter((e) => !vues.has(e.id) && !suivies.has(e.id)).slice(0, args.entreprises);
        await ctx.depot.marquerVues(entreprises.map((e) => ({ id: e.id, score: null })), jour);
      } catch (e) {
        remarques.add(`La Bonne Boîte indisponible : ${(e as Error).message}`);
      }
    }
  }

  // 5. Relances dues.
  const relances = await ctx.depot.lister({ aRelancerAu: jour });

  return formater({ jour, commune: commune.nom, args, total: parId.size, nouvelles: notees, retenues, entreprises, relances, remarques: [...remarques], profil: ctx.profil });
}

function formater(v: {
  jour: string;
  commune: string;
  args: ArgsVeille;
  total: number;
  nouvelles: Array<{ offre: OffreComplete; evaluation: Evaluation }>;
  retenues: OffreNotee[];
  entreprises: Entreprise[];
  relances: Candidature[];
  remarques: string[];
  profil: Profil;
}): string {
  const { args } = v;
  const l: string[] = [
    `# Veille du ${v.jour} — ${v.commune} + ${args.rayon_km} km`,
    `Métiers : ${args.metiers.map((m) => METIERS[m].libelle).join(", ")} · ${args.types.join(" et ")} · seuil ${args.seuil}/100`,
    "",
    `- ${v.total} offre(s) trouvée(s), dont **${v.nouvelles.length} nouvelle(s)** depuis la dernière veille`,
    `- **${v.retenues.length} au-dessus du seuil**`,
    `- ${v.entreprises.length} nouvelle(s) entreprise(s) susceptible(s) de recruter`,
    `- ${v.relances.length} relance(s) due(s)`,
  ];
  if (v.remarques.length) l.push("", ...v.remarques.map((m) => `> ${m}`));

  l.push("", "## Offres retenues");
  if (v.retenues.length === 0) l.push("Aucune nouvelle offre n'atteint le seuil.");
  for (const r of v.retenues) {
    const e = r.evaluation;
    const o = r.offre;
    l.push(
      "",
      `### ${o.intitule} — ${o.entreprise ?? "entreprise non indiquée"} · **${e.score.total}/100**`,
      `- Offre \`${o.id}\` · ${o.source}${r.candidature ? ` · candidature #${r.candidature.id} (${LIBELLES_ETATS[r.candidature.etat]})` : ""}`,
      `- ${[o.lieu ? `${o.lieu}${o.distance_km !== null ? ` (${o.distance_km} km)` : ""}` : null, o.contrat, o.date_debut ? `début ${o.date_debut}` : "début non indiqué"].filter(Boolean).join(" · ")}`,
      `- Postuler : ${o.lien_candidature ?? "pas de lien fourni par la source"}`,
      `- Score : ${e.score.detail.join(" ; ")}`,
      `- Ce qui colle : ${e.competences_qui_collent.map((c) => c.competence).join(", ") || "aucune compétence du profil citée telle quelle"}`,
      `- Ce qui manque : ${e.competences_qui_manquent.join(", ") || "rien de repéré"}`,
    );
    if (e.a_mettre_en_avant.length) l.push(`- À mettre en avant : ${e.a_mettre_en_avant.map((a) => `${a.demande} → ${a.appui.join(", ")}`).join(" ; ")}`);
    if (e.projets_a_citer.length) l.push(`- Projets à citer : ${e.projets_a_citer.join(" ; ")}`);
  }

  const dessous = v.nouvelles.filter((n) => n.evaluation.score.total < args.seuil);
  if (dessous.length) {
    l.push("", `## Autres nouvelles offres (sous le seuil) — ${dessous.length}`);
    for (const n of dessous.slice(0, 10)) l.push(`- ${n.offre.intitule} — ${n.offre.entreprise ?? "?"} · ${n.evaluation.score.total}/100 · \`${n.offre.id}\``);
    if (dessous.length > 10) l.push(`- … et ${dessous.length - 10} autre(s)`);
  }

  if (v.entreprises.length) {
    l.push("", "## Entreprises susceptibles de recruter (candidature spontanée)", "Source : La Bonne Boîte (France Travail).");
    v.entreprises.forEach((e, i) => l.push(...ligneEntreprise(e, i + 1, false)));
  }

  if (v.relances.length) {
    l.push("", "## Relances dues");
    for (const c of v.relances) l.push(`- #${c.id} ${c.poste} — ${c.entreprise} · envoyée le ${c.date_candidature ?? "?"} · relance prévue le ${c.date_relance}${c.lien ? ` · ${c.lien}` : ""}`);
  }

  if (v.retenues.length || v.entreprises.length || v.relances.length) l.push("", ...faitsPourBrouillons(v.profil));
  return l.join("\n");
}

/** Les seuls faits sur Deo qu'un brouillon a le droit d'utiliser, et la consigne de rédaction. */
export function faitsPourBrouillons(p: Profil): string[] {
  return [
    "## Pour rédiger les brouillons",
    "Faits utilisables (et seulement ceux-là, avec ceux de l'annonce) :",
    `- ${p.nom}, ${p.formation}`,
    `- Disponibilité : ${p.disponibilite.alternance.origine} ; ${p.disponibilite.stage.origine}`,
    `- Expériences : ${p.experiences.map((e) => `${e.poste}, ${e.structure} (${e.lieu}, ${e.periode})`).join(" ; ")}`,
    `- Projets : ${p.projets.map((x) => `${x.nom} (${x.date}, ${x.technologies.join(", ")}${x.lien ? `, ${x.lien}` : ""})`).join(" ; ")}`,
    `- Compétences : ${p.competences.map((c) => c.nom).join(", ")}`,
    `- Langues : ${p.langues.join(", ")} · Certifications : ${p.certifications.join(", ")}`,
    "",
    "Consigne : pour chaque offre retenue, lire l'annonce (lire_offre), puis rédiger une lettre courte (250 mots maximum) qui relie 2 ou 3 faits ci-dessus aux besoins de l'annonce. " +
      "Ne rien inventer (ni expérience, ni niveau, ni motivation personnelle non exprimée) ; si une compétence demandée manque, ne pas la prétendre. " +
      "Pour une relance due, un message de 80 mots. Les entreprises sans offre ne reçoivent un brouillon (candidature spontanée, 150 mots) que si Deo les ajoute à ses candidatures. " +
      "Enregistrer chaque texte avec suivre_candidatures (action mettre_a_jour, id, brouillon). Ne rien envoyer : Deo relit et envoie lui-même.",
  ];
}
