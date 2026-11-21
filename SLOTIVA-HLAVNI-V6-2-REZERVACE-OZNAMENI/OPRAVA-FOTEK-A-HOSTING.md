# Slotiva – propojení fotek a nové hostování

## Opraveno v této verzi

1. Rezervační stránka používá logo firmy; pokud není nastavené, použije profilový obrázek majitele jako náhradní logo.
2. Logo, pozadí a firemní údaje jsou společné pro celý tým. Při přepnutí na kalendář barbera se změny propíšou do nastavení majitele, které načítá veřejná stránka.
3. Fotky zaměstnanců se načítají z týmových účtů a předávají se na veřejné rezervační stránce při výběru barbera.
4. Nahrané logo nebo pozadí se nyní uloží automaticky při výběru souboru (není potřeba další kliknutí na Uložit změny).

## Trvalé uchování fotek a rezervací

Fotky jsou zmenšené a uložené jako base64 v SQLite databázi (`DATA_DIR/slotiva.db`). Pokud je server na hostingu s dočasným diskem (Render Free), ztratí se společně s databází.

Na hostingu s persistent volume nastavte proměnnou `DATA_DIR=/data` a připojte trvalý disk právě do `/data`. Nastavte pevný `SESSION_SECRET` (alespoň 32 znaků) a pravidelně zálohujte databázi.

Pro hlavní provoz doporučujeme placený hosting s trvalým diskem a zálohami. Alternativa: Northflank s persistent volume, Fly.io s volume, VPS Hetzner nebo Render placená služba s diskem.

## SMS ověřování

SMS funkce není služba hostingu, ale samostatná integrace Twilio Verify. Projekt ji má připravenou: nastavte `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` a `TWILIO_VERIFY_SERVICE_SID` v Environment. K odesílání SMS potřebujete správně nastavený a aktivní Twilio účet; běžně jde o placenou službu.

## Test po nasazení

- Nahrajte logo podniku nebo profilovou fotografii majitele, otevřete veřejnou rezervaci v anonymním okně.
- Zvolte kalendář zaměstnance, upravte pozadí a ověřte, že se změní i na veřejné stránce.
- Nahrajte fotku barbera ve Správě týmu, otevřete výběr barbera na veřejné rezervační stránce.
- Proveďte restart služby a ověřte, že účet, logo i fotky zůstaly (vyžaduje trvalý disk / úspěšně nastavenou externí zálohu).

**Poznámka:** Je to cílená oprava propojení dat a UX, nikoli migrace SQLite na PostgreSQL ani testovací SMS odeslání. Plná funkčnost po nasazení závisí na nastavení hostingu a Twilio.
