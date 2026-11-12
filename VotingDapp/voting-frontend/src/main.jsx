import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app.jsx";
import "./style.css";

const Root = import.meta.env.MODE === "browser-sandbox" ? React.lazy(() => import("./sandbox/Sandbox.jsx")) : App;
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <React.Suspense fallback={<p role="status">Loading VoteChain…</p>}>
      <Root />
    </React.Suspense>
  </React.StrictMode>
);
