type SuiteFn<T> = (caseValue: T, caseIndex: number) => void

/** Register a test to cycle */
export function cycle(id: string, fn: () => void): {
  /** Run a function before every test sample of this cycle */
  beforeEach(run: () => void): this
  /** Run a function after every test sample of this cycle */
  afterEach(run: () => void): this
}

/** Run a function before every test sample in this context */
export function beforeEach(fn: () => void): void

/** Run a function after every test sample in this context */
export function afterEach(fn: () => void): void

/** Create a function that runs a test group for each case */
export function bench<T>(
  setup: SuiteFn<T>
): {
  (cases: T[]): Promise<T[]>
  one(caseValue: T): Promise<T[]>
}

/** @deprecated Run a factory function for each case */
export function each<Cases extends any[]>(
  cases: Cases,
  setup: SuiteFn<Cases>
): void

type GlobalConfig = {
  /** Delay between samples (in seconds) - default: `0.005` */
  delay: number
  /** Minimum seconds per cycle - default: `1` */
  minTime: number
  /** Minimum number of samples - default: `5` */
  minSamples: number
  /** Called at the end of every sample */
  onSample(): void
  /** Called at the end of every cycle */
  onCycle: (cycle: any, opts: any) => void
  /** Called when a test has an uncaught error */
  onError: (error: Error) => void
  /** Called at the end of every suite */
  onFinish(): void
}

export function configure(config: Partial<GlobalConfig>): void

// Benchmark defaults
export declare const defaults: GlobalConfig
