/** Pinned, reproducible subset. Never infer an eGRID subregion from a ZIP code. */
export const FACTOR_VERSION = "epa-hub-2025+egrid2023-rev2";
export const FACTOR_SOURCES = {
  fuel: "https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf",
  grid: "https://www.epa.gov/egrid/summary-data",
};
export const GRID_FACTORS = {
  RFCE: { name: "RFC East", lbCo2ePerMwh: 599.17 },
  CAMX: { name: "California", lbCo2ePerMwh: 429.983 },
  ERCT: { name: "ERCOT", lbCo2ePerMwh: 736.629 },
} as const;
export type GridRegion = keyof typeof GRID_FACTORS;
export const LB_TO_KG = 0.45359237;
// EPA 2025 Hub Table 1, stationary combustion; AR5 100-year GWP: CH4=28, N2O=265.
// Natural gas: kgCO2/MMBtu + gCH4/MMBtu/1000 * GWP + gN2O/MMBtu/1000 * GWP.
export const GAS_KG_PER_THERM = (53.06 + 1 / 1000 * 28 + 0.1 / 1000 * 265) * 0.1;
// Distillate Fuel Oil No.2: EPA's per-gallon columns, stationary equipment only.
export const DIESEL_KG_PER_GALLON = 10.21 + 0.41 / 1000 * 28 + 0.08 / 1000 * 265;

export function factorFor(kind: "electricity" | "natural_gas" | "stationary_diesel", region: GridRegion) {
  if (kind === "electricity") return {
    value: GRID_FACTORS[region].lbCo2ePerMwh * LB_TO_KG / 1000,
    unit: "kWh", scope: 2 as const, source: FACTOR_SOURCES.grid,
    sourceLabel: `EPA eGRID2023 Rev2 · ${region} · ${GRID_FACTORS[region].lbCo2ePerMwh} lb CO₂e/MWh`,
    derivation: `${GRID_FACTORS[region].lbCo2ePerMwh} × 0.45359237 ÷ 1000`,
  };
  if (kind === "natural_gas") return {
    value: GAS_KG_PER_THERM, unit: "therm", scope: 1 as const,
    source: FACTOR_SOURCES.fuel, sourceLabel: "EPA 2025 Hub · Table 1 · Natural gas · AR5 GWP",
    derivation: "(53.06 + 1/1000 × 28 + 0.1/1000 × 265) × 0.1 MMBtu/therm",
  };
  return {
    value: DIESEL_KG_PER_GALLON, unit: "gallon", scope: 1 as const,
    source: FACTOR_SOURCES.fuel, sourceLabel: "EPA 2025 Hub · Table 1 · Distillate Fuel Oil No. 2 · AR5 GWP",
    derivation: "10.21 + 0.41/1000 × 28 + 0.08/1000 × 265",
  };
}
