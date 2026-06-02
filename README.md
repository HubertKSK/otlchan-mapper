# Otchlan Mapper

Lokalna aplikacja webowa do grania w Otchlan 1.3 i prowadzenia mapy lokacji. Aplikacja uruchamia gre w pseudo-terminalu, pokazuje terminal w przegladarce przez xterm.js i synchronizuje pozycje gracza z pamieci procesu `otchlan.exe`.
<img width="2155" height="1264" alt="image" src="https://github.com/user-attachments/assets/31a62d99-4722-44bf-a9ee-90c23505ff6f" />


Projekt jest przeznaczony do lokalnego uruchamiania na Windowsie.

## Funkcje

- terminal Otchlani w przegladarce,
- start/stop gry z UI,
- mapa pokoi, wyjsc, scian, korytarzy i poziomow `z`,
- pozycja gracza synchronizowana z pamieci procesu gry, bez zgadywania komend z terminala,
- panel statystyk postaci: HP, mana, MV, zloto przy sobie, zloto w banku, EXP i postep do kolejnego poziomu,
- aktywne czary i statusy postaci, np. glod i pragnienie,
- notatki lokacji, tagi i globalny notes,
- zapis warstwy uzytkownika na serwerze do `user-layer.json`,
- automatyczny zapis warstwy uzytkownika po zmianach mapy/notatek/tagow,
- import/eksport backupu JSON,
- popupy po zapisie, wczytaniu i bledach serwera,
- logi aplikacji, bledow serwera i opcjonalny debug outputu terminala,
- narzedzia do wygenerowania cache/atlasu swiata z lokalnej instalacji gry.

Pelna lista funkcjonalnosci jest w [FEATURES.md](FEATURES.md).

## Wymagania

- Windows
- Node.js 18+
- .NET SDK 8+ do zbudowania szybkiego czytnika pamieci
- [Otchlan 1.3](https://otchlan.pl)

Wazne: `Otchlan Mapper` nie musi byc w katalogu gry. To sa dwa osobne miejsca:

- katalog aplikacji - folder, w ktorym znajduje sie ten projekt i gdzie uruchamiasz komendy `npm`,
- katalog gry - folder z zainstalowana Otchlania, z ktorego mapper czyta pliki gry.

Domyslna sciezka katalogu gry to:

```text
C:\Program Files (x86)\Otchlan 1.3
```

Jesli gra jest w tym katalogu, nie trzeba ustawiac `OTCHLAN_DIR`. Jesli gra jest gdzie indziej, ustaw `OTCHLAN_DIR` w PowerShell przed ekstrakcja mapy i przed startem serwera.

## Instalacja

Pobierz projekt i otworz PowerShell w katalogu aplikacji `otchlan-mapper`, czyli w folderze z plikiem `package.json`. To nie jest katalog gry.

Potem zainstaluj zaleznosci:

```powershell
npm install
npm.cmd run memory:build
```

## Pierwsze Uruchomienie Dla Nietechnicznej Osoby

Przy pierwszym uruchomieniu trzeba przygotowac mape swiata z plikow gry. Komendy uruchamiaj w katalogu aplikacji `otchlan-mapper`, a skrypty same znajda gre w domyslnej lokalizacji `C:\Program Files (x86)\Otchlan 1.3`.

To sa dwa osobne kroki:

1. `world:extract` czyta dane z lokalnej instalacji Otchlani i tworzy `world-cache.json`.
2. `world:atlas` parsuje ten cache i tworzy `world-atlas.json`, czyli gotowy atlas dla mappera.

Dopiero po tych dwoch komendach aplikacja jest gotowa do normalnego uruchomienia.

Jesli Otchlan jest zainstalowana w domyslnym katalogu gry:

```text
C:\Program Files (x86)\Otchlan 1.3
```

wpisz po kolei w katalogu aplikacji:

```powershell
npm.cmd run world:extract
npm.cmd run world:atlas
npm.cmd run memory:build
npm start
```

Nastepnie otworz w przegladarce:

```text
http://localhost:5173
```

Jesli Otchlan jest zainstalowana gdzie indziej, nadal zostajesz w katalogu aplikacji, ale najpierw ustaw sciezke do katalogu gry w tym samym oknie PowerShell:

```powershell
$env:OTCHLAN_DIR="D:\Gry\Otchlan 1.3"
npm.cmd run world:extract
npm.cmd run world:atlas
npm.cmd run memory:build
npm start
```

Najczestszy problem przy pierwszym uruchomieniu: aplikacja startuje, ale mapa jest pusta albo nie ma atlasu. Wtedy zwykle brakuje jednego z tych plikow:

```text
world-cache.json
world-atlas.json
```

Rozwiazanie: uruchom ponownie `npm.cmd run world:extract`, potem `npm.cmd run world:atlas`, a na koncu `npm start`.

## Normalne Uruchomienie

Po pierwszym przygotowaniu atlasu nie trzeba za kazdym razem ekstraktowac mapy. Przy kolejnym graniu otworz PowerShell w katalogu aplikacji i zwykle wystarczy:

```powershell
npm start
```

Jesli korzystasz z gotowej paczki release z GitHuba, mozesz zamiast tego uruchomic:

```text
run.cmd
```

Zatrzymanie serwera i czytnika pamieci:

```text
stop.cmd
```

Paczka release zawiera juz zbudowany `bin\OtchlanMemoryReader.exe`, wiec nie wymaga instalowania .NET SDK ani uruchamiania `npm.cmd run memory:build`.

Jesli po aktualizacji projektu zmienil sie czytnik pamieci, uruchom jednorazowo:

```powershell
npm.cmd run memory:build
```

Serwer preferuje szybki czytnik `OtchlanMemoryReader.exe`. Jesli nie jest zbudowany, uzyje wolniejszego fallbacku PowerShell.

Nastepnie otworz:

```text
http://localhost:5173
```

Jesli przy danym uruchomieniu uzywasz niestandardowego katalogu gry, ustaw `OTCHLAN_DIR` przed `npm start`:

```powershell
$env:OTCHLAN_DIR="D:\Gry\Otchlan 1.3"
npm start
```

Inny port:

```powershell
$env:PORT=5174
npm start
```

Tryb debug terminala:

```powershell
node server.js --debug
```

albo:

```powershell
$env:OTCHLAN_DEBUG=1
npm start
```

## Konfiguracja

Opcjonalne zmienne srodowiskowe:

- `OTCHLAN_DIR` - katalog instalacji gry.
- `PORT` - port HTTP aplikacji, domyslnie `5173`.
- `OTCHLAN_DEBUG` albo `DEBUG_TERMINAL` - wlacza nagrywanie outputu terminala w trybie debug.
- `OTCHLAN_POSITION_POLL_MS` - interwal odczytu pozycji i statystyk procesu, domyslnie `100`.
- `OTCHLAN_MOB_POLL_MS` - interwal odczytu mobow z pamieci procesu, domyslnie `1000`.
- `OTCHLAN_TERMINAL_COLS` - liczba kolumn terminala, domyslnie `120`.
- `OTCHLAN_TERMINAL_ROWS` - liczba wierszy terminala, domyslnie `48`.
- `OTCHLAN_LOG_MAX_BYTES` - rozmiar pliku logu przed rotacja, domyslnie `1048576`.
- `OTCHLAN_LOG_KEEP` - liczba rotowanych plikow logow, domyslnie `5`.

## Jak Uzywac

1. Przy pierwszym uzyciu uruchom `npm.cmd run world:extract`.
2. Potem uruchom `npm.cmd run world:atlas`.
3. Uruchom serwer przez `npm start`.
4. Otworz `http://localhost:5173`.
5. Kliknij przycisk startu gry przy terminalu.
6. Graj normalnie w terminalu w aplikacji.
7. Mapper odczytuje aktualna pozycje i statystyki z pamieci gry, odkrywa odwiedzone pokoje i zapisuje warstwe uzytkownika.
8. W menu aplikacji mozesz importowac/eksportowac backup, zmieniac ustawienia UI i utworzyc nowa mape po potwierdzeniu.

Mapper nie przechwytuje juz komend uzytkownika jako zrodla prawdy o ruchu i nie synchronizuje pozycji z tekstu terminala. Terminal sluzy do gry i diagnostyki, a pozycja pochodzi z procesu `otchlan.exe`.

## Dane I Pliki Lokalne

Stan uzytkownika jest zapisywany lokalnie w katalogu projektu:

```text
user-layer.json
```

Ten plik zawiera warstwe uzytkownika: odwiedzone lokacje, notatki, tagi i globalny notes. Nie zapisujemy w nim pozycji gracza, zaznaczonej lokacji ani ustawienia sledzenia gracza. Biezaca pozycja jest stanem runtime odczytywanym z pamieci gry.

Import/eksport backupu w UI sluzy do przenoszenia warstwy uzytkownika miedzy instalacjami albo robienia recznych kopii.

## Generowanie Atlasu Swiata

Skrypty czytaja pliki gry z katalogu Otchlani i generuja lokalne pliki pomocnicze. Kolejnosc jest wazna:

```powershell
npm.cmd run world:extract
npm.cmd run world:atlas
```

Najpierw `world:extract`, bo bez `world-cache.json` nie ma czego parsowac. Potem `world:atlas`, bo dopiero on buduje atlas uzywany przez mapper.

Powstaja:

```text
world-cache.json
world-atlas.json
```

Te pliki sa generowane lokalnie i ignorowane przez git.

## Testy

Pelna weryfikacja:

```powershell
npm.cmd run verify
```

Uruchamia:

- `npm run check` - kontrola skladni JS,
- `npm test` - testy parsera, mapy, UI, pamieci procesu i serwera,
- `npm run smoke` - szybki test serwera na porcie `5187`.

Pojedyncze komendy:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run smoke
```

## Release 1.0 Na GitHubie

Gotowa paczka Windows jest budowana przez GitHub Actions. Release tworzy sie po wypchnieciu taga:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Workflow `.github/workflows/release.yml` buduje paczke i publikuje ja jako asset GitHub Release:

```text
otchlan-mapper-1.0.0.zip
otchlan-mapper-1.0.0.sha256
```

Paczka release zawiera:

- `run.cmd` do prostego uruchomienia,
- `stop.cmd` do zatrzymania serwera i `OtchlanMemoryReader.exe`,
- zbudowany self-contained `bin\OtchlanMemoryReader.exe`,
- aplikacje webowa, serwer, skrypty i dokumentacje,
- produkcyjne `node_modules`, zeby uzytkownik release nie musial od razu uruchamiac `npm install`.

Paczka release nie zawiera prywatnych ani lokalnie generowanych danych:

- `user-layer.json`,
- `world-cache.json`,
- `world-atlas.json`,
- `logs/`,
- `server.log`.

Workflow mozna tez uruchomic recznie z zakladki Actions, ale oficjalny release najlepiej robic tagiem `vX.Y.Z`.

## Logi

Log zdarzen mappera:

```text
logs\automapper.log
```

Log serwera i nieobsluzonych bledow:

```text
server.log
```

Pelny output terminala w trybie debug:

```text
logs\terminal-output-debug.jsonl
```

Logi sa lokalne, rotowane i ignorowane przez git.

## Struktura Projektu

- `server.js` - lokalny serwer HTTP, SSE, uruchamianie gry przez `node-pty`, odczyt pamieci procesu, zapis warstwy uzytkownika i logowanie.
- `public/index.html` - struktura UI.
- `public/app.js` - terminal, komunikacja z serwerem, mapper, statystyki postaci i renderowanie mapy.
- `public/map-core.js` - model mapy, kierunki, parser lokacji i laczenie pokoi.
- `public/styles.css` - layout, motywy i animacje.
- `src/OtchlanMemoryReader/` - szybki czytnik pamieci `otchlan.exe` w C#; pozycja jest czytana czesto, moby domyslnie co 1 sekunde.
- `scripts/read-otchlan-position.ps1` - starszy fallback PowerShell do odczytu pamieci, uzywany tylko gdy szybki reader nie jest zbudowany.
- `scripts/extract-world.mjs` - ekstrakcja danych swiata z plikow gry.
- `scripts/build-world-atlas.mjs` - budowanie atlasu swiata.
- `scripts/smoke-server.mjs` - szybki smoke test serwera.
- `test/` - testy Node.

## Publikacja Na GitHubie

Nie commituj prywatnych albo generowanych plikow:

- `user-layer.json`
- `user-layer.json.tmp`
- `*.tmp`
- `*.log`
- `*.log.*`
- `*.jsonl`
- `*.jsonl.*`
- `world-cache.json`
- `world-atlas.json`
- `node_modules/`

Kazdy uzytkownik powinien wygenerowac wlasny cache/atlas lokalnie z posiadanej instalacji gry.

## Ograniczenia

- Projekt zaklada lokalne uruchamianie na Windowsie, razem z lokalna instalacja Otchlani.
- Odczyt pozycji i statystyk zalezy od znanych offsetow pamieci gry dla wersji Otchlan 1.3.
- Automatyczne mapowanie wymaga wygenerowanego `world-cache.json` i `world-atlas.json`.
- Terminal debug zapisuje pelny output gry lokalnie i moze zawierac prywatne dane z rozgrywki.
