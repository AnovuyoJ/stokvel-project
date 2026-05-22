import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL;

// const FALLBACK_RATES = { repoRate: 8.25, primeRate: 11.75 };

export function useRates() {
  const [rates, setRates] = useState(null);

  useEffect(() => {
    fetch(`${API}/rates`)
      .then((res) => res.json())
      .then((data) => setRates(data))
      .catch(() => setRates(null));
  }, []);

  return rates;
}
