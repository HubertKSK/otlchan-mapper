# Otchlan Mapper

Lokalna aplikacja webowa do grania w Otchlan 1.3 i prowadzenia mapy lokacji. Aplikacja uruchamia gre w pseudo-terminalu, pokazuje terminal w przegladarce przez xterm.js i synchronizuje pozycje gracza z pamieci procesu `otchlan.exe`.

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

## Wymagania

- Windows
- Node.js 18+
- Otchlan 1.3

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
- `OTCHLAN_POSITION_POLL_MS` - interwal odczytu pamieci procesu, domyslnie `120`.
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
8. W menu aplikacji mozesz zapisac/wczytac mape z serwera oraz importowac/eksportowac backup.

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
- `scripts/read-otchlan-position.ps1` - odczyt pozycji, statystyk, zlota, EXP, czarow i statusow z pamieci `otchlan.exe`.
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
