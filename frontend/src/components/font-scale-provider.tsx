import React, { createContext, useContext, useEffect, useState } from 'react';

type FontScale = 'default' | 'large';

const STORAGE_KEY = 'ui-font-scale';

type FontScaleContextValue = {
  fontScale: FontScale;
  setFontScale: (scale: FontScale) => void;
};

const FontScaleContext = createContext<FontScaleContextValue | undefined>(undefined);

export function FontScaleProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [fontScale, setFontScaleState] = useState<FontScale>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'large' ? 'large' : 'default';
  });

  useEffect(() => {
    document.documentElement.dataset.fontScale = fontScale;
  }, [fontScale]);

  const setFontScale = (scale: FontScale) => {
    localStorage.setItem(STORAGE_KEY, scale);
    setFontScaleState(scale);
  };

  return (
    <FontScaleContext.Provider value={{ fontScale, setFontScale }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale(): FontScaleContextValue {
  const ctx = useContext(FontScaleContext);
  if (!ctx) throw new Error('useFontScale must be used inside FontScaleProvider');
  return ctx;
}
