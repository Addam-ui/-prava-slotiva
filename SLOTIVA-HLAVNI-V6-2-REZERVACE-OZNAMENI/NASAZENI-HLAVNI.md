# Slotiva – hlavní verze / PULZ (nasazení a provoz)

Toto **není demo projekt**. Jde o úpravu původního `Addam-ui/slotiva`. Nic se automaticky neplní falešnými rezervacemi. Nové účty mají vlastní data.

## 1. GitHub a Render

1. Rozbal `SLOTIVA-HLAVNI-V3.zip` na počítači.
2. Nahraj **soubory UVNITŘ** rozbalené složky do kořene repozitáře `Addam-ui/slotiva` (ne ZIP jako jediný soubor, ne další podsložku).
3. Na GitHubu musí být přímo vidět `package.json`, `package-lock.json`, `server.js`, `public/` a `src/`.
4. Render: Web Service, branch `main`, **Root Directory prázdné**, Build Command `npm ci --omit=dev`, Start Command `npm start`, health check `/healthz`.
5. V Render Environment: `NODE_ENV=production`, `PUBLIC_BASE_URL=https://VAŠE-ADRESA.onrender.com` a stabilní náhodný `SESSION_SECRET` (minimálně 32 znaků). **Nezadávej `localhost`.**
6. Po deployi zkontroluj `https://VAŠE-ADRESA.onrender.com/healthz` a potom přihlášení a veřejnou rezervaci.

**Pozor na Blueprinty**: `render.yaml` je Free varianta. `render-starter-disk.yaml` je ukázka placené varianty s persistent diskem. Ověř cenu před zapnutím placeného plánu.

## 2. Trvalá data na Render Free – volitelný Upstash Redis

Render Free bez persistent disku **neuchovává lokální SQLite spolehlivě** mezi uspáním, restartem a deployi. Pro zachování účtů a rezervací lze použít dvě varianty:

- **Free web + Upstash Redis REST:** nový mechanismus šifrovaných SQLite snapshotů (pouze **jedna instance** aplikace). Založ Redis databázi u [Upstash](https://console.upstash.com/), ideálně s regionem EU. V jejím REST nastavení zkopíruj URL a token do Render Environment:

  ```env
  UPSTASH_REDIS_REST_URL=https://...
  UPSTASH_REDIS_REST_TOKEN=...
  UPSTASH_SNAPSHOT_KEY=slotiva:main:v1
  SESSION_SECRET=<stabilni-tajny-klic-min-32-znaku>
  ```

  Ověř, že poskytovatelův plán a limity tvému projektu vyhovují. Každá záloha je před odesláním **šifrovaná AES-256-GCM** pomocí klíče odvozeného ze `SESSION_SECRET`. Bez stejného tajného klíče nelze data po restartu obnovit! Používej pro projekt jedinečný `UPSTASH_SNAPSHOT_KEY`, nesdílej ho s demem. V administraci → Nastavení → Ukládání dat zkontroluj poslední úspěšnou zálohu.

- **Render Starter s persistent diskem:** použij placený disk namountovaný na `/data` a `DATA_DIR=/data` (ukázka `render-starter-disk.yaml`). Upstash pak není potřeba.

**Omezení snapshotů:** záloha probíhá po úspěšných změnách na pozadí, nikoli jako atomická vzdálená databázová transakce. Náhlé ukončení těsně po uložení může ztratit poslední změnu. Vzdálená záloha je určená pro menší jednoserverové instalace do velikosti SQLite 32 MB. Pro rostoucí komerční službu doporučuji samostatnou správně migrovanou SQL databázi (např. PostgreSQL) a pravidelné exporty. **Samotné nastavení `DATABASE_URL` PostgreSQL zde zatím nepodporuje** – současný backend je SQLite.

## 3. Testovací účet PULZ

Na **prázdné databázi** můžeš automaticky založit jediný účet majitele:

```env
PULZ_BOOTSTRAP_EMAIL=pulzbarbershop@gmail.com
PULZ_BOOTSTRAP_PASSWORD=<nove-silne-testovaci-heslo>
```

Heslo nastavuj **výhradně v Render Environment**, nikdy v kódu, repozitáři, do screenu ani do chatu. Heslo se ukládá jako scrypt hash. Účet se založí jen pokud uvedený e-mail ještě neexistuje a při dalších deployích se nebude mazat ani přepisovat. Použij jiné heslo než dříve sdílené. Je-li už účet v databázi vytvořen, bootstrap jeho heslo **nezmění**.

PULZ se založí se službami:

- Pánský střih – 390 Kč / 30 min
- Dětský střih – 290 Kč / 25 min
- Combo – 590 Kč / 45 min

Barbeři se **nevytvářejí s falešnými přihlašovacími údaji**. Otevři **Správa týmu** a přidej Kikina a Honzu s jejich skutečnými e-maily a vlastními hesly. Fotografie lze nahrát z počítače, v prohlížeči se automaticky zmenší. Každý zaměstnanec má svůj kalendář a kopii služeb majitele; další úpravy lze dělat po přepnutí na jeho kalendář.

## 4. Funkce

- **Rezervační stránka** `https://VAŠE-ADRESA.onrender.com/pulz`: pokud existují aktivní zaměstnanci, zákazník si nejprve vybere barbera a pak službu a volný termín.
- **Správa týmu**: majitel přidává/deaktivuje zaměstnance, nastavuje e-mail, heslo a fotografii; zaměstnanci se přihlašují samostatně.
- **Integrace a web**: veřejný odkaz, vložení formuláře, Google Kalendář; status Kalendáře nepřekáží v dolní části navigace.
- **Nastavení → Vzhled rezervační stránky**: logo, fotografie pozadí, barva pozadí, vlastní profilový obrázek a barva značky. Obrázky jsou v databázi, a tedy součástí zálohy.

## 5. Přihlášení Google a ověření telefonu

Google OAuth: vytvoř Google OAuth Client ID/Secret pro Web Application a na Google Cloud OAuth nastav redirect URI:

```
https://VAŠE-ADRESA.onrender.com/auth/google/callback
```

Do Render Environment vlož `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`. Přihlášení přes Google pak pracuje jen s identitou. Propojení Google Kalendáře najdeš v **Integrace a web** a vyžádá si zvlášť oprávnění. Existující účet s heslem je potřeba nejdřív přihlásit a Google účet explicitně propojit; samotná shoda e-mailu heslo nezmění.

Ověřovací SMS kód při **registraci e-mailem** podporuje Twilio Verify, ale vyžaduje platného poskytovatele a nastavené hodnoty:

```env
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
```

Bez těchto proměnných je krok SMS vypnutý (aplikace nepředstírá, že telefon ověřila). Když je SMS zapnutá, nový uživatel musí kód potvrdit, a nový účet přes Google lze založit až po vytvoření účtu s ověřeným telefonem a následném propojení. SMS může být zpoplatněná.

## 6. Ověření funkčnosti

1. Přihlas se jako majitel PULZ, otevři `/app/#/tym` a přidej dva zaměstnance.
2. Otevři `/pulz` v anonymním okně. Musí jít vybrat Kikin/Honza, služba a dostupný termín.
3. Pošli jednu **testovací** rezervaci a ověř, že se objevila u zvoleného barbera v dashboardu.
4. Ulož nastavení vzhledu, překontroluj veřejný odkaz (nesmí ukazovat `localhost`).
5. Jestli používáš Upstash, vyčkej na potvrzenou zálohu v Nastavení → Ukládání dat a následně ověř načtení po restartu serveru. Nesmaž si nejdříve data bez ověření zálohy.

## 7. Co je a není ověřené

- Kontrola syntaxe JS: ano.
- Samostatné testy vytvoření účtu, týmové vazby, přihlašování a obrázků v nastavení: ano (bez prohlížeče).
- Samostatný test šifrované zálohy a obnovy po smazání lokální DB s falešným Redis REST serverem: ano.
- Kompletní API + browser end-to-end: **zatím ne** – npm závislosti nebylo v testovacím prostředí možné stáhnout. Pro reálné spuštění je nutné `npm ci` na Renderu a ověřit klientské formuláře.

Nepoužívej veřejnou testovací instalaci pro skutečná zákaznická data, dokud neověříš zálohy, integrace a pravidla ochrany osobních údajů.
