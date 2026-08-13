/**
 * Stand-in for Charts.tsx under jsdom, wired up by vitest.config.ts.
 *
 * chart.js draws on a canvas, and jsdom has no 2D context to give it. It fails
 * asynchronously — inside a resize callback, after the render that scheduled
 * it — so the throw lands in whichever test happens to be running and tears it
 * down part-way through. Module mocks do not reach these components (the app
 * loads them through `lazy(() => import(...))`), so the swap happens in the
 * resolver instead. Nothing is lost: a canvas cannot be asserted on anyway.
 */
const Nothing = (): null => null;

export const DailyChart = Nothing;
export const TypeDoughnut = Nothing;
export const TypeRadar = Nothing;
export const WeekdayBars = Nothing;
export const YearBars = Nothing;
export const TypeRadarCompare = Nothing;
export const YearBarsCompare = Nothing;
