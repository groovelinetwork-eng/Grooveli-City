import { useEffect, useMemo, useState } from 'react';
import { cityConfig } from './config';
import { createGamesService, type GameListing } from '../services/games';

/** Game availability from the games service (none configured yet → every game "Coming soon"). */
export function useGameListings(): GameListing[] {
  const service = useMemo(() => createGamesService(cityConfig.gamesApiUrl), []);
  const [listings, setListings] = useState<GameListing[]>([]);
  useEffect(() => {
    let live = true;
    service.listGames().then((l) => {
      if (live) setListings(l);
    });
    return () => {
      live = false;
    };
  }, [service]);
  return listings;
}
