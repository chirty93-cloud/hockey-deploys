import { useState } from "react";
import {
  ArrowRight,
  RotateCcw,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  TABLE_SIZES,
  THEMES,
  TUNING_FIELDS,
} from "../config/preferences.ts";
import type { Preferences } from "../config/preferences.ts";
import { GameOverlay } from "./GameOverlay.tsx";
import { ControlGuide } from "./ControlGuide.tsx";
import { ARENAS } from "../config/arenas.ts";
import { EFFECT_OPTIONS } from "../config/effects.ts";
import { GRAPHICS_PRESETS } from "../config/graphics.ts";

interface Props {
  preferences: Preferences;
  sound: boolean;
  ready: boolean;
  onSound: () => void;
  onStart: (preferences: Preferences) => void;
  onClose: () => void;
}

export function GameSetup({
  preferences,
  sound,
  ready,
  onSound,
  onStart,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(preferences);
  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <GameOverlay
      title="Ustawienia nowego meczu"
      className="settings-scrim"
      onDismiss={onClose}
    >
      <form
        className="setup-form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(draft);
        }}
      >
        <div className="setup-heading">
          <div>
            <span className="overlay-kicker">TWÓJ STÓŁ. TWOJE ZASADY.</span>
            <h2>Przygotuj mecz.</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Zamknij ustawienia"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <p className="setup-intro">
          Na telefonie gra wypełnia ekran. Wybierz Auto, a stół obróci się razem
          z urządzeniem.
        </p>
        <fieldset className="arena-picker">
          <legend>Wybierz arenę</legend>
          {Object.entries(ARENAS).map(([id, arena]) => (
            <label key={id} className={`arena-option arena-${id} ${draft.arena === id ? "selected" : ""}`}>
              <input type="radio" name="arena" value={id} checked={draft.arena === id}
                onChange={() => set("arena", id as Preferences["arena"])} />
              <span className="arena-swatch" aria-hidden="true"><i /><i /><b /></span>
              <strong>{arena.label}</strong><small>{arena.description}</small>
            </label>
          ))}
        </fieldset>
        <fieldset className="graphics-picker">
          <legend>Jakość grafiki</legend>
          <div className="effect-presets">
            {Object.entries(GRAPHICS_PRESETS).map(([key, preset]) => (
              <label key={key} className={draft.graphicsQuality === key ? "selected" : ""}>
                <input type="radio" name="graphics-quality" value={key} checked={draft.graphicsQuality === key}
                  onChange={() => set("graphicsQuality", key as Preferences["graphicsQuality"])} />
                {preset.label}
              </label>
            ))}
          </div>
          <p>{GRAPHICS_PRESETS[draft.graphicsQuality].description}</p>
          <small>Siłę i przełączniki efektów ustawiasz niezależnie poniżej.</small>
        </fieldset>
        <details className="setup-details effects-settings">
          <summary>Efekty wizualne</summary>
          <div className="tuning-fields">
            <label>
              <span>Siła efektów na stole <output>{draft.effectIntensity}%</output></span>
              <input type="range" aria-label="Siła efektów na stole" min="0" max="125" step="5"
                value={draft.effectIntensity} onChange={(event) => set("effectIntensity", Number(event.target.value))} />
              <small>0% wyłącza efekty na stole. 100% to obecna siła, 125% delikatnie ją wzmacnia.</small>
            </label>
          </div>
          <div className="effect-presets" role="group" aria-label="Szybki wybór siły efektów">
            {[{ label: "Subtelne", value: 50 }, { label: "Standardowe", value: 100 }, { label: "Mocniejsze", value: 125 }].map(({label, value}) => (
              <button key={value} type="button" className="control-button" aria-pressed={draft.effectIntensity === value}
                onClick={() => set("effectIntensity", value)}>{label}</button>
            ))}
          </div>
          <div className="effect-toggles">
            {EFFECT_OPTIONS.map(({key, label, help}) => (
              <label key={key}>
                <input type="checkbox" checked={draft[key]} onChange={(event) => set(key, event.target.checked)} />
                <span>{label}<small>{help}</small></span>
              </label>
            ))}
          </div>
          <label className="motion-toggle">
            <input type="checkbox" checked={draft.screenShake}
              onChange={(event) => set("screenShake", event.target.checked)} />
            Delikatne drgania przy golach i mocnych strzałach
          </label>
          <p className="motion-note">Ograniczenie ruchu w systemie wyłącza drgania i animowane efekty.</p>
        </details>
        <div className="setup-grid">
          <label>
            Punkty do wygranej
            <input
              aria-label="Punkty do wygranej"
              type="number"
              min="1"
              max="99"
              value={draft.winningScore}
              onChange={(event) =>
                set(
                  "winningScore",
                  Math.max(1, Math.min(99, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
          <label>
            Poziom AI
            <select
              aria-label="Poziom AI"
              value={draft.difficulty}
              onChange={(event) =>
                set(
                  "difficulty",
                  event.target.value as Preferences["difficulty"],
                )
              }
            >
              <option value="easy">Łatwy</option>
              <option value="medium">Średni</option>
              <option value="hard">Trudny</option>
            </select>
          </label>
          <label>
            Orientacja stołu
            <select
              aria-label="Orientacja stołu"
              value={draft.orientation}
              onChange={(event) =>
                set(
                  "orientation",
                  event.target.value as Preferences["orientation"],
                )
              }
            >
              <option value="auto">Auto · obrót z ekranem</option>
              <option value="vertical">Pionowa</option>
              <option value="horizontal">Pozioma</option>
            </select>
          </label>
          <label>
            Proporcje stołu
            <select
              aria-label="Proporcje stołu"
              value={draft.aspect}
              onChange={(event) =>
                set("aspect", event.target.value as Preferences["aspect"])
              }
            >
              <option value="auto">Auto · wypełnij ekran</option>
              <option value="16:9">16:9 · panoramiczne</option>
              <option value="4:3">4:3 · klasyczne</option>
            </select>
          </label>
        </div>
        <details className="setup-details">
          <summary>Kolor, strona i zasady meczu</summary>
          <div className="setup-grid">
            <label>
              Twoja strona w poziomie
              <select
                aria-label="Twoja strona w poziomie"
                value={draft.playerSide}
                onChange={(event) =>
                  set(
                    "playerSide",
                    event.target.value as Preferences["playerSide"],
                  )
                }
              >
                <option value="left">Lewa połowa</option>
                <option value="right">Prawa połowa</option>
              </select>
              <small>W pionie zawsze grasz na dole.</small>
            </label>
            <label>
              Kolor paletki
              <select
                aria-label="Kolor paletki"
                value={draft.theme}
                onChange={(event) =>
                  set("theme", event.target.value as Preferences["theme"])
                }
              >
                {Object.entries(THEMES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              <small>Własny kolor w arenie Neon. Lód i Retro mają spójne palety.</small>
            </label>
            <label>
              Rozmiar stołu
              <select
                aria-label="Rozmiar stołu"
                value={draft.tableSize}
                onChange={(event) =>
                  set(
                    "tableSize",
                    event.target.value as Preferences["tableSize"],
                  )
                }
              >
                {Object.entries(TABLE_SIZES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Limit czasu
              <select
                aria-label="Limit czasu"
                value={draft.timeLimitSeconds}
                onChange={(event) =>
                  set("timeLimitSeconds", Number(event.target.value))
                }
              >
                <option value="0">Bez limitu</option>
                {[60, 180, 300, 600, 900, 1800, 3600].map((s) => (
                  <option key={s} value={s}>
                    {s / 60} min
                  </option>
                ))}
              </select>
              <small>Po czasie wygrywa wyższy wynik; możliwy remis.</small>
            </label>
          </div>
        </details>
        <details className="setup-details">
          <summary>
            <SlidersHorizontal size={15} /> Dynamika i sterowanie
          </summary>
          <div className="tuning-fields">
            {TUNING_FIELDS.map((field) => (
              <label key={field.key}>
                <span>
                  {field.label}
                  <output>
                    {field.unit === "%"
                      ? Math.round(draft[field.key] * 100)
                      : Number(draft[field.key].toFixed(3))}{" "}
                    {field.unit}
                  </output>
                </span>
                <input
                  aria-label={field.label}
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={draft[field.key]}
                  onChange={(event) =>
                    set(field.key, Number(event.target.value))
                  }
                />
                <small>{field.help}</small>
              </label>
            ))}
          </div>
        </details>
        <details className="setup-details">
          <summary>Rozmiar paletek i krążka</summary>
          <div className="tuning-fields">
            <label>
              <span>Rozmiar paletek <output>Ø {draft.paddleRadius * 2} j.</output></span>
              <input type="range" aria-label="Rozmiar paletek" min="20" max="48" step="1"
                value={draft.paddleRadius} onChange={(event) => set("paddleRadius", Number(event.target.value))} />
              <small>Średnica obu paletek. Standardowo 60 jednostek stołu.</small>
            </label>
            <label>
              <span>Rozmiar krążka <output>Ø {draft.puckRadius * 2} j.</output></span>
              <input type="range" aria-label="Rozmiar krążka" min="7" max="20" step="1"
                value={draft.puckRadius} onChange={(event) => set("puckRadius", Number(event.target.value))} />
              <small>Średnica krążka. Standardowo 26 jednostek stołu. Rozmiar zmienia też kolizje.</small>
            </label>
          </div>
        </details>
        <div className="setup-audio">
          <span>Dźwięki gry</span>
          <button
            type="button"
            className="control-button"
            role="switch"
            aria-label="Dźwięki w ustawieniach"
            aria-checked={sound}
            onClick={onSound}
          >
            {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
            {sound ? "Włączone" : "Wyłączone"}
          </button>
        </div>
        <ControlGuide />
        <div className="setup-actions">
          <button type="submit" className="primary-button" disabled={!ready}>
            Rozpocznij mecz <ArrowRight size={18} />
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setDraft({ ...DEFAULT_PREFERENCES })}
          >
            <RotateCcw size={14} /> Ustawienia domyślne
          </button>
        </div>
      </form>
    </GameOverlay>
  );
}
