# Slotiva V4 – společný kalendář a role firmy

Tato verze navazuje na hlavní Slotivu V3 (nikoli demo repozitář).

## Role a chování

| Funkce | Majitel firmy | Zaměstnanec |
|---|---|---|
| Společný kalendář všech členů týmu | Ano, výchozí zobrazení „Všichni“ | Ne |
| Rychlé přepnutí kalendáře | Ano, přepínač trvale v horní liště | Ne |
| Rezervace a zákazníci | Celý tým nebo vybraný barber | Jen vlastní |
| Potvrzení nových rezervací | Ano | Ano, jen vlastní |
| Zrušení nebo označení nepříchodu | Ano | Ano, jen vlastní |
| Ruční vytváření, přesun a editace rezervací | Ano, po výběru barbera | Ne |
| Firemní údaje, služby, vzhled, Google a vložení na web | Ano | Ne |
| Přidávání/deaktivace a hesla členů týmu | Ano | Ne |
| Vlastní fotografie, jméno, e-mail a heslo | Ano | Ano |

U **týmových veřejných rezervací** se nově používá stav `pending` („Čeká na potvrzení“). Termín se ihned rezervuje proti dvojímu obsazení. Když barber v Rezervacích/kalendáři klikne „Potvrdit rezervaci“, stav se změní na `confirmed`, spustí se případné zapsání do Google Kalendáře a pokud je nastavený SMTP, odešle se e-mail zákazníkovi. Veřejné stránky bez zaměstnanců zůstávají s přímým potvrzením.

## Jak nasadit

1. **Nejdřív zálohuj databázi hlavní Slotivy.** V ZIPu nejsou existující účty ani skutečné rezervace. Nikdy nemaž aktivní databázi jen kvůli upgradu.
2. Rozbal soubor a nahraj jeho **jednotlivé soubory a složky přímo do kořene** GitHub repozitáře (tam, kde jsou `package.json` a `package-lock.json`).
3. Na hostingu Root Directory nech prázdné, pokud je `package.json` v kořeni. Build Command `npm ci --omit=dev`, Start Command `npm start`.
4. Nastav `PUBLIC_BASE_URL` na veřejnou HTTPS adresu Slotivy. Nastav pevný `SESSION_SECRET` a trvalé `DATA_DIR` s diskem nebo správně nakonfigurované externí zálohování.
5. V účtu majitele otevři **Správa týmu** a nastav e-maily a hesla zaměstnanců. V horní liště vyzkoušej „Všichni“, „Kikin“ a „Honza“.
6. Přihlas se zaměstnaneckým účtem v anonymním okně: dostupné musí být jen Kalendář, Rezervace a Můj profil.
7. Ověř zcela novou rezervaci z veřejné stránky: po vytvoření má `pending`, ve správě zaměstnance se zobrazí tlačítko „Potvrdit“, po potvrzení `confirmed`.

## Ověření a omezení

- Provedena **syntaktická kontrola všech JS souborů**, nikoli kompletní integrační test v běžícím Node/Express serveru. Instalace npm závislostí v pracovním prostředí nedokončila stažení; reálné HTTP/OAuth/SMS testy nebyly provedeny.
- Původní backend je stále **SQLite**. Render Free bez trvalého disku či externí zálohy není bezpečné úložiště pro ostré rezervace. V3 obsahuje volitelný šifrovaný Upstash snapshot, který **není náhradou plnohodnotné databáze**.
- SMS kód vyžaduje nakonfigurovaný **Twilio Verify** (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`). Žádná běžná hostingová platforma neposílá SMS sama od sebe.
- Fotky zůstávají uložené jako zmenšené base64 v databázi; pro jejich zachování je nutné trvalé uložení databáze.
- Bez e-mailového SMTP se zákazníkovi při potvrzení neodešle e-mail; stav rezervace v aplikaci se přesto změní.

## Doporučený kontrolní scénář před ostrým provozem

Majitel: společný kalendář → přepnutí Kikin/Honza → rezervace zákazníka pro Kikina → potvrzení Kikinem → ověřit, že Honza nevidí Kikinovu rezervaci → změna fotky Kikina → refresh veřejné rezervační stránky → restart serveru → ověřit, že fotografie a rezervace zůstaly.

Další nasazení na jiný hosting nezapíná automaticky SMS ani Google OAuth, jejich klíče a callback adresy je třeba nastavit zvlášť.
