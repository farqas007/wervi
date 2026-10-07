import { type Column, type SQL, sql } from 'drizzle-orm';
import { check } from 'drizzle-orm/pg-core';

/**
 * CHECK constraint factories.
 *
 * Every constraint that restricts a value to a shared constant list is built
 * here, so a new status or currency produces one migration and no hand-edited
 * SQL. Constraint names are `table_column_check`, matching the naming Drizzle
 * uses for foreign keys and indexes, so a violation names its own table.
 */

/**
 * Quote a compile-time constant as a SQL literal list.
 *
 * The values come from `as const` tuples in `@wervi/shared`, never from user
 * input, which is what makes inlining them into DDL safe.
 */
function literalList(values: readonly string[]): SQL {
  const literals = values.map((value) => `'${value.replace(/'/g, "''")}'`);
  return sql.raw(`(${literals.join(', ')})`);
}

/**
 * Quote a compile-time constant as a `text[]` literal.
 *
 * Written as `'{a,b}'` rather than `ARRAY('a','b')`: the array constructor takes
 * square brackets, and `ARRAY(...)` parses as a call to a function named `array`,
 * which is a syntax error at migration time. Values must therefore be
 * single tokens without commas, which every shared vocabulary satisfies.
 */
function textArrayLiteral(values: readonly string[]): SQL {
  const escaped = values.map((value) => value.replace(/'/g, "''"));
  return sql.raw(`'{${escaped.join(',')}}'`);
}

/**
 * Quote a compile-time number as a SQL literal.
 *
 * A number interpolated into a `sql` template becomes a bind parameter, and a
 * bind parameter is not valid inside a CHECK constraint in a migration file:
 * `drizzle-kit generate` writes the statement out with a literal `$1` and the
 * migration cannot run. Bounds therefore go through `sql.raw`, and the values
 * come from shared constants rather than user input.
 */
function literalNumber(value: number): SQL {
  return sql.raw(String(value));
}

/** CHECK (`column` IN (...)) generated from a shared vocabulary. */
export function oneOf(
  name: string,
  column: Column | SQL,
  values: readonly [string, ...string[]],
) {
  return check(name, sql`${column} in ${literalList(values)}`);
}

/** CHECK (`column` IS NULL OR `column` IN (...)) for an optional attribute. */
export function optionalOneOf(
  name: string,
  column: Column | SQL,
  values: readonly [string, ...string[]],
) {
  return check(
    name,
    sql`${column} is null or ${column} in ${literalList(values)}`,
  );
}

/** CHECK (`column` >= 0) — an amount that may legitimately be zero. */
export function nonNegative(name: string, column: Column | SQL) {
  return check(name, sql`${column} >= 0`);
}

/** CHECK (`column` > 0) — an amount or counter that must carry meaning. */
export function positive(name: string, column: Column | SQL) {
  return check(name, sql`${column} > 0`);
}

/** CHECK (`column` >= `min`). */
export function atLeast(name: string, column: Column | SQL, min: number) {
  return check(name, sql`${column} >= ${literalNumber(min)}`);
}

/** CHECK (`column` <= `max`). */
export function atMost(name: string, column: Column | SQL, max: number) {
  return check(name, sql`${column} <= ${literalNumber(max)}`);
}

/** CHECK (`column` BETWEEN `min` AND `max`). */
export function inRange(
  name: string,
  column: Column | SQL,
  min: number,
  max: number,
) {
  return check(
    name,
    sql`${column} between ${literalNumber(min)} and ${literalNumber(max)}`,
  );
}

/** CHECK (`column` IS NULL OR `column` BETWEEN `min` AND `max`). */
export function optionalInRange(
  name: string,
  column: Column | SQL,
  min: number,
  max: number,
) {
  return check(
    name,
    sql`${column} is null or ${column} between ${literalNumber(min)} and ${literalNumber(max)}`,
  );
}

/**
 * CHECK (`array_column` <@ ARRAY(...)) — every element of a text array is one of
 * the allowed values. Used for the additive roles array on a user.
 */
export function arraySubsetOf(
  name: string,
  column: Column | SQL,
  values: readonly [string, ...string[]],
) {
  return check(name, sql`${column} <@ ${textArrayLiteral(values)}`);
}

/** CHECK that a self-referencing foreign key never points at its own row. */
export function notSelfReferential(
  name: string,
  column: Column | SQL,
  owner: Column | SQL,
) {
  return check(name, sql`${column} is null or ${column} <> ${owner}`);
}

/**
 * CHECK that two optional columns are either both set or both null.
 *
 * Written out rather than as `("a" is null) = ("b" is null)`: the equality of
 * two booleans is correct but has to be derived by the reader, and a CHECK
 * constraint should be obvious at a glance when it appears in an error.
 */
export function bothOrNeither(
  name: string,
  first: Column | SQL,
  second: Column | SQL,
) {
  return check(
    name,
    sql`(${first} is null and ${second} is null) or (${first} is not null and ${second} is not null)`,
  );
}

/** CHECK that `first` is not greater than `second`, when both are present. */
export function notGreaterThan(
  name: string,
  first: Column | SQL,
  second: Column | SQL,
) {
  return check(
    name,
    sql`${first} is null or ${second} is null or ${first} <= ${second}`,
  );
}
