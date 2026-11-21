# Slotiva V6.4 – mobilní ovládání

Tato verze navazuje na Slotivu V6.3 (živý náhled). Nemění databázové schéma ani serverové API.

## Co se změnilo

- **Mobilní spodní navigace:** důležité obrazovky dostupné jedním klepnutím; nabídka „Více“ otevírá původní postranní menu. Rozložení respektuje práva majitele a zaměstnance. Zobrazuje počet nepřečtených oznámení.
- **Kalendář na telefonu:** výchozí **Agenda** – přehledné dotykové karty a rychlé přepínání mezi zaměstnanci. Volba **Časová osa** zobrazuje původní bloky rezervací, možnost **Den/Týden** zůstává zachována. Majitel má společný kalendář; pracovníci zůstávají ve vlastním rozsahu dle serverových práv.
- **Rezervace:** na úzkých displejích jsou namísto široké tabulky samostatné karty. Detail a menu akcí jsou oddělené, aby se při klepnutí neotevřela nesprávná akce.
- **Formuláře, potvrzování, volno, profil:** větší dotykové oblasti; modální okna se otevírají od spodního okraje, tlačítka zůstávají dosažitelná. Upraveno i pro iOS safe-area a klávesnici.
- **Nastavení s živým náhledem:** editor se na telefonu skládá pod sebe; náhled lze rozbalit, publikování zůstává samostatným úkonem.
- **Přístupnost:** zavírání menu klávesou Escape, focus-trap modálních oken, popisky navigace a stav aktivní záložky.
- **PWA cache:** zvýšena verze, aby se po nasazení načetly aktuální soubory.

## Nasazení na Render

1. Před nasazením si zálohujte databázi, pokud obsahuje důležitá data.
2. Rozbalte ZIP a nahrajte **obsah** do kořene GitHub repozitáře. `package.json` a `package-lock.json` mají být přímo v kořeni.
3. Root Directory: prázdné; Build Command: `npm ci --omit=dev`; Start Command: `npm start`.
4. Ponechte stávající Environment proměnné (včetně `SESSION_SECRET` a případných externích záloh).
5. Po deployi na telefonu znovu otevřete stránku/PWA a zavřete a znovu spusťte případnou starou instalovanou záložku.

## Mobilní kontrolní scénář

1. Jako majitel otevřete **Kalendář** a přes filtr přepněte Kikin / Honza / Všichni.
2. Přepněte **Agenda** / **Časová osa** a **Den** / **Týden**; posuňte na další den.
3. Otevřete rezervaci, potvrďte ji a ověřte aktualizaci na jiném zařízení.
4. V **Rezervacích** otevřete detail i samostatné menu akcí; vyzkoušejte hledání a data od/do.
5. V části **Volno** vytvořte/zpracujte testovací žádost, jako zaměstnanec ověřte pouze vlastní oprávnění.
6. V **Nastavení firmy** upravte draft, otevřete živý náhled a ověřte, že se veřejný web mění až po uložení.
7. Na zařízení o šířce přibližně 320–390 px ověřte spodní navigaci, nabídku **Více**, zavření nabídky, formuláře a klávesnici.

## Testování a omezení

- Syntaxe upravovaných JS souborů prošla `node --check`.
- V headless Chromiu se simulovaným API prošlo proklikávání mobilním kalendářem, rezervacemi, navigací a stránkou volna na **320 px a 390 px**; kontrolován také desktop **1440 px**. Na mobilu se nezobrazovalo horizontální přetečení dokumentu.
- Produkční odeslání změn do skutečné databáze, skutečné zařízení i kompletní integrační test na Renderu v tomto prostředí **nebyly ověřeny**. U backendových automatických testů chybí nainstalované npm závislosti jako `express` a `luxon`. Nejde o důkaz chyby nasazeného projektu.
- Ukládání dat na Render Free se **nemění**: trvalost závisí na dříve nastaveném externím zálohování/úložišti.
