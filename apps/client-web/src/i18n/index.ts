import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import commonEn from './en/common.json'
import marketingEn from './en/marketing.json'
import authEn from './en/auth.json'
import billingEn from './en/billing.json'
import accountEn from './en/account.json'
import commonVi from './vi/common.json'
import marketingVi from './vi/marketing.json'
import authVi from './vi/auth.json'
import billingVi from './vi/billing.json'
import accountVi from './vi/account.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: commonEn, marketing: marketingEn, auth: authEn, billing: billingEn, account: accountEn },
      vi: { common: commonVi, marketing: marketingVi, auth: authVi, billing: billingVi, account: accountVi },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'marketing', 'auth', 'billing', 'account'],
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

export default i18n
