import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type Team = { code: string; name: string; iso2: string };
type Pick = 0 | 1 | null;
type Match = [Team | null, Team | null];
type Slot = `${string}${1 | 2 | 3 | 4}`;
type GroupState = Record<string, Team[]>;

const STORAGE_KEY = "copa-x-draft-v2";

const GROUPS: Array<{ group: string; teams: Team[] }> = [
  { group: "A", teams: [{ code: "MEX", name: "Mexico", iso2: "mx" }, { code: "RSA", name: "South Africa", iso2: "za" }, { code: "KOR", name: "Korea Republic", iso2: "kr" }, { code: "CZE", name: "Czechia", iso2: "cz" }] },
  { group: "B", teams: [{ code: "CAN", name: "Canada", iso2: "ca" }, { code: "BIH", name: "Bosnia and Herzegovina", iso2: "ba" }, { code: "QAT", name: "Qatar", iso2: "qa" }, { code: "SUI", name: "Switzerland", iso2: "ch" }] },
  { group: "C", teams: [{ code: "BRA", name: "Brazil", iso2: "br" }, { code: "MAR", name: "Morocco", iso2: "ma" }, { code: "HAI", name: "Haiti", iso2: "ht" }, { code: "SCO", name: "Scotland", iso2: "gb-sct" }] },
  { group: "D", teams: [{ code: "USA", name: "USA", iso2: "us" }, { code: "PAR", name: "Paraguay", iso2: "py" }, { code: "AUS", name: "Australia", iso2: "au" }, { code: "TUR", name: "Turkiye", iso2: "tr" }] },
  { group: "E", teams: [{ code: "GER", name: "Germany", iso2: "de" }, { code: "CUR", name: "Curacao", iso2: "cw" }, { code: "CIV", name: "Cote d'Ivoire", iso2: "ci" }, { code: "ECU", name: "Ecuador", iso2: "ec" }] },
  { group: "F", teams: [{ code: "NED", name: "Netherlands", iso2: "nl" }, { code: "JPN", name: "Japan", iso2: "jp" }, { code: "SWE", name: "Sweden", iso2: "se" }, { code: "TUN", name: "Tunisia", iso2: "tn" }] },
  { group: "G", teams: [{ code: "BEL", name: "Belgium", iso2: "be" }, { code: "EGY", name: "Egypt", iso2: "eg" }, { code: "IRN", name: "IR Iran", iso2: "ir" }, { code: "NZL", name: "New Zealand", iso2: "nz" }] },
  { group: "H", teams: [{ code: "ESP", name: "Spain", iso2: "es" }, { code: "CPV", name: "Cabo Verde", iso2: "cv" }, { code: "KSA", name: "Saudi Arabia", iso2: "sa" }, { code: "URU", name: "Uruguay", iso2: "uy" }] },
  { group: "I", teams: [{ code: "FRA", name: "France", iso2: "fr" }, { code: "SEN", name: "Senegal", iso2: "sn" }, { code: "IRQ", name: "Iraq", iso2: "iq" }, { code: "NOR", name: "Norway", iso2: "no" }] },
  { group: "J", teams: [{ code: "ARG", name: "Argentina", iso2: "ar" }, { code: "ALG", name: "Algeria", iso2: "dz" }, { code: "AUT", name: "Austria", iso2: "at" }, { code: "JOR", name: "Jordan", iso2: "jo" }] },
  { group: "K", teams: [{ code: "POR", name: "Portugal", iso2: "pt" }, { code: "COD", name: "Congo DR", iso2: "cd" }, { code: "UZB", name: "Uzbekistan", iso2: "uz" }, { code: "COL", name: "Colombia", iso2: "co" }] },
  { group: "L", teams: [{ code: "ENG", name: "England", iso2: "gb-eng" }, { code: "CRO", name: "Croatia", iso2: "hr" }, { code: "GHA", name: "Ghana", iso2: "gh" }, { code: "PAN", name: "Panama", iso2: "pa" }] },
];

const ROUND32_SLOTS: [Slot, Slot][] = [
  ["E1", "C3"], ["I1", "G3"], ["A2", "B2"], ["F1", "C2"],
  ["K2", "L2"], ["H1", "J2"], ["D1", "B3"], ["G1", "A3"],
  ["C1", "F2"], ["E2", "I2"], ["A1", "H3"], ["L1", "E3"],
  ["J1", "H2"], ["D2", "G2"], ["B1", "F3"], ["K1", "D3"],
];

const emptyPicks = (n: number) => Array<Pick>(n).fill(null);

function winner(match: Match, pick: Pick): Team | null {
  return pick == null ? null : (match[pick] ?? null);
}

function buildRound(previousWinners: Array<Team | null>): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < previousWinners.length; i += 2) {
    matches.push([previousWinners[i] ?? null, previousWinners[i + 1] ?? null]);
  }
  return matches;
}

function simulatePicks(matches: Match[]): Pick[] {
  return matches.map(([a, b]) => (!a || !b ? null : (Math.random() > 0.5 ? 0 : 1)));
}

function defaultGroupState(): GroupState {
  return Object.fromEntries(GROUPS.map((g) => [g.group, [...g.teams]]));
}

function teamBySlot(groups: GroupState, slot: Slot): Team | null {
  const group = slot.charAt(0);
  const pos = Number(slot.slice(1));
  const arr = groups[group];
  if (!arr || pos < 1 || pos > 4) return null;
  return arr[pos - 1] ?? null;
}

function toFlagUrl(iso2: string): string | null {
  if (iso2.includes("-")) return null;
  return `https://flagcdn.com/w40/${iso2.toLowerCase()}.png`;
}

export function CopaXSimulator() {
  const [groups, setGroups] = useState<GroupState>(defaultGroupState);
  const [dragging, setDragging] = useState<{ group: string; index: number } | null>(null);
  const [r32, setR32] = useState<Pick[]>(emptyPicks(16));
  const [r16, setR16] = useState<Pick[]>(emptyPicks(8));
  const [qf, setQf] = useState<Pick[]>(emptyPicks(4));
  const [sf, setSf] = useState<Pick[]>(emptyPicks(2));
  const [finalPick, setFinalPick] = useState<Pick[]>(emptyPicks(1));
  const [feedback, setFeedback] = useState("");

  const round32 = useMemo<Match[]>(
    () => ROUND32_SLOTS.map(([a, b]) => [teamBySlot(groups, a), teamBySlot(groups, b)]),
    [groups],
  );
  const left32 = round32.slice(0, 8);
  const right32 = round32.slice(8);

  const leftW32 = useMemo(() => left32.map((m, i) => winner(m, r32[i])), [left32, r32]);
  const rightW32 = useMemo(() => right32.map((m, i) => winner(m, r32[i + 8])), [right32, r32]);
  const left16 = useMemo(() => buildRound(leftW32), [leftW32]);
  const right16 = useMemo(() => buildRound(rightW32), [rightW32]);
  const leftW16 = useMemo(() => left16.map((m, i) => winner(m, r16[i])), [left16, r16]);
  const rightW16 = useMemo(() => right16.map((m, i) => winner(m, r16[i + 4])), [right16, r16]);
  const leftQf = useMemo(() => buildRound(leftW16), [leftW16]);
  const rightQf = useMemo(() => buildRound(rightW16), [rightW16]);
  const leftWQf = useMemo(() => leftQf.map((m, i) => winner(m, qf[i])), [leftQf, qf]);
  const rightWQf = useMemo(() => rightQf.map((m, i) => winner(m, qf[i + 2])), [rightQf, qf]);
  const leftSf = useMemo(() => buildRound(leftWQf), [leftWQf]);
  const rightSf = useMemo(() => buildRound(rightWQf), [rightWQf]);
  const leftChampion = useMemo(() => winner(leftSf[0] ?? [null, null], sf[0]), [leftSf, sf]);
  const rightChampion = useMemo(() => winner(rightSf[0] ?? [null, null], sf[1]), [rightSf, sf]);
  const finalMatch = useMemo<Match>(() => [leftChampion, rightChampion], [leftChampion, rightChampion]);
  const champion = useMemo(() => winner(finalMatch, finalPick[0]), [finalMatch, finalPick]);

  const decided = useMemo(
    () => [...r32, ...r16, ...qf, ...sf, ...finalPick].filter((p) => p != null).length,
    [r32, r16, qf, sf, finalPick],
  );

  const selectedThirdSlots = useMemo(() => {
    const set = new Set<string>();
    for (const [a, b] of ROUND32_SLOTS) {
      if (a.endsWith("3")) set.add(a);
      if (b.endsWith("3")) set.add(b);
    }
    return [...set].sort();
  }, []);

  const thirdRows = useMemo(() => {
    const rows = GROUPS.map((g) => ({ group: g.group, team: groups[g.group]?.[2] ?? null }));
    return rows.sort((a, b) => a.group.localeCompare(b.group));
  }, [groups]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        groups?: GroupState;
        r32?: Pick[];
        r16?: Pick[];
        qf?: Pick[];
        sf?: Pick[];
        finalPick?: Pick[];
      };
      if (parsed.groups) setGroups(parsed.groups);
      if (parsed.r32?.length === 16) setR32(parsed.r32);
      if (parsed.r16?.length === 8) setR16(parsed.r16);
      if (parsed.qf?.length === 4) setQf(parsed.qf);
      if (parsed.sf?.length === 2) setSf(parsed.sf);
      if (parsed.finalPick?.length === 1) setFinalPick(parsed.finalPick);
    } catch {
      // ignore corrupted draft
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ groups, r32, r16, qf, sf, finalPick }));
  }, [groups, r32, r16, qf, sf, finalPick]);

  function clearAll() {
    setGroups(defaultGroupState());
    setR32(emptyPicks(16));
    setR16(emptyPicks(8));
    setQf(emptyPicks(4));
    setSf(emptyPicks(2));
    setFinalPick(emptyPicks(1));
    setFeedback("Rascunho local limpo.");
  }

  function simulateAll() {
    const s32 = simulatePicks(round32);
    const lW32 = left32.map((m, i) => winner(m, s32[i]));
    const rW32 = right32.map((m, i) => winner(m, s32[i + 8]));
    const l16 = buildRound(lW32);
    const r16m = buildRound(rW32);
    const s16L = simulatePicks(l16);
    const s16R = simulatePicks(r16m);
    const s16 = [...s16L, ...s16R];
    const lW16 = l16.map((m, i) => winner(m, s16L[i]));
    const rW16 = r16m.map((m, i) => winner(m, s16R[i]));
    const lQf = buildRound(lW16);
    const rQf = buildRound(rW16);
    const sQfL = simulatePicks(lQf);
    const sQfR = simulatePicks(rQf);
    const sQf = [...sQfL, ...sQfR];
    const lWQf = lQf.map((m, i) => winner(m, sQfL[i]));
    const rWQf = rQf.map((m, i) => winner(m, sQfR[i]));
    const lSf = buildRound(lWQf);
    const rSf = buildRound(rWQf);
    const sSf: Pick[] = [simulatePicks(lSf)[0], simulatePicks(rSf)[0]];
    const finalP: Pick[] = [Math.random() > 0.5 ? 0 : 1];
    setR32(s32);
    setR16(s16);
    setQf(sQf);
    setSf(sSf);
    setFinalPick(finalP);
    setFeedback("Simulação preenchida.");
  }

  function onDrop(group: string, targetIndex: number) {
    if (!dragging || dragging.group !== group || dragging.index === targetIndex) return;
    setGroups((prev) => {
      const arr = [...prev[group]];
      const [item] = arr.splice(dragging.index, 1);
      arr.splice(targetIndex, 0, item);
      return { ...prev, [group]: arr };
    });
  }

  return (
    <section className="copa-x-panel mb-8 animate-fade-up">
      <div className="copa-x-head">
        <div>
          <p className="copa-x-badge">BOLÃO COPA X</p>
          <h2 className="copa-x-title">Chaveamento completo</h2>
        </div>
        <div className="copa-x-stats">
          <Stat title="Classificados" value="32/32" />
          <Stat title="Partidas decididas" value={`${decided}/31`} />
          <Stat title="Campeão" value={champion?.code ?? "-"} />
        </div>
      </div>

      <div className="copa-x-actions">
        <button className="btn-secondary" onClick={() => setFeedback("Entrar no modo Copa X salvo localmente.")}>Entrar</button>
        <button className="btn-secondary" onClick={simulateAll}>Simular</button>
        <button className="btn-secondary" onClick={clearAll}>Limpar</button>
        <button className="btn-secondary" onClick={() => setFeedback("Ranking Copa X será integrado ao backend.")}>Ranking</button>
        <button className="btn-primary" onClick={() => setFeedback("Rascunho local salvo neste navegador.")}>Salvar</button>
      </div>
      {feedback && <p className="mt-3 text-sm text-zinc-400">{feedback}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_2fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.group} className="copa-group">
              <p className="copa-group-title">Grupo {g.group}</p>
              <ul className="space-y-1.5">
                {(groups[g.group] ?? []).map((team, idx) => (
                  <li
                    key={team.code}
                    className="copa-group-item"
                    draggable
                    onDragStart={() => setDragging({ group: g.group, index: idx })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(g.group, idx)}
                  >
                    <span className="text-zinc-500">{idx + 1}</span>
                    <Flag team={team} />
                    <span className="font-semibold">{team.code}</span>
                    <span className="truncate text-zinc-400">{team.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="copa-group sm:col-span-2">
            <p className="copa-group-title">Melhores 3º dos grupos (8 avançam)</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {thirdRows.map(({ group, team }) => {
                const key = `${group}3`;
                const selected = selectedThirdSlots.includes(key);
                return (
                  <li key={group} className="copa-group-item">
                    <span className="text-zinc-500">{group}</span>
                    {team ? <Flag team={team} /> : <span />}
                    <span className="font-semibold">{team?.code ?? "-"}</span>
                    <span className={`truncate ${selected ? "text-emerald-300" : "text-zinc-500"}`}>
                      {team?.name ?? "A definir"} {selected ? "✓" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto_1fr_1fr]">
          <Round title="Oitavas" matches={left32} picks={r32.slice(0, 8)} onPick={(next) => setR32([...next, ...r32.slice(8)])} />
          <Round title="Quartas/Semi" matches={[...left16, ...leftQf, ...leftSf]} picks={[...r16.slice(0, 4), ...qf.slice(0, 2), ...sf.slice(0, 1)]} onPick={(next) => {
            setR16([...next.slice(0, 4), ...r16.slice(4)]);
            setQf([...next.slice(4, 6), ...qf.slice(2)]);
            setSf([...next.slice(6, 7), ...sf.slice(1)]);
          }} />

          <div className="copa-final-col">
            <p className="copa-round-title">Final</p>
            <div className="copa-match">
              <FinalTeamButton team={finalMatch[0]} selected={finalPick[0] === 0} onClick={() => setFinalPick([0])} />
              <FinalTeamButton team={finalMatch[1]} selected={finalPick[0] === 1} onClick={() => setFinalPick([1])} />
            </div>
            <div className="mt-3 text-center text-xs text-zinc-400">
              Campeão: <strong className="text-chiliz-gold">{champion?.code ?? "a definir"}</strong>
            </div>
          </div>

          <Round title="Quartas/Semi" matches={[...right16, ...rightQf, ...rightSf]} picks={[...r16.slice(4), ...qf.slice(2), ...sf.slice(1)]} onPick={(next) => {
            setR16([...r16.slice(0, 4), ...next.slice(0, 4)]);
            setQf([...qf.slice(0, 2), ...next.slice(4, 6)]);
            setSf([...sf.slice(0, 1), ...next.slice(6, 7)]);
          }} />
          <Round title="Oitavas" matches={right32} picks={r32.slice(8)} onPick={(next) => setR32([...r32.slice(0, 8), ...next])} />
        </div>
      </div>
    </section>
  );
}

function Round({
  title,
  matches,
  picks,
  onPick,
}: {
  title: string;
  matches: Match[];
  picks: Pick[];
  onPick: (next: Pick[]) => void;
}) {
  return (
    <div className="copa-round">
      <p className="copa-round-title">{title}</p>
      <div className="space-y-2">
        {matches.map((match, idx) => (
          <div key={`${title}-${idx}`} className="copa-match">
            {[0, 1].map((side) => {
              const team = match[side as 0 | 1];
              const selected = picks[idx] === side;
              return (
                <button
                  key={side}
                  type="button"
                  disabled={!team}
                  onClick={() => {
                    const copy = [...picks];
                    copy[idx] = side as 0 | 1;
                    onPick(copy);
                  }}
                  className={`copa-team ${selected ? "copa-team-selected" : ""}`}
                >
                  {team ? (
                    <span className="flex items-center gap-1.5">
                      <Flag team={team} small />
                      {team.code}
                    </span>
                  ) : "A definir"}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Flag({ team, small }: { team: Team; small?: boolean }) {
  const url = toFlagUrl(team.iso2);
  const size = small ? 14 : 16;
  if (!url) return <span className="text-[10px] text-zinc-500">🏳️</span>;
  return (
    <Image
      src={url}
      alt={team.code}
      width={size}
      height={size}
      unoptimized
      className="rounded-[2px] border border-white/10"
    />
  );
}

function FinalTeamButton({
  team,
  selected,
  onClick,
}: {
  team: Team | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!team}
      onClick={onClick}
      className={`copa-team ${selected ? "copa-team-selected" : ""}`}
    >
      {team ? (
        <span className="flex items-center gap-2">
          <Flag team={team} />
          <span className="font-semibold">{team.code}</span>
          <span className="truncate text-zinc-400">{team.name}</span>
        </span>
      ) : "A definir"}
    </button>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="copa-stat">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
