/**
 * Feature 003 planning constants (tunable; see research.md "Planning constants"). Centralized so
 * the bounding-box radius, quorum thresholds, party-size bound, place-grouping precision, and poll
 * cadences are single-sourced for both the backend and the frontend.
 */
export const DISCOVERY_RADIUS_KM = 15;
export const NEAR_QUORUM = 8;
export const QUORUM = 10;
export const PARTY_SIZE_MAX = 50;
/** 014: max guest seats a gathering (hosting/social) may open. Host is not counted (R12). */
export const EVENT_CAPACITY_MAX = 500;
/** Decimal places to round lat/lng for "same place" grouping in discovery (~11 m at 4 dp). */
export const COORD_GROUP_DP = 4;
/** Polling cadence (ms) for the discovery list and the Minyan-detail views (D5/R7). */
export const POLL_DISCOVERY_MS = 8000;
export const POLL_DETAIL_MS = 5000;
