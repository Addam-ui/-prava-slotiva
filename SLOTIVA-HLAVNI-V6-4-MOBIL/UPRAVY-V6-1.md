# Slotiva V6.1 – čitelný kalendář + volno a dovolené

Navazuje přímo na **SLOTIVA-HLAVNI-V6-FAZE-1**, nikoliv na demonstrační repozitář. V6.1 zachovává dosavadní dashboard, týmové účty, služby i rezervace.

## Oprava denního týmového kalendáře

- Časový sloupec má na PC 76 px; při vodorovném posouvání zůstává vlevo.
- Hlavička a rezervace používají shodné CSS grid sloupce.
- Denní rezervace mají větší vertikální rozestupy (72 px/h místo 52 px/h). Krátké rezervace zobrazují jen jméno, zbytek je v titulku/detailu.
- Na mobilu se ve společném pohledu defaultně ukáže jeden barber, mezi zaměstnanci se přepíná pomocí tlačítek. Tlačítko „Všichni“ zůstává k dispozici s vodorovným posouváním.
- Opravena i šířka časového sloupce v týdenním pohledu.

## Nově: Volno a dovolené

- V menu je **Volno a dovolené** pro majitele i zaměstnance.
- Majitel může vložit schválené volno, dovolenou nebo přestávku konkrétnímu zaměstnanci.
- Zaměstnanec může poslat žádost o volno; majitel ji může schválit nebo zamítnout. Zaměstnanec může stáhnout vlastní nevyřízenou žádost.
- Schválené volno blokuje dostupné termíny ve veřejném rezervačním formuláři i v administraci. Žádosti čekající na schválení dostupnost **neblokují**.
- Schválené celodenní volno se promítá do hlavičky denního kalendáře a do týdenního pohledu. Částečné volno se zobrazuje v časovém rastru.
- Při schvalování nebo vytvoření schváleného volna s kolidující rezervací aplikace vrací chybu; nejprve je třeba rezervaci přeložit nebo vyřešit. Systém nic automaticky nemaže.
- Oprávnění se ověřují **na serveru**, nikoliv pouze skrytím tlačítek.

## Změny dat

Při spuštění se vytvoří tabulka `staff_time_off`. Migrace **nemaže ani nemění** existující rezervace nebo uživatelské účty. Přesně uchovává datumy v UTC s vazbou na jednotlivé zaměstnance a bezpečným oddělením firmních účtů.

## Nasazení

1. Před nasazením zálohujte stávající SQLite databázi a ověřte, že externí záloha (Upstash, pokud ji používáte) je aktuální.
2. Rozbalte ZIP a do hlavního GitHub repozitáře nahrajte **obsah** kořenové složky, kde je `package.json`, ne samostatný ZIP ani další vnořenou složku.
3. Render: Node.js 24; Root Directory prázdné, **pokud** je `package.json` v kořeni; Build Command `npm ci --omit=dev`; Start Command `npm start`.
4. Zachovejte původní proměnné `SESSION_SECRET`, `PUBLIC_BASE_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` a `UPSTASH_SNAPSHOT_KEY` (pokud je máte). Nezakládejte nové hodnoty, které by odpojily zálohy.
5. Po nasazení: ověřte společný kalendář Den/Týden, mobilní přepínač barberů a vytvoření žádosti o volno u zaměstnance, schválení majitelem a nepřístupnost dotčeného času na veřejné rezervační stránce.

## Co zatím NENÍ implementováno

- Opakované rezervace, interní/e-mailové notifikace a živý editor vzhledu jsou plánované další fáze.
- Nedochází k migraci na PostgreSQL. Pro Render Free je stále nutná správně funkční externí záloha; šifrovaný snapshot není plnohodnotná transakční databáze.
- Přímá kontrola kolize s externími událostmi Google při **zakládání volna** není implementována. S běžnými rezervacemi Slotivy se kolize kontrolují.
- Kompletní integrační a vizuální test na Renderu nebyl proveden; místní instalace npm balíčků v prostředí nedoběhla.

## Provedené testy

- `node --test test/calendar-roster.test.js test/durable.test.js test/time-off-schema.test.js` – 6 úspěšných testů.
- `node --check` – všechny JS soubory.
- Kontrola integrity ZIPu.

