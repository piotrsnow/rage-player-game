import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const DictationContext = createContext(null);

export function DictationProvider({ children }) {
  const [dictation, setDictation] = useState(null);

  const register = useCallback((d) => setDictation(d), []);
  const unregister = useCallback(() => setDictation(null), []);

  const value = useMemo(() => ({ dictation, register, unregister }), [dictation, register, unregister]);

  return (
    <DictationContext.Provider value={value}>
      {children}
    </DictationContext.Provider>
  );
}

export function useDictationContext() {
  return useContext(DictationContext);
}
