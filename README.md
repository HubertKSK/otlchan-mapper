# Otchlan mapper

Lokalna aplikacja webowa do grania w Otchlan 1.3 i automatycznego rysowania mapy lokacji. Aplikacja uruchamia gre w pseudo-terminalu, pokazuje terminal w przegladarce przez xterm.js i prowadzi mape gracza na podstawie atlasu swiata oraz tekstu z gry.

Projekt jest przeznaczony do uruchamiania lokalnie na Windowsie.

## Funkcje

- terminal Otchlani w przegladarce,
- start/stop gry z UI,
- automatyczne przesuwanie pozycji gracza po mapie,
- mapa pokoi, wyjsc, scian i poziomow `z`,
- notatki, tagi i globalny notes,
- zapis stanu mapy na serwerze do `user-layer.json`,
- automatyczny zapis pozycji i warstwy uzytkownika,
- import/eksport backupu JSON,
- popupy po zapisie, wczytaniu i bledach serwera,
- logi aplikacji i bledow serwera,
- narzedzia do wygenerowania cache/atlasu swiata z lokalnej instalacji gry.

## Wymagania

- Windows
- Node.js 18+
- Otchlan 1.3

Domyslna sciezka gry:

```text
C:\Program Files (x86)\Otchlan 1.3
```

Jesli gra jest w innym katalogu, ustaw `OTCHLAN_DIR` przed startem serwera.

## Instalacja

```powershell
npm install
```

## Uruchomienie

```powershell
npm start
```

Nastepnie otworz:

```text
http://localhost:5173
```

Inny katalog gry:

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

## Jak Uzywac

1. Uruchom serwer przez `npm start`.
2. Otworz `http://localhost:5173`.
3. Kliknij przycisk startu gry przy terminalu.
4. Graj normalnie w terminalu w aplikacji.
5. Mapper przesuwa pozycje gracza, odkrywa odwiedzone pokoje i zapisuje stan na serwerze.
6. W menu aplikacji mozesz zapisac/wczytac mape z serwera oraz importowac/eksportowac backup.

Dioda przy tytule mapy pokazuje stan synchronizacji:

- zielona: mapper uwaza, ze zna aktualna pozycje,
- czerwona: mapper czeka na jednoznaczna lokacje z terminala, zeby zsynchronizowac atlas.

## Dane I Pliki Lokalne

Stan uzytkownika jest zapisywany lokalnie w katalogu projektu:

```text
user-layer.json
```

Ten plik zawiera prywatny stan gracza: aktualna pozycje, odwiedzone lokacje, notatki i tagi. Nie powinien byc commitowany do publicznego repozytorium.

Import/eksport backupu w UI sluzy do przenoszenia mapy miedzy instalacjami albo robienia recznych kopii.

## Generowanie Atlasu Swiata

Skrypty czytaja pliki gry z katalogu Otchlani i generuja lokalne pliki pomocnicze.

```powershell
npm.cmd run world:extract
npm.cmd run world:atlas
```

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
- `npm test` - testy parsera, mapy, UI i serwera,
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

Log nieobsluzonych bledow serwera:

```text
server.log
```

Pelny output terminala w trybie debug:

```text
logs\terminal-output-debug.jsonl
```

Logi sa lokalne i ignorowane przez git.

## Notatki Techniczne

- `docs/otchlan-memory.md` - aktualne ustalenia o czytaniu stanu gracza z pamieci procesu `otchlan.exe`, offsetach `TGRACZ`, ekwipunku, umiejetnosciach i flagach swiata.

## Struktura Projektu

- `server.js` - lokalny serwer HTTP, SSE, uruchamianie gry przez `node-pty`, zapis mapy i logowanie.
- `public/index.html` - struktura UI.
- `public/app.js` - terminal, komunikacja z serwerem, automapper i renderowanie mapy.
- `public/map-core.js` - model mapy, kierunki, parser lokacji i laczenie pokoi.
- `public/styles.css` - layout, motywy i animacje.
- `scripts/extract-world.mjs` - ekstrakcja danych swiata z plikow gry.
- `scripts/build-world-atlas.mjs` - budowanie atlasu swiata.
- `test/` - testy Node.

## Publikacja Na GitHubie

Nie commituj prywatnych albo generowanych plikow:

- `user-layer.json`
- `*.tmp`
- `*.log`
- `*.jsonl`
- `world-cache.json`
- `world-atlas.json`
- `node_modules/`

Kazdy uzytkownik powinien wygenerowac wlasny cache/atlas lokalnie z posiadanej instalacji gry.

## Ograniczenia

- Parser terminala jest heurystyczny, bo lokacje w Otchlani moga miec podobne nazwy i opisy.
- Czerwona dioda oznacza, ze mapper czeka na bezpieczna synchronizacje z aktualnym ekranem gry.
- Projekt zaklada lokalne uruchamianie na Windowsie, razem z lokalna instalacja Otchlani.
