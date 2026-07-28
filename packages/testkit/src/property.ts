import * as fc from "fast-check";

/** Re-export fast-check for property tests across packages. */
export { fc };

/** Run a property with shared defaults for Huddle protocol tests. */
export function runProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  params: fc.Parameters<[T]> = {},
): void {
  fc.assert(fc.property(arbitrary, predicate), { numRuns: 50, ...params });
}
