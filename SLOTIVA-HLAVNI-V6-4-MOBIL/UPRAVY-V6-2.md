# Slotiva V6.2 – opakované rezervace a interní oznámení

Tento balíček navazuje na V6.1. Zachovává společný týmový kalendář, volno a dovolené i rozdělení oprávnění majitel / zaměstnanec.

## Nové funkce

### Opakované rezervace
- Majitel vybere konkrétního zaměstnance (ne společný pohled) a otevře **Nová rezervace**.
- Pod údaji klienta vybere **Jednorázová**, **Každý týden** nebo **Každé dva týdny**.
- Série může mít 2–12 termínů. Kontroluje pracovní dobu, dovolené, už existující rezervace a obsazenost z Google Kalendáře, pokud je připojen.
- Při jediné kolizi se nic neuloží a zobrazí se termín konfliktu. DB zápis celé série probíhá v transakci.
- V detailu rezervace ze série může majitel zrušit její budoucí termíny; minulých rezervací se tato akce nedotkne.
- Série se zatím vytváří pouze ručně z administrace, nikoliv zákazníkem na veřejné stránce.

### Oznámení
- Nová položka **Oznámení** v levém menu. Jsou to oznámení **uvnitř aplikace**, bez externí SMS nebo e-mailové služby.
- Nová, potvrzená, přesunutá a zrušená rezervace a změny volna.
- Majitel dostává události týmu, zaměstnanec jen svoje. Oznámení mají oddělené příjemce a jedinečný identifikátor, aby se nevytvářely duplicity.
- Lze označit jedno nebo všechna oznámení jako přečtená.
- Počty v menu se obnovují při navigaci, po změně a po návratu do karty; na viditelné stránce také jednou za 60 sekund.

### Počítadlo rezervací
- Rušivé označení typu `1 !` je pryč.
- Čekající rezervace / Google synchronizace jsou označené jemným oranžovým zaobleným štítkem s tečkou a číslem.
- Pokud nic nevyžaduje pozornost, je zde neutrální počet nadcházejících rezervací; pokud nejsou ani ty, značka není vidět.
- Po najetí je vysvětlení stavu, dostupné je také pro čtečky obrazovky.

## Nasazení
1. Zálohujte aktuální databázi a ověřte fungování externí zálohy / persistentního disku. U Render Free bez Upstash hrozí ztráta dat po restartu.
2. Rozbalte ZIP. Do GitHub repozitáře nahrajte **obsah archivu**, aby `package.json` a `package-lock.json` byly přímo v kořeni.
3. Render: **Root Directory** prázdné, **Build Command** `npm ci --omit=dev`, **Start Command** `npm start`, Node 24.
4. Zachovejte stávající `SESSION_SECRET`, údaje Upstash, Google OAuth a další environment proměnné; nic z toho do GitHubu neukládejte.
5. Po nasazení otevřete Slotivu znovu a zkontrolujte společný kalendář, oznámení a nové opakování ve formuláři Nová rezervace.

Přidané databázové tabulky `booking_series` a `notifications` a sloupec `bookings.series_id` se vytvoří automaticky. Stávající záznamy se nesmažou.

## Ověření a známá omezení
- Prošla syntaktická kontrola všech zdrojových JavaScriptových souborů.
- Prošly samostatné testy SQLite migrace, idempotence notifikací, izolace uživatelů a rollbacku databázové transakce; prošly také původní testy společného kalendáře, volna a šifrované zálohy.
- Kompletní end-to-end test UI a Google Kalendáře neproběhl: závislosti npm se v testovacím prostředí nepodařilo dokončit instalovat. Před ostrým nasazením ověřte funkčnost na testovacím účtu.
- Notifikace jsou pouze v aplikaci (bez e-mailů/SMS). Nemají okamžitý WebSocket přenos; při otevřené kartě se aktualizují do cca 60 sekund.
- Opakované rezervace nevytvářejí hromadné e-maily zákazníkovi. Stav každého termínu se dá spravovat samostatně.
- Na Render Free neznamená „aktuální data po refreshi“ garantovanou trvalou databázi; bez zálohování/persistentního disku se mohou ztratit.
