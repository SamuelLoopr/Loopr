-- Tar bort all åtkomst utan inloggning till audits, proposals, review_clients
-- och profile.
--
-- Reglerna nedan gav den publika nyckeln — den som finns i varje webbläsare —
-- full åtkomst: läsa, ändra och ta bort alla audits, förslag och
-- recensionskunder, och läsa operatörens profil. De fanns för att de publika
-- sidorna /audit, /forslag och /demo läste tabellerna direkt från webbläsaren.
-- Sedan app/api/public/* läser sidorna via servern (service-rollen), en rad per
-- share_id och bara de fält som visas.
--
-- KÖR FÖRST NÄR KODEN MED app/api/public/* LIGGER I DRIFT — annars slutar de
-- publika sidorna fungera.
--
-- Inloggade operatörer har kvar sin åtkomst via 048 (is_operator()), och
-- profile behåller sina ägarregler från 021.

drop policy if exists "Anon full access to audits" on audits;

drop policy if exists "Anon full access to proposals" on proposals;

drop policy if exists "Anon full access to review_clients" on review_clients;
drop policy if exists "Allow anon insert" on review_clients;
drop policy if exists "Allow anon update" on review_clients;
drop policy if exists "Allow anon select" on review_clients;
-- De verkliga namnen i databasen (borttagna för hand 2026-10-31, eftersom
-- raderna ovan inte träffade):
drop policy if exists "Allow anon insert on review_clients" on review_clients;
drop policy if exists "Allow anon update on review_clients" on review_clients;
drop policy if exists "Allow anon select on review_clients" on review_clients;

drop policy if exists "Anon may read profile" on profile;
drop policy if exists "Anon full access to profile" on profile;

-- ROLLBACK (återinför den publika åtkomsten — gör det bara om sidorna går sönder)
-- create policy "Anon full access to audits" on audits for all to anon using (true) with check (true);
-- create policy "Anon full access to proposals" on proposals for all to anon using (true) with check (true);
-- create policy "Anon full access to review_clients" on review_clients for all to anon using (true) with check (true);
-- create policy "Anon may read profile" on profile for select to anon using (true);
