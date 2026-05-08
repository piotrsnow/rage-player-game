import { createContext, useContext, useCallback, useRef } from 'react';

const ActionTagContext = createContext(null);

export function ActionTagProvider({ children }) {
  const insertTagRef = useRef(null);

  const registerInsertTag = useCallback((fn) => {
    insertTagRef.current = fn;
  }, []);

  const insertTag = useCallback((tag) => {
    insertTagRef.current?.(tag);
  }, []);

  return (
    <ActionTagContext.Provider value={{ insertTag, registerInsertTag }}>
      {children}
    </ActionTagContext.Provider>
  );
}

export function useActionTag() {
  return useContext(ActionTagContext);
}
