'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { type Thema, themaLesen, themaSetzen, themaAnwenden, istDunkel } from './thema';
import { telegramFarben } from './telegram/webapp';
import { leistenFaerben } from './native/leisten';

interface ThemaKontext { thema: Thema; dunkel: boolean; setThema: (t: Thema) => void }

const Kontext = createContext<ThemaKontext>({ thema: 'system', dunkel: false, setThema: () => {} });

export function ThemaProvider({ children }: { children: React.ReactNode }) {
  const [thema, setT] = useState<Thema>('system');
  const [dunkel, setDunkel] = useState(false);

  const anwenden = useCallback((t: Thema) => {
    const d = themaAnwenden(t);
    setDunkel(d);
    telegramFarben(d);
    leistenFaerben(d);
  }, []);

  useEffect(() => {
    const t = themaLesen();
    setT(t); anwenden(t);
    // "System" folgt dem Geraet auch, wenn es sich waehrend der Sitzung aendert.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const neu = () => { if (themaLesen() === 'system') anwenden('system'); };
    mq?.addEventListener?.('change', neu);
    const tg = window.Telegram?.WebApp;
    tg?.onEvent?.('themeChanged', neu);
    return () => { mq?.removeEventListener?.('change', neu); tg?.offEvent?.('themeChanged', neu); };
  }, [anwenden]);

  const setThema = useCallback((t: Thema) => { themaSetzen(t); setT(t); anwenden(t); }, [anwenden]);

  return <Kontext.Provider value={{ thema, dunkel, setThema }}>{children}</Kontext.Provider>;
}

export const useThema = () => useContext(Kontext);
export { istDunkel };
