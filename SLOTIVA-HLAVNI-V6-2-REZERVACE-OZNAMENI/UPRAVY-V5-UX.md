# Slotiva V5 – úpravy ovládání

Tato verze navazuje na V4 (majitel / zaměstnanci). Zachovává její API a databázovou strukturu.

## Co se změnilo

- Správa nastavení firmy: jednotlivé části se dají rozbalit a sbalit. Výchozí rozbalené části jsou údaje firmy a vzhled. Rozbalenost si aplikace zachovává při ukládání v rámci otevřené stránky.
- Nahrávání fotek: vlastní tlačítko místo výchozího file inputu, náhled, úprava výřezu před použitím, zoom a posun myší/prstem. Čtvercový ořez pro logo/profil, široký 16:9 pro pozadí. Výsledný výřez se komprimuje do WebP a ukládá do existující databáze.
- Logo a pozadí podniku se ukládá automaticky po potvrzení výřezu, mají i tlačítko Odebrat. Profilová fotka majitele se ukládá samostatně.
- Fotografie zaměstnanců mohou měnit jak majitel ve správě týmu, tak zaměstnanec ve svém profilu. Pro zaměstnance zůstává nutné stisknout Uložit zaměstnance/Uložit svůj profil.
- Barva pozadí používá kompaktní barevný čtvereček.
- Integrace a web: technické kódy pro vložení jsou schované v rozbalovacím panelu „Rezervace na vlastním webu · pokročilé“.
- Správa týmu: karty zaměstnanců jsou sbalovací. Přepínání kalendářů je v horní liště.
- Společný kalendář je pojmenovaný „Společný kalendář · celý tým“; v metadatech se nevrací `null` jako jméno kalendáře; boční lišta ignoruje prázdné volitelné položky.
- Aktualizace cache service workeru, aby prohlížeč načetl V5.

## Instalace na Render

1. Rozbalit ZIP a nahrát **obsah** ZIPu do kořene GitHub repozitáře, nikoliv ZIP ani vnořenou složku.
2. Root Directory: prázdné (pokud package.json leží v kořeni).
3. Build Command: `npm ci --omit=dev`, Start Command: `npm start`.
4. Zachovat Environment proměnné hlavní Slotivy (`SESSION_SECRET`, `PUBLIC_BASE_URL` a nastavení úložiště).
5. Po deployi obnovit stránku. Pokud je stále stará, použít obnovení bez cache nebo zavřít a znovu otevřít nainstalovanou PWA.

## Upozornění

V5 je změna UI, ne migrace databáze. SQLite na Render Free pořád potřebuje vyřešit trvalé úložiště (například ověřené externí zálohy).
Neproběhl integrační test na Renderu. Syntaktická kontrola JS proběhla; npm test se nepodařilo provést kompletně, protože v lokálním prostředí jsou neúplné nainstalované balíčky (`express`, `luxon`).
