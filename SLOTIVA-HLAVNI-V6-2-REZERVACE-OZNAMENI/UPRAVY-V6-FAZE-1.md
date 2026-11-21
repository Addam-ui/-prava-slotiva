# Slotiva V6 – fáze 0 + 1 (hlavní projekt)

Vychází ze zdrojového balíčku `SLOTIVA-HLAVNI-V5-UX.zip`. Nenahrávejte V6 do demo repozitáře.

## Co je nového

- **Současný dashboard zůstal zachovaný.** V týmovém režimu už nenabízí tlačítko „Nová rezervace“, které by na společném rozsahu narazilo na odmítnutí API. Nabízí „Kalendář týmu“.
- **Kalendář:** přepínač **Den / Týden**; pro majitele s týmem je výchozí denní pohled. Každý zaměstnanec má vlastní sloupec a pracovní dobu. Ve společném pohledu lze v kalendáři rychle vybrat „Všichni“ nebo konkrétního zaměstnance. Na mobilu se sloupce dají vodorovně posouvat nebo vyfiltrovat na jednoho zaměstnance.
- **Oprávnění:** trasa `/api/app/calendar` dál používá stávající serverový `calendarScope`. Zaměstnanec dostává jen svůj rozsah; přepínač jiných zaměstnanců je pouze pro majitele.
- **Staré rezervace majitele:** pokud existují, API pro ně zobrazí také sloupec majitele. Pokud neexistují, společný kalendář zbytečný sloupec majitele neukazuje.
- **Vlastní pracovní doba:** API vrací `workingHours` pro každého viditelného zaměstnance a zvlášť `staffId` u událostí z Google.
- **Trvalé ukládání:** původní volitelná šifrovaná Upstash záloha SQLite zůstala zachovaná. Nový přepínač `REQUIRE_UPSTASH_BACKUP=true` odmítne start bez nakonfigurované zálohy a ověří spojení pomocí `PING`. Na dashboardu majitel vidí varování, pokud externí záloha není nastavená nebo selhala.
- Aktualizovaná PWA cache a verze frontendových souborů pro nové nasazení.

## Nasazení hlavní verze

1. Zálohujte současnou databázi **dřív, než budete nasazovat**. Nový ZIP žádnou databázi neobsahuje a účet nevytváří pomocí natvrdo zakódovaného hesla.
2. Rozbalte ZIP a nahrajte **obsah** složky do správné větve hlavního GitHub repozitáře, ve které běží hlavní Slotiva.
3. Pokud je `package.json` přímo v kořeni repozitáře, v Renderu nechte **Root Directory prázdné**. Jinak do Root Directory napište skutečnou cestu ke složce se souborem `package.json`.
4. Build Command `npm ci --omit=dev`; Start Command `npm start`; Node.js 24.
5. Zachovejte stejné `SESSION_SECRET`, `UPSTASH_SNAPSHOT_KEY`, `UPSTASH_REDIS_REST_URL` a `UPSTASH_REDIS_REST_TOKEN` jako u stávající instalace, jestli už vzdálenou zálohu používáte. Změna klíče nebo tajemství způsobí neobnovitelnost starého snapshotu.
6. Na Render Free vytvořte nejprve vlastní Upstash Redis a do Environment vložte URL a token. Až potom nastavte `REQUIRE_UPSTASH_BACKUP=true`. Při chybě spojení server z bezpečnostních důvodů nenastartuje.
7. Po deployi otevřete **Kalendář**, ověřte sloupce zaměstnanců, přepnutí Den/Týden a přihlaste se také jako zaměstnanec k ověření přístupových práv.

## Co zatím není dokončené

- V6 zatím **nepřechází na PostgreSQL**. Šifrovaný snapshot je obnova souboru pro jednu instanci, **není to transakční úložiště**. Změny mezi posledním uložením a výpadkem se mohou ztratit, selhání externího úložiště není vyřešené frontou offline zápisů. Při ostrém provozu zvolte trvalý disk s offsite zálohami nebo plnohodnotnou migraci na PostgreSQL.
- Správa volna, dovolené, opakované rezervace, notifikace a editor vzhledu s živým náhledem jsou **další fáze**, nikoliv součást tohoto ZIPu.
- Denní pohled neposkytuje drag & drop. Rezervace lze otevřít kliknutím, další změny probíhají přes existující detail.
- SMTP e-maily na Render Free mohou být omezené; přechod na HTTPS poskytovatele e-mailů bude další samostatný krok.

## Ověření

- `node --test test/calendar-roster.test.js` – testy sestavení týmového rozsahu pro majitele, zachování historických rezervací a samostatného zaměstnance.
- `node --check` na všech JS souborech.
- Kompletní integrační test proti Express serveru a vizuální test v prohlížeči zatím nebyl dokončen (v testovacím prostředí se nepodařilo stáhnout npm závislosti a otevřít lokální stránku v Chromium). Nasazujte nejprve na testovací větev/službu a **nepřepisujte jedinou kopii živé databáze**.
