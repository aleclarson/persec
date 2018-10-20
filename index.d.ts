type SuiteFn<T> = (caseValue: T, caseIndex: number) => void

/** Register a test cycle */
export function cycle(id: string, fn: () => void): void

/** Run a function before every test sample */
export function beforeEach(fn: () => void): void

/** Run a function after every test sample */
export function afterEach(fn: () => void): void

/** Create a function that runs a test group for each case */
export function bench<T>(
  setup: SuiteFn<T>
): {
  (cases: T[]): Promise<void>
  one(caseValue: T): Promise<void>
}

/** @deprecated Run a factory function for each case */
export function each<Cases extends any[]>(
  cases: Cases,
  setup: SuiteFn<Cases>
): void
