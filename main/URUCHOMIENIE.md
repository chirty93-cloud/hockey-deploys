# Jak uruchomić grę

1. Rozpakuj paczkę ZIP.
2. Zainstaluj Node.js 24 z https://nodejs.org.
3. Otwórz terminal w folderze `air-hockey` (tym z plikiem `package.json`).
4. Wpisz kolejno:

```sh
npm ci
npm run dev
```

Otwórz w przeglądarce adres wyświetlony w terminalu. Zostaw terminal uruchomiony podczas gry. Samo otwarcie pliku `index.html` dwukrotnym kliknięciem nie wystarczy.

## Co ustawić przed meczem

- Na komputerze kliknij **Ustawienia meczu**. Na telefonie menu pojawia się od razu.
- **Auto** obraca stół razem z telefonem i dopasowuje go do dostępnej przestrzeni. Można też wymusić pion lub poziom oraz proporcje 16:9 / 4:3.
- **Maksymalny · 100%** daje największy stół. W poziomie możesz wybrać lewą albo prawą stronę gracza.
- Ustaw liczbę punktów, AI, kolor paletki i opcjonalny limit czasu. Więcej opcji znajdziesz w rozwijanych sekcjach.
- Na telefonie mecz wypełnia widoczną część ekranu. Jeśli przeglądarka obsługuje pełny ekran, pasek przeglądarki też znika. W pozostałych przeglądarkach możesz zainstalować grę jako PWA / dodać ją do ekranu głównego.
- Sterowanie: mysz, przeciąganie palcem, **strzałki lub WASD** po kliknięciu stołu. **P / Spacja** wstrzymują grę, **Esc** wznawia ją. Instrukcje są też pod stołem i pod przyciskiem ze znakiem zapytania.

Ustawienia zapisują się w tej przeglądarce. Zmiana orientacji podczas meczu zachowuje wynik; rozpoczęcie meczu z nowymi ustawieniami zeruje wynik.

## Wersja do publikacji

Folder `dist` w paczce zawiera gotowy build. Po zmianie kodu odśwież go poleceniem `npm run build`. Zawartość `dist` można opublikować na hostingu statycznym obsługującym HTTPS, w katalogu głównym witryny. Dzięki temu grę otworzysz również na telefonie. Po pierwszym pełnym załadowaniu wersja produkcyjna działa także offline.
