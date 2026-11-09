-- Suivi des candidatures envoyées (une ligne par candidature).
CREATE TABLE IF NOT EXISTS candidatures (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  offre_id         TEXT,                 -- identifiant renvoyé par chercher_offres (ex. "lba:…" ou "ft:…"), facultatif
  entreprise       TEXT NOT NULL,
  poste            TEXT NOT NULL,
  type             TEXT CHECK (type IN ('alternance', 'stage')),
  lien             TEXT,
  etat             TEXT NOT NULL DEFAULT 'a_envoyer'
                   CHECK (etat IN ('a_envoyer', 'envoyee', 'relancee', 'entretien', 'acceptee', 'refusee', 'abandonnee')),
  date_candidature TEXT,                 -- AAAA-MM-JJ
  date_relance     TEXT,                 -- AAAA-MM-JJ : date à laquelle relancer
  notes            TEXT,
  cree_le          TEXT NOT NULL,        -- horodatage ISO 8601
  modifie_le       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_candidatures_etat ON candidatures (etat);
CREATE INDEX IF NOT EXISTS idx_candidatures_relance ON candidatures (date_relance);
