/**
 * i18next TypeScript Declarations
 *
 * Provides type-safe translation keys via module augmentation.
 * IntelliSense will autocomplete all translation keys.
 */
import { resources, defaultNS } from "./i18n";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)["en"];
  }
}
