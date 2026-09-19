import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { STRINGS, type Lang } from './strings'

interface LangValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
}

const Ctx = createContext<LangValue>({ lang: 'en', setLang: () => {}, t: k => k })

const STORAGE_KEY = 'cnas.lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
    } catch {
      return 'en'   // private windows and blocked storage must not break the app
    }
  })

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* non-fatal */ }
  }, [])

  // Screen readers and text rendering both key off this.
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // Missing Hindi falls back to English, then to the key itself — a partial
  // translation degrades to a readable screen rather than blank labels.
  const t = useCallback(
    (key: string) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key,
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useLang = () => useContext(Ctx)

export function LanguageToggle() {
  const { lang, setLang } = useLang()
  return (
    <div className="flex items-center rounded-full border border-gov-border overflow-hidden">
      {(['en', 'hi'] as Lang[]).map(l => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            lang === l ? 'bg-gov-navy text-white' : 'text-gov-muted hover:text-gov-navy'}`}
        >
          {l === 'en' ? 'EN' : 'हिं'}
        </button>
      ))}
    </div>
  )
}
