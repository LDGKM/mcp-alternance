import { METIERS, type CleMetier } from "../domaine/metiers.js";
import { trouverCommune } from "../sources/geo.js";
import { identifiantsPresents } from "../sources/jetonFranceTravail.js";
import { type Entreprise, rechercherEntreprises } from "../sources/laBonneBoite.js";
import type { Contexte } from "./contexte.js";

export interface ArgsEntreprises {
  metier: CleMetier;
  ville: string;
  rayon_km: number;
  limite: number;
}

export function idsFranceTravail(ctx: Contexte) {
  return { clientId: ctx.secrets.FT_CLIENT_ID, clientSecret: ctx.secrets.FT_CLIENT_SECRET };
}

export async function chercherEntreprises(ctx: Contexte, args: ArgsEntreprises): Promise<string> {
  if (!identifiantsPresents(idsFranceTravail(ctx))) {
    throw new Error("La Bonne Boîte passe par votre application France Travail : enregistrez les secrets FT_CLIENT_ID et FT_CLIENT_SECRET (voir le guide).");
  }
  const metier = METIERS[args.metier];
  const commune = await trouverCommune(ctx.fetch, args.ville);
  const entreprises = await rechercherEntreprises(ctx.fetch, idsFranceTravail(ctx), {
    codeInsee: commune.codeInsee,
    rayonKm: args.rayon_km,
    codesRome: metier.codesEntreprises ?? metier.codesRome,
    taille: args.limite,
  });
  const suivies = new Set((await ctx.depot.lister()).map((c) => c.offre_id).filter(Boolean));
  const l = [
    `# ${entreprises.length} entreprise(s) susceptibles de recruter — ${metier.libelle} · ${commune.nom} + ${args.rayon_km} km`,
    "Source : La Bonne Boîte (France Travail). Potentiel d'embauche estimé sur 6 mois, sans offre publiée : à cibler par candidature spontanée.",
    "",
  ];
  if (entreprises.length === 0) l.push("Aucune entreprise trouvée. Essayez un rayon plus large ou le métier data_large.");
  entreprises.slice(0, args.limite).forEach((e, i) => l.push(...ligneEntreprise(e, i + 1, suivies.has(e.id))));
  if (entreprises.length) {
    l.push(
      "",
      "Pour suivre une candidature spontanée : suivre_candidatures, action ajouter, avec offre_id = l'id lbb:…, l'entreprise et un poste du type « Candidature spontanée — alternance data ».",
    );
  }
  return l.join("\n");
}

export function ligneEntreprise(e: Entreprise, rang: number, dejaSuivie: boolean): string[] {
  const details = [
    e.potentiel !== null ? `potentiel ${e.potentiel}/100` : null,
    e.activite,
    e.effectif,
    e.ville,
  ].filter(Boolean);
  return [
    `${rang}. **${e.nom}** — ${details.join(" · ")}`,
    `   id \`${e.id}\` · fiche : ${e.fiche}${dejaSuivie ? " · déjà dans vos candidatures" : ""}`,
  ];
}
