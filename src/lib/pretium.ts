export const PRETIUM_DISBURSE_TIERS: [number, number][] = [
  [100, 1], [500, 8], [1000, 12], [1500, 20], [2500, 22],
  [3500, 25], [5000, 27], [7500, 30], [10000, 35], [15000, 37],
  [20000, 40], [25000, 43], [30000, 45], [35000, 50], [40000, 60],
  [45000, 70], [50000, 80], [70000, 100],
];

export function pretiumDisburseFee(amount: number): number {
  return PRETIUM_DISBURSE_TIERS.find(([cap]) => amount <= cap)?.[1] ?? 150;
}
