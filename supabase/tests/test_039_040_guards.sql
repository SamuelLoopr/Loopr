-- Prövar skydden i migration 039 och 040 utan att lämna något efter sig.
--
-- KÖR I SUPABASE SQL EDITOR EFTER att 039, 040 och 041 är körda.
--
-- Hela blocket rullas tillbaka av ett avslutande raise exception. Inga rader
-- blir kvar, ingen nummerserie förbrukas, ingenting i produktionsdata ändras.
-- Filen innehåller inget commit — kontrollera gärna själv.
--
-- Resultatet skrivs BÅDE som NOTICE under körningen och i det avslutande
-- felmeddelandet, eftersom vissa klienter döljer NOTICE.
--
-- ── VARFÖR RADRÄKNING OCH INTE BARA undantag ────────────────────────────────
-- Under RLS misslyckas inte ett UPDATE eller DELETE som ingen policy tillåter.
-- Det matchar noll rader och svarar UTAN fel. Ett test som bara fångar undantag
-- rapporterar därför "skyddet saknas" för precis de fall där det fungerar.
-- Varje skrivning som rollen authenticated gör mäts därför med GET DIAGNOSTICS:
-- noll rader ÄR ett godkänt utfall, lika giltigt som ett uttryckligt fel.
--
-- ── OM ROLLEN ───────────────────────────────────────────────────────────────
-- RLS gäller inte superuser. Blocket växlar till rollen authenticated med en
-- jwt-claim för testanvändaren. Går växlingen inte igenom rapporteras RLS-delen
-- som MISSLYCKAD, inte som godkänd — läs den raden särskilt.

do $$
declare
  v_user      uuid;
  v_role      text := current_user;
  v_client    uuid;
  v_invoice   uuid;
  v_agreement uuid;
  v_template  uuid;
  ok          int := 0;
  nok         int := 0;
  res         text := '';
  n           int;
  nn          text;
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then
    raise exception 'Hittade ingen användare i auth.users — testet behöver en för att kunna sätta user_id.';
  end if;
  res := res || E'\n--- Testanvändare ' || v_user || ', roll ' || v_role || ' ---';
  raise notice '--- Testanvändare %, roll % ---', v_user, v_role;

  -- ══ Kolumner som kan fälla uppsättningen ════════════════════════════════
  -- Om agent_id eller description är NOT NULL måste de sättas nedan, annars
  -- misslyckas testet av fel skäl och alla efterföljande rader blir
  -- meningslösa.
  for nn in
    select column_name || ' = ' || is_nullable
         || case when is_nullable = 'NO' and column_name in ('agent_id','description')
                 then '  <-- NOT NULL: uppsättningen nedan måste sätta den, annars misslyckas testet av fel skäl'
                 else '' end
      from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices'
       and column_name in ('agent_id','description','client_name','amount')
     order by column_name
  loop
    res := res || E'\nSCHEMA   invoices.' || nn;
    raise notice 'SCHEMA   invoices.%', nn;
  end loop;

  -- Avbryt hellre direkt än att låta uppsättningen falla på en NOT NULL och
  -- göra alla efterföljande rader meningslösa.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'invoices'
       and column_name = 'agent_id' and is_nullable = 'NO'
  ) then
    raise exception 'invoices.agent_id är NOT NULL — lägg till agent_id i INSERT-satsen nedan innan testet körs.';
  end if;

  -- ══ Uppsättning ══════════════════════════════════════════════════════════
  insert into billing_clients (user_id, company_name)
    values (v_user, 'TESTKUND rullas tillbaka') returning id into v_client;

  insert into invoices (
    user_id, status, client_name, amount, description, invoice_number,
    invoice_date, issued_at, seller_snapshot, buyer_snapshot, billing_client_id, is_recurring
  ) values (
    v_user, 'sent', 'TESTKUND', 1000, 'Testrad', 'TEST-9999',
    current_date, now(), '{"seller":"test"}'::jsonb, '{"buyer":"test"}'::jsonb, v_client, false
  ) returning id into v_invoice;

  insert into agreement_templates (user_id, kind, version, title, body, lawyer_reviewed_at)
    values (v_user, 'service', 999, 'TESTMALL', 'Brödtext.', now())
    returning id into v_template;

  insert into agreements (
    user_id, billing_client_id, rendered_title, rendered_body, content_hash, status, sent_at
  ) values (
    v_user, v_client, 'TESTAVTAL', 'Avtalstext.', 'deadbeef', 'sent', now()
  ) returning id into v_agreement;

  -- Räknarraden, så den går att pröva nedan.
  insert into invoice_counters (user_id, prefix, next_number)
    values (v_user, 'TEST-', 42) on conflict (user_id) do nothing;

  res := res || E'\nUppsättning klar: utfärdad faktura, skickat avtal, granskad mall, räknarrad';
  raise notice 'Uppsättning klar';

  -- ══ (a) Utfärdad faktura — triggern, gäller alla roller ══════════════════
  res := res || E'\n\n=== (a) Utfärdad faktura (trigger) ===';
  raise notice '=== (a) Utfärdad faktura (trigger) ===';

  begin
    delete from invoices where id = v_invoice;
    nok := nok + 1; res := res || E'\nFEL      radering gick igenom';
    raise notice 'FEL      radering gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       radering avvisad: ' || left(sqlerrm, 70);
    raise notice 'OK       radering avvisad: %', left(sqlerrm, 70);
  end;

  begin
    update invoices set amount = 5000 where id = v_invoice;
    nok := nok + 1; res := res || E'\nFEL      beloppsändring gick igenom';
    raise notice 'FEL      beloppsändring gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       beloppsändring avvisad';
    raise notice 'OK       beloppsändring avvisad: %', left(sqlerrm, 70);
  end;

  begin
    update invoices set status = 'draft' where id = v_invoice;
    nok := nok + 1; res := res || E'\nFEL      återgång till utkast gick igenom';
    raise notice 'FEL      återgång till utkast gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       återgång till utkast avvisad';
    raise notice 'OK       återgång till utkast avvisad: %', left(sqlerrm, 70);
  end;

  begin
    update invoices set billing_client_id = null where id = v_invoice;
    nok := nok + 1; res := res || E'\nFEL      byte av motpart gick igenom';
    raise notice 'FEL      byte av motpart gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       byte av motpart avvisad';
    raise notice 'OK       byte av motpart avvisad';
  end;

  -- Ska lyckas. Ett skydd som låser för hårt är lika trasigt som inget skydd.
  begin
    update invoices set status = 'paid', paid_at = now() where id = v_invoice;
    ok := ok + 1; res := res || E'\nOK       markera betald gick igenom (ska den)';
    raise notice 'OK       markera betald gick igenom (ska den)';
  exception when others then
    nok := nok + 1; res := res || E'\nFEL      markera betald avvisades — MRR vore omöjlig: ' || left(sqlerrm, 60);
    raise notice 'FEL      markera betald avvisades: %', left(sqlerrm, 70);
  end;

  -- ══ (c) Skickat avtal och granskad mall ══════════════════════════════════
  res := res || E'\n\n=== (c) Skickat avtal och granskad mall (trigger) ===';
  raise notice '=== (c) Skickat avtal och granskad mall ===';

  begin
    delete from agreements where id = v_agreement;
    nok := nok + 1; res := res || E'\nFEL      radering av avtal gick igenom';
    raise notice 'FEL      radering av avtal gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       radering av avtal avvisad';
    raise notice 'OK       radering av avtal avvisad: %', left(sqlerrm, 70);
  end;

  begin
    update agreements set status = 'draft' where id = v_agreement;
    nok := nok + 1; res := res || E'\nFEL      avtal till utkast gick igenom';
    raise notice 'FEL      avtal till utkast gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       avtal till utkast avvisad';
    raise notice 'OK       avtal till utkast avvisad';
  end;

  begin
    update agreements set rendered_body = 'Ändrad text.' where id = v_agreement;
    nok := nok + 1; res := res || E'\nFEL      textändring gick igenom';
    raise notice 'FEL      textändring gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       textändring avvisad';
    raise notice 'OK       textändring avvisad';
  end;

  begin
    update agreements set sent_at = now() - interval '10 days' where id = v_agreement;
    nok := nok + 1; res := res || E'\nFEL      flyttad sent_at gick igenom';
    raise notice 'FEL      flyttad sent_at gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       flyttad sent_at avvisad';
    raise notice 'OK       flyttad sent_at avvisad';
  end;

  begin
    update agreement_templates set body = 'Omskriven.' where id = v_template;
    nok := nok + 1; res := res || E'\nFEL      ändring av granskad mall gick igenom';
    raise notice 'FEL      ändring av granskad mall gick igenom';
  exception when others then
    ok := ok + 1; res := res || E'\nOK       ändring av granskad mall avvisad';
    raise notice 'OK       ändring av granskad mall avvisad';
  end;

  begin
    update agreement_templates set lawyer_reviewed_note = 'Anteckning.' where id = v_template;
    ok := ok + 1; res := res || E'\nOK       anteckning om granskning fick ändras (ska den)';
    raise notice 'OK       anteckning om granskning fick ändras (ska den)';
  exception when others then
    nok := nok + 1; res := res || E'\nFEL      anteckning avvisades: ' || left(sqlerrm, 60);
    raise notice 'FEL      anteckning avvisades';
  end;

  -- Granskad mall får inte raderas. Försvinner versionen går det inte längre
  -- att visa vad juristens granskning faktiskt gällde.
  begin
    delete from agreement_templates where id = v_template;
    get diagnostics n = row_count;
    if n = 0 then
      ok := ok + 1; res := res || E'\nOK       granskad mall kunde inte raderas (0 rader)';
      raise notice 'OK       granskad mall kunde inte raderas (0 rader)';
    else
      nok := nok + 1; res := res || E'\nFEL      granskad mall raderades (' || n || ' rad)';
      raise notice 'FEL      granskad mall raderades (% rad)', n;
    end if;
  exception when others then
    ok := ok + 1; res := res || E'\nOK       radering av granskad mall avvisad: ' || left(sqlerrm, 50);
    raise notice 'OK       radering av granskad mall avvisad: %', left(sqlerrm, 55);
  end;

  -- ══ Referensskydd: kund med faktura ═════════════════════════════════════
  res := res || E'\n\n=== Referensskydd (on delete restrict) ===';
  raise notice '=== Referensskydd (on delete restrict) ===';

  -- Kunden har både en utfärdad faktura och ett skickat avtal som pekar på sig,
  -- och båda främmande nycklarna är restrict. Vilken av dem som fäller
  -- raderingen framgår av felmeddelandet — poängen är att den fälls.
  begin
    delete from billing_clients where id = v_client;
    get diagnostics n = row_count;
    if n = 0 then
      ok := ok + 1; res := res || E'\nOK       kund med faktura kunde inte raderas (0 rader)';
      raise notice 'OK       kund med faktura kunde inte raderas (0 rader)';
    else
      nok := nok + 1; res := res || E'\nFEL      kund med faktura raderades — fakturan tappade sin motpart';
      raise notice 'FEL      kund med faktura raderades (% rad)', n;
    end if;
  exception when others then
    ok := ok + 1; res := res || E'\nOK       radering av kund avvisad: ' || left(sqlerrm, 60);
    raise notice 'OK       radering av kund avvisad: %', left(sqlerrm, 65);
  end;

  -- ══ (b) RLS och kolumnrättigheter som rollen authenticated ═══════════════
  res := res || E'\n\n=== (b) RLS som authenticated (0 rader = godkänt) ===';
  raise notice '=== (b) RLS som authenticated (0 rader = godkänt) ===';
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    -- Fabricerad acceptans: WITH CHECK på INSERT kastar fel, till skillnad
    -- från UPDATE och DELETE.
    begin
      insert into agreement_acceptances (user_id, agreement_id, token_hash, expires_at, used_at, accepted_ip)
        values (v_user, v_agreement, 'testhash1', now() + interval '7 days', now(), '1.2.3.4');
      nok := nok + 1; res := res || E'\nFEL      fabricerad acceptans gick igenom';
      raise notice 'FEL      fabricerad acceptans gick igenom';
    exception when others then
      ok := ok + 1; res := res || E'\nOK       fabricerad acceptans avvisad: ' || left(sqlerrm, 55);
      raise notice 'OK       fabricerad acceptans avvisad: %', left(sqlerrm, 60);
    end;

    begin
      insert into agreement_acceptances (user_id, agreement_id, token_hash, expires_at)
        values (v_user, v_agreement, 'testhash2', now() + interval '7 days');
      ok := ok + 1; res := res || E'\nOK       oanvänd token fick skapas (ska den)';
      raise notice 'OK       oanvänd token fick skapas (ska den)';
    exception when others then
      nok := nok + 1; res := res || E'\nFEL      oanvänd token avvisades: ' || left(sqlerrm, 55);
      raise notice 'FEL      oanvänd token avvisades: %', left(sqlerrm, 60);
    end;

    -- Härifrån räknas rader. Ingen update-policy finns, så RLS filtrerar bort
    -- raden och noll rader ändras — utan fel.
    begin
      update agreement_acceptances set used_at = now() where token_hash = 'testhash2';
      get diagnostics n = row_count;
      if n = 0 then
        ok := ok + 1; res := res || E'\nOK       ägaren kunde inte fylla used_at (0 rader)';
        raise notice 'OK       ägaren kunde inte fylla used_at (0 rader)';
      else
        nok := nok + 1; res := res || E'\nFEL      ägaren fyllde used_at på ' || n || ' rad(er)';
        raise notice 'FEL      ägaren fyllde used_at på % rad(er)', n;
      end if;
    exception when others then
      ok := ok + 1; res := res || E'\nOK       used_at avvisad med fel: ' || left(sqlerrm, 55);
      raise notice 'OK       used_at avvisad med fel: %', left(sqlerrm, 60);
    end;

    begin
      update invoice_counters set next_number = 500 where user_id = v_user;
      get diagnostics n = row_count;
      nok := nok + 1; res := res || E'\nFEL      next_number skrevs på ' || n || ' rad(er)';
      raise notice 'FEL      next_number skrevs på % rad(er)', n;
    exception when others then
      ok := ok + 1; res := res || E'\nOK       next_number nekad på kolumnnivå: ' || left(sqlerrm, 50);
      raise notice 'OK       next_number nekad på kolumnnivå: %', left(sqlerrm, 55);
    end;

    -- Prefixet SKA gå att ändra — det är det enda ägaren får skriva.
    begin
      update invoice_counters set prefix = '2027-' where user_id = v_user;
      get diagnostics n = row_count;
      if n = 1 then
        ok := ok + 1; res := res || E'\nOK       prefix fick ändras (ska det)';
        raise notice 'OK       prefix fick ändras (ska det)';
      else
        nok := nok + 1; res := res || E'\nFEL      prefix ändrade ' || n || ' rader, väntade 1';
        raise notice 'FEL      prefix ändrade % rader, väntade 1', n;
      end if;
    exception when others then
      nok := nok + 1; res := res || E'\nFEL      prefix avvisades: ' || left(sqlerrm, 55);
      raise notice 'FEL      prefix avvisades: %', left(sqlerrm, 60);
    end;

    -- Räknarraden får inte raderas, annars börjar serien om på 1.
    begin
      delete from invoice_counters where user_id = v_user;
      get diagnostics n = row_count;
      if n = 0 then
        ok := ok + 1; res := res || E'\nOK       räknarraden kunde inte raderas (0 rader)';
        raise notice 'OK       räknarraden kunde inte raderas (0 rader)';
      else
        nok := nok + 1; res := res || E'\nFEL      ägaren raderade räknarraden — serien kan börja om på 1';
        raise notice 'FEL      ägaren raderade räknarraden';
      end if;
    exception when others then
      ok := ok + 1; res := res || E'\nOK       radering av räknarrad nekad: ' || left(sqlerrm, 50);
      raise notice 'OK       radering av räknarrad nekad: %', left(sqlerrm, 55);
    end;

    execute 'set local role ' || quote_ident(v_role);
  exception when others then
    execute 'set local role ' || quote_ident(v_role);
    nok := nok + 1;
    res := res || E'\nFEL      kunde inte växla till authenticated — (b) är INTE prövat: ' || left(sqlerrm, 60);
    raise notice 'FEL      kunde inte växla till authenticated — (b) är INTE prövat: %', left(sqlerrm, 70);
  end;

  res := res || E'\n\n  ' || ok || ' godkända, ' || nok || ' misslyckade';
  raise notice ' ';
  raise notice '  % godkända, % misslyckade', ok, nok;

  -- Allt ovan rullas tillbaka av detta. Felet är avsiktligt.
  raise exception E'TESTET KLART — allt rullas tillbaka med avsikt.\n%', res;
end $$;
