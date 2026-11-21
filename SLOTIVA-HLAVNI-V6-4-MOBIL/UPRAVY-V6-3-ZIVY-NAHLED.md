# Slotiva V6.3 – skutečný živý náhled rezervační stránky

Navazuje na hlavní Slotivu V6.2. Zachovává opakované rezervace, oznámení, tým, kalendář, volno i dovolené.

## Co je nové

- **Nastavení firmy** má vpravo živý náhled **skutečné veřejné rezervační stránky**, nikoli ilustrační maketu.
- Náhled se okamžitě aktualizuje při úpravě názvu, podnadpisu, popisu, adresy, kontaktů, hlavní barvy, barvy pozadí, loga a fotografie na pozadí.
- Přepínač **Mobil / Počítač** mění rozměry náhledu. Na užší obrazovce se panel otevírá tlačítkem **Zobrazit živý náhled**.
- Logo a pozadí se po výběru a oříznutí **neukládají automaticky**. Změny veřejné stránky se uloží až po stisknutí **Uložit a zveřejnit** (v náhledu nebo ve spodní liště).
- V náhledu lze prohlédnout výběr zaměstnance a služby, ale **nelze odeslat rezervaci**. Režim náhledu posílá pouze změny vzhledu, nikdy automatické úpravy veřejné databáze.
- Po stisknutí „Zahodit“ se náhled vrátí k naposledy uložené podobě.
- Změna veřejného slugu účtu znovu načte náhled na nové adrese.

## Jak ověřit funkčnost po nasazení

1. Přihlaste se jako **majitel**, otevřete **Nastavení firmy**.
2. Vpravo se má objevit **Živý náhled stránky**; na mobilu klepněte na **Zobrazit živý náhled**.
3. V části **Jak se ukazujete klientům** změňte dočasně název. Nový název se musí **ihned** objevit uvnitř náhledu.
4. Vyberte novou **hlavní barvu**, **barvu pozadí** nebo **logo**. Změna se musí ihned ukázat bez uložení.
5. Otevřete rezervační stránku firmy v **jiné kartě**: dokud nekliknete na **Uložit a zveřejnit**, zůstane tam stará uložená verze.
6. Zkontrolujte přepínání **Mobil / Počítač**, pak klikněte na **Uložit a zveřejnit**. Nyní se změny musí objevit i na veřejném webu.
7. Ověřte, že výběr zaměstnance i služby na veřejné stránce nadále funguje.

## Nasazení

Rozbalte ZIP. Nahrajte obsah **přímo do kořene** GitHub repozitáře hlavní Slotivy.

- **Root Directory:** prázdné, pokud se `package.json` nachází v kořeni repozitáře
- **Build Command:** `npm ci --omit=dev`
- **Start Command:** `npm start`
- **Node.js:** 24.x podle `package.json`

Nejsou potřeba nové environment proměnné ani změna schématu databáze. Před nasazením si ověřte zálohu databáze a zachovejte `SESSION_SECRET` i externí zálohování (pokud je používáte).

## Poznámky k ověření

- Prošla kontrola syntaxe všech veřejných JavaScriptových souborů.
- Prošel izolovaný test odeslání náhledu a neuložených změn (`node --test test/live-preview.test.js`).
- Celý integrační běh lokálně neproběhl: v testovacím prostředí jsou neúplné `node_modules` (chybí např. `express`, `luxon`) a prohlížeč blokuje lokální HTTP adresu.
- Tuto aktualizaci proto **nejprve ověřte na vývojové službě**, než ji nasadíte na provozní rezervační systém.
