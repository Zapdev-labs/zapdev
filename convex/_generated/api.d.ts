/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as importData from "../importData.js";
import type * as imports from "../imports.js";
import type * as messages from "../messages.js";
import type * as oauth from "../oauth.js";
import type * as polar from "../polar.js";
import type * as projects from "../projects.js";
import type * as rateLimit from "../rateLimit.js";
import type * as subscriptions from "../subscriptions.js";
import type * as usage from "../usage.js";
import type * as webcontainerFiles from "../webcontainerFiles.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  helpers: typeof helpers;
  http: typeof http;
  importData: typeof importData;
  imports: typeof imports;
  messages: typeof messages;
  oauth: typeof oauth;
  polar: typeof polar;
  projects: typeof projects;
  rateLimit: typeof rateLimit;
  subscriptions: typeof subscriptions;
  usage: typeof usage;
  webcontainerFiles: typeof webcontainerFiles;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
