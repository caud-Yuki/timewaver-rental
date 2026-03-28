import { DeviceModule } from '@/types';

/**
 * Calculate the total module add-up price per month.
 * Formula: sum of (moduleBasePrice * module.point) for each module
 */
export function calculateModuleAddon(modules: DeviceModule[] | undefined, moduleBasePrice: number): number {
  if (!modules || modules.length === 0 || !moduleBasePrice) return 0;
  return modules.reduce((total, mod) => total + (moduleBasePrice * (mod.point || 0)), 0);
}

/**
 * Calculate full monthly price including module add-ons.
 */
export function calculateTotalMonthly(baseMonthly: number, modules: DeviceModule[] | undefined, moduleBasePrice: number): number {
  return baseMonthly + calculateModuleAddon(modules, moduleBasePrice);
}

/**
 * Calculate full payment price including module add-ons.
 * Module add-on is calculated per month, then multiplied by total months.
 */
export function calculateTotalFull(baseFull: number, modules: DeviceModule[] | undefined, moduleBasePrice: number, months: number): number {
  const monthlyAddon = calculateModuleAddon(modules, moduleBasePrice);
  return baseFull + (monthlyAddon * months);
}
