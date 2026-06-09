import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SiteMain } from "@/components/SiteMain";

const STEPS = [
  {
    n: "01",
    title: "Abrir rodada",
    text: "Admin abre a rodada da Copa no Discord com modo free e/ou CHZ.",
    icon: "🏟️",
  },
  {
    n: "02",
    title: "Conectar wallet",
    text: "Vincule sua carteira ao Discord com assinatura segura.",
    icon: "🔗",
  },
  {
    n: "03",
    title: "Enviar palpites",
    text: "Palpite pelo site ou Discord — mesmo fluxo, mesmos resultados.",
    icon: "⚽",
  },
  {
    n: "04",
    title: "Validar CHZ",
    text: "Bot confirma a transferência na blockchain antes de validar sua entrada no bolão.",
    icon: "✓",
  },
] as const;

const MARQUEE = [
  "Copa 2026",
  "Chiliz Spicy Testnet",
  "Palpites on-chain",
  "Ranking ao vivo",
  "Non-custodial",
  "Discord + Web",
  "Validação por tx hash",
  "FIFA vibes",
];

export default function HomePage() {
  return (
    <>
      <PageHeader />
      <SiteMain className="pb-16 pt-6 sm:pt-10">
        {/* Hero */}
        <section className="animate-fade-up mb-16">
          <div className="badge-pill mb-5">
            <span className="badge-pill-dot" />
            Copa do Mundo 2026 · Chiliz Chain
          </div>

          <h1 className="max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            O maior palpiteiro
            <span className="mt-1 block glow-text-animated">da Copa on-chain</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-zinc-400 sm:text-xl">
            Visual de campeonato, fluxo rápido e validação na Chiliz. Jogue grátis
            no Discord ou entre no modo CHZ com transferência direta — sem contrato
            inteligente, sem custódia.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/palpites" className="btn-primary pulse-glow">
              Palpitar agora
            </Link>
            <Link href="#como-funciona" className="btn-secondary">
              Como funciona
            </Link>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <StatCard label="Rede" value="Chiliz Spicy" delay={1} />
            <StatCard label="Modo grátis" value="/palpite Discord" delay={2} />
            <StatCard label="Bolão CHZ" value="/bolao-chz" delay={3} />
          </div>
        </section>

        {/* Marquee */}
        <div className="marquee-wrap animate-fade-up animate-fade-up-delay-2 mb-16">
          <div className="marquee-track">
            {[...MARQUEE, ...MARQUEE].map((item, i) => (
              <span key={`${item}-${i}`} className="marquee-item">
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Feature grid */}
        <section className="mb-16 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="glass-panel-strong card-hover scanline-card animate-fade-up animate-fade-up-delay-3 rounded-3xl p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-chiliz">
              Match Center
            </p>
            <h2 className="mt-2 text-3xl font-bold">Rodada Copa · Live</h2>
            <p className="mt-3 text-zinc-400">
              Painel unificado para admin abrir rodadas e membros palpitarem pelo
              site com a mesma experiência do Discord.
            </p>

            <div className="mt-6 space-y-3">
              <InfoRow k="Kickoff" v="Rodada liberada no Discord" />
              <InfoRow k="FREE" v="Palpite sem custo" />
              <InfoRow k="CHZ" v="Entrada + premiação" />
              <InfoRow k="Check" v="Validação por tx hash" />
            </div>

            <div className="mt-6 space-y-3">
              <ProgressBar label="Engajamento da rodada" percent={82} />
              <ProgressBar label="Pagamentos confirmados" percent={67} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <FeatureCard
              title="Palpites Web"
              desc="Envie seus palpites da Copa direto pelo navegador."
              href="/palpites"
              accent="from-chiliz/20 to-transparent"
              delay={3}
            />
            <FeatureCard
              title="Chiliscan"
              desc="Acompanhe transações na testnet em tempo real."
              href="https://testnet.chiliscan.com"
              external
              accent="from-purple-900/30 to-transparent"
              delay={4}
            />
            <div className="glass-panel float-soft animate-fade-up animate-fade-up-delay-5 rounded-3xl p-5">
              <p className="text-sm text-zinc-400">
                <span className="font-semibold text-zinc-200">Non-custodial:</span>{" "}
                o bot não segura dinheiro dos membros — apenas valida pagamentos na
                blockchain.
              </p>
            </div>
          </div>
        </section>

        {/* Steps */}
        <section id="como-funciona" className="mb-16">
          <div className="mb-8 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-chiliz">
              Como funciona
            </p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">
              Match day em <span className="text-gradient-gold">4 passos</span>
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, idx) => (
              <StepCard key={step.n} {...step} delay={idx} />
            ))}
          </div>
        </section>

        {/* Modes */}
        <section className="mb-16 grid gap-5 md:grid-cols-2">
          <ModeCard
            title="Modo FREE"
            subtitle="Para quem quer jogar sem custo"
            emoji="🎯"
            points={[
              "Palpite rápido pelo Discord",
              "Ranking e canal de resultados",
              "Ideal para engajar a comunidade",
            ]}
            variant="emerald"
          />
          <ModeCard
            title="Modo CHZ"
            subtitle="Para quem quer competir valendo prêmio"
            emoji="💎"
            points={[
              "Pagamento CHZ na blockchain",
              "Transação assinada na carteira",
              "Validação automática por tx hash",
            ]}
            variant="chiliz"
          />
        </section>

        {/* CTA */}
        <section className="glass-panel-strong animate-fade-up rounded-3xl p-8 text-center sm:p-12">
          <h2 className="text-3xl font-black sm:text-4xl">
            Seus palpites não vão se fazer sozinhos
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Conecte a wallet, vincule ao Discord e trave seus palpites da Copa antes
            do apito inicial.
          </p>
          <Link href="/palpites" className="btn-primary mt-8 inline-flex">
            Entrar na rodada
          </Link>
        </section>
      </SiteMain>
    </>
  );
}

function StatCard({
  label,
  value,
  delay,
}: {
  label: string;
  value: string;
  delay: number;
}) {
  return (
    <div
      className={`stat-card animate-fade-up animate-fade-up-delay-${delay}`}
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-zinc-100">{value}</p>
    </div>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 px-4 py-3 text-sm">
      <span className="text-zinc-500">{k}</span>
      <span className="font-medium text-zinc-200">{v}</span>
    </div>
  );
}

function ProgressBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="font-semibold text-chiliz-gold">{percent}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  desc,
  href,
  external,
  accent,
  delay,
}: {
  title: string;
  desc: string;
  href: string;
  external?: boolean;
  accent: string;
  delay: number;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={`glass-panel card-hover animate-fade-up animate-fade-up-delay-${delay} group block rounded-3xl bg-gradient-to-br ${accent} p-5`}
    >
      <h3 className="text-lg font-bold transition group-hover:text-chiliz-gold">
        {title} →
      </h3>
      <p className="mt-1 text-sm text-zinc-400">{desc}</p>
    </Link>
  );
}

function StepCard({
  n,
  title,
  text,
  icon,
  delay,
}: {
  n: string;
  title: string;
  text: string;
  icon: string;
  delay: number;
}) {
  return (
    <div
      className="step-card glass-panel card-hover rounded-2xl p-5"
      style={{ animationDelay: `${delay * 100}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs font-black tracking-wider text-chiliz">{n}</span>
      </div>
      <h3 className="mt-3 font-bold">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{text}</p>
    </div>
  );
}

function ModeCard({
  title,
  subtitle,
  emoji,
  points,
  variant,
}: {
  title: string;
  subtitle: string;
  emoji: string;
  points: string[];
  variant: "emerald" | "chiliz";
}) {
  const border =
    variant === "emerald"
      ? "border-emerald-500/30 bg-emerald-950/10"
      : "border-chiliz/40 bg-chiliz/5";

  return (
    <div className={`card-hover rounded-3xl border p-6 sm:p-8 ${border}`}>
      <span className="text-3xl">{emoji}</span>
      <h3 className="mt-3 text-2xl font-bold">{title}</h3>
      <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      <ul className="mt-5 space-y-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2 text-sm text-zinc-200">
            <span className="text-chiliz-gold">✦</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
