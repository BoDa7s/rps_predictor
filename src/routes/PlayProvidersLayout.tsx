import React from "react";
import { Outlet } from "react-router-dom";
import PlayProviders from "./PlayProviders";

export default function PlayProvidersLayout() {
  return (
    <PlayProviders>
      <Outlet />
    </PlayProviders>
  );
}
