import { LIBELLES_ETATS } from "../candidatures/depot.js";
import { normaliser } from "../domaine/evaluation.js";
import { METIERS, type CleMetier } from "../domaine/metiers.js";
import { type OffreComplete, resumer, type ResumeOffre } from "../domaine/offre.js";
import { convertirFt, type OffreFtBrute, rechercherFt } from "../sources/franceTravail.js";
import { type Commune, trouverCommune } from "../sources/geo.js";
import { identifiantsPresents } from "../sources/jetonFranceTravail.js";
import { convertirLba, type OffreLbaBrute, rechercherLba } from "../sources/laBonneAlternance.js";
import type { Contexte } from "./contexte.js";
import { premierJour } from "./dates.js";

export interface ArgsRecherche {
  type: "alternance" | "stage";
  metier: CleMetier;
  ville: string;
  rayon_km: number;
  /** AAAA-MM ou AAAA-MM-JJ : écarte les offres qui annoncent un début plus tôt. */
  date_debut?: string | undefined;
  mots_cles?: string | undefined;
  sources: Array<"lba" | "ft">;
  limite: number;
}

export interface ResultatRecherche {
  criteres: { type: string; metier: string; ville: string; code_insee: string; rayon_km: number; date_debut: string | null };
  offres: Array<ResumeOffre & { deja_suivie: string | null }>;
  total_avant_limite: number;
  par_source: Record<string, number>;
  remarques: string[];
}

const MOTIF_STAGE = /\b(stage|stagiaire|internship)\b/;

function texte(o: OffreComplete): string {
  return normaliser([o.intitule, o.description, ...o.competences_demandees].filter(Boolean).join(" "));
}

/** Chaque terme (séparé par des virgules) doit apparaître dans l'annonce. */
export function filtreMotsCles(motsCles: string | undefined): (o: OffreComplete) => boolean {
  const termes = (motsCles ?? "").split(",").map((t) => normaliser(t.trim())).filter(Boolean);
  return (o) => termes.every((t) => texte(o).includes(t));
}

export interface OffresTrouvees {
  commune: Commune;
  /** Offres complètes, sans doublon, filtrées et triées par distance. */
  offres: OffreComplete[];
  remarques: string[];
  debutMin: string | null;
}

/** Recherche commune à chercher_offres et à la veille : renvoie les offres complètes. */
export async function trouverOffres(ctx: Contexte, args: Omit<ArgsRecherche, "limite">, commune?: Commune): Promise<OffresTrouvees> {
  const metier = METIERS[args.metier];
  commune ??= await trouverCommune(ctx.fetch, args.ville);
  const origine = { lat: commune.lat, lon: commune.lon };
  const remarques: string[] = [];

  const veutLba = args.sources.includes("lba");
  // Depuis octobre 2026, l'API Offres d'emploi n'est plus en libre-service : on ne l'interroge que si l'accès est déclaré.
  const ftConfigure = ctx.franceTravailOffres && identifiantsPresents({ clientId: ctx.secrets.FT_CLIENT_ID, clientSecret: ctx.secrets.FT_CLIENT_SECRET });
  const veutFt = args.sources.includes("ft") && ftConfigure;
  if (args.sources.includes("ft") && !ftConfigure) {
    remarques.push(
      "France Travail (offres) non activé : l'API Offres d'emploi est accordée sur demande depuis octobre 2026 (voir le guide). Recherche faite sans cette source.",
    );
  }
  if (veutLba && args.type === "stage") {
    remarques.push("La bonne alternance ne publie que des offres d'alternance : elle n'est pas interrogée pour un stage.");
  }

  const [lba, ft] = await Promise.allSettled([
    veutLba && args.type === "alternance"
      ? rechercherLba(ctx.fetch, ctx.secrets.LBA_API_KEY, { latitude: commune.lat, longitude: commune.lon, rayonKm: args.rayon_km, codesRome: metier.codesRome })
      : Promise.resolve(null),
    veutFt
      ? rechercherFt(
          ctx.fetch,
          { clientId: ctx.secrets.FT_CLIENT_ID, clientSecret: ctx.secrets.FT_CLIENT_SECRET },
          {
            codeInsee: commune.codeInsee,
            departement: commune.departement,
            rayonKm: args.rayon_km,
            codesRome: metier.codesRome,
            motsCles: args.type === "stage" ? "stage" : metier.motsClesFranceTravail,
          },
        )
      : Promise.resolve(null),
  ]);

  let offresFt: OffreFtBrute[] = [];
  if (ft.status === "rejected") remarques.push(`France Travail indisponible : ${(ft.reason as Error).message}`);
  else if (ft.value) offresFt = ft.value;

  let offresLba: OffreLbaBrute[] = [];
  if (lba.status === "rejected") remarques.push(`La bonne alternance indisponible : ${(lba.reason as Error).message}`);
  else if (lba.value) {
    offresLba = lba.value.offres;
    remarques.push(...lba.value.avertissements);
  }

  // La bonne alternance rediffuse des offres France Travail : on garde une seule copie.
  const idsFt = new Set(offresFt.map((o) => o.id));
  const avantDedoublonnage = offresLba.length;
  offresLba = offresLba.filter(
    (o) => !(o.identifier.partner_job_id && /france travail/i.test(o.identifier.partner_label ?? "") && idsFt.has(o.identifier.partner_job_id)),
  );
  if (offresLba.length < avantDedoublonnage) remarques.push(`${avantDedoublonnage - offresLba.length} doublon(s) présents dans les deux sources fusionnés.`);

  let offres: OffreComplete[] = [
    ...offresLba.filter((o) => o.identifier.id).map((o) => convertirLba(o, origine)),
    ...offresFt.map((o) => convertirFt(o, origine)),
  ];

  // La même offre peut revenir plusieurs fois (une fois par code ROME correspondant) : une seule copie.
  const vus = new Set<string>();
  offres = offres.filter((o) => (vus.has(o.id) ? false : (vus.add(o.id), true)));

  // Type de contrat demandé.
  offres = offres.filter((o) =>
    args.type === "alternance" ? o.alternance === true : o.alternance !== true && MOTIF_STAGE.test(normaliser(`${o.intitule} ${o.description ?? ""}`)),
  );
  // Métier sans code ROME (R&D) : filtre sur le texte.
  if (metier.filtreTexte) offres = offres.filter((o) => metier.filtreTexte!.test(`${o.intitule} ${o.description ?? ""}`));
  offres = offres.filter(filtreMotsCles(args.mots_cles));

  // Date de début.
  const debutMin = args.date_debut ? premierJour(args.date_debut) : null;
  if (debutMin) {
    const avant = offres.length;
    offres = offres.filter((o) => o.date_debut === null || o.date_debut >= debutMin);
    const sansDate = offres.filter((o) => o.date_debut === null).length;
    if (avant > offres.length) remarques.push(`${avant - offres.length} offre(s) écartée(s) car elles annoncent un début avant le ${debutMin}.`);
    if (sansDate) remarques.push(`${sansDate} offre(s) gardée(s) sans date de début connue (France Travail ne publie pas cette date) : à vérifier.`);
  }

  offres.sort(
    (a, b) =>
      (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY) ||
      (b.date_publication ?? "").localeCompare(a.date_publication ?? ""),
  );
  return { commune, offres, remarques, debutMin };
}

export async function chercherOffres(ctx: Contexte, args: ArgsRecherche): Promise<ResultatRecherche> {
  const metier = METIERS[args.metier];
  const { commune, offres, remarques, debutMin } = await trouverOffres(ctx, args);
  const parSource: Record<string, number> = {};
  for (const o of offres) parSource[o.source] = (parSource[o.source] ?? 0) + 1;

  const suivies = new Map((await ctx.depot.lister()).filter((c) => c.offre_id).map((c) => [c.offre_id as string, LIBELLES_ETATS[c.etat]]));

  return {
    criteres: {
      type: args.type,
      metier: metier.libelle,
      ville: commune.nom,
      code_insee: commune.codeInsee,
      rayon_km: args.rayon_km,
      date_debut: debutMin,
    },
    offres: offres.slice(0, args.limite).map((o) => ({ ...resumer(o), deja_suivie: suivies.get(o.id) ?? null })),
    total_avant_limite: offres.length,
    par_source: parSource,
    remarques,
  };
}

export function formaterRecherche(r: ResultatRecherche): string {
  const c = r.criteres;
  const l: string[] = [
    `# ${r.total_avant_limite} offre(s) — ${c.type} · ${c.metier} · ${c.ville} (${c.code_insee}) + ${c.rayon_km} km${c.date_debut ? ` · début à partir du ${c.date_debut}` : ""}`,
  ];
  const sources = Object.entries(r.par_source).map(([s, n]) => `${s} : ${n}`);
  if (sources.length) l.push(`Par source : ${sources.join(" · ")}`);
  if (r.total_avant_limite > r.offres.length) l.push(`Affichage des ${r.offres.length} plus proches.`);
  if (r.remarques.length) l.push("", ...r.remarques.map((m) => `> ${m}`));
  l.push("");
  if (r.offres.length === 0) {
    l.push("Aucune offre ne correspond. Essayez un rayon plus large, un autre métier ou sans date de début.");
    return l.join("\n");
  }
  r.offres.forEach((o, i) => {
    const details = [
      o.entreprise,
      o.lieu ? `${o.lieu}${o.distance_km !== null ? ` (${o.distance_km} km)` : ""}` : null,
      o.contrat,
      o.date_debut ? `début ${o.date_debut}` : "début non indiqué",
      o.date_publication ? `publiée le ${o.date_publication}` : null,
    ].filter(Boolean);
    l.push(`${i + 1}. **${o.intitule}** — ${details.join(" · ")}`);
    l.push(`   id \`${o.id}\` · ${o.source}${o.deja_suivie ? ` · déjà dans vos candidatures (${o.deja_suivie})` : ""}`);
  });
  l.push("", "Utilisez lire_offre ou evaluer_offre avec l'id pour le détail.");
  return l.join("\n");
}
