-- Brouillon de lettre ou de message rédigé pour une candidature.
ALTER TABLE candidatures ADD COLUMN brouillon TEXT;

-- Offres et entreprises déjà examinées par la veille, pour ne signaler que les nouvelles.
CREATE TABLE IF NOT EXISTS offres_vues (
  id      TEXT PRIMARY KEY,   -- « lba:… », « ft:… » ou « lbb:<siret> »
  vue_le  TEXT NOT NULL,      -- AAAA-MM-JJ
  score   INTEGER             -- score de correspondance au moment de l'examen (offres seulement)
);
