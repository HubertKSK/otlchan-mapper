# Funkcjonalnosci Otchlan Mapper

Ten plik opisuje funkcje aplikacji z perspektywy uzytkownika. README zostaje przewodnikiem instalacji i uruchomienia, a tutaj jest pelniejsza lista tego, co aplikacja potrafi.

## Terminal I Gra

- Uruchamianie i zatrzymywanie Otchlani z poziomu interfejsu.
- Terminal gry w przegladarce oparty o xterm.js.
- Staly rozmiar terminala `120 x 48`.
- Przekazywanie inputu uzytkownika do gry bez interpretowania komend jako zrodla prawdy dla mappera.
- Claim aktywnosci mappera po powrocie do karty, focusie okna i kliknieciu terminala.
- Opcjonalne nagrywanie outputu terminala w trybie debug.

## Mapa I Nawigacja

- Renderowanie mapy pokoi, wyjsc, scian, przejsc specjalnych, korytarzy i poziomow `z`.
- Pozycja gracza synchronizowana z pamieci procesu `otchlan.exe`.
- Brak zgadywania pozycji z tekstu terminala i brak przechwytywania komend gracza jako mechanizmu ruchu mapy.
- Automatyczne odkrywanie odwiedzonych pokoi.
- Inferowanie lokalnych polaczen miedzy sasiednimi pokojami na podstawie pamieci i atlasu.
- Sledzenie gracza na mapie z mozliwoscia wlaczenia lub wylaczenia.
- Plynna animacja pionka gracza przy ruchu.
- Animowane przesuwanie widoku mapy przy sledzeniu gracza.
- Crossfade przy zmianie poziomu `z`.
- Tryb debug / cala mapa pokazujacy wiekszy zakres atlasu.
- Renderowanie tylko widocznych pokoi w trybie calej mapy, zeby ograniczyc koszt rysowania.

## Dane Z Pamieci Gry

- Szybki czytnik pamieci w C# (`OtchlanMemoryReader`).
- Fallback PowerShell, gdy szybki czytnik nie jest zbudowany.
- Odczyt pozycji, krainy, wspolrzednych i poziomu `z`.
- Odczyt HP, many i MV.
- Odczyt poziomu postaci oraz postepu EXP do kolejnego poziomu.
- Odczyt zlota przy postaci i zlota w banku.
- Odczyt czasu gry i dnia podrozy.
- Odczyt aktywnych czarow i statusow postaci.
- Wykrywanie ciemnosci jako stanu ograniczajacego widocznosc mobow.
- Oddzielne interwaly odczytu pozycji/statystyk i mobow.

## Statystyki Postaci W UI

- Panel statystyk pod terminalem.
- Wizualizacja HP, many i MV jako paski.
- Zloto przy postaci i zloto w banku w jednym polu.
- Poziom postaci oraz pasek postepu EXP.
- Statusy i aktywne efekty w formie malych etykiet.
- Czas gry i dzien podrozy obok statusow.
- Animowane popupy zmian statystyk, np. `-7 HP` albo `+20` zlota.
- Ustawienia widocznosci dla: HP, mana, MV, zloto, poziom/EXP, statusy, zegar i data.

## Moby Na Mapie

- Warstwa mobow czytana z pamieci gry, nie z terminala.
- Nazwy mobow mapowane z danych gry.
- Questowe NPC moga miec nazwy z pamieci `MOBQ`.
- Normalny widok pokazuje moby widoczne dla gracza w czterech kierunkach.
- Sciany blokuja widzenie mobow.
- Tryb debug / cala mapa moze pokazac wszystkie znane moby z aktualnego poziomu.
- Kilka mobow na jednym polu jest agregowane w jeden marker z licznikiem i tooltipem.
- Moby sa ukrywane, gdy postac nie moze sie rozejrzec, np. w ciemnosci bez zrodla swiatla.
- Widocznosc mobow na mapie mozna wlaczyc albo wylaczyc w ustawieniach.

## Notatki I Warstwa Uzytkownika

- Notatki przypisane do lokacji.
- Tagi lokacji.
- Globalny notes z wieloma stronami.
- Edycja notatek i tagow takze dla wybranych pokoi, nie tylko pola gracza.
- Mozliwosc ukrycia panelu notesu w ustawieniach.
- Mozliwosc ukrycia opisu lokacji w ustawieniach.
- Warstwa uzytkownika obejmuje odwiedzone lokacje, notatki, tagi i globalny notes.
- Pozycja gracza nie jest zapisywana jako czesc backupu warstwy uzytkownika.

## Zapis, Backup I Bezpieczenstwo Danych

- Serwerowy zapis warstwy uzytkownika do `user-layer.json`.
- Automatyczny zapis zmian warstwy uzytkownika.
- Oszczedny zapis pozycji runtime, bez przepisywania calej warstwy, gdy nie trzeba.
- Import backupu JSON.
- Eksport backupu JSON.
- Popupy informujace o imporcie, eksporcie, bledach serwera i wybranych akcjach UI.
- Ostrzezenie i modal potwierdzenia przed akcja `Nowa mapa`.
- Rotowane logi aplikacji i serwera.

## Ustawienia Interfejsu

- Pelny panel ustawien pod przyciskiem menu mapy.
- Sekcje ustawien: Interfejs, Mapa, Postac, Dane i Debug.
- Przelacznik jasnego / ciemnego motywu.
- Przelacznik opisu lokacji.
- Przelacznik panelu notesu.
- Przelacznik mobow na mapie.
- Przelaczniki poszczegolnych statystyk postaci.
- Import i eksport backupu z sekcji Dane.
- Akcja `Nowa mapa` z wymaganym potwierdzeniem.
- Sekcja Debug widoczna tylko w trybie debug.

## Logi I Diagnostyka

- `logs/automapper.log` dla zdarzen mappera.
- `server.log` dla serwera i nieobsluzonych bledow.
- `logs/terminal-output-debug.jsonl` dla pelnego outputu terminala w trybie debug.
- Rotowanie logow konfigurowane zmiennymi srodowiskowymi.
- Diagnostyka odczytu pamieci i stanu procesu gry.
- Smoke test lokalnego serwera.

## Generowanie Atlasu

- `npm.cmd run world:extract` czyta dane swiata z lokalnej instalacji Otchlani.
- `npm.cmd run world:atlas` buduje atlas dla mappera.
- Domyslna sciezka gry to `C:\Program Files (x86)\Otchlan 1.3`.
- Mozliwosc ustawienia innego katalogu gry przez `OTCHLAN_DIR`.
- Wygenerowane pliki `world-cache.json` i `world-atlas.json` sa lokalne i ignorowane przez git.

## Testy I Jakosc

- `npm.cmd run verify` uruchamia kontrole skladni, build czytnika pamieci, testy i smoke test.
- Testy obejmuja UI, parsery, atlas, serwer, zapis warstwy uzytkownika, odczyt pamieci i zachowania mappera.
- Testy statyczne pilnuja waznych decyzji produktowych, np. braku recznego save/load serwera w ustawieniach.

