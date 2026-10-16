# Konfiguracja Air Hockey

Edytuj `src/game-config.json`. Plik jest importowany podczas budowania aplikacji; po edycji wykonaj ponownie build i publikację. Nie trzeba zmieniać komponentów, aby zmienić wartości domyślne, zakresy lub opisy istniejących suwaków.

- `defaults`: wynik docelowy, czas w sekundach, orientacja, proporcje, kolor, strona w poziomie i rozmiar stołu.
- `limits`: zakres punktów i czasu w formularzu.
- `table`: krótszy bok, promienie paletki/krążka, szerokość bramki i odległość startowa od końca stołu, w jednostkach symulacji. Domyślny krótszy bok 432 daje dokładne całkowite wymiary 432×576 i 432×768.
- `tablePresets`: etykiety i skale 0–1 względem dostępnego miejsca.
- `colors` i `opponentColors`: palety i pary przeciwników.
- `gameplay`: szybkość serwisu i AI w jednostkach symulacji/s. Zachowana reguła beta `aiHalfTimeoutSeconds: 10` przyznaje punkt po 10 s na połowie AI; ustaw 0, żeby ją wyłączyć.
- `physics`: każda pozycja zawiera `default`, `min`, `max`, `step`, `label`, `unit`, `description` i `group`. Formularz jest generowany z tych danych. Dodanie nowego rodzaju parametru wymaga także implementacji jego działania.

## Proporcje i obrót

`aspectRatio`: `auto`, `16:9`, `4:3`. Auto porównuje dłuższy i krótszy bok obszaru przeglądarki: od 14/9 wybiera 16:9, poniżej 4:3. Reaguje na zmianę rozmiaru okna i obrót. W pionie pole ma odpowiednio proporcje 9:16 lub 3:4.

Zmienia się geometria pola gry, a następnie całe pole jest skalowane jednakowo w obu osiach. Krążek i paletki pozostają okrągłe. Obrót zmienia wyłącznie widok i mapowanie wejścia. W pionie gracz zawsze pozostaje na dole; lewa/prawa strona działa w poziomie. Przy zmianie proporcji w trakcie gry pozycje są przenoszone proporcjonalnie i ograniczane do nowych granic.

Dostępny obszar nadal wynika z kontenera `100dvh`, wyniku, instrukcji i `safe-area-inset-*`. Wcześniejsza geometria kodu wynosiła 400×600 (3:2), teraz 4:3 oznacza dokładnie 4:3.

## Dynamika

| Klucz | Jednostka | Działanie |
| --- | --- | --- |
| `puckDrag` | 1/s | `v(t)=v₀·exp(−k·t)`; położenie jest całkowane analitycznie między zderzeniami. 0 wyłącza opór. |
| `wallRestitution` | 0–1, UI w % | Współczynnik odbicia prędkości normalnej do bandy. |
| `paddleRestitution` | 0–1, UI w % | Współczynnik odbicia względem poruszającej się paletki. |
| `playerResponseMs` | ms | Stała czasu doganiania wskaźnika (ok. 63% dystansu w jednej stałej czasu), ograniczona maksymalną szybkością. 0 usuwa wygładzanie. |
| `playerMaxSpeed` | krótsze boki stołu/s | Fizyczny limit szybkości paletki, niezależny od skali CSS. |

Zderzenie z paletką traktuje ją jako obiekt sterowany ręką: `v' = v − (1+e)·((v−u)·n)·n`, wyłącznie gdy obiekty się zbliżają. `u` to faktyczna prędkość paletki, `n` to normalna zderzenia. Ruch styczny nie dostaje sztucznego mnożnika. Model nie symuluje obrotu krążka.

Usunięto przewidywanie ruchu, osobny mnożnik siły, suwak przyspieszenia w px/klatkę², minimalną wymuszaną prędkość, cooldown ignorujący kolejne kontakty. Spoczywający krążek sam nie przyspiesza. Małe adaptacyjne kroki symulacji ograniczają przechodzenie szybkich obiektów przez siebie.

### Limit mocnych uderzeń

`gameplay.puckMaxSpeed: 1.8` ogranicza szybkość krążka po uderzeniu do 1,8 krótszego boku stołu na sekundę (777,6 jednostek/s przy szerokości 432). To celowy limit grywalności, nie dodatkowy parametr fizycznego zderzenia. Działa tak samo dla gracza i AI. Zwykłe strzały poniżej limitu pozostają bez zmian; przy mocnych strzałach zachowany jest kierunek ruchu. Limit nie zmniejsza szybkości sterowania paletką. Zwiększ tę wartość, aby dopuścić szybsze strzały.

## Dźwięki

`defaults.soundEnabled` określa domyślny stan dźwięków, a `audio.volume` ich wspólną głośność (0–1, domyślnie 0,22). Przełącznik jest dostępny w ustawieniach oraz w pauzie. Wybór użytkownika jest zapisywany lokalnie i ma pierwszeństwo przed wartością domyślną; przy zablokowanym zapisie działa do zamknięcia aplikacji.

Dźwięki paletki i bandy są krótkimi, perkusyjnymi próbkami PCM wygenerowanymi przez kod: impuls szumu i gasnące rezonanse tworzą charakter plastikowego krążka oraz twardszej bandy. Trzy warianty są buforowane i odtwarzane z niewielką zmianą tempa. Gol łączy stuknięcia krążka wpadającego do bramki z krótkim sygnałem stołu. To autorska synteza inspirowana fizycznym air hockey, nie próbki wyciągnięte z oryginalnej gry; identyczność brzmienia z betą wymaga odsłuchu jej materiałów źródłowych. Web Audio działa bez pobierania plików i bez nowych zależności. Dźwięk aktywuje się po naciśnięciu Start, Wznów lub włączeniu przełącznika. Wyciszenie zatrzymuje także już grające dźwięki. Brak dostępu do audio nie zatrzymuje gry.

## Efekty wizualne

`effects.wallDuration` i `effects.goalDuration` określają czas efektów w sekundach, `maxParticles` ogranicza jednoczesną liczbę iskier (domyślnie 80), a `noticeMs` czas komunikatu gola. Efekty są rysowane we współrzędnych stołu, więc zachowują położenie po jego obrocie. Bandy emitują iskry do wnętrza pola. Gol rozświetla trafioną bramkę kolorem zdobywcy punktu; komunikat jest widoczny także przy zwycięskim golu. Punkt z reguły czasu na połowie AI ma etykietę „+1 PUNKT”, bez udawania gola.

Efekty nie zmieniają fizyki i działają także przy wyciszeniu. Pauza i zmiana geometrii usuwają wcześniejsze efekty. Przy `prefers-reduced-motion: reduce` pozostaje krótka poświata i nieruchomy komunikat, bez iskier ani powiększania.

## Weryfikacja

```sh
npm test
npm run typecheck
npm run build
```

Testy jednostkowe obejmują proporcje, skalowanie, mapowanie dotyku, dostępność dolnej połowy, opór, niezależność ruchu od częstotliwości klatek i zderzenia.

Przed publikacją sprawdź także dotyk w pionie, obie strony w poziomie, zmianę proporcji podczas meczu i PWA.
