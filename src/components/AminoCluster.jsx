import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Dna, FlaskConical, Microscope } from 'lucide-react';
import PageTransition from '../PageTransition';
import useUiSounds from '../hooks/useUiSounds';
import aminoData from '../data/aminoAcids.json';

void motion;

// ─── Constants ────────────────────────────────────────────────────────────────

const FEATURES = [
  { key: 'mw',         label: 'Mol. Weight',    unit: 'Da' },
  { key: 'pi',         label: 'Isoelectric pt',  unit: 'pI' },
  { key: 'hydropathy', label: 'Hydropathy',      unit: 'KD' },
  { key: 'vdwVolume',  label: 'VdW Volume',      unit: 'Å³' },
  { key: 'polarity',   label: 'Polarity',        unit: 'Gr' },
];

const GROUP_COLORS = {
  'Nonpolar Aliphatic': '#888888',
  'Aromatic':           '#f0a500',
  'Polar Uncharged':    '#a8dadc',
  'Positively Charged': '#e4000f',
  'Negatively Charged': '#4cc9f0',
};

const GROUPS = Object.keys(GROUP_COLORS);

const SVG_W = 580;
const SVG_H = 460;
const PAD   = 50;

// ─── PCA (pure JS, power iteration + deflation) ───────────────────────────────

function standardize(matrix) {
  const n = matrix.length;
  const m = matrix[0].length;
  const means = Array.from({ length: m }, (_, j) =>
    matrix.reduce((s, row) => s + row[j], 0) / n,
  );
  const stds = Array.from({ length: m }, (_, j) =>
    Math.sqrt(matrix.reduce((s, row) => s + (row[j] - means[j]) ** 2, 0) / n),
  );
  return matrix.map(row =>
    row.map((v, j) => (stds[j] > 1e-10 ? (v - means[j]) / stds[j] : 0)),
  );
}

function matMul(A, B) {
  return A.map(rowA =>
    B[0].map((_, j) => rowA.reduce((s, aij, k) => s + aij * B[k][j], 0)),
  );
}

function transpose(M) {
  return M[0].map((_, j) => M.map(row => row[j]));
}

function covMatrix(X) {
  const n = X.length;
  return matMul(transpose(X), X).map(row => row.map(v => v / (n - 1)));
}

function normalize(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 1e-12 ? v.map(x => x / norm) : v;
}

function topEigenvector(C) {
  const m = C.length;
  // deterministic non-degenerate seed
  let v = normalize(Array.from({ length: m }, (_, i) => i + 1));
  for (let iter = 0; iter < 500; iter++) {
    v = normalize(C.map(row => row.reduce((s, c, j) => s + c * v[j], 0)));
  }
  return v;
}

function eigVal(C, v) {
  const Cv = C.map(row => row.reduce((s, c, j) => s + c * v[j], 0));
  return v.reduce((s, vi, i) => s + vi * Cv[i], 0);
}

function deflate(C, v) {
  const lam = eigVal(C, v);
  return C.map((row, i) => row.map((cij, j) => cij - lam * v[i] * v[j]));
}

function runPCA(featureKeys) {
  if (featureKeys.length < 2) {
    return { coords: aminoData.map(() => [0, 0]), pct1: 0, pct2: 0 };
  }
  const matrix = aminoData.map(aa => featureKeys.map(k => aa[k]));
  const Z  = standardize(matrix);
  const C  = covMatrix(Z);
  const v1 = topEigenvector(C);
  const l1 = eigVal(C, v1);
  const v2 = topEigenvector(deflate(C, v1));
  const l2 = eigVal(C, v2);
  const totalVar = C.reduce((s, row, i) => s + row[i], 0);
  const coords = Z.map(row => [
    row.reduce((s, z, j) => s + z * v1[j], 0),
    row.reduce((s, z, j) => s + z * v2[j], 0),
  ]);
  return {
    coords,
    pct1: Math.round(Math.max(0, (l1 / totalVar) * 1000)) / 10,
    pct2: Math.round(Math.max(0, (l2 / totalVar) * 1000)) / 10,
  };
}

// ─── SVG coordinate helpers ───────────────────────────────────────────────────

function toSVG(coords) {
  const xs = coords.map(c => c[0]);
  const ys = coords.map(c => c[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  return coords.map(([x, y]) => ({
    cx: PAD + ((x - minX) / rx) * (SVG_W - 2 * PAD),
    cy: SVG_H - PAD - ((y - minY) / ry) * (SVG_H - 2 * PAD),
  }));
}

// ─── Mini 3D structure viewer ─────────────────────────────────────────────────

function AminoViewer({ code3 }) {
  const containerRef = useRef(null);
  const viewerRef    = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    let disposed = false;

    async function load() {
      if (!containerRef.current) return;
      setLoading(true);
      setError('');
      try {
        const mod          = await import('3dmol/build/3Dmol.es6.js');
        const lib          = mod.default?.createViewer ? mod.default : mod;
        const createViewer = lib.createViewer ?? window.$3Dmol?.createViewer;
        if (!createViewer) throw new Error('3Dmol unavailable');

        if (!viewerRef.current) {
          viewerRef.current = createViewer(containerRef.current, {
            backgroundColor: '#050505',
            antialias: true,
          });
        }
        const viewer = viewerRef.current;
        viewer.clear();
        viewer.removeAllLabels();

        const res = await fetch(
          `https://files.rcsb.org/ligands/download/${code3}_ideal.sdf`,
        );
        if (!res.ok) throw new Error('SDF unavailable');
        const sdf = await res.text();

        viewer.addModel(sdf, 'sdf');
        viewer.setStyle({}, {
          stick:  { radius: 0.14, colorscheme: 'Jmol' },
          sphere: { radius: 0.28, colorscheme: 'Jmol' },
        });
        viewer.zoomTo();
        viewer.zoom(1.1, 0);
        viewer.render();

        requestAnimationFrame(() => {
          if (viewerRef.current) {
            viewerRef.current.resize();
            viewerRef.current.render();
          }
        });

        if (!disposed) setLoading(false);
      } catch {
        if (!disposed) {
          setError('Structure feed unavailable.');
          setLoading(false);
        }
      }
    }

    load();
    return () => { disposed = true; };
  }, [code3]);

  return (
    <div className="relative h-44 w-full border border-p5-white/20 bg-[#050505]">
      <div ref={containerRef} className="h-full w-full" />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.3em] text-p5-white/40">
          Loading structure…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.22em] text-p5-red/70">
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Property bar ─────────────────────────────────────────────────────────────

function PropBar({ label, value, min, max, unit }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min || 1)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em]">
        <span className="text-p5-white/55">{label}</span>
        <span className="text-p5-white">{value} {unit}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-white/10">
        <div
          className="h-full bg-p5-red transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── SVG hover tooltip ────────────────────────────────────────────────────────

function ScatterTooltip({ aa, cx, cy }) {
  const color = GROUP_COLORS[aa.group];
  const tX    = cx > SVG_W * 0.60 ? cx - 172 : cx + 16;
  const tY    = cy > SVG_H * 0.72 ? cy - 84  : cy + 12;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={tX} y={tY} width={164} height={72} rx={2}
        fill="#000000" stroke={color} strokeWidth="1.5"
      />
      <text
        x={tX + 10} y={tY + 22}
        fontSize="14" fontFamily="Oswald, sans-serif" fontStyle="italic"
        fill="white" letterSpacing="1"
      >
        {aa.name.toUpperCase()}
      </text>
      <text
        x={tX + 10} y={tY + 38}
        fontSize="9" fontFamily="sans-serif"
        fill="rgba(255,255,255,0.6)" letterSpacing="1.5"
      >
        {aa.group.toUpperCase()}
      </text>
      <text
        x={tX + 10} y={tY + 54}
        fontSize="9" fontFamily="sans-serif"
        fill="rgba(255,255,255,0.5)" letterSpacing="1"
      >
        MW {aa.mw} · pI {aa.pi} · H {aa.hydropathy}
      </text>
      <text
        x={tX + 10} y={tY + 66}
        fontSize="9" fontFamily="sans-serif"
        fill={color} letterSpacing="1"
      >
        {aa.code3} · VdW {aa.vdwVolume} Å³
      </text>
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AminoCluster() {
  const [enabledFeatures, setEnabledFeatures] = useState(FEATURES.map(f => f.key));
  const [viewMode,        setViewMode]         = useState('pca');
  const [xKey,            setXKey]             = useState('hydropathy');
  const [yKey,            setYKey]             = useState('mw');
  const [hoveredCode,     setHoveredCode]      = useState(null);
  const [selectedCode,    setSelectedCode]     = useState(null);
  const { playHover, playClick } = useUiSounds(0.22);

  const pcaResult = useMemo(() => runPCA(enabledFeatures), [enabledFeatures]);

  const plotCoords = useMemo(() => {
    if (viewMode === 'pca') return toSVG(pcaResult.coords);
    const raw = aminoData.map(aa => [aa[xKey], aa[yKey]]);
    return toSVG(raw);
  }, [viewMode, pcaResult, xKey, yKey]);

  const selectedAa = useMemo(
    () => aminoData.find(aa => aa.code === selectedCode) ?? null,
    [selectedCode],
  );

  const hoveredAa = useMemo(
    () => aminoData.find(aa => aa.code === hoveredCode) ?? null,
    [hoveredCode],
  );

  const hoveredIdx = useMemo(
    () => aminoData.findIndex(aa => aa.code === hoveredCode),
    [hoveredCode],
  );

  const toggleFeature = (key) => {
    setEnabledFeatures(prev =>
      prev.includes(key)
        ? prev.length > 2 ? prev.filter(k => k !== key) : prev
        : [...prev, key],
    );
  };

  const xAxisLabel = viewMode === 'pca'
    ? `PC1 (${pcaResult.pct1}% variance)`
    : (FEATURES.find(f => f.key === xKey)?.label ?? xKey);

  const yAxisLabel = viewMode === 'pca'
    ? `PC2 (${pcaResult.pct2}% variance)`
    : (FEATURES.find(f => f.key === yKey)?.label ?? yKey);

  const buttonFx = {
    onMouseEnter: () => playHover(),
    onFocus:      () => playHover(),
    onClick:      () => playClick(),
  };

  return (
    <PageTransition>
      <div className="relative z-10 min-h-screen p-6 md:p-12">

        {/* ── Back button ── */}
        <a
          href="https://eganegan.space"
          className="relative z-20 inline-block border-4 border-p5-black bg-p5-black px-6 py-2 text-2xl font-oswald italic uppercase text-p5-white transition-colors hover:bg-p5-white hover:text-p5-red md:text-3xl skew-x-[-15deg] [clip-path:polygon(0_0,100%_0,90%_100%,10%_100%)]"
          {...buttonFx}
        >
          ◄ Back
        </a>

        {/* ── Header ── */}
        <div className="mt-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-5xl font-oswald italic uppercase text-p5-black md:text-8xl skew-x-[-10deg] [text-shadow:4px_4px_0px_white]">
              Amino Cluster
            </h1>
            <p className="mt-3 max-w-2xl bg-p5-white/90 px-4 py-3 font-sans text-sm font-semibold uppercase tracking-[0.25em] text-p5-black shadow-[6px_6px_0_#000] md:text-base">
              Machine learning discovers amino acid groups — no labels given.
            </p>
          </div>
          <div className="border-2 border-p5-black bg-p5-black px-4 py-2 text-sm uppercase tracking-[0.24em] text-p5-white shadow-[6px_6px_0_#fff]">
            Unsupervised ML · PCA · 20 residues
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="mt-8 flex flex-wrap items-center gap-3">

          {/* View mode toggle */}
          <div className="flex border-2 border-p5-white/30">
            {(['pca', 'direct']).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { playClick(); setViewMode(mode); }}
                onMouseEnter={() => playHover()}
                className={`px-4 py-2 text-xs uppercase tracking-[0.22em] transition-colors ${
                  viewMode === mode
                    ? 'bg-p5-red text-p5-white'
                    : 'bg-transparent text-p5-white/50 hover:text-p5-white'
                }`}
              >
                {mode === 'pca' ? 'PCA Mode' : 'Direct Mode'}
              </button>
            ))}
          </div>

          {/* PCA feature toggles */}
          {viewMode === 'pca' && (
            <div className="flex flex-wrap gap-2">
              {FEATURES.map(f => {
                const active = enabledFeatures.includes(f.key);
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { playClick(); toggleFeature(f.key); }}
                    onMouseEnter={() => playHover()}
                    title={enabledFeatures.length <= 2 && active ? 'Need at least 2 features' : ''}
                    className={`border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-all ${
                      active
                        ? 'border-p5-red bg-p5-red/15 text-p5-white'
                        : 'border-p5-white/20 text-p5-white/35 hover:border-p5-white/50 hover:text-p5-white/65'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Direct mode axis selectors */}
          {viewMode === 'direct' && (
            <div className="flex flex-wrap gap-3">
              {[['X-Axis', xKey, setXKey], ['Y-Axis', yKey, setYKey]].map(([axisLabel, val, setter]) => (
                <label
                  key={axisLabel}
                  className="flex items-center gap-2 border border-p5-white/30 bg-white/5 px-3 py-1.5"
                >
                  <span className="text-[10px] uppercase tracking-[0.22em] text-p5-white/55">
                    {axisLabel}
                  </span>
                  <select
                    value={val}
                    onChange={e => { playClick(); setter(e.target.value); }}
                    className="bg-transparent text-[10px] uppercase tracking-[0.18em] text-p5-white outline-none"
                  >
                    {FEATURES.map(f => (
                      <option key={f.key} value={f.key} className="bg-p5-black normal-case">
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ── Main grid ── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.55fr] lg:items-start">

          {/* ── Scatter plot ── */}
          <div className="relative">
            <div className="absolute -inset-2 -z-10 rotate-[0.4deg] bg-p5-white [clip-path:polygon(1%_0,100%_3%,99%_100%,0_97%)]" />
            <div className="relative overflow-hidden bg-p5-black p-4 [clip-path:polygon(0_2%,97%_0,100%_98%,3%_100%)]">
              <div className="pointer-events-none absolute inset-0 z-10 opacity-35 scanlines" />

              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-p5-white/55">
                  <Activity size={12} className="text-p5-red" />
                  Cluster Scatter Plot
                </p>
                {viewMode === 'pca' && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-p5-white/35">
                    {(pcaResult.pct1 + pcaResult.pct2).toFixed(1)}% variance captured
                  </p>
                )}
              </div>

              <svg
                viewBox={`0 0 ${SVG_W} ${SVG_H + 28}`}
                width="100%"
                className="overflow-visible"
                aria-label="Amino acid property clustering scatter plot"
              >
                {/* Grid lines */}
                {[0.25, 0.5, 0.75].map(t => (
                  <g key={t}>
                    <line
                      x1={PAD + t * (SVG_W - 2 * PAD)} y1={PAD}
                      x2={PAD + t * (SVG_W - 2 * PAD)} y2={SVG_H - PAD}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                    />
                    <line
                      x1={PAD} y1={PAD + t * (SVG_H - 2 * PAD)}
                      x2={SVG_W - PAD} y2={PAD + t * (SVG_H - 2 * PAD)}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                    />
                  </g>
                ))}

                {/* Axis border */}
                <rect
                  x={PAD} y={PAD}
                  width={SVG_W - 2 * PAD} height={SVG_H - 2 * PAD}
                  fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1"
                />

                {/* Axis labels */}
                <text
                  x={SVG_W / 2} y={SVG_H + 20}
                  textAnchor="middle" fontSize="11"
                  fill="rgba(255,255,255,0.45)"
                  fontFamily="Oswald, sans-serif" letterSpacing="2"
                >
                  {xAxisLabel.toUpperCase()}
                </text>
                <text
                  x={14} y={SVG_H / 2}
                  textAnchor="middle" fontSize="11"
                  fill="rgba(255,255,255,0.45)"
                  fontFamily="Oswald, sans-serif" letterSpacing="2"
                  transform={`rotate(-90, 14, ${SVG_H / 2})`}
                >
                  {yAxisLabel.toUpperCase()}
                </text>

                {/* Dots */}
                {aminoData.map((aa, i) => {
                  const { cx, cy } = plotCoords[i];
                  const color      = GROUP_COLORS[aa.group];
                  const isHovered  = hoveredCode  === aa.code;
                  const isSelected = selectedCode === aa.code;
                  const r          = isHovered || isSelected ? 13 : 10;
                  const textColor  = aa.group === 'Positively Charged' ? '#ffffff' : '#000000';

                  return (
                    <motion.g
                      key={aa.code}
                      initial={{ x: cx, y: cy, opacity: 0 }}
                      animate={{ x: cx, y: cy, opacity: 1 }}
                      transition={{
                        x:       { type: 'spring', stiffness: 140, damping: 18 },
                        y:       { type: 'spring', stiffness: 140, damping: 18 },
                        opacity: { duration: 0.25, delay: i * 0.025 },
                      }}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => { playHover(); setHoveredCode(aa.code); }}
                      onMouseLeave={() => setHoveredCode(null)}
                      onClick={() => {
                        playClick();
                        setSelectedCode(prev => prev === aa.code ? null : aa.code);
                      }}
                    >
                      <circle
                        r={r}
                        fill={color}
                        fillOpacity={isHovered || isSelected ? 1 : 0.80}
                        stroke={isSelected ? '#ffffff' : 'none'}
                        strokeWidth={isSelected ? 2.5 : 0}
                        style={{ transition: 'r 0.12s ease, fill-opacity 0.12s ease' }}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={isHovered || isSelected ? 9 : 7.5}
                        fontFamily="Oswald, sans-serif"
                        fontWeight="700"
                        fill={textColor}
                        style={{ pointerEvents: 'none', userSelect: 'none', transition: 'font-size 0.12s ease' }}
                      >
                        {aa.code}
                      </text>
                    </motion.g>
                  );
                })}

                {/* Hover tooltip (rendered last = on top) */}
                {hoveredAa && hoveredIdx >= 0 && (
                  <ScatterTooltip
                    aa={hoveredAa}
                    cx={plotCoords[hoveredIdx].cx}
                    cy={plotCoords[hoveredIdx].cy}
                  />
                )}
              </svg>
            </div>
          </div>

          {/* ── Info panel ── */}
          <div className="space-y-4">

            {/* Legend */}
            <div className="border border-p5-white/25 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-p5-white/55">Group Legend</p>
              <div className="mt-3 space-y-2.5">
                {GROUPS.map(group => (
                  <div key={group} className="flex items-start gap-3">
                    <div
                      className="mt-0.5 h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: GROUP_COLORS[group] }}
                    />
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-p5-white">{group}</p>
                      <p className="text-[10px] text-p5-white/45">
                        {aminoData.filter(aa => aa.group === group).map(aa => aa.code).join(' ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PCA variance panel */}
            {viewMode === 'pca' && (
              <div className="border border-p5-white/25 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-p5-white/55">
                  Variance Explained
                </p>
                <div className="mt-3 space-y-2">
                  {[['PC1', pcaResult.pct1], ['PC2', pcaResult.pct2]].map(([label, pct]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[10px] uppercase tracking-[0.2em]">
                        <span className="text-p5-white/65">{label}</span>
                        <span className="font-bold text-p5-red">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-white/10">
                        <div
                          className="h-full bg-p5-red transition-[width] duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-p5-white/40">
                  PCA reduces {enabledFeatures.length} chemical dimensions to 2D.
                  Toggle features above to watch the algorithm adapt in real time.
                </p>
              </div>
            )}

            {/* Selected amino acid card */}
            <AnimatePresence mode="wait">
              {selectedAa ? (
                <motion.div
                  key={selectedAa.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="border-2 p-4"
                  style={{ borderColor: GROUP_COLORS[selectedAa.group] }}
                >
                  {/* Name + code badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-p5-white/50">
                        Selected residue
                      </p>
                      <h3 className="mt-0.5 font-oswald text-2xl italic uppercase text-p5-white">
                        {selectedAa.name}
                      </h3>
                      <p
                        className="text-xs uppercase tracking-[0.25em]"
                        style={{ color: GROUP_COLORS[selectedAa.group] }}
                      >
                        {selectedAa.group}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-center">
                      <div
                        className="flex h-10 w-10 items-center justify-center border-2 font-oswald text-xl font-bold italic"
                        style={{
                          borderColor: GROUP_COLORS[selectedAa.group],
                          color:       GROUP_COLORS[selectedAa.group],
                        }}
                      >
                        {selectedAa.code}
                      </div>
                      <p className="mt-1 text-[10px] text-p5-white/40">{selectedAa.code3}</p>
                    </div>
                  </div>

                  {/* Property bars */}
                  <div className="mt-4 space-y-2">
                    {FEATURES.map(f => {
                      const allVals = aminoData.map(aa => aa[f.key]);
                      return (
                        <PropBar
                          key={f.key}
                          label={f.label}
                          value={selectedAa[f.key]}
                          min={Math.min(...allVals)}
                          max={Math.max(...allVals)}
                          unit={f.unit}
                        />
                      );
                    })}
                  </div>

                  {/* Mini 3D structure viewer */}
                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] text-p5-white/50">
                      <Microscope size={11} className="text-p5-red" />
                      3D Structure · {selectedAa.code3}
                    </p>
                    <AminoViewer code3={selectedAa.code3} />
                  </div>

                  <button
                    type="button"
                    onClick={() => { playClick(); setSelectedCode(null); }}
                    onMouseEnter={() => playHover()}
                    className="mt-3 text-[10px] uppercase tracking-[0.25em] text-p5-white/35 transition-colors hover:text-p5-red"
                  >
                    ✕ Deselect
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="border border-p5-white/20 bg-white/5 p-4"
                >
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-p5-white/45">
                    <Dna size={13} className="text-p5-red" />
                    Click any dot to inspect its chemical profile and 3D structure.
                  </p>
                  <p className="mt-3 text-[10px] leading-relaxed text-p5-white/35">
                    The algorithm sees only raw numbers, no amino acid names, no
                    biology labels. Yet it separates the charged residues from the
                    hydrophobic ones using nothing but Euclidean distance in
                    n-dimensional feature space.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Math callout */}
            <div className="border border-p5-white/20 bg-white/5 p-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.3em] text-p5-white/55">
                <FlaskConical size={11} className="text-p5-red" />
                The Math
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-p5-white/40">
                PCA maximises variance. Clustering uses Euclidean distance — the
                Pythagorean theorem extended to {enabledFeatures.length} dimensions:
              </p>
              <div className="mt-2 border border-p5-white/15 bg-black/50 px-3 py-2 font-mono text-[11px] text-p5-white/65">
                d = √( Σ (p<sub>i</sub> − q<sub>i</sub>)² ) &nbsp; i = 1..{enabledFeatures.length}
              </div>
            </div>

          </div>
        </div>
      </div>
    </PageTransition>
  );
}
