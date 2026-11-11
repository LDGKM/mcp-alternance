import { describe, expect, it } from "vitest";
import { evaluer, formaterEvaluation, normaliser, trouverAlias } from "../src/domaine/evaluation.js";
import { decouperId, distanceKm, formaterOffre, jourIso } from "../src/domaine/offre.js";
import { PROFIL } from "../src/domaine/profil.js";
import { convertirFt } from "../src/sources/franceTravail.js";
import { convertirLba } from "../src/sources/laBonneAlternance.js";
import { offreFt, offreLba } from "./aides.js";

describe("identifiants d'offre", () => {
  it("découpe un identifiant préfixé", () => {
    expect(decouperId("lba:abc123")).toEqual({ source: "lba", idBrut: "abc123" });
    expect(decouperId("ft:201XYZK")).toEqual({ source: "ft", idBrut: "201XYZK" });
  });

  it("refuse un identifiant sans source connue", () => {
    expect(() => decouperId("201XYZK")).toThrow(/invalide/);
    expect(() => decouperId("indeed:1")).toThrow(/invalide/);
    expect(() => decouperId("lba:")).toThrow(/invalide/);
  });
});

describe("utilitaires", () => {
  it("garde la date d'un horodatage", () => {
    expect(jourIso("2027-09-01T00:00:00.000Z")).toBe("2027-09-01");
    expect(jourIso(null)).toBeNull();
  });

  it("calcule la distance Mulhouse–Colmar (≈ 37 km à vol d'oiseau)", () => {
    expect(distanceKm({ lat: 47.7526, lon: 7.3255 }, { lat: 48.0794, lon: 7.3585 })).toBe(36);
  });

  it("normalise accents et casse", () => {
    expect(normaliser("Régression  LOGISTIQUE")).toBe("regression logistique");
  });
});

describe("repérage des compétences", () => {
  it("ne confond pas Java et JavaScript", () => {
    expect(trouverAlias(normaliser("Développement JavaScript"), ["java"])).toBeNull();
    expect(trouverAlias(normaliser("Java et Spring"), ["java"])).toBe("java");
  });

  it("reconnaît les noms avec symboles", () => {
    expect(trouverAlias(normaliser("Expérience en C++ appréciée"), ["c++"])).toBe("c++");
    expect(trouverAlias(normaliser("C# / .NET"), ["c#"])).toBe("c#");
    expect(trouverAlias(normaliser("C ou C++"), ["c#"])).toBeNull();
  });
});

describe("conversion des offres", () => {
  it("convertit une offre La bonne alternance sans rien inventer", () => {
    const o = convertirLba(offreLba(), { lat: 47.7526, lon: 7.3255 });
    expect(o).toMatchObject({
      id: "lba:lba-test-1",
      source: "La bonne alternance",
      intitule: "Alternant data analyst",
      entreprise: "Exemple Données SAS",
      contrat: "Apprentissage",
      date_debut: "2027-09-01",
      duree_mois: 12,
      teletravail: "hybride",
      lien_candidature: "https://exemple.invalid/postuler/1",
      alternance: true,
      salaire: null,
    });
    expect(o.distance_km).toBe(1);
  });

  it("convertit une offre France Travail sans date de début (non publiée par l'API)", () => {
    const o = convertirFt(offreFt());
    expect(o.id).toBe("ft:999TEST");
    expect(o.date_debut).toBeNull();
    expect(o.distance_km).toBeNull();
    expect(o.competences_demandees).toEqual(["Python (exigé)"]);
    expect(o.lien_candidature).toBe("https://candidat.francetravail.fr/offres/recherche/detail/999TEST");
  });

  it("décode les entités HTML envoyées par certains partenaires", () => {
    const brute = offreLba();
    brute.offer = { ...brute.offer, title: "Alternance - Portfolio &amp; Data Analyst H/F", description: "Charg&#233; d&#x27;&eacute;tudes" };
    const o = convertirLba(brute);
    expect(o.intitule).toBe("Alternance - Portfolio & Data Analyst H/F");
    expect(o.description).toContain("Chargé d'&eacute;tudes");
  });

  it("affiche clairement l'absence de lien de candidature", () => {
    const o = convertirLba(offreLba({ apply: { url: null, phone: null, recipient_id: null } }));
    expect(formaterOffre(o)).toContain("ne fournit pas de lien de candidature");
  });
});

describe("evaluer", () => {
  it("dit ce qui colle et ce qui manque", () => {
    const e = evaluer(convertirLba(offreLba(), PROFIL.ville), PROFIL);
    const collent = e.competences_qui_collent.map((c) => c.competence);
    expect(collent).toEqual(expect.arrayContaining(["Python", "SQL"]));
    expect(e.competences_qui_manquent).toContain("Power BI");
    expect(e.a_mettre_en_avant).toContainEqual({ demande: "Power BI", appui: ["Visualisation de données", "Reporting"] });
    expect(e.type_contrat).toMatchObject({ type: "alternance", statut: "compatible" });
    expect(e.date_debut.statut).toBe("compatible");
    expect(e.niveau.statut).toBe("compatible");
    expect(e.projets_a_citer.some((p) => p.includes("Accidents de la route"))).toBe(true);
  });

  it("signale un début trop tôt", () => {
    const brute = offreLba({ contract: { start: "2026-12-01T00:00:00.000Z", duration: 12, type: ["Apprentissage"], remote: null, start_type: "precise_date", start_is_flexible: false } });
    expect(evaluer(convertirLba(brute), PROFIL).date_debut.statut).toBe("incompatible");
  });

  it("dit « non indiqué » quand la source ne donne pas l'information", () => {
    const e = evaluer(convertirFt(offreFt()), PROFIL);
    expect(e.date_debut.statut).toBe("non_indique");
    expect(e.distance.statut).toBe("non_indique");
    expect(formaterEvaluation(e)).toContain("à demander au recruteur");
  });

  it("reconnaît un stage et applique la disponibilité de mai 2027", () => {
    const stage = convertirFt(offreFt({ intitule: "Stage data analyst (H/F)", alternance: false, typeContratLibelle: "Stage" }));
    const e = evaluer(stage, PROFIL);
    expect(e.type_contrat.type).toBe("stage");
    expect(e.date_debut.detail).toContain("mai 2027");
  });

  it("écarte un CDI", () => {
    const cdi = convertirFt(offreFt({ intitule: "Data analyst confirmé", alternance: false, typeContratLibelle: "CDI", description: "Poste en CDI." }));
    expect(evaluer(cdi, PROFIL).type_contrat.statut).toBe("incompatible");
  });
});
