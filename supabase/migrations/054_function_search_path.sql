-- Säkerhetsfixar från Supabase advisor.
--
-- 1. Fast search_path på de tre triggerfunktionerna (039, 040). Utan den
--    körs de med anroparens search_path, så ett objekt med samma namn i ett
--    annat schema skulle kunna användas i stället för det i public. De är
--    inte security definer och kropparna hänvisar till tabeller utan schema,
--    så 'public' (inte '') behåller exakt samma beteende.
--
-- 2. next_invoice_number(uuid) går inte längre att anropa från klienten.
--    Ingen kod anropar den i dag (inget .rpc() i app/ eller lib/), och
--    funktionen kräver p_user = auth.uid(), så servern med service_role kan
--    inte heller använda den direkt. Den är tänkt att anropas inifrån en
--    framtida issue_invoice() (039, steg A), och det fungerar utan grant
--    eftersom anropet då sker som funktionens ägare. service_role behåller
--    sin rätt.
--
-- Säker att köra före eller efter koden. Ändrar inga data.

alter function public.invoices_guard_issued() set search_path = public;
alter function public.agreement_templates_guard() set search_path = public;
alter function public.agreements_guard() set search_path = public;

revoke execute on function public.next_invoice_number(uuid) from authenticated;
revoke execute on function public.next_invoice_number(uuid) from public;

-- ROLLBACK
-- alter function public.invoices_guard_issued() reset search_path;
-- alter function public.agreement_templates_guard() reset search_path;
-- alter function public.agreements_guard() reset search_path;
-- grant execute on function public.next_invoice_number(uuid) to authenticated;
