import React from "react";
import { PlayersProvider } from "../players";
import { StatsProvider } from "../stats";
import PlayThemeProvider from "./PlayThemeProvider";

export default function PlayProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlayersProvider>
      <StatsProvider>
        <PlayThemeProvider>{children}</PlayThemeProvider>
      </StatsProvider>
    </PlayersProvider>
  );
}
