export function fixtureFactory<T extends object>(defaults: T) {
  return (overrides: Partial<T> = {}): T => structuredClone({ ...defaults, ...overrides });
}
