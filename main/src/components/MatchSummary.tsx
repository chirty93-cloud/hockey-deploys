import type { MatchStats } from "../game/types.ts";

const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export function MatchSummary({ stats }: { stats: MatchStats }) {
  const fastest = Math.max(stats.player.fastestShot, stats.ai.fastestShot);
  const highlight = stats.player.bankGoals
    ? `Gole po bandzie: ${stats.player.bankGoals} · TY`
    : fastest > 0 ? `Strzał meczu: ${stats.player.fastestShot >= stats.ai.fastestShot ? "TY" : "AI"} · ${Math.round(fastest)} j./s`
      : "Każdy mecz to nowa szansa.";
  return (
    <section className="match-summary" aria-label="Podsumowanie meczu">
      <div className="summary-highlight"><span>MOMENT MECZU</span><strong>{highlight}</strong></div>
      <table>
        <caption>Podsumowanie meczu</caption>
        <thead><tr><th scope="col">Statystyka</th><th scope="col">TY</th><th scope="col">AI</th></tr></thead>
        <tbody>
          <tr><th scope="row">Uderzenia</th><td>{stats.player.hits}</td><td>{stats.ai.hits}</td></tr>
          <tr><th scope="row">Obrony</th><td>{stats.player.saves}</td><td>{stats.ai.saves}</td></tr>
          <tr><th scope="row">Najmocniejszy strzał <small>j./s</small></th><td>{Math.round(stats.player.fastestShot)}</td><td>{Math.round(stats.ai.fastestShot)}</td></tr>
          <tr><th scope="row">Gole po bandzie</th><td>{stats.player.bankGoals}</td><td>{stats.ai.bankGoals}</td></tr>
        </tbody>
      </table>
      <div className="rally-summary">
        <span>Czas gry<strong>{duration(stats.elapsed)}</strong></span>
        <span>Najdłuższa wymiana<strong>{stats.longestRally.toFixed(1)} s</strong></span>
        <span>Najwięcej uderzeń w wymianie<strong>{stats.longestRallyHits}</strong></span>
      </div>
      <p className="summary-note">Obrona: kontakt z krążkiem lecącym w światło bramki. Prędkość w jednostkach stołu na sekundę.</p>
    </section>
  );
}
