import { Keyboard, MousePointer2, Smartphone } from "lucide-react";

export function ControlGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`control-guide ${compact ? 'compact-guide' : ''}`}>
      <div>
        <MousePointer2 size={18} />
        <span>
          <strong>Mysz</strong>Przesuwaj kursor nad stołem.
        </span>
      </div>
      <div>
        <Smartphone size={18} />
        <span>
          <strong>Dotyk</strong>{compact ? 'Dotknij i przeciągaj palcem.' : 'Dotknij swojej połowy i przeciągaj palcem.'}
        </span>
      </div>
      <div>
        <Keyboard size={18} />
        <span>
          <strong>Strzałki lub WASD</strong>{compact ? <>Kliknij stół. <kbd>P</kbd> — pauza.</> : <>Kliknij stół, aby sterować klawiaturą. <kbd>P</kbd> / <kbd>Spacja</kbd> — pauza, <kbd>Esc</kbd> — wznów.</>}
        </span>
      </div>
    </div>
  );
}
