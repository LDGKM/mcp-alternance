/** Accès à la table des candidatures (Cloudflare D1, SQLite). */

export const ETATS = ["a_envoyer", "envoyee", "relancee", "entretien", "acceptee", "refusee", "abandonnee"] as const;
export type Etat = (typeof ETATS)[number];

export const LIBELLES_ETATS: Record<Etat, string> = {
  a_envoyer: "à envoyer",
  envoyee: "envoyée",
  relancee: "relancée",
  entretien: "entretien",
  acceptee: "acceptée",
  refusee: "refusée",
  abandonnee: "abandonnée",
};

/** États pour lesquels une relance a encore un sens. */
export const ETATS_EN_ATTENTE: Etat[] = ["envoyee", "relancee"];

export interface Candidature {
  id: number;
  offre_id: string | null;
  entreprise: string;
  poste: string;
  type: "alternance" | "stage" | null;
  lien: string | null;
  etat: Etat;
  date_candidature: string | null;
  date_relance: string | null;
  notes: string | null;
  brouillon: string | null;
  cree_le: string;
  modifie_le: string;
}

export type NouvelleCandidature = Omit<Candidature, "id" | "cree_le" | "modifie_le" | "brouillon"> & { brouillon?: string | null };
export type ModificationCandidature = Partial<Omit<Candidature, "id" | "cree_le" | "modifie_le">>;

export interface FiltreCandidatures {
  etat?: Etat;
  /** Ne garder que les candidatures en attente dont la date de relance est atteinte. */
  aRelancerAu?: string;
}

const CHAMPS_MODIFIABLES = ["offre_id", "entreprise", "poste", "type", "lien", "etat", "date_candidature", "date_relance", "notes", "brouillon"] as const;

export class DepotCandidatures {
  constructor(
    private readonly db: D1Database,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  async ajouter(c: NouvelleCandidature): Promise<Candidature> {
    const horodatage = this.maintenant().toISOString();
    const ligne = await this.db
      .prepare(
        `INSERT INTO candidatures (offre_id, entreprise, poste, type, lien, etat, date_candidature, date_relance, notes, brouillon, cree_le, modifie_le)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(c.offre_id, c.entreprise, c.poste, c.type, c.lien, c.etat, c.date_candidature, c.date_relance, c.notes, c.brouillon ?? null, horodatage, horodatage)
      .first<Candidature>();
    if (!ligne) throw new Error("L'enregistrement de la candidature a échoué.");
    return ligne;
  }

  async lire(id: number): Promise<Candidature | null> {
    return this.db.prepare("SELECT * FROM candidatures WHERE id = ?").bind(id).first<Candidature>();
  }

  async trouverParOffre(offreId: string): Promise<Candidature | null> {
    return this.db.prepare("SELECT * FROM candidatures WHERE offre_id = ? LIMIT 1").bind(offreId).first<Candidature>();
  }

  async lister(filtre: FiltreCandidatures = {}): Promise<Candidature[]> {
    const conditions: string[] = [];
    const valeurs: unknown[] = [];
    if (filtre.etat) {
      conditions.push("etat = ?");
      valeurs.push(filtre.etat);
    }
    if (filtre.aRelancerAu) {
      conditions.push(`etat IN (${ETATS_EN_ATTENTE.map(() => "?").join(", ")})`, "date_relance IS NOT NULL", "date_relance <= ?");
      valeurs.push(...ETATS_EN_ATTENTE, filtre.aRelancerAu);
    }
    const ou = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { results } = await this.db
      .prepare(`SELECT * FROM candidatures ${ou} ORDER BY COALESCE(date_relance, '9999-12-31'), id`)
      .bind(...valeurs)
      .all<Candidature>();
    return results;
  }

  async modifier(id: number, changements: ModificationCandidature): Promise<Candidature | null> {
    const champs = CHAMPS_MODIFIABLES.filter((c) => changements[c] !== undefined);
    if (champs.length === 0) return this.lire(id);
    const affectations = [...champs.map((c) => `${c} = ?`), "modifie_le = ?"].join(", ");
    return this.db
      .prepare(`UPDATE candidatures SET ${affectations} WHERE id = ? RETURNING *`)
      .bind(...champs.map((c) => changements[c] ?? null), this.maintenant().toISOString(), id)
      .first<Candidature>();
  }

  /** Parmi `ids`, ceux que la veille a déjà examinés. */
  async dejaVues(ids: string[]): Promise<Set<string>> {
    const vues = new Set<string>();
    // Par paquets, pour rester sous la limite de paramètres de SQLite.
    for (let i = 0; i < ids.length; i += 90) {
      const paquet = ids.slice(i, i + 90);
      if (paquet.length === 0) continue;
      const { results } = await this.db
        .prepare(`SELECT id FROM offres_vues WHERE id IN (${paquet.map(() => "?").join(", ")})`)
        .bind(...paquet)
        .all<{ id: string }>();
      for (const r of results) vues.add(r.id);
    }
    return vues;
  }

  async marquerVues(entrees: Array<{ id: string; score: number | null }>, jour: string): Promise<void> {
    for (const e of entrees) {
      await this.db.prepare("INSERT OR IGNORE INTO offres_vues (id, vue_le, score) VALUES (?, ?, ?)").bind(e.id, jour, e.score).run();
    }
  }
}
