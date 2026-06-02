import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

// The token lives in sessionStorage only: it survives reloads but is cleared
// when the tab closes, and is never sent anywhere except api.github.com.
const STORAGE_KEY = "devpulse-token";

const TokenContext = createContext<{
  token: string;
  setToken: (t: string) => void;
}>({ token: "", setToken: () => {} });

function initialToken(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function TokenProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string>(initialToken);

  useEffect(() => {
    try {
      if (token) sessionStorage.setItem(STORAGE_KEY, token);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked */
    }
  }, [token]);

  return (
    <TokenContext.Provider value={{ token, setToken: setTokenState }}>
      {children}
    </TokenContext.Provider>
  );
}

export const useToken = () => useContext(TokenContext);
